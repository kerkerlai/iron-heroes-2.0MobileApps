// POST /admin-mobile：GM 後台專用 (需 x-gm-password，與 Edge Function 環境變數 GM_PASSWORD 比對)
// actions: create_invite / list_invites / delete_invite / list_devices / revoke_device / restore_device / rename_hero
import { corsHeaders, json, serviceClient } from "../_shared/util.ts";

function genCode(season: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去除易混淆字元
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  const tail = Array.from(arr).map((b) => chars[b % chars.length]).join("");
  const prefix = (season || "S").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "S";
  return `${prefix}-${tail}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("GM_PASSWORD") || "";
  if (!expected || req.headers.get("x-gm-password") !== expected) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const db = serviceClient();
  const action = String(body.action || "");

  if (action === "create_invite") {
    const season = String(body.season || "S");
    const code = genCode(season);
    const row = {
      code,
      season,
      note: String(body.note || "").slice(0, 100),
      max_uses: Number(body.max_uses) > 0 ? Math.round(Number(body.max_uses)) : 50,
      expires_at: body.expires_at ? String(body.expires_at) : null,
    };
    const { error } = await db.from("invite_codes").insert(row);
    if (error) return json({ error: "db_error", message: error.message }, 500);
    return json({ invite: row });
  }
  if (action === "list_invites") {
    const { data, error } = await db.from("invite_codes").select("*").order("created_at", { ascending: false });
    if (error) return json({ error: "db_error", message: error.message }, 500);
    return json({ invites: data });
  }
  if (action === "delete_invite") {
    const { error } = await db.from("invite_codes").delete().eq("code", String(body.code || ""));
    if (error) return json({ error: "db_error", message: error.message }, 500);
    return json({ ok: true });
  }
  if (action === "list_devices") {
    const { data, error } = await db.from("devices")
      .select("id, hero, platform, device_model, app_version, last_sync_at, last_upload_count, revoked, created_at")
      .order("created_at", { ascending: false });
    if (error) return json({ error: "db_error", message: error.message }, 500);
    return json({ devices: data });
  }
  if (action === "revoke_device" || action === "restore_device") {
    const { error } = await db.from("devices").update({ revoked: action === "revoke_device" }).eq("id", String(body.device_id || ""));
    if (error) return json({ error: "db_error", message: error.message }, 500);
    return json({ ok: true });
  }
  if (action === "rename_hero") {
    // 英雄改名：所有掛在舊名字底下的資料一起搬到新名字 (英雄 / 運動紀錄 / 每日健康 / 手機綁定 / GM 稱號與手動徽章)
    const oldName = String(body.old_name || "").trim();
    const newName = String(body.new_name || "").trim();
    if (!oldName || !newName) return json({ error: "invalid_body", message: "old_name、new_name 為必填" }, 400);
    if (oldName === newName) return json({ ok: true, unchanged: true });
    if (newName.length > 30 || /[<>"'`\\]/.test(newName)) return json({ error: "invalid_body", message: "新名稱過長或包含不允許的符號" }, 400);
    const { data: src } = await db.from("heroes").select("name").eq("name", oldName).maybeSingle();
    if (!src) return json({ error: "hero_not_found", message: `找不到英雄「${oldName}」` }, 404);
    const { data: clash } = await db.from("heroes").select("name").eq("name", newName).maybeSingle();
    if (clash) return json({ error: "hero_exists", message: `已經有名為「${newName}」的英雄` }, 409);

    const counts: Record<string, number> = {};
    const upd = async (table: string, col: string) => {
      const { data, error } = await db.from(table).update({ [col]: newName }).eq(col, oldName).select(col);
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = data?.length ?? 0;
    };
    try {
      await upd("heroes", "name");
      await upd("activities", "hero");
      await upd("daily_health", "hero");
      await upd("devices", "hero");
      // GM 設定中以英雄名字為 key 的資料 (頭像特效/稱號、手動頒發徽章)
      const { data: cfgRow } = await db.from("game_config").select("value").eq("key", "gm_ops_config").maybeSingle();
      const v = (cfgRow?.value || null) as Record<string, any> | null;
      if (v) {
        let changed = false;
        for (const k of ["heroFx", "manualBadges"]) {
          if (v[k] && typeof v[k] === "object" && oldName in v[k]) {
            v[k][newName] = v[k][oldName];
            delete v[k][oldName];
            changed = true;
          }
        }
        if (changed) {
          const { error } = await db.from("game_config").update({ value: v }).eq("key", "gm_ops_config");
          if (error) throw new Error(`game_config: ${error.message}`);
          counts.gm_ops_config = 1;
        }
      }
      // 改名對照表：舊遊戲資料庫 (鏡像同步來源) 仍是舊名，鏡像時會用這張表換成新名，避免出現重複英雄
      const { data: aliasRow } = await db.from("game_config").select("value").eq("key", "hero_aliases").maybeSingle();
      const aliases = ((aliasRow?.value && typeof aliasRow.value === "object") ? aliasRow.value : {}) as Record<string, string>;
      for (const k of Object.keys(aliases)) if (aliases[k] === oldName) aliases[k] = newName;
      aliases[oldName] = newName;
      delete aliases[newName];
      const { error: aErr } = await db.from("game_config").upsert({ key: "hero_aliases", value: aliases }, { onConflict: "key" });
      if (aErr) throw new Error(`hero_aliases: ${aErr.message}`);
      counts.hero_aliases = Object.keys(aliases).length;
    } catch (e) {
      return json({ error: "db_error", message: `改名途中失敗：${(e as Error).message}（已完成的部分：${JSON.stringify(counts)}）` }, 500);
    }
    return json({ ok: true, old_name: oldName, new_name: newName, counts });
  }
  return json({ error: "unknown_action" }, 400);
});
