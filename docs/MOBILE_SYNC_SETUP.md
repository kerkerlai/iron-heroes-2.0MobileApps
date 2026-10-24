# 📱 手機同步 App 啟用指南 (預備功能)

> 目前遊戲仍使用 **Strava 爬蟲**。以下步驟等你決定改用手機 App 時再做即可。
> 在 GM 後台打開「啟用手機同步 App」之前，所有新功能都不會作用，也不會發出任何額外的網路請求。

## 這個預備功能包含什麼
| 位置 | 內容 |
|---|---|
| `scripts/supabase_migration_mobile_v1.sql` | 資料庫擴充，**只新增、不刪改**：`activities` 新增來源欄位、新增 `daily_health`、`devices`、`invite_codes` 三張表，以及 `devices_public` 檢視表 |
| `supabase/functions/register-device` | 驗證邀請碼，綁定或建立英雄，發給這支手機專屬金鑰 |
| `supabase/functions/ingest-health` | 接收 App 上傳的運動與每日健康數據。**只新增、不覆蓋** GM 修改過的資料，並統一轉成台灣時間 |
| `supabase/functions/admin-mobile` | GM 後台專用：產生／刪除邀請碼、裝置清單、停用／恢復裝置 |
| `public/join.html` | 玩家邀請頁：自動判斷 iPhone 或 Android，顯示安裝連結和各品牌手錶的同步教學 |
| `public/privacy.html` | 隱私權政策（TestFlight 和 Google Play 審核需要） |
| GM 後台「📱 手機同步 App 管理中心」 | 啟用開關、下載連結、邀請碼、裝置連線健康度、Strava × 手機來源對帳 |
| 前台戰情室 | 顯示資料來源（🍎 Apple 健康／🤖 Health Connect＋手錶品牌），以及「近 7 天身體狀態」卡片（步數、睡眠、靜止心率、HRV、VO₂max） |
| 疑似重複判定 | 分數與時長都相同時，優先保留手機 App 的資料（Strava 和手機並行期間使用） |
| `public/js/mobileModes.js` | 📱 手機同步資料片：八 萬步遠征 / 九 夢境守護者 / 十一 不滅之火 / 十三 鐵人修行院（計算引擎＋前台畫面）。開啟手機同步後，才能在 GM 後台的資料片選單中選用；參數存在 `game_config.mobile_modes_config`。玩法與公式見根目錄 `README.md` 第 4 節 |

手機 App 原始碼在另一個資料夾 `Iron-heroes-2.0MobileApps`（Flutter），裡面有自己的 README。

## 啟用步驟（全部可以在 Windows 完成）

### 1. 擴充資料庫（約 1 分鐘）
Supabase Dashboard → **SQL Editor** → 貼上 `scripts/supabase_migration_mobile_v1.sql` 的全部內容 → **Run**。

### 2. 部署 Edge Functions（約 5 分鐘，免安裝任何軟體）
> 鋼鐵英雄紀元 2.0 新資料庫已經在建庫 SQL 裡包含第 1 步，可以跳過第 1 步。

1. 到 supabase.com → 右上角頭像 → **Account preferences** → **Access Tokens** → **Generate new token**（名稱填 `github`）→ 複製 `sbp_` 開頭那串。這串**只貼到 GitHub Secrets**，不要貼到聊天或任何檔案。
2. 新 GitHub repo → Settings → Secrets and variables → Actions，新增：
   - `SUPABASE_ACCESS_TOKEN` = 剛剛那串
   - `GM_PASSWORD` = GM 後台密碼（與 `public/js/admin.js` 的 `GM_MASTER_PASSWORD` 相同）
3. Actions → **Deploy mobile Edge Functions (App 後端)** → **Run workflow** → 等綠勾 ✅。
4. 確認：Supabase → 新專案 → 左側 **Edge Functions**，應看到 `register-device`、`ingest-health`、`admin-mobile` 三個。

`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 自動提供，不用自己設定。workflow 會拒絕部署到舊遊戲資料庫。

### 3. 發佈 App
依照 `Iron-heroes-2.0MobileApps 資料夾的「測試App完整教學_給非工程師.md」`：iPhone 版用 Codemagic 編譯後上傳 TestFlight；Android 版用 Google Play 內部測試或 APK。

### 4. GM 後台開啟
GM 後台 →「📱 手機同步 App 管理中心」：
1. 勾選「啟用手機同步 App」，填入 TestFlight／Google Play／APK 連結 → 儲存。
2. 按「🎟️ 產生邀請碼」→「📋 複製邀請連結」→ 貼到 LINE 群組。

### 5. 並行對帳 → 關閉 Strava
- 新舊來源並行 1–2 週，看「⚖️ 來源對帳」表。所有人都顯示 ✅ 一致之後，到 GitHub → Actions 停用 `strava_crawler` 排程。
- Strava 的歷史資料會保留，過去的分數和徽章都不會改變。

## 如何關閉／回復
- GM 後台取消勾選「啟用手機同步 App」：前台立刻回到純 Strava 模式。已上傳的手機運動紀錄仍會計分；如果不想計入，可以在運動紀錄管理中作廢。
- 資料庫新增的欄位和資料表留著不會影響任何現有功能。
