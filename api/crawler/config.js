const { getGameState, setGameState } = require('../_kv');
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

function getDefaultCrawlerConfig() {
  try {
    const p = path.join(process.cwd(), 'data', 'crawler_config.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}

  return {
    athleteProfiles: {
      "468395126": "Kerker",
      "972959242": "Calla",
      "449473529": "Naomi",
      "2029007949": "Weber",
      "822925839": "Mooooo",
      "387396829": "Moupower"
    },
    excludeKeywords: ["羽球", "不想抓的關鍵字"],
    sheetUrl: "https://docs.google.com/spreadsheets/d/1gNr8ptE_zjIeZsliaEqddqp5xz3Ir0LT7AkLmnSh3pY/edit?gid=434984273#gid=434984273",
    worksheetName: "Rawdata"
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (KV_URL && KV_TOKEN) {
        await fetch(`${KV_URL}/set/crawler_config`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(JSON.stringify(body))
        });
      }
      return res.status(200).json({ success: true, config: body });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // GET
  if (KV_URL && KV_TOKEN) {
    try {
      const r = await fetch(`${KV_URL}/get/crawler_config`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      if (r.ok) {
        const json = await r.json();
        if (json && json.result) {
          const cfg = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
          return res.status(200).json(cfg);
        }
      }
    } catch (e) {}
  }

  res.status(200).json(getDefaultCrawlerConfig());
};
