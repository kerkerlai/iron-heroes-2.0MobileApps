# Iron Heroes Mobile Sync — API Contract v1 (shared by Flutter app & Supabase Edge Functions)

Base URL: `https://frhnfvdxukwzuzzklzyf.supabase.co/functions/v1`
All requests: headers `apikey: <SUPABASE_ANON_KEY>`, `Authorization: Bearer <SUPABASE_ANON_KEY>`, `Content-Type: application/json`.

## 1. POST /register-device
Request:
```json
{
  "invite_code": "S6-AB12CD",
  "hero_name": "Calla",            // existing hero name, or new name when creating
  "create_new_hero": false,         // true = create hero row if not exists
  "age": 35,                        // optional, used when creating
  "guild": "Cake",                  // optional, used when creating
  "platform": "ios",                // "ios" | "android"
  "device_model": "iPhone15,2",
  "app_version": "1.0.0+1"
}
```
Response 200:
```json
{ "device_id": "uuid", "device_token": "random-64-hex", "hero_name": "Calla", "max_hr": 185 }
```
Errors: 400 invalid body, 403 invalid/expired/used-up invite, 404 hero not found (when create_new_hero=false), 409 hero exists (when create_new_hero=true) or `hero_already_bound` (hero already bound to an active device), 500 `db_error`.
The app must store `device_id` + `device_token` in secure storage. Token is shown only once (server stores SHA-256 hash).

## 2. POST /ingest-health
Extra header: `x-device-token: <device_token>`
Request:
```json
{
  "device_id": "uuid",
  "app_version": "1.0.0+1",
  "workouts": [
    {
      "source_id": "6F1C...UUID",          // HealthKit workout UUID or Health Connect record id (stable!)
      "platform_source": "apple_health",    // "apple_health" | "health_connect"
      "origin_app": "com.garmin.connect.mobile", // HK source bundle id / HC dataOrigin package
      "device_name": "Forerunner 265",      // optional
      "type": "Run",                        // normalized: Run, Walk, Ride, Swim, Hike, WeightTraining, Yoga, HIIT, Workout, ...
      "start_time": "2026-10-22T09:26:04Z", // ISO-8601 with offset/Z
      "end_time":   "2026-10-22T10:01:04Z",
      "duration_min": 35.0,                 // active duration in minutes
      "avg_hr": 142, "max_hr": 171,          // computed from HR samples in the workout window (0 if none)
      "calories": 420,                       // active kcal (fallback total kcal)
      "distance_m": 6020,                    // optional
      "steps": 5200                          // optional
    }
  ],
  "daily": [
    {
      "date": "2026-10-22",                 // local (device) calendar date (sleep is attributed to WAKE-UP date)
      "steps": 9821,                        // OS aggregate (de-duplicated)
      "active_kcal": 612,                   // OS aggregate
      "active_minutes": 42,                 // v1.1: minutes that day with HR >= 64% of hero max_hr (from HR samples, 1-min buckets)
      "sleep_minutes": 412,                 // main sleep session asleep minutes
      "bed_time": "23:48",                  // v1.1: local HH:MM the main sleep started (may be previous calendar day)
      "wake_time": "07:02",                 // v1.1: local HH:MM the main sleep ended
      "resting_hr": 56,                     // v1.1: DERIVED by the app = lowest 30-min average HR inside the main sleep window (fallback: OS resting HR, else null)
      "hrv_ms": 48.2, "spo2_pct": 97.5      // optional, display-only (not used for scoring)
    }
  ]
}
```
v1.1 REMOVED fields (do not send): weight_kg, body_fat_pct, vo2max, sleep_deep_min, sleep_rem_min, elevation_m.
All daily fields optional/null. Max 500 workouts + 120 daily rows per request (client batches).
Response 200: `{ "inserted_workouts": 3, "skipped_workouts": 1, "upserted_daily": 7, "server_time": "...", "max_hr": 185, "hero_name": "Calla" }`  (v1.1: app should store max_hr and hero_name so GM age/rename updates propagate automatically)
Errors: 401 bad/revoked token, 400 invalid body, 500 `db_error`.

Server rules:
- activities.id = `ah_<source_id>` (apple_health) or `hc_<source_id>` (health_connect); insert with ignore-duplicates (never overwrite GM edits).
- activities.date = start_time converted to Asia/Taipei as `YYYY/MM/DD HH:MM:SS` (same format as Strava crawler) so cross-source overlap detection works.
- hero = the device's bound hero.
- daily_health upsert on (hero, date) — newer values overwrite nulls / older values.
- updates devices.last_sync_at, app_version.

## Client rules (Flutter app)
- SKIP workouts whose origin_app is Strava (`com.strava`, `com.strava.stravaride`, any id containing "strava") — Strava data already comes from the crawler; prevents echo duplicates.
- Use aggregate/statistics queries for daily steps/kcal (OS de-duplicates watch+phone).
- First sync: last 30 days. Then incremental from `last_sync_at - 2 days` (overlap window; server is idempotent).
- Only workouts with duration >= 1 minute.
