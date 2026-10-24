// POST /ingest-health：手機 App 上傳運動紀錄與每日健康數據
// - 運動：id = ah_/hc_ + 原始 ID，「只新增不覆蓋」(保護 GM 作廢與手動修正)
// - 時間：統一轉成台灣時間字串，與 Strava 爬蟲格式一致，跨來源重複判定才能正確比對
// - 每日健康：依 (hero, date) 合併更新，新值覆蓋舊值，未提供的欄位保留原值
import { corsHeaders, json, serviceClient, sha256Hex, toTaipeiString, num } from "../_shared/util.ts";

const MAX_WORKOUTS = 500;
const MAX_DAILY = 120;
const PREFIX: Record<string, string> = { apple_health: "ah_", health_connect: "hc_" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = req.headers.get("x-device-token") || "";
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const deviceId = String(body.device_id || "");
  if (!token || !deviceId) return json({ error: "unauthorized" }, 401);

  const db = serviceClient();
  const { data: device } = await db.from("devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device || device.revoked || device.token_hash !== await sha256Hex(token)) {
    return json({ error: "unauthorized", message: "裝置未綁定或已被 GM 停用，請重新加入" }, 401);
  }
  const hero = device.hero as string;

  const workouts = Array.isArray(body.workouts) ? body.workouts.slice(0, MAX_WORKOUTS) : [];
  const daily = Array.isArray(body.daily) ? body.daily.slice(0, MAX_DAILY) : [];

  // ---- 運動紀錄 ----
  const rows: Record<string, unknown>[] = [];
  for (const w of workouts as Record<string, unknown>[]) {
    const src = String(w.platform_source || "");
    const sid = String(w.source_id || "").trim();
    const origin = String(w.origin_app || "").toLowerCase();
    if (!PREFIX[src] || !sid) continue;
    if (origin.includes("strava")) continue; // Strava 資料已由爬蟲處理，避免回寫造成重複
    const dateStr = toTaipeiString(String(w.start_time || ""));
    const duration = num(w.duration_min) ?? 0;
    if (!dateStr || duration < 1) continue;
    rows.push({
      id: PREFIX[src] + sid,
      hero,
      date: dateStr,
      type: String(w.type || "Workout").slice(0, 40),
      name: String(w.name || w.type || "運動").slice(0, 120),
      duration: Math.round(duration * 10) / 10,
      distance: num(w.distance_m) !== null ? Math.round((num(w.distance_m)! / 1000) * 100) / 100 : 0, // km (與爬蟲一致)
      elevation: num(w.elevation_m) ?? 0,
      avg_hr: num(w.avg_hr) ?? 0,
      max_hr: num(w.max_hr) ?? 0,
      calories: Math.round(num(w.calories) ?? 0),
      is_manual: false,
      is_excluded: false,
      source: src,
      source_id: sid,
      origin_app: origin.slice(0, 120),
      device_name: String(w.device_name || "").slice(0, 80) || null,
      start_time: String(w.start_time),
      end_time: w.end_time ? String(w.end_time) : null,
      steps: num(w.steps),
    });
  }

  let inserted = 0;
  if (rows.length) {
    const { data, error } = await db.from("activities")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) return json({ error: "db_error", message: error.message }, 500);
    inserted = data?.length ?? 0;
  }

  // ---- 每日健康數據 ----
  const fields = ["steps", "active_kcal", "active_minutes", "sleep_minutes", "resting_hr", "hrv_ms", "spo2_pct"];
  const intFields = ["steps", "active_minutes", "sleep_minutes"];
  const dailyRows: Record<string, unknown>[] = [];
  for (const d of daily as Record<string, unknown>[]) {
    const date = String(d.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const row: Record<string, unknown> = { hero, date, source: device.platform === "ios" ? "apple_health" : "health_connect", updated_at: new Date().toISOString() };
    let hasValue = false;
    for (const f of fields) {
      const v = num(d[f]);
      if (v !== null) { row[f] = intFields.includes(f) ? Math.round(v) : v; hasValue = true; }
    }
    for (const f of ["bed_time", "wake_time"]) {
      const t = String(d[f] ?? "").trim();
      if (/^\d{1,2}:\d{2}$/.test(t)) { row[f] = t.padStart(5, "0"); hasValue = true; }
    }
    if (hasValue) dailyRows.push(row);
  }
  if (dailyRows.length) {
    // 合併更新：先讀既有資料，未提供的欄位保留原值
    const dates = dailyRows.map((r) => r.date as string);
    const { data: existing } = await db.from("daily_health").select("*").eq("hero", hero).in("date", dates);
    const byDate = new Map((existing || []).map((e: Record<string, unknown>) => [String(e.date), e]));
    const merged = dailyRows.map((r) => ({ ...(byDate.get(r.date as string) || {}), ...r }));
    const { error } = await db.from("daily_health").upsert(merged, { onConflict: "hero,date" });
    if (error) return json({ error: "db_error", message: error.message }, 500);
  }

  await db.from("devices").update({
    last_sync_at: new Date().toISOString(),
    last_upload_count: inserted,
    app_version: String(body.app_version || device.app_version || "").slice(0, 30),
  }).eq("id", deviceId);

  const { data: heroRow } = await db.from("heroes").select("max_hr").eq("name", hero).maybeSingle();
  return json({
    max_hr: heroRow?.max_hr ?? 185,
    inserted_workouts: inserted,
    skipped_workouts: workouts.length - inserted,
    upserted_daily: dailyRows.length,
    server_time: new Date().toISOString(),
  });
});
