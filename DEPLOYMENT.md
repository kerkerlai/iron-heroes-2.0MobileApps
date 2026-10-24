# ⚔️ 鋼鐵英雄紀元 (Iron Heroes Era) — 完整部屬與維運手冊

本專案為結合 **Strava 運動生理學計算**、**三大主題資料片**、**GM 大師控制台** 與 **GitHub Actions 雲端定時爬蟲** 的全功能競賽系統。

---

## 🏗️ 系統架構一覽

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 雲端自動採集層 (Data Ingestion)                          │
│    GitHub Actions (每 30 分鐘)                              │
│    └── scripts/strava_scraper.py (DOM 隔離 + Streams 數據流) │
│        └── 自動寫入 Google Sheet (工作表: Rawdata)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. 核心遊戲引擎與資料庫 (Core Engine & Storage)             │
│    • Google Sheet (權威運動 Rawdata)                        │
│    • Web 手動補登資料庫 + GM 異常作廢名單                   │
│    • 即時 TRIMP 衝力、無氧落差 Gap、三大傷害、天賦戰力計算   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 前端玩家體驗與 GM 維運平台 (Frontend & Admin Console)    │
│    • 前台遊戲看板 (index.html): 3 大資料片 + 戰情室 + 英雄史│
│    • GM 控制台 (admin.html): 密碼保護 (800402) + 爬蟲控制   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 部屬方案一：GitHub Actions + Vercel / Cloudflare（推薦 • 零成本永久自動化）

這是最省心、零主機維護成本的推薦架構：

### 步驟 1：將程式碼推送至 GitHub Repository
```bash
git init
git add .
git commit -m "feat: Release Iron Heroes Era v2.0"
git branch -M main
git remote add origin https://github.com/<你的用戶名>/<你的專案名稱>.git
git push -u origin main
```

### 步驟 2：設定 GitHub Actions 爬蟲密鑰 (Repository Secrets)
前往 GitHub Repo ➔ **Settings** ➔ **Secrets and variables** ➔ **Actions** ➔ **New repository secret**：
1. **`GOOGLE_SHEETS_CREDENTIALS`**：貼上 Google Service Account 的完整 JSON 密鑰內容。
2. **`STRAVA_COOKIE`**：貼上您的 Strava 登入 Cookie（包含 `_strava4_session=...`）。

> 💡 **自動生效**：GitHub Actions 即刻啟動，每 30 分鐘自動爬取運動資料並寫入 Google Sheet `Rawdata`！

### 步驟 3：部屬 Web 前端至 Vercel
1. 前往 [Vercel](https://vercel.com/) 點選 **Add New Project**。
2. 匯入剛才建立的 GitHub Repository。
3. 根目錄 (Root Directory) 選擇預設，點選 **Deploy**。
4. 取得專屬網址（例如：`https://iron-heroes-era.vercel.app`），全站即可永久在線！

---

## 🐳 部屬方案二：Docker / 自建 Linux 伺服器 (VPS / Cloud Run)

若您希望前後端、即時 SSE 廣播與本地 Python 爬蟲全部在同一台伺服器運行：

### 1. 本地/伺服器直接執行
```bash
# 1. 安裝必要套件
pip install -r requirements.txt # (requests, beautifulsoup4, gspread, google-auth)

# 2. 啟動伺服器 (預設 8080 Port)
python3 server.py 8080
```

### 2. 背景守護行程 (Systemd Service)
建立 `/etc/systemd/system/iron-heroes.service`：
```ini
[Unit]
Description=Iron Heroes Era Web Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/iron-heroes-web
ExecStart=/usr/bin/python3 server.py 8080
Restart=always

[Install]
WantedBy=multi-user.target
```
啟動服務：
```bash
sudo systemctl enable --now iron-heroes
```

---

## 🔑 GM 大師控制台存取資訊

* **控制台路徑**：`/admin` 或 `/admin.html`
* **通行密碼**：`800402`
* **維護功能一覽**：
  * 🏆 **資料片模式切換**：經典競技、RPG 職業天賦、世界 Boss 討伐戰。
  * 📅 **日曆賽季時間選擇**：視覺化日曆即時調整賽事起訖日。
  * 🕷️ **Strava 爬蟲管理**：新增選手 Strava ID、排除黑名單關鍵字、立即測試執行。
  * 📸 **賽季歷史快照 (Snapshots)**：一鍵封存歷史賽季，永存過往英雄史。
  * 🏃 **運動紀錄審核**：手動補登、GM 異常作廢。
  * 👥 **英雄與公會名冊維護**。
