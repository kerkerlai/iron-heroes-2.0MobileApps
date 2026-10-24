// POST /register-device：驗證邀請碼 → 綁定 (或建立) 英雄 → 發放此手機專屬金鑰
import { corsHeaders, json, serviceClient, sha256Hex, randomHex } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const inviteCode = String(body.invite_code || "").trim().toUpperCase();
  const heroName = String(body.hero_name || "").trim();
  const createNew = Boolean(body.create_new_hero);
  const platform = String(body.platform || "").toLowerCase();
  if (!inviteCode || !heroName || !["ios", "android"].includes(platform)) {
    return json({ error: "invalid_body", message: "invite_code、hero_name、platform(ios/android) 為必填" }, 400);
  }
  if (heroName.length > 30) return json({ error: "invalid_body", message: "英雄名稱過長" }, 400);
  if (createNew && /[<>"'`\\]/.test(heroName)) return json({ error: "invalid_body", message: "英雄名稱不能包含 < > \" ' ` \\ 等符號" }, 400);

  const db = serviceClient();

  // 1. 驗證邀請碼
  const { data: invite, error: invErr } = await db.from("invite_codes").select("*").eq("code", inviteCode).maybeSingle();
  if (invErr) return json({ error: "db_error", message: invErr.message }, 500);
  if (!invite) return json({ error: "invalid_invite", message: "邀請碼不存在" }, 403);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return json({ error: "invalid_invite", message: "邀請碼已過期" }, 403);
  if (invite.max_uses && invite.used_count >= invite.max_uses) return json({ error: "invalid_invite", message: "邀請碼使用次數已滿" }, 403);

  // 2. 英雄：綁定既有 或 建立新英雄
  const { data: hero } = await db.from("heroes").select("name").eq("name", heroName).maybeSingle();
  if (createNew) {
    if (hero) return json({ error: "hero_exists", message: "已有同名英雄，請改選「既有英雄」" }, 409);
    const guild = String(body.guild || "").trim() || "自由英雄";
    if (guild.length > 30 || /[<>"'`\\]/.test(guild)) {
      return json({ error: "invalid_body", message: "公會名稱過長或包含不允許的符號" }, 400);
    }
    const rawAge = Number(body.age);
    const age = Number.isFinite(rawAge) && rawAge > 0 ? Math.min(100, Math.max(5, Math.round(rawAge))) : 35;
    const { error: insErr } = await db.from("heroes").insert({
      name: heroName,
      age,
      max_hr: Math.max(120, 220 - age),
      guild,
      rpg_class: "狂戰士",
      strava_id: "",
      avatar: "",
    });
    if (insErr) return json({ error: "db_error", message: insErr.message }, 500);
  } else if (!hero) {
    return json({ error: "hero_not_found", message: "找不到這位英雄，請確認名稱（要跟遊戲裡一字不差，包含空白與大小寫）或選擇「建立新英雄」" }, 404);
  } else {
    // 一位英雄同時只能綁定一支手機 (避免誤綁 / 冒用)。換手機時請 GM 在後台「停用」舊裝置後再綁定。
    const { data: bound, error: bErr } = await db.from("devices").select("id").eq("hero", heroName).eq("revoked", false).limit(1);
    if (bErr) return json({ error: "db_error", message: bErr.message }, 500);
    if (bound && bound.length) {
      return json({ error: "hero_already_bound", message: "這位英雄已經綁定在另一支手機上。如果是你換手機，請 GM 在後台「裝置清單」停用舊手機後再試一次。" }, 409);
    }
  }

  // 3. 發放金鑰 (只回傳一次，資料庫只存雜湊)
  const cleanStr = (v: unknown, max: number) => String(v || "").replace(/[<>"'`\\]/g, "").slice(0, max);
  const token = randomHex(32);
  const { data: device, error: devErr } = await db.from("devices").insert({
    hero: heroName,
    platform,
    device_model: cleanStr(body.device_model, 80),
    app_version: cleanStr(body.app_version, 30),
    token_hash: await sha256Hex(token),
  }).select("id").single();
  if (devErr) return json({ error: "db_error", message: devErr.message }, 500);

  await db.from("invite_codes").update({ used_count: (invite.used_count || 0) + 1 }).eq("code", inviteCode);

  const { data: heroRow } = await db.from("heroes").select("max_hr").eq("name", heroName).maybeSingle();
  return json({ device_id: device.id, device_token: token, hero_name: heroName, max_hr: heroRow?.max_hr ?? 185 });
});
