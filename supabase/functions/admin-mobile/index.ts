// POST /admin-mobile：GM 後台專用 (需 x-gm-password，與 Edge Function 環境變數 GM_PASSWORD 比對)
// actions: create_invite / list_invites / delete_invite / list_devices / revoke_device / restore_device
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
  return json({ error: "unknown_action" }, 400);
});
