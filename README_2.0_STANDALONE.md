# 鋼鐵英雄紀元 2.0（獨立版）— 架設與切換手冊

> 這個資料夾是一套**完全獨立**的鋼鐵英雄紀元：自己的 Supabase 資料庫、自己的 GitHub repo、自己的 Vercel 網址。
> 舊版遊戲（舊 repo / 舊 Vercel / 舊 Supabase `yxkvbkfnlqwlybhmugki`）**一行都沒改**，玩家照常玩。

## 0. 一張圖看懂

```
平行測試期 (現在)                                   正式切換後
Strava ─► 舊爬蟲(舊repo) ─► 舊 Supabase              Strava ─► 新爬蟲(新repo) ─► 新 Supabase ─► 2.0 網站
                               │ 只讀
                               ▼ mirror_from_old.yml (每30分，只新增、ID重複跳過)
                           新 Supabase ─► 2.0 網站 / GM 後台 (你在這裡亂點測試)

切換方式：GM 後台「🛰️ 資料來源」按一下 + 到舊 GitHub 關掉舊爬蟲
```

| 項目 | 舊版 (照常運作) | 2.0 獨立版 |
|---|---|---|
| Supabase | `yxkvbkfnlqwlybhmugki` | `frhnfvdxukwzuzzklzyf` |
| 設定位置 | `public/js/supabaseClient.js` 寫死 | `public/js/env.js` (`supabaseUrl` / `anonKey`) |
| Strava 爬蟲 | 每 30 分自動 | 排程開著，但由 GM 後台「🛰️ 資料來源」開關決定要不要真的抓（預設不抓） |
| 資料來源 | Strava 爬蟲 | 平行期：從舊庫鏡像；切換後：自己的爬蟲 |
| 費用 | 0 | 0（Supabase 免費版可有 2 個專案、GitHub/Vercel 免費） |

## 1. 和舊版的差異（這個資料夾改了什麼）

| 檔案 | 改動 | 原因 |
|---|---|---|
| `public/js/env.js` | 新增 `supabaseUrl`、`anonKey`、`label` | 每個網站各自指定資料庫 |
| `public/js/supabaseClient.js` | 連線設定改讀 `env.js`；沒設定就報錯，**不會退回舊庫** | 避免 2.0 誤寫舊庫 |
| `scripts/strava_scraper.py` | 移除寫死的舊庫網址/金鑰；缺 Secrets 直接中止 | 避免新 repo 少設 Secret 時寫進舊庫 |
| `.github/workflows/strava_crawler.yml` | 移除舊庫預設值；每次執行先讀 GM 資料來源開關 | 平行期 Strava 只被抓一次；切換不用改檔案 |
| `scripts/data_source.py`、`public/js/dataSource.js`、`admin.html` | 新增「🛰️ 資料來源」開關與排程報到狀態 | 一鍵切換 + 確認排程有在跑 |
| `.github/workflows/mirror_from_old.yml` | 新增 | 平行期把舊庫新資料複製到新庫 |
| `scripts/sync_old_to_new.py` | 新增 | 鏡像/搬家程式（舊庫只讀） |
| `scripts/supabase_full_setup_v2.sql` | 新增 | 新專案一鍵建庫（資料表 + App 預備表 + 頭像 bucket） |
| `public/js/supabaseSync.js`、`game.js`、`admin.js`、`admin.html` | 資料片四「雙城激戰」新增 GM「⚔️ 陣營分配」：每個公會可選 自動 / 🟢 / 🔴，即時顯示兩隊人數；存在 `faction_config.guildAssign`，全選自動 = 與舊版相同 | 舊版依註冊順序交錯分隊，GM 無法控制、人數易失衡 |
| `public/index.html`、`public/js/game.js` | App 內嵌模式：`?app=1` 隱藏網頁頂部導覽、`?hero=名稱` 預選英雄、`window.IronApp.show()/refresh()` 給 App 原生分頁呼叫 | 手機 App「⚔️ 戰績」分頁直接嵌入網站，分數與網站 100% 一致 |
| r5：`mobileBadges.js`、`badgesCatalog.js`、`game.js`、`mobileModes.js`、`css/heroCard.css`、`img/bosses/`、`admin.*` | 200 枚手機徽章、統一大頭貼英雄卡、Boss 形象圖庫、資料片重新編號、夢境規則白話化 | 見 README.md 第 4-4 節 |
| `scripts/migrate_to_supabase.py` | 移除 | 舊的 Google Sheet 搬家工具，2.0 用不到且寫死舊庫 |

遊戲邏輯、7 個經典資料片、手機資料片 八/九/十/十一、GM 後台、限時加成、重複上傳偵測……全部與 BugFixed13 相同。

## 2. 架設步驟（Windows 全程用瀏覽器即可）

### 步驟 1：建立新資料庫的資料表（只做一次）
1. 打開 https://supabase.com/dashboard → 選新專案 `frhnfvdxukwzuzzklzyf`
2. 左側 **SQL Editor** → **New query** → 把 `scripts/supabase_full_setup_v2.sql` 全部貼上 → **Run**
3. 看到 `Success. No rows returned` 即完成（重複執行也安全）

### 步驟 2：把舊資料搬過來（第一次）
（已由 Jetski 在 Cloudtop 執行過一次 `full`；之後若要重置，用 GitHub Actions 的 full 模式即可。）

### 步驟 3：建立新的 GitHub repo
1. GitHub → **New repository**（例如 `iron-heroes-2`，可設 Private）
2. 把本資料夾全部內容上傳（含 `.github` 資料夾；網頁上傳若看不到隱藏資料夾，可用 GitHub Desktop）
3. **Settings → Secrets and variables → Actions → New repository secret**，新增 5 個：

| Secret 名稱 | 值 |
|---|---|
| `SUPABASE_URL` | `https://frhnfvdxukwzuzzklzyf.supabase.co`（新庫） |
| `SUPABASE_ANON_KEY` | 新庫 anon key（同 `env.js`） |
| `OLD_SUPABASE_URL` | `https://yxkvbkfnlqwlybhmugki.supabase.co`（舊庫，只讀用） |
| `OLD_SUPABASE_ANON_KEY` | 舊庫 anon key（舊版 `supabaseClient.js` 裡那串） |
| `STRAVA_COOKIE` | 跟舊 repo 一樣（切換時才會用到，可先設好） |

4. **Actions** 分頁 → 若出現「I understand my workflows, go ahead and enable them」就按下去
5. 手動測一次：Actions → **Mirror old DB -> 2.0 DB** → Run workflow → mode=`mirror` → 綠燈即成功

> 也可以手動 Run 一次 **Strava to Supabase Cloud Crawler**：在「鏡像」模式下它只會報到、不抓 Strava，GM 後台會看到「🏃 Strava 爬蟲：只報到」，代表排程與 Secrets 都正常。

### 步驟 4：建立新的 Vercel 網站
1. Vercel → **Add New → Project** → Import 剛剛的新 repo
2. Framework Preset 選 **Other**，其他全部預設 → Deploy
3. 得到新網址（例如 `iron-heroes-2.vercel.app`）；GM 後台：`新網址/admin.html`

## 3. 平行測試期：資料怎麼保證不重複、不打架？

| 情境 | 結果 |
|---|---|
| 舊爬蟲抓到新運動 | 30 分鐘內鏡像到新庫（ID 相同就跳過，不會重複） |
| 舊版有新玩家加入 | 新玩家（含頭像）會被複製到新庫 |
| 你在 2.0 改 GM 設定 / 作廢 / 補登 / 刪除 | 只影響新庫；鏡像**不會覆蓋**（只新增不覆蓋） |
| 你在 2.0 刪掉一筆從舊庫來的紀錄 | ⚠️ 下次鏡像會再補回來（因為舊庫還有）→ 測刪除請用「作廢」或接受它回來 |
| 舊版 GM 改設定 / 作廢紀錄 / 換頭像 | **不會**自動同步到 2.0（mirror 只新增）；需要時手動跑一次 `full` |
| 想把 2.0 重置成跟舊版一模一樣 | Actions → Mirror → mode=`full`（以舊庫為準覆蓋；新庫多出來的資料不會被刪） |

## 4. 正式切換：GM 後台「🛰️ 資料來源」開關

GM 後台（`/admin.html`）在「手機同步 App 管理中心」上方有 **🛰️ 資料來源** 區塊：

| 開關 | 新 repo 的 Mirror 排程 | 新 repo 的 Strava 爬蟲排程 |
|---|---|---|
| 🔁 鏡像舊資料庫（預設，平行測試期） | 每 30 分從舊庫複製「新」資料 | 只報到、不抓 Strava |
| 🏃 自己抓 Strava（正式營運） | 只報到、不複製 | 每 30 分抓 Strava 寫進新庫 |

- 兩個 GitHub 排程**一直開著**，每次執行前先讀這個開關（`scripts/data_source.py`）。
- 這個按鈕**不會**改 GitHub 設定（不需要 GitHub 金鑰，比較安全）。
- 區塊下方「📡 GitHub 排程最後報到」會顯示兩個排程最後一次執行時間、結果、STRAVA_COOKIE 是否已設定；超過 75 分鐘沒報到會顯示警告。
- 資料庫裡的設定：`game_config` 的 `data_source_config`、`data_source_status_mirror`、`data_source_status_crawler`（舊版程式會自動忽略這些 key）。

### 切換當天的檢查清單（建議在賽季結束、新賽季開始前）
- [ ] 1. GM 後台確認「📡 最後報到」兩行都是 ✅，且 🍪 STRAVA_COOKIE 已設定
- [ ] 2. 選「🏃 自己抓 Strava」→ 💾 套用 → 小視窗勾「我知道了」→ 確認切換
- [ ] 3. **照小視窗提醒：到「舊」GitHub 專案 → Actions → Strava to Supabase Cloud Crawler → ··· → Disable workflow**
- [ ] 4. 30 分鐘內回 GM 後台，「🏃 Strava 爬蟲」應顯示「抓取完成」
- [ ] 5. 把新網址發給玩家；舊網址首頁可放公告「已搬家到 …」
- [ ] 6. 觀察 1~2 週 → 舊 Vercel 可刪除；舊 Supabase 建議先 Pause 不要刪

**想退回？** 選「🔁 鏡像舊資料庫」→ 套用，並照提醒到舊 GitHub 把舊爬蟲 **Enable** 回來。

> 頭像已複製到新庫，舊 Supabase 關掉後頭像不會壞。
> 已切到「自己抓 Strava」時，Mirror 的 `full` 模式會被擋下（避免拿過期的舊資料覆蓋新庫）；真的需要可在本機加 `--force`。

## 5. 手機 App（未來）
- App 原始碼：另一個資料夾 **`Iron-heroes-2.0MobileApps`**（已改成連 2.0 新資料庫），測試流程見裡面的「測試App完整教學_給非工程師.md」。
- App 後端（3 個 Edge Functions）：新 repo → Actions → **Deploy mobile Edge Functions (App 後端)** 按一下即可部署，步驟見 `docs/MOBILE_SYNC_SETUP.md` 第 2 節。
- 新資料庫已預先建好 App 用的資料表。

## 6. 安全提醒
- `anon key` 本來就會出現在網頁裡，可以公開；**`service_role key` 絕對不要放進程式碼或聊天**。
- 所有程式缺少設定時一律「中止」，不會自動退回任何預設資料庫。
- GM 密碼與舊版相同（`admin.js` 內設定）。
