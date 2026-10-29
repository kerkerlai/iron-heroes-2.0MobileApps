// POST /ingest-health：手機 App 上傳運動紀錄與每日健康數據
// - 運動：id = ah_/hc_ + 原始 ID，「只新增不覆蓋」(保護 GM 作廢與手動修正)
// - 時間：統一轉成台灣時間字串，與 Strava 爬蟲格式一致，跨來源重複判定才能正確比對
// - 每日健康：依 (hero, date) 合併更新，新值覆蓋舊值，未提供的欄位保留原值
import { corsHeaders, json, serviceClient, sha256Hex, toTaipeiString, num } from "../_shared/util.ts";

const MAX_WORKOUTS = 500;
const MAX_DAILY = 120;
const PREFIX: Record<string, string> = { apple_health: "ah_", health_connect: "hc_" };
const cleanStr = (v: unknown, max: number) => String(v || "").replace(/[<>"'`\\]/g, "").slice(0, max);
const toIsoOrNull = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const clamp = (v: number | null, min: number, max: number): number | null =>
  v === null ? null : Math.min(max, Math.max(min, v));

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
  const nowMs = Date.now();
  const minStartMs = nowMs - 120 * 86400 * 1000;
  const maxStartMs = nowMs + 2 * 86400 * 1000;
  const rows: Record<string, unknown>[] = [];
  for (const w of workouts as Record<string, unknown>[]) {
    const src = String(w.platform_source || "");
    const sid = cleanStr(w.source_id, 120).trim();
    const origin = cleanStr(w.origin_app, 120).toLowerCase();
    if (!PREFIX[src] || !sid) continue;
    // 允許手機端 Apple Health / Health Connect 內由 Strava App 寫入的運動紀錄上傳
    // (支援小米手環透過手機端 Strava 橋接完整熱量與重訓，並支援未來關閉雲端 Strava 爬蟲的純手機模式；
    //  若雲端 Strava 爬蟲仍開啟，前端與後台之 detectDuplicateActivities 會自動依時間重疊去重，絕不重複計分)
    const startIso = toIsoOrNull(w.start_time);
    const dateStr = startIso ? toTaipeiString(startIso) : null;
    const durationRaw = num(w.duration_min) ?? 0;
    const duration = Math.min(1440, Math.max(0, durationRaw));
    if (!startIso || !dateStr || duration < 1) continue;
    const startMs = new Date(startIso).getTime();
    if (startMs < minStartMs || startMs > maxStartMs) continue;
    const distKm = num(w.distance_m) !== null ? Math.round((clamp(num(w.distance_m), 0, 1000000)! / 1000) * 100) / 100 : 0;
    const rawCal = Math.round(clamp(num(w.calories), 0, 10000) ?? 0);
    const fallbackCal = Math.max(1, Math.round(duration * 4));
    const isCalFallback = rawCal <= 0;
    rows.push({
      id: PREFIX[src] + sid,
      hero,
      date: dateStr,
      type: cleanStr(w.type || "Workout", 40) || "Workout",
      name: cleanStr(w.name || w.type || "運動", 120) || "運動",
      duration: Math.round(duration * 10) / 10,
      distance: distKm, // km (與爬蟲一致)
      elevation: clamp(num(w.elevation_m), 0, 20000) ?? 0,
      avg_hr: Math.round(clamp(num(w.avg_hr), 0, 250) ?? 0),
      max_hr: Math.round(clamp(num(w.max_hr), 0, 250) ?? 0),
      // 若手錶與 Strava 皆無熱量 (rawCal == 0)，自動以「時間 × 4 kcal」作為保底熱量寫入，
      // 並於 extra.calories_is_fallback 標記為 true；一旦後續同步收到真實熱量 (!incIsFallback)，無條件替換為真實熱量！
      calories: isCalFallback ? fallbackCal : rawCal,
      is_manual: false,
      is_excluded: false,
      source: src,
      source_id: sid,
      origin_app: origin,
      device_name: cleanStr(w.device_name, 80) || null,
      start_time: startIso,
      end_time: toIsoOrNull(w.end_time),
      steps: clamp(num(w.steps), 0, 100000),
      extra: { calories_is_fallback: isCalFallback },
    });
  }

  let inserted = 0;
  let backfilled = 0;
  if (rows.length) {
    // 先讀取該英雄既有的手機運動紀錄，處理兩種先後同步順序：
    // (a) Strava 先同步進手機並上傳 (hc_strava_...)，Apple Watch / Pixel Watch 後同步進手機 (hc_watch_...)；
    // (b) 手錶 (如小米) 先同步進手機並上傳 (無熱量 → 先套用 時間×4 保底)，Strava 後同步進手機 (帶有真實熱量)。
    // 若新傳入的紀錄與雲端既有手機紀錄 ID 相同或時間重疊 (±5 分鐘)，直接將真實心率/真實熱量/距離回補至雲端既有紀錄！
    const { data: existingMobileActs } = await db.from("activities")
      .select("id, type, name, duration, avg_hr, max_hr, calories, distance, steps, origin_app, start_time, end_time, is_manual, extra")
      .eq("hero", hero)
      .in("source", ["apple_health", "health_connect"]);

    const existingById = new Map<string, Record<string, unknown>>();
    const existingList = (existingMobileActs || []) as Record<string, unknown>[];
    for (const ex of existingList) {
      existingById.set(String(ex.id), ex);
    }

    const overlapsInTime = (aStartIso: unknown, aDurMin: unknown, bStartIso: unknown, bDurMin: unknown): boolean => {
      if (!aStartIso || !bStartIso) return false;
      const aS = new Date(String(aStartIso)).getTime();
      const bS = new Date(String(bStartIso)).getTime();
      if (isNaN(aS) || isNaN(bS)) return false;
      const aE = aS + (Number(aDurMin) || 0) * 60000;
      const bE = bS + (Number(bDurMin) || 0) * 60000;
      const tol = 5 * 60000;
      return (aS - tol) < bE && (bS - tol) < aE;
    };

    const toInsert: Record<string, unknown>[] = [];
    for (const inc of rows) {
      const incId = String(inc.id);
      let matchedEx = existingById.get(incId);
      if (!matchedEx) {
        matchedEx = existingList.find((ex) =>
          overlapsInTime(inc.start_time, inc.duration, ex.start_time, ex.duration)
        );
      }
      if (!matchedEx) {
        toInsert.push(inc);
        continue;
      }
      if (matchedEx.is_manual) continue;

      const patch: Record<string, unknown> = {};
      const exOrigin = String(matchedEx.origin_app || "").toLowerCase();
      const incOrigin = String(inc.origin_app || "").toLowerCase();
      const incIsNativeWatch = !incOrigin.includes("strava");
      const exIsStrava = exOrigin.includes("strava");

      if ((!matchedEx.avg_hr || Number(matchedEx.avg_hr) <= 0 || (exIsStrava && incIsNativeWatch)) && Number(inc.avg_hr) > 0) {
        if (Number(matchedEx.avg_hr) !== Number(inc.avg_hr)) patch.avg_hr = inc.avg_hr;
      }
      if ((!matchedEx.max_hr || Number(matchedEx.max_hr) <= 0 || (exIsStrava && incIsNativeWatch)) && Number(inc.max_hr) > 0) {
        if (Number(matchedEx.max_hr) !== Number(inc.max_hr)) patch.max_hr = inc.max_hr;
      }

      // 熱量更新規則：
      // 1. 若雲端既有紀錄原本是 0 kcal，但新傳入有保底值或真實值 → 更新為新值
      // 2. 若雲端既有紀錄是「時間×4 保底值」(exIsFallback == true)，且新傳入的是「真實熱量」(!incIsFallback) → 無條件以真實熱量覆蓋保底值！
      // 3. 若兩者皆為真實熱量，取較完整/原生手錶之真實熱量
      const exCal = Number(matchedEx.calories) || 0;
      const incCal = Number(inc.calories) || 0;
      const exExtra = (matchedEx.extra && typeof matchedEx.extra === "object") ? (matchedEx.extra as Record<string, unknown>) : {};
      const incExtra = (inc.extra && typeof inc.extra === "object") ? (inc.extra as Record<string, unknown>) : {};
      const exFallback = Math.round((Number(matchedEx.duration) || Number(inc.duration) || 0) * 4);
      const exIsFallback = Boolean(exExtra.calories_is_fallback) || exCal <= 0 || exCal === exFallback;
      const incIsFallback = Boolean(incExtra.calories_is_fallback);

      if (exCal <= 0 && incCal > 0) {
        patch.calories = incCal;
        patch.extra = { ...exExtra, calories_is_fallback: incIsFallback };
      } else if (!incIsFallback && incCal > 0) {
        if (exIsFallback || incCal > exCal || (exIsStrava && incIsNativeWatch && incCal !== exCal)) {
          patch.calories = incCal;
          patch.extra = { ...exExtra, calories_is_fallback: false };
        }
      }
      if ((!matchedEx.distance || Number(matchedEx.distance) <= 0) && Number(inc.distance) > 0) {
        patch.distance = inc.distance;
      }
      if ((matchedEx.steps === null || matchedEx.steps === undefined || Number(matchedEx.steps) <= 0) && inc.steps !== null && Number(inc.steps) > 0) {
        patch.steps = inc.steps;
      }
      if (exIsStrava && incIsNativeWatch && incOrigin) {
        patch.origin_app = incOrigin;
      }
      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await db.from("activities").update(patch).eq("id", String(matchedEx.id));
        if (!upErr) backfilled++;
      }
    }

    if (toInsert.length) {
      const { data, error } = await db.from("activities")
        .upsert(toInsert, { onConflict: "id", ignoreDuplicates: true })
        .select("id");
      if (error) return json({ error: "db_error", message: error.message }, 500);
      inserted = (data || []).length;
    }
  }

  // ---- 每日健康數據 ----
  const fieldBounds: Record<string, [number, number, boolean]> = {
    steps: [0, 100000, true],
    active_kcal: [0, 10000, false],
    active_minutes: [0, 1440, true],
    sleep_minutes: [0, 1440, true],
    resting_hr: [20, 220, false],
    hrv_ms: [0, 500, false],
    spo2_pct: [50, 100, false],
  };
  const dailyRows: Record<string, unknown>[] = [];
  for (const d of daily as Record<string, unknown>[]) {
    const date = String(d.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const row: Record<string, unknown> = { hero, date, source: device.platform === "ios" ? "apple_health" : "health_connect", updated_at: new Date().toISOString() };
    let hasValue = false;
    for (const [f, [lo, hi, isInt]] of Object.entries(fieldBounds)) {
      const v = clamp(num(d[f]), lo, hi);
      if (v !== null) { row[f] = isInt ? Math.round(v) : v; hasValue = true; }
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
    app_version: cleanStr(body.app_version || device.app_version || "", 30),
  }).eq("id", deviceId);

  const { data: heroRow } = await db.from("heroes").select("max_hr").eq("name", hero).maybeSingle();
  return json({
    max_hr: heroRow?.max_hr ?? 185,
    hero_name: hero,
    inserted_workouts: inserted + backfilled,
    backfilled_workouts: backfilled,
    skipped_workouts: Math.max(0, workouts.length - inserted - backfilled),
    upserted_daily: dailyRows.length,
    server_time: new Date().toISOString(),
  });
});
