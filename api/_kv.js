// Vercel KV REST API Helper (Zero external dependencies)
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

function getInitialGameState() {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'game_data.json');
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
  } catch (e) {}

  return {
    activeMode: "world_boss",
    seasonStart: "2026/08/12",
    seasonEnd: "2026/08/31",
    boss: {
      name: "🌩️ 墮落雷神・索爾 (Fallen Thor)",
      subtitle: "世界 Boss 討伐戰 (全伺服器合作模式)",
      maxHp: 350000,
      currentHp: 232849,
      seasonStart: "2026/08/12",
      seasonEnd: "2026/08/31",
      avatar: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
      description: "索爾受到雷霆魔劍侵蝕陷入瘋狂，諸神黃昏即將降臨！唯有全服英雄透過每日嚴格汗水訓練，轉化為物理與魔法攻擊，方能拯救世界！",
      rules: { minDurationMinutes: 30.0, physMultiplier: 1.0, magicMultiplier: 15.0, critMultiplier: 100.0 }
    },
    guilds: [
      { name: "Cake", badge: "🍰", color: "#ec4899", members: ["Kerker", "Calla"] },
      { name: "咪咪胡胡", badge: "🐱", color: "#3b82f6", members: ["Naomi", "Weber"] },
      { name: "嘿喲嘿喲拔蘿蔔", badge: "🥕", color: "#f97316", members: ["Moupower", "Mooooo"] }
    ],
    heroes: [
      { name: "Kerker", guild: "Cake", age: 35, maxHr: 185, rpgClass: "狂戰士" },
      { name: "Calla", guild: "Cake", age: 35, maxHr: 185, rpgClass: "刺客" },
      { name: "Naomi", guild: "咪咪胡胡", age: 33, maxHr: 187, rpgClass: "聖騎士" },
      { name: "Weber", guild: "咪咪胡胡", age: 35, maxHr: 185, rpgClass: "大法師" },
      { name: "Moupower", guild: "嘿喲嘿喲拔蘿蔔", age: 35, maxHr: 185, rpgClass: "遊俠" },
      { name: "Mooooo", guild: "嘿喲嘿喲拔蘿蔔", age: 34, maxHr: 186, rpgClass: "狂戰士" }
    ],
    activities: [],
    snapshots: [],
    archivedSeasons: []
  };
}

async function getGameState() {
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await fetch(`${KV_URL}/get/game_state`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.result) {
          return typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        }
      }
    } catch (e) {
      console.error('KV get error:', e);
    }
  }
  return getInitialGameState();
}

async function setGameState(state) {
  if (KV_URL && KV_TOKEN) {
    try {
      const stateStr = typeof state === 'string' ? state : JSON.stringify(state);
      await fetch(`${KV_URL}/set/game_state`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(stateStr)
      });
      return true;
    } catch (e) {
      console.error('KV set error:', e);
    }
  }
  return false;
}

module.exports = {
  getGameState,
  setGameState,
  getInitialGameState
};
