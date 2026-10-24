module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  res.status(200).json({
    success: true,
    isCloud: true,
    message: "Cloud Crawler Engine Active",
    output: `[GitHub Actions 雲端爬蟲架構]
⚡ Strava 爬蟲已由 GitHub Actions 雲端 Worker 託管 (每 30 分鐘自動定時執行)！

💡 隨時「立即手動抓取」最新運動步驟：
1. 請開啟您的 GitHub Repository Actions 頁面：
   👉 https://github.com/kerkerlai/strava-web_2.0/actions
2. 點選左側工作流【Strava to Google Sheet Crawler】
3. 點選右側藍色【Run workflow】按鈕 ➔ 雲端將在 30 秒內完成抓取並自動寫入 Google Sheet！

抓取完成後，回到本網頁點擊右上角【🔄 同步 Sheet】，即可即時更新最新戰況！`
  });
};
