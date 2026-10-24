-- =====================================================================
-- 鋼鐵英雄紀元 2.0 — 新 Supabase 專案「一鍵建庫」SQL
-- ---------------------------------------------------------------------
-- 用法：新 Supabase 專案 → 左側 SQL Editor → New query → 貼上整份 → Run
-- 可重複執行 (全部 IF NOT EXISTS / DROP ... IF EXISTS)，不會刪除任何資料。
-- 內容：
--   1. 遊戲主資料表 heroes / activities / game_config
--   2. 手機 App 預備資料表 daily_health / devices / invite_codes (App 上線前不會被使用)
--   3. 頭像圖片儲存空間 avatars (公開讀取、網站可上傳/覆蓋)
-- ⚠️ 只在「新」專案執行；舊專案不需要也不要執行。
-- =====================================================================

-- ---------- 1. 遊戲主資料表 ----------
CREATE TABLE IF NOT EXISTS heroes (
    name TEXT PRIMARY KEY,
    age INTEGER DEFAULT 35,
    max_hr INTEGER DEFAULT 185,
    guild TEXT DEFAULT '自由英雄',
    rpg_class TEXT DEFAULT '狂戰士',
    strava_id TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    hero TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT DEFAULT 'Workout',
    name TEXT DEFAULT '運動',
    duration NUMERIC DEFAULT 0,
    distance NUMERIC DEFAULT 0,
    elevation NUMERIC DEFAULT 0,
    avg_hr NUMERIC DEFAULT 0,
    max_hr NUMERIC DEFAULT 0,
    calories NUMERIC DEFAULT 0,
    is_manual BOOLEAN DEFAULT FALSE,
    is_excluded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 手機 App 資料來源欄位 (全部可為空，Strava 爬蟲不用改)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'strava';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS origin_app TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS steps NUMERIC;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS hr_zone_minutes JSONB;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS extra JSONB;
CREATE INDEX IF NOT EXISTS activities_hero_idx ON activities (hero);

ALTER TABLE heroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on heroes" ON heroes;
CREATE POLICY "Allow public all on heroes" ON heroes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public all on activities" ON activities;
CREATE POLICY "Allow public all on activities" ON activities FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public all on game_config" ON game_config;
CREATE POLICY "Allow public all on game_config" ON game_config FOR ALL USING (true) WITH CHECK (true);

-- 明確授權 (較新的 Supabase 專案不一定自動開放資料表給 API)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON heroes, activities, game_config TO anon, authenticated;

-- ---------- 2. 手機 App 預備資料表 (App 上線前不會被使用) ----------
CREATE TABLE IF NOT EXISTS daily_health (
    hero TEXT NOT NULL,
    date DATE NOT NULL,
    source TEXT DEFAULT 'mobile',
    steps INTEGER,
    active_kcal NUMERIC,
    active_minutes INTEGER,
    sleep_minutes INTEGER,
    bed_time TEXT,
    wake_time TEXT,
    resting_hr NUMERIC,
    hrv_ms NUMERIC,
    spo2_pct NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (hero, date)
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hero TEXT NOT NULL,
    platform TEXT NOT NULL,
    device_model TEXT,
    app_version TEXT,
    token_hash TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    last_upload_count INTEGER DEFAULT 0,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS devices_hero_idx ON devices (hero);

CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    season TEXT,
    note TEXT,
    max_uses INTEGER DEFAULT 50,
    used_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE daily_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read daily_health" ON daily_health;
CREATE POLICY "Public read daily_health" ON daily_health FOR SELECT USING (true);
GRANT SELECT ON daily_health TO anon, authenticated;
REVOKE ALL ON devices, invite_codes FROM anon, authenticated;

CREATE OR REPLACE VIEW devices_public AS
  SELECT id, hero, platform, device_model, app_version, last_sync_at, last_upload_count, revoked, created_at
  FROM devices;
GRANT SELECT ON devices_public TO anon, authenticated;

-- ---------- 3. 頭像儲存空間 avatars ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars public insert" ON storage.objects;
CREATE POLICY "avatars public insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars public update" ON storage.objects;
CREATE POLICY "avatars public update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');

-- 讓 API 立即認得新資料表
NOTIFY pgrst, 'reload schema';

-- 完成後應看到 "Success. No rows returned"
