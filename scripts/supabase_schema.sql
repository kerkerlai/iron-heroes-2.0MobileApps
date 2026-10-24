--
-- 鋼鐵英雄紀元 (Iron Heroes Era) - Supabase 100% 雲端資料庫初始化架構
--

-- 1. 建立 heroes 冒險者名冊表
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

-- 2. 建立 activities 運動紀錄表 (支援爬蟲自動寫入與 GM 手動補登)
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

-- 3. 建立 game_config 賽季設定與歷史快照表
CREATE TABLE IF NOT EXISTS game_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 啟用 Row Level Security (RLS) 並開放公開讀寫 Policy
ALTER TABLE heroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on heroes" ON heroes;
CREATE POLICY "Allow public all on heroes" ON heroes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all on activities" ON activities;
CREATE POLICY "Allow public all on activities" ON activities FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all on game_config" ON game_config;
CREATE POLICY "Allow public all on game_config" ON game_config FOR ALL USING (true) WITH CHECK (true);
