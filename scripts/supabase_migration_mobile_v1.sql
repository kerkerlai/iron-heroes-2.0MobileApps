-- =====================================================================
-- 鋼鐵英雄紀元 • 手機同步 App 資料庫擴充 (Mobile Sync v1)
-- ---------------------------------------------------------------------
-- ⚠️ 預備功能：現在「不需要」執行。等決定改用手機 App 時，
--    到 Supabase Dashboard → SQL Editor 貼上整份執行一次即可。
-- ✅ 全部為「新增」(ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS)，
--    不會刪除或修改任何既有資料；Strava 爬蟲與現行網站可照常運作。
-- =====================================================================

-- 1. activities：新增資料來源相關欄位 (全部可為空，Strava 爬蟲不用改)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'strava';      -- strava | apple_health | health_connect | manual
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source_id TEXT;                     -- 來源平台原始 ID
ALTER TABLE activities ADD COLUMN IF NOT EXISTS origin_app TEXT;                    -- 寫入健康資料庫的 App (com.garmin.connect.mobile...)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS device_name TEXT;                   -- 手錶型號
ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS steps NUMERIC;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS hr_zone_minutes JSONB;           -- 預留：運動心率區間分鐘數 {z1..z5}
ALTER TABLE activities ADD COLUMN IF NOT EXISTS extra JSONB;                        -- 未來擴充用 (配速、功率、踏頻…)

-- 既有手動補登紀錄標記來源
UPDATE activities SET source = 'manual' WHERE is_manual = TRUE AND (source IS NULL OR source = 'strava');

-- 2. daily_health：每位英雄每天一筆的健康數據 (睡眠 / HRV / 步數 / 靜止心率…)
CREATE TABLE IF NOT EXISTS daily_health (
    hero TEXT NOT NULL,
    date DATE NOT NULL,                  -- 當地日期 (睡眠歸屬於「起床」那一天)
    source TEXT DEFAULT 'mobile',
    steps INTEGER,                       -- 每日步數 (系統彙總，已去除手錶+手機重複)
    active_kcal NUMERIC,                 -- 每日活動熱量
    active_minutes INTEGER,              -- 中高強度活動分鐘 (心率 >= 最大心率 64%)
    sleep_minutes INTEGER,               -- 主睡眠時長 (分鐘)
    bed_time TEXT,                       -- 主睡眠入睡時間 HH:MM
    wake_time TEXT,                      -- 主睡眠起床時間 HH:MM
    resting_hr NUMERIC,                  -- 靜止心率 (App 由睡眠期間最低 30 分鐘平均心率推算)
    hrv_ms NUMERIC,                      -- 選填，僅顯示不計分
    spo2_pct NUMERIC,                    -- 選填，僅顯示不計分
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (hero, date)
);

-- 3. devices：已綁定的手機 (金鑰只存雜湊值)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hero TEXT NOT NULL,
    platform TEXT NOT NULL,              -- ios | android
    device_model TEXT,
    app_version TEXT,
    token_hash TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_upload_count INTEGER DEFAULT 0,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS devices_hero_idx ON devices (hero);

-- 4. invite_codes：賽季邀請碼
CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    season TEXT,
    note TEXT,
    max_uses INTEGER DEFAULT 50,
    used_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 權限 (RLS)：
--    daily_health 開放「讀取」給網站；寫入只允許 Edge Function (service_role，不受 RLS 限制)
--    devices / invite_codes 不開放匿名讀寫 (含金鑰雜湊與邀請碼)，網站透過 devices_public 檢視表讀取安全欄位
ALTER TABLE daily_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read daily_health" ON daily_health;
CREATE POLICY "Public read daily_health" ON daily_health FOR SELECT USING (true);

CREATE OR REPLACE VIEW devices_public AS
  SELECT id, hero, platform, device_model, app_version, last_sync_at, last_upload_count, revoked, created_at
  FROM devices;
GRANT SELECT ON devices_public TO anon, authenticated;
