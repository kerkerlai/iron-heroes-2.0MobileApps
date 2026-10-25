/**
 * 鋼鐵英雄紀元 - Supabase Live Synchronizer (v3.0 雲端直連版)
 * 100% 擺脫 Google Sheet，直連 Supabase PostgreSQL 提供毫秒級跨裝置即時同步
 */

/**
 * ⚔️ 資料片四「雙城激戰」陣營分配 (前台與 GM 後台共用)
 * guildAssign: { 公會名稱: 1 | 2 }，由 GM 後台指定；沒指定的公會照舊規則自動分：
 *   依公會排列順序 (公會中最早註冊英雄的先後) 第 1、3、5… 個 → 陣營 1，第 2、4… 個 → 陣營 2
 * 全部都沒指定時，結果與舊版完全相同。
 */
function computeFactionSplit(guildNames, guildAssign) {
  const assign = guildAssign || {};
  const out = { 1: [], 2: [] };
  (guildNames || []).forEach((name, idx) => {
    const a = Number(assign[name]);
    const side = (a === 1 || a === 2) ? a : (idx % 2 === 0 ? 1 : 2);
    out[side].push(name);
  });
  return out;
}
window.computeFactionSplit = computeFactionSplit;

/**
 * 🛡️ XSS 防護：把資料庫來的自由文字中的 HTML 特殊字元換成全形 (畫面看起來一樣，但瀏覽器不會當成程式碼)
 * 網址類欄位 (avatar、url、link…) 與日期/數字不處理。
 */
const SAFE_TEXT_MAP = { '<': '＜', '>': '＞', '"': '＂', "'": '＇', '`': '｀' };
const UNSAFE_TEXT_MAP = { '＜': '<', '＞': '>', '＂': '"', '＇': "'", '｀': '`' };
function safeDisplayText(v) {
  return typeof v === 'string' ? v.replace(/[<>"'`]/g, c => SAFE_TEXT_MAP[c]) : v;
}
function rawDbText(v) {
  return typeof v === 'string' ? v.replace(/[＜＞＂＇｀]/g, c => UNSAFE_TEXT_MAP[c]) : v;
}
function deepRaw(v) {
  if (typeof v === 'string') return rawDbText(v);
  if (Array.isArray(v)) return v.map(deepRaw);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach(k => { out[rawDbText(k)] = deepRaw(v[k]); });
    return out;
  }
  return v;
}
const SAFE_SKIP_KEY = /(avatar|url|link|href|src|image|img)$/i;
function deepSafe(v, keyName) {
  if (typeof v === 'string') return SAFE_SKIP_KEY.test(keyName || '') ? v : safeDisplayText(v);
  if (Array.isArray(v)) return v.map(x => deepSafe(x, keyName));
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach(k => { out[safeDisplayText(k)] = deepSafe(v[k], k); });
    return out;
  }
  return v;
}
function sanitizeDbRows(heroes, acts, config) {
  (heroes || []).forEach(h => {
    if (h && h.__rawName === undefined) h.__rawName = h.name;
    ['name', 'guild', 'rpg_class', 'strava_id'].forEach(k => { if (h[k] != null) h[k] = safeDisplayText(String(h[k])); });
  });
  (acts || []).forEach(a => {
    if (a && a.__rawName === undefined) a.__rawName = a.name;
    if (a && a.__rawHero === undefined) a.__rawHero = a.hero;
    ['hero', 'name', 'type', 'device_name', 'origin_app', 'source', 'id'].forEach(k => { if (typeof a[k] === 'string') a[k] = safeDisplayText(a[k]); });
  });
  (config || []).forEach(c => { if (c && c.value != null) c.value = deepSafe(c.value, c.key); });
}
window.safeDisplayText = safeDisplayText;
window.rawDbText = rawDbText;
window.deepRaw = deepRaw;
window.sanitizeDbRows = sanitizeDbRows;

const SYNC_CONFIG = {
  pollIntervalSeconds: 30
};

/**
 * 跨瀏覽器高相容繁體中文/標準日期時間解析器 (支援上下午 12/24小時制)
 */
function parseActivityDate(dateStr) {
  if (!dateStr) return null;
  try {
    const s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d/.test(s)) {
      const iso = new Date(s);
      if (!isNaN(iso.getTime())) return iso;
    }
    const isPM = s.includes('下午') || s.toUpperCase().includes('PM');
    const isAM = s.includes('上午') || s.toUpperCase().includes('AM');
    const cleaned = s.replace(/下午|上午|AM|PM/gi, '').trim();

    const parts = cleaned.split(/\s+/);
    const datePart = parts[0];
    const timePart = parts[1] || '00:00:00';

    const dp = datePart.replace(/-/g, '/').split('/').map(x => parseInt(x, 10));
    if (dp.length < 3 || isNaN(dp[0]) || isNaN(dp[1]) || isNaN(dp[2])) {
      return new Date(cleaned);
    }
    const year = dp[0];
    const month = dp[1] - 1;
    const day = dp[2];

    const tp = timePart.split(':').map(x => parseInt(x, 10));
    let hour = tp[0] || 0;
    const minute = tp[1] || 0;
    const second = tp[2] || 0;

    if (isPM && hour < 12) {
      hour += 12;
    } else if (isAM && hour === 12) {
      hour = 0;
    }

    return new Date(year, month, day, hour, minute, second);
  } catch (e) {
    return null;
  }
}

function cleanNumber(val, defaultVal = 0.0) {
  if (val === undefined || val === null) return defaultVal;
  const str = String(val).replace(/[\*,\s"]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? defaultVal : num;
}

/**
 * 【疑似重複上傳自動判定】
 * Strava 常因多個來源 (手錶 / 手機 App / 第三方) 同步而出現同一場運動多筆紀錄。
 * 規則：同一位英雄、運動「開始時間 ~ 開始時間+時長」有重疊的紀錄視為同一組，
 *   - 保留「當前資料片有效分數」最高的一筆；若全部 0 分則保留時長最長的一筆 (再相同則保留較早上傳者)。
 *   - 其餘標記為「疑似重複 (不計分)」，除非 GM 在後台勾選「納入計算」(gmOps.duplicateOverrides[actId] = true)。
 *   - GM 已手動作廢的紀錄不參與判定。
 * @param {Array} rows 每筆需含 { id, hero, start(Date), duration(分), score(數字), excluded(bool), priority(選填：分數與時長都相同時，數字大者優先保留；手機 App 來源 = 1) }
 * @returns {Object} map: actId -> { duplicateOf: 保留紀錄的 id, groupIds: [...] }
 */
function detectDuplicateActivities(rows) {
  const result = {};
  const byHero = {};
  (rows || []).forEach(r => {
    if (!r || r.excluded || !r.start || isNaN(r.start.getTime()) || !(r.duration > 0)) return;
    (byHero[r.hero] = byHero[r.hero] || []).push(r);
  });
  const idNum = (id) => (/^\d+$/.test(String(id)) ? Number(id) : Number.MAX_SAFE_INTEGER);
  Object.values(byHero).forEach(list => {
    list.sort((a, b) => a.start - b.start);
    let group = [];
    let groupEnd = -Infinity;
    const flush = () => {
      if (group.length > 1) {
        const keeper = group.slice().sort((a, b) =>
          (b.score - a.score) || (b.duration - a.duration) || ((b.priority || 0) - (a.priority || 0)) || (idNum(a.id) - idNum(b.id)) || String(a.id).localeCompare(String(b.id))
        )[0];
        const ids = group.map(g => String(g.id));
        group.forEach(g => {
          if (g !== keeper) result[String(g.id)] = { duplicateOf: String(keeper.id), groupIds: ids };
        });
      }
      group = [];
      groupEnd = -Infinity;
    };
    list.forEach(r => {
      const s = r.start.getTime();
      const e = s + r.duration * 60000;
      if (group.length && s < groupEnd) {
        group.push(r);
        groupEnd = Math.max(groupEnd, e);
      } else {
        flush();
        group = [r];
        groupEnd = e;
      }
    });
    flush();
  });
  return result;
}
window.detectDuplicateActivities = detectDuplicateActivities;

const GUILD_COLOR_MAP = {
  'Cake': { badge: '🍰', color: '#ec4899' },
  '咪咪胡胡': { badge: '🐱', color: '#a855f7' },
  '嘿喲嘿喲拔蘿蔔': { badge: '🥕', color: '#f97316' },
  '天琳琳地琳琳': { badge: '⚡', color: '#3b82f6' },
  '試試看': { badge: '🎯', color: '#10b981' },
  '自由英雄': { badge: '🛡️', color: '#64748b' }
};

/**
 * 計算經典競技模式 (Classic Mode) 八大指標與四冠王數據
 */
function calculateLiveClassicStats(state) {
  const targetState = state || window.gameState || {};
  const heroes = targetState.heroes || [];
  const guilds = targetState.guilds || [];
  const activities = targetState.activities || [];
  const validActs = activities.filter(a => a.isValidAttack !== false && !a.isExcluded);

  const heroDataMap = {};
  heroes.forEach(h => {
    heroDataMap[h.name] = {
      name: h.name,
      guild: h.guild,
      avatar: h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`,
      maxHr: h.maxHr || 185,
      workouts: 0,
      duration: 0,
      calories: 0,
      trimp: 0,
      zone2: 0, elevation: 0,
      gapSum: 0,
      maxGap: 0,
      suffer: 0,
      density: 0
    };
  });

  validActs.forEach(a => {
    const h = heroDataMap[a.hero];
    if (h) {
      const w = (a.scoreWeight ?? 1);
      h.workouts += w;
      h.duration += (a.durationScore ?? a.duration ?? 0);
      h.rawDuration = (h.rawDuration || 0) + (a.duration || 0);
      h.calories += (a.calories || 0);
      h.elevation += (a.elevation || 0);
      h.trimp += (a.trimp || 0);
      if (a.isZone2) h.zone2 += w;
      h.gapSum += (a.gapScore ?? a.gap ?? 0);
      h.maxGap = Math.max(h.maxGap, a.gapScore ?? a.gap ?? 0);
      h.suffer += (a.suffer || 0);
    }
  });

  Object.values(heroDataMap).forEach(h => {
    h.density = h.rawDuration > 0 ? Math.round((h.suffer / h.rawDuration) * 100) / 100 : 0;
  });

  const guildDataMap = {};
  guilds.forEach(g => {
    const members = g.members || [];
    const memberCount = Math.max(1, members.length);
    guildDataMap[g.name] = {
      name: g.name,
      badge: g.badge || '🛡️',
      color: g.color || '#3b82f6',
      memberCount: memberCount,
      members: members,
      totalWorkouts: 0,
      totalDuration: 0,
      totalCalories: 0,
      totalTrimp: 0,
      totalZone2: 0,
      totalGap: 0,
      totalSuffer: 0,
      perWorkouts: 0,
      perDuration: 0,
      perCalories: 0,
      perTrimp: 0,
      perZone2: 0,
      perGap: 0,
      perSuffer: 0,
      perDensity: 0
    };
  });

  Object.values(heroDataMap).forEach(h => {
    const g = guildDataMap[h.guild];
    if (g) {
      g.totalWorkouts += h.workouts;
      g.totalDuration += h.duration;
      g.totalRawDuration = (g.totalRawDuration || 0) + (h.rawDuration || 0);
      g.totalCalories += h.calories;
      g.totalTrimp += h.trimp;
      g.totalZone2 += h.zone2;
      g.totalGap += h.gapSum;
      g.totalSuffer += h.suffer;
    }
  });

  Object.values(guildDataMap).forEach(g => {
    g.perWorkouts = Math.round((g.totalWorkouts / g.memberCount) * 10) / 10;
    g.perDuration = Math.round((g.totalDuration / g.memberCount) * 10) / 10;
    g.perCalories = Math.round(g.totalCalories / g.memberCount);
    g.perTrimp = Math.round((g.totalTrimp / g.memberCount) * 10) / 10;
    g.perZone2 = Math.round((g.totalZone2 / g.memberCount) * 10) / 10;
    g.perGap = Math.round((g.totalGap / g.memberCount) * 10) / 10;
    g.perSuffer = Math.round((g.totalSuffer / g.memberCount) * 10) / 10;
    g.perDensity = g.totalRawDuration > 0 ? Math.round((g.totalSuffer / g.totalRawDuration) * 100) / 100 : 0;
  });

  const gList = Object.values(guildDataMap);
  const hList = Object.values(heroDataMap);

  const maxGTrimp = Math.max(1, ...gList.map(g => g.perTrimp));
  const maxGCal = Math.max(1, ...gList.map(g => g.perCalories));
  const maxGZone2 = Math.max(1, ...gList.map(g => g.perZone2));
  const maxGGap = Math.max(1, ...gList.map(g => g.perGap));
  const maxGDens = Math.max(0.1, ...gList.map(g => g.perDensity));
  const maxGWk = Math.max(1, ...gList.map(g => g.perWorkouts));

  const maxHTrimp = Math.max(1, ...hList.map(h => h.trimp));
  const maxHCal = Math.max(1, ...hList.map(h => h.calories));
  const maxHZone2 = Math.max(1, ...hList.map(h => h.zone2));
  const maxHGap = Math.max(1, ...hList.map(h => h.gapSum));
  const maxHDens = Math.max(0.1, ...hList.map(h => h.density));
  const maxHWk = Math.max(1, ...hList.map(h => h.workouts));

  const teamAerobic = gList.map(g => ({
    name: g.name,
    score: Math.round(((g.perTrimp / maxGTrimp) * 40 + (g.perCalories / maxGCal) * 30 + (g.perZone2 / maxGZone2) * 30) * 100) / 100
  })).sort((a, b) => b.score - a.score).map((t, idx) => ({
    ...t, rank: idx + 1, badge: idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''))
  }));

  const heroAerobic = hList.map(h => ({
    name: h.name, guild: h.guild,
    score: Math.round(((h.trimp / maxHTrimp) * 40 + (h.calories / maxHCal) * 30 + (h.zone2 / maxHZone2) * 30) * 100) / 100
  })).sort((a, b) => b.score - a.score).map((h, idx) => ({
    ...h, rank: idx + 1, badge: idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''))
  }));

  const teamAnaerobic = gList.map(g => ({
    name: g.name,
    score: Math.round(((g.perGap / maxGGap) * 50 + (g.perDensity / maxGDens) * 30 + (g.perWorkouts / maxGWk) * 20) * 100) / 100
  })).sort((a, b) => b.score - a.score).map((t, idx) => ({
    ...t, rank: idx + 1, badge: idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''))
  }));

  const heroAnaerobic = hList.map(h => ({
    name: h.name, guild: h.guild,
    score: Math.round(((h.gapSum / maxHGap) * 40 + (h.density / maxHDens) * 30 + (h.maxHr / 220) * 15 + (h.workouts / maxHWk) * 15) * 100) / 100
  })).sort((a, b) => b.score - a.score).map((h, idx) => ({
    ...h, rank: idx + 1, badge: idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''))
  }));

  const buildLeaderboard = (getter, unit) => {
    return [...gList].sort((a, b) => getter(b) - getter(a)).map((g, idx) => ({
      rank: idx === 0 ? '🥇 1' : (idx === 1 ? '🥈 2' : (idx === 2 ? '🥉 3' : `#${idx+1}`)),
      team: g.name,
      value: getter(g).toLocaleString()
    }));
  };

  const teamMetrics = [
    { metric: "🏋️ 鋼鐵紀律 (人均出勤)", unit: "次", leaderboard: buildLeaderboard(g => g.perWorkouts) },
    { metric: "⏱️ 精神時光屋 (人均時長)", unit: "分鐘", leaderboard: buildLeaderboard(g => g.perDuration) },
    { metric: "🔋 燃脂發電機 (人均熱量)", unit: "kcal", leaderboard: buildLeaderboard(g => g.perCalories) },
    { metric: "🚀 引擎過載 (人均衝力 TRIMP)", unit: "TRIMP", leaderboard: buildLeaderboard(g => g.perTrimp) },
    { metric: "🟢 有氧大師 (人均有氧次數)", unit: "次", leaderboard: buildLeaderboard(g => g.perZone2) },
    { metric: "🦍 絕對力量 (人均落差 Gap)", unit: "bpm", leaderboard: buildLeaderboard(g => g.perGap) },
    { metric: "💥 效率之王 (人均密度)", unit: "分", leaderboard: buildLeaderboard(g => g.perDensity) },
    { metric: "🥵 燃燒殆盡 (人均痛苦 Suffer)", unit: "分", leaderboard: buildLeaderboard(g => g.perSuffer) }
  ];

  return { champions: { teamAerobic, heroAerobic, teamAnaerobic, heroAnaerobic }, teamMetrics, guildList: gList, heroList: hList };
}

const DEFAULT_RPG_CLASSES = {
  '狂戰士': {
    name: '狂戰士',
    enName: 'Berserker',
    badge: '⚔️',
    color: '#ef4444',
    bg: 'bg-rose-950/40 border-rose-500/50 text-rose-300',
    passiveName: '血性狂暴 (Bloodrage)',
    passiveDesc: '無氧落差 (Gap) 獲得 +30% 額外戰力加成，大重量力竭突破。'
  },
  '聖騎士': {
    name: '聖騎士',
    enName: 'Paladin',
    badge: '🛡️',
    color: '#eab308',
    bg: 'bg-amber-950/40 border-amber-500/50 text-amber-300',
    passiveName: '鋼鐵壁壘 (Iron Bastion)',
    passiveDesc: '出勤次數 × 150 點聖光防禦值，痛苦承受力轉化為堅毅戰力。'
  },
  '遊俠': {
    name: '遊俠',
    enName: 'Ranger',
    badge: '🏹',
    color: '#10b981',
    bg: 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300',
    passiveName: '精準巡航 (Precision Cruise)',
    passiveDesc: 'Zone 2 有氧燃脂次數獲得 +35% 加成，巡航耐力極致轉化。'
  },
  '大法師': {
    name: '大法師',
    enName: 'Grand Mage',
    badge: '🧙',
    color: '#06b6d4',
    bg: 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300',
    passiveName: '奧術過載 (Arcane Overload)',
    passiveDesc: '訓練衝力 TRIMP 放大 1.5 倍奧術增幅，心肺負荷戰力最高。'
  },
  '刺客': {
    name: '刺客',
    enName: 'Shadow Assassin',
    badge: '🗡️',
    color: '#a855f7',
    bg: 'bg-purple-950/40 border-purple-500/50 text-purple-300',
    passiveName: '致命密擊 (Lethal Density)',
    passiveDesc: '訓練密度 (Density) 獲得 2.0 倍暗影刺殺加成，短時極致爆發。'
  }
};
if (!window.RPG_CLASSES) window.RPG_CLASSES = DEFAULT_RPG_CLASSES;

/**
 * 計算 RPG 職業天賦模式 (RPG Talent Mode) 戰力、首席大師與公會羈絆
 */
function calculateLiveRPGStats(state) {
  const targetState = state || window.gameState || {};
  const heroes = targetState.heroes || [];
  const guilds = targetState.guilds || [];
  const activities = targetState.activities || [];
  const validActs = activities.filter(a => a.isValidAttack !== false && !a.isExcluded);

  const heroRpgMap = {};
  const classDict = window.RPG_CLASSES || DEFAULT_RPG_CLASSES;
  heroes.forEach(h => {
    const heroClassKey = h.rpgClass || '狂戰士';
    const cls = classDict[heroClassKey] || DEFAULT_RPG_CLASSES[heroClassKey] || DEFAULT_RPG_CLASSES['狂戰士'];
    heroRpgMap[h.name] = {
      name: h.name,
      guild: h.guild,
      avatar: h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`,
      rpgClass: cls.name,
      classMeta: cls,
      workouts: 0,
      duration: 0,
      calories: 0,
      trimp: 0,
      zone2: 0, elevation: 0,
      gapSum: 0,
      maxGap: 0,
      suffer: 0,
      combatPower: 0
    };
  });

  validActs.forEach(a => {
    const h = heroRpgMap[a.hero];
    if (h) {
      const w = (a.scoreWeight ?? 1);
      h.workouts += w;
      h.duration += (a.durationScore ?? a.duration ?? 0);
      h.rawDuration = (h.rawDuration || 0) + (a.duration || 0);
      h.calories += (a.calories || 0);
      h.elevation += (a.elevation || 0);
      h.trimp += (a.trimp || 0);
      if (a.isZone2) h.zone2 += w;
      h.gapSum += (a.gapScore ?? a.gap ?? 0);
      h.maxGap = Math.max(h.maxGap, a.gapScore ?? a.gap ?? 0);
      h.suffer += (a.suffer || 0);
    }
  });

  Object.values(heroRpgMap).forEach(h => {
    const density = h.rawDuration > 0 ? (h.suffer / h.rawDuration) : 0;
    if (h.rpgClass === '狂戰士') {
      h.combatPower = Math.round((h.maxGap * 50) + (h.gapSum * 8) + (h.calories * 0.6));
    } else if (h.rpgClass === '聖騎士') {
      h.combatPower = Math.round((h.workouts * 150) + (h.suffer * 1.5) + (h.duration * 1.0));
    } else if (h.rpgClass === '遊俠') {
      h.combatPower = Math.round((h.zone2 * 120) + (h.calories * 1.2) + (h.duration * 1.5));
    } else if (h.rpgClass === '大法師') {
      h.combatPower = Math.round((h.trimp * 25) + (h.duration * 2.0));
    } else if (h.rpgClass === '刺客') {
      h.combatPower = Math.round((density * 1200) + (h.maxGap * 40) + (h.calories * 0.8));
    } else {
      h.combatPower = Math.round((h.calories * 1.0) + (h.trimp * 15));
    }
  });

  const classMasters = {};
  const allClasses = ['狂戰士', '聖騎士', '遊俠', '大法師', '刺客'];
  allClasses.forEach(cName => {
    const candidates = Object.values(heroRpgMap).filter(h => h.rpgClass === cName).sort((a, b) => b.combatPower - a.combatPower);
    classMasters[cName] = candidates[0] || null;
  });

  const guildSynergyList = guilds.map(g => {
    const members = g.members || [];
    const memberHeroes = members.map(m => heroRpgMap[m]).filter(Boolean);
    const rawPower = memberHeroes.reduce((s, h) => s + (h.combatPower || 0), 0);
    const uniqueClasses = new Set(memberHeroes.map(h => h.rpgClass));
    let bonusPct = 0;
    let synergyTag = '基礎小隊';

    if (uniqueClasses.size >= 4) {
      bonusPct = 15;
      synergyTag = '🌟 全能四職業羈絆 (+15%)';
    } else if (uniqueClasses.size === 3) {
      bonusPct = 10;
      synergyTag = '⚡ 三重戰術羈絆 (+10%)';
    } else if (uniqueClasses.size === 2) {
      bonusPct = 5;
      synergyTag = '🛡️ 雙重協同羈絆 (+5%)';
    }

    const totalSynergyPower = Math.round(rawPower * (1 + bonusPct / 100));

    return {
      guild: g.name,
      badge: g.badge || '🛡️',
      color: g.color || '#f59e0b',
      members: members,
      uniqueClasses: Array.from(uniqueClasses),
      bonusPct: bonusPct,
      synergyTag: synergyTag,
      rawPower: rawPower,
      totalPower: totalSynergyPower
    };
  }).sort((a, b) => b.totalPower - a.totalPower);

  return {
    heroRpgList: Object.values(heroRpgMap).sort((a, b) => b.combatPower - a.combatPower),
    classMasters: classMasters,
    guildSynergyList: guildSynergyList
  };
}

/**
 * 從 Supabase 雲端資料庫同步所有遊戲數據
 */
async function syncFromDatabaseCore() {
  const syncBtn = document.getElementById('btn-sheet-sync') || document.getElementById('sheet-sync-btn') || document.getElementById('sync-db-btn');
  const syncBtnOrigHtml = syncBtn ? syncBtn.innerHTML : '';
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-amber-400"></i><span class="hidden sm:inline">同步中...</span>';
    if (window.lucide) lucide.createIcons();
  }

  try {
    // 1. Parallel fetch from Supabase tables (分頁讀取，避免超過 1000 筆被截斷；任何一張表失敗即整體中止，不以殘缺資料覆蓋畫面或設定)
    const [heroesData, activitiesData, configData] = await Promise.all([
      window.supabase.fetchAll('heroes', 'select=*&order=created_at.asc,name.asc'),
      window.supabase.fetchAll('activities', 'select=*&order=id.asc'),
      window.supabase.fetch('game_config', 'select=*')
    ]);

    // 保留未經全形轉換的原始資料列與設定，供 GM 後台匯出備份與寫回資料庫時使用 (避免全形字寫回 DB 或漏掉預設值污染)
    try {
      window.__rawHeroesRows = JSON.parse(JSON.stringify(heroesData || []));
      window.__rawActivitiesRows = JSON.parse(JSON.stringify(activitiesData || []));
      window.__rawConfigMap = {};
      (configData || []).forEach(c => {
        if (c && c.key) window.__rawConfigMap[c.key] = JSON.parse(JSON.stringify(c.value));
      });
    } catch (e) {}

    // 🛡️ 安全防護：資料庫裡的自由文字 (英雄名、公會、運動名稱、GM 稱號/活動標題、各種設定文字) 在進入畫面前，
    //    把 < > " ' ` 換成外觀相同的全形字，避免有人在 Strava 運動名稱或英雄名稱藏程式碼 (XSS)。網址欄位不處理。
    window.sanitizeDbRows && window.sanitizeDbRows(heroesData, activitiesData, configData);

    // Fallback to local game_state if Supabase is completely empty
    if ((!heroesData || heroesData.length === 0) && (!activitiesData || activitiesData.length === 0)) {
      console.warn('[Supabase] 資料庫為空，嘗試載入本地快取...');
      window.__dbSyncOk = false;
      if (window.renderAllGameViews) window.renderAllGameViews();
      return;
    }

    // 2. Parse Config
    const configMap = {};
    (configData || []).forEach(c => { configMap[c.key] = c.value; });

    const activeMode = configMap.active_mode || gameState?.activeMode || 'world_boss';
    const bossConfig = configMap.boss_config || gameState?.boss || {};
    const classicConfig = configMap.classic_config || gameState?.classic || {};
    const rpgConfig = configMap.rpg_config || gameState?.rpg || {};
    const factionConfig = configMap.faction_config || gameState?.faction || {};
    const survivalConfig = configMap.survival_config || gameState?.survival || {};
    const baseConfig = configMap.base_config || gameState?.base || {};
    const bingoConfig = configMap.bingo_config || gameState?.bingo || {};
    const snapshots = configMap.snapshots || gameState?.snapshots || [];
    const excludeKeywords = configMap.exclude_keywords || gameState?.excludeKeywords || ["羽球", "Badminton"];
    const gmOpsConfig = configMap.gm_ops_config || gameState?.gmOps || { events: [], heroFx: {}, manualBadges: {} };

    // 📱 手機同步 App (預備功能)：GM 開啟後才讀取每日健康數據與裝置清單；未開啟時完全不發出額外請求
    let dailyHealthRows = [];
    let deviceRows = [];
    if (gmOpsConfig?.mobileSync?.enabled) {
      // 讀取範圍：賽季開始前 28 天 (鐵人修行院的慢性負荷需要) ~ 今天；若無賽季設定則取近 120 天
      const seasonStartForHealth = (configMap.boss_config && configMap.boss_config.seasonStart) || (configMap.classic_config && configMap.classic_config.seasonStart) || '';
      const ss = normalizeDateYMD(seasonStartForHealth);
      const ssMinus28 = ss ? addDaysYMD(ss, -28).replace(/\//g, '-') : '9999-99-99';
      const last60d = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      const sinceDate = ssMinus28 < last60d ? ssMinus28 : last60d;
      [dailyHealthRows, deviceRows] = await Promise.all([
        window.supabase.fetchAll('daily_health', `select=*&date=gte.${sinceDate}&order=date.asc`).catch(e => { console.warn('[MobileSync] daily_health 讀取失敗 (是否已執行資料庫擴充 SQL？)', e.message); return []; }),
        window.supabase.fetch('devices_public', 'select=*').catch(() => [])
      ]);
      (dailyHealthRows || []).forEach(r => { if (r && typeof r.hero === 'string') r.hero = safeDisplayText(r.hero); ['bed_time', 'wake_time', 'source'].forEach(k => { if (typeof r[k] === 'string') r[k] = safeDisplayText(r[k]); }); });
      (deviceRows || []).forEach(r => { ['hero', 'platform', 'device_model', 'app_version'].forEach(k => { if (r && typeof r[k] === 'string') r[k] = safeDisplayText(r[k]); }); });
    }

    // Parse Active Season Dates
    let seasonStartStr = "2026/08/12";
    let seasonEndStr = "2026/08/31";

    if (activeMode === 'classic' && classicConfig.seasonStart) {
      seasonStartStr = classicConfig.seasonStart;
      seasonEndStr = classicConfig.seasonEnd || "2026/08/31";
    } else if ((activeMode === 'rpg_talent' || activeMode === 'rpg') && rpgConfig.seasonStart) {
      seasonStartStr = rpgConfig.seasonStart;
      seasonEndStr = rpgConfig.seasonEnd || "2026/08/31";
    } else if (bossConfig.seasonStart || classicConfig.seasonStart || rpgConfig.seasonStart) {
      seasonStartStr = bossConfig.seasonStart || classicConfig.seasonStart || rpgConfig.seasonStart;
      seasonEndStr = bossConfig.seasonEnd || classicConfig.seasonEnd || rpgConfig.seasonEnd || "2026/08/31";
    }

    const seasonStartDate = parseActivityDate(seasonStartStr + " 00:00:00") || new Date(2026, 7, 12);
    const seasonEndDate = parseActivityDate(seasonEndStr + " 23:59:59") || new Date(2026, 7, 31, 23, 59, 59);

    // 3. Parse Heroes & Guilds
    const heroes = [];
    const heroMap = {};
    const guildMembers = {};
    const heroAggregates = {};

    (heroesData || []).forEach(h => {
      const name = h.name;
      const age = h.age || 35;
      const maxHr = h.max_hr || Math.max(120, 220 - age);
      const guild = h.guild || '自由英雄';
      const rpgClass = h.rpg_class || '狂戰士';
      const avatar = h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name}&backgroundColor=0f172a`;
      const stravaId = h.strava_id || '';

      const heroObj = {
        name,
        rawName: h.__rawName !== undefined ? h.__rawName : rawDbText(name),
        createdAt: h.created_at || null,
        age,
        maxHr,
        guild,
        rpgClass,
        avatar,
        stravaId
      };
      heroes.push(heroObj);
      heroMap[name] = heroObj;

      if (!guildMembers[guild]) guildMembers[guild] = [];
      guildMembers[guild].push(name);

      heroAggregates[name] = {
        physDmg: 0,
        magDmg: 0,
        critDmg: 0,
        totalDmg: 0,
        maxGap: 0,
        scoreMaxGap: 0,
        validCount: 0
      };
    });

    // 4. Parse & Calculate Activities
    const activities = [];

    const physMult = bossConfig?.rules?.physMultiplier || 1.0;
    const magMult = bossConfig?.rules?.magicMultiplier || 15.0;
    const critMult = bossConfig?.rules?.critMultiplier || 100.0;
    const minDurGlobal = (activeMode === 'classic' ? classicConfig?.minDuration : null)
      || bossConfig?.rules?.minDurationMinutes
      || classicConfig?.minDuration
      || gameState?.summary?.minDurationMinutes
      || 30.0;

    // 4-1. 疑似重複上傳判定 (先以原始數值計算各筆在「當前資料片」的有效分數，再做時間重疊分組)
    const duplicateOverrides = (gmOpsConfig && gmOpsConfig.duplicateOverrides) || {};
    const dupInputRows = (activitiesData || []).map(a => {
      const hero = heroMap[a.hero] || { maxHr: 185, rpgClass: '狂戰士' };
      const dateStr = String(a.date || '');
      const start = /\d{1,2}:\d{2}/.test(dateStr) ? parseActivityDate(dateStr) : null; // 只有含時分的紀錄才能判斷重疊
      const duration = cleanNumber(a.duration);
      const avgHr = cleanNumber(a.avg_hr);
      const maxHr = cleanNumber(a.max_hr);
      const cal = cleanNumber(a.calories);
      const gap = Math.max(0, maxHr - avgHr);
      const ratio = (hero.maxHr > 0 && avgHr > 0) ? avgHr / hero.maxHr : 0;
      const trimp = ratio > 0 ? duration * ratio * Math.exp(1.92 * ratio) : 0;
      const suffer = avgHr > 0 ? Math.pow(avgHr / 150.0, 2) * duration : 0;
      const inSeasonRow = start ? (start >= seasonStartDate && start <= seasonEndDate) : true;
      const validRow = duration >= minDurGlobal && inSeasonRow && !a.is_excluded;
      let score = 0;
      if (validRow) {
        if (activeMode === 'survival') score = cal + trimp * 1.5;
        else if (activeMode === 'faction_war') score = trimp * 10 + gap * 100 + cal;
        else if (activeMode === 'base_builder') score = cal + trimp + gap * 10;
        else if (activeMode === 'bingo') score = cal + trimp * 10 + gap * 50;
        else if (activeMode === 'world_boss' || activeMode === 'boss') score = cal * physMult + trimp * magMult + gap * critMult;
        else if (activeMode === 'rpg_talent' || activeMode === 'rpg') {
          const isZ2 = (0.60 * hero.maxHr) <= avgHr && avgHr <= (0.75 * hero.maxHr);
          const dens = duration > 0 ? suffer / duration : 0;
          if (hero.rpgClass === '狂戰士') score = gap * 58 + cal * 0.6;
          else if (hero.rpgClass === '聖騎士') score = 150 + suffer * 1.5 + duration;
          else if (hero.rpgClass === '遊俠') score = (isZ2 ? 120 : 0) + cal * 1.2 + duration * 1.5;
          else if (hero.rpgClass === '大法師') score = trimp * 25 + duration * 2;
          else if (hero.rpgClass === '刺客') score = dens * 1200 + gap * 40 + cal * 0.8;
          else score = cal + trimp * 15;
        } else score = cal + trimp; // classic
      }
      const priority = (a.source && a.source !== 'strava' && a.source !== 'manual') ? 1 : 0;
      return { id: String(a.id), hero: a.hero, start, duration, score, excluded: Boolean(a.is_excluded), priority };
    });
    const duplicateMap = detectDuplicateActivities(dupInputRows);
    (activitiesData || []).forEach(a => {
      const actId = String(a.id);
      const hero = heroMap[a.hero] || { maxHr: 185, guild: '自由英雄', rpgClass: '狂戰士' };
      const actDate = parseActivityDate(a.date);
      const inSeason = actDate ? (actDate >= seasonStartDate && actDate <= seasonEndDate) : true;
      const isExcluded = Boolean(a.is_excluded);
      const isManual = Boolean(a.is_manual);

      const duration = cleanNumber(a.duration);
      const distance = cleanNumber(a.distance);
      const elevation = cleanNumber(a.elevation);
      const avgHr = cleanNumber(a.avg_hr);
      const maxHr = cleanNumber(a.max_hr);
      const rawCalories = cleanNumber(a.calories);

      const dupInfo = duplicateMap[actId] || null;
      const isSuspectedDuplicate = Boolean(dupInfo);
      const duplicateIncluded = isSuspectedDuplicate && duplicateOverrides[actId] === true;
      const isValid = (duration >= minDurGlobal) && inSeason && !isExcluded && (!isSuspectedDuplicate || duplicateIncluded);
      let physDmg = 0;
      let magDmg = 0;
      let gap = Math.max(0, maxHr - avgHr);
      let rawTrimp = 0.0;

      if (hero.maxHr > 0 && avgHr > 0) {
        const ratio = avgHr / hero.maxHr;
        rawTrimp = duration * ratio * Math.exp(1.92 * ratio);
      }

      let rawSuffer = 0;
      if (avgHr > 0) rawSuffer = Math.pow(avgHr / 150.0, 2) * duration;
      const isZone2 = (0.60 * hero.maxHr) <= avgHr && avgHr <= (0.75 * hero.maxHr);
      const zoneLabel = isZone2 ? '🟢 有氧燃脂' : (avgHr > 0.75 * hero.maxHr ? '🚀 極限無氧' : '🚶 暖身/恢復');

      // GM 限時積分加倍活動判定 (7 大資料片通用乘算，同時保留 rawCalories / rawTrimp 供後台與原始生理檢視)
      const evBonus = (typeof window.getActivityEventBonus === 'function')
        ? window.getActivityEventBonus(a.date, gmOpsConfig)
        : { bonusPct: 0, multiplier: 1.0, matchedEvents: [] };
      const eventMult = isValid ? (evBonus.multiplier || 1.0) : 1.0;

      const calories = Math.round(rawCalories * eventMult);
      const trimp = rawTrimp * eventMult;
      const suffer = rawSuffer * eventMult;
      // 計分用加權值：讓「出勤次數 / 時長 / 無氧落差 / Zone2 次數」在任何資料片都同樣吃到活動加成
      const scoreWeight = isValid ? eventMult : 0;
      const gapScore = gap * eventMult;
      const durationScore = duration * eventMult;

      if (isValid) {
        physDmg = Math.round(calories * physMult);
        magDmg = Math.round(trimp * magMult);

        if (heroAggregates[a.hero]) {
          heroAggregates[a.hero].physDmg += physDmg;
          heroAggregates[a.hero].magDmg += magDmg;
          heroAggregates[a.hero].maxGap = Math.max(heroAggregates[a.hero].maxGap, gap);
          heroAggregates[a.hero].scoreMaxGap = Math.max(heroAggregates[a.hero].scoreMaxGap, gapScore);
          heroAggregates[a.hero].validCount += 1;
        }
      }

      const singleCritDmg = Math.round(gapScore * critMult);
      const density = duration > 0 ? (rawSuffer / duration) : 0;
      let actCombatPower = 0;
      if (isValid) {
        let baseCp = 0;
        // 單筆 CP 以原始數值計算後整筆乘上活動倍率 (與英雄總 CP 的加權方式一致)
        if (hero.rpgClass === '狂戰士') baseCp = (gap * 50) + (gap * 8) + (rawCalories * 0.6);
        else if (hero.rpgClass === '聖騎士') baseCp = 150 + (rawSuffer * 1.5) + (duration * 1.0);
        else if (hero.rpgClass === '遊俠') baseCp = (isZone2 ? 120 : 0) + (rawCalories * 1.2) + (duration * 1.5);
        else if (hero.rpgClass === '大法師') baseCp = (rawTrimp * 25) + (duration * 2.0);
        else if (hero.rpgClass === '刺客') baseCp = (density * 1200) + (gap * 40) + (rawCalories * 0.8);
        else baseCp = (rawCalories * 1.0) + (rawTrimp * 15);
        actCombatPower = Math.round(baseCp * eventMult);
      }

      const actTitle = a.name || a.title || '鍛鍊';

      activities.push({
        id: actId,
        hero: a.hero,
        rawHero: a.__rawHero !== undefined ? a.__rawHero : rawDbText(a.hero),
        rawName: a.__rawName !== undefined ? a.__rawName : rawDbText(actTitle),
        source: a.source || (isManual ? 'manual' : 'strava'),
        sourceId: a.source_id || null,
        originApp: a.origin_app || '',
        deviceName: a.device_name || '',
        startTime: a.start_time || null,
        endTime: a.end_time || null,
        steps: a.steps ?? null,
        date: a.date,
        time: a.date,
        type: a.type || 'Workout',
        name: actTitle,
        title: actTitle,
        duration: duration,
        distance: distance,
        elevation: elevation,
        avgHr: avgHr,
        maxHr: maxHr,
        calories: calories,
        rawCalories: rawCalories,
        isManual: isManual,
        isExcluded: isExcluded,
        suffer: suffer,
        rawSuffer: rawSuffer,
        guild: hero.guild,
        trimp: Math.round(trimp * 10) / 10,
        rawTrimp: Math.round(rawTrimp * 10) / 10,
        gap: Math.round(gap * 10) / 10,
        gapVal: gap,
        isZone2: isZone2,
        zoneLabel: zoneLabel,
        isValidAttack: isValid,
        inSeason: inSeason,
        isSuspectedDuplicate: isSuspectedDuplicate,
        duplicateIncluded: duplicateIncluded,
        duplicateOf: dupInfo ? dupInfo.duplicateOf : null,
        scoreWeight: scoreWeight,
        gapScore: Math.round(gapScore * 10) / 10,
        durationScore: Math.round(durationScore * 10) / 10,
        eventBonusPct: isValid ? (evBonus.bonusPct || 0) : 0,
        eventMultiplier: eventMult,
        matchedEvents: isValid ? (evBonus.matchedEvents || []) : [],
        damage: isValid ? (physDmg + magDmg) : 0,
        combatPower: actCombatPower,
        physDmg: physDmg,
        magDmg: magDmg,
        critDmg: singleCritDmg
      });
    });

    // Sort all activities chronologically (newest first)
    activities.sort((a, b) => {
      const ta = parseActivityDate(a.date || a.time)?.getTime() || 0;
      const tb = parseActivityDate(b.date || b.time)?.getTime() || 0;
      return tb - ta;
    });

    // 5. Build Hero Stats List (取單次最大 Gap 作為賽季爆擊傷害，並完整累計至總傷害)
    const heroStatsList = heroes.map(h => {
      const heroActs = activities.filter(a => a.hero === h.name && !a.isExcluded);
      const validSeasonActs = heroActs.filter(a => a.isValidAttack);
      const agg = heroAggregates[h.name] || { physDmg: 0, magDmg: 0, maxGap: 0, validCount: 0 };
      
      // 爆擊傷害：取賽季中單次最大 Gap * critMultiplier (100)
      const heroCritDmg = agg.validCount > 0 ? Math.round(agg.scoreMaxGap * critMult) : 0;
      // 英雄總輸出 = 普攻總和 + 魔攻總和 + 最高單次爆擊輸出
      const heroTotalDmg = agg.physDmg + agg.magDmg + heroCritDmg;

      const totalCalories = validSeasonActs.reduce((s, a) => s + (a.calories || 0), 0);
      const rawTotalCalories = validSeasonActs.reduce((s, a) => s + (a.rawCalories !== undefined ? a.rawCalories : (a.calories || 0)), 0);
      const totalTrimp = validSeasonActs.reduce((s, a) => s + (a.trimp || 0), 0);
      const rawTotalTrimp = validSeasonActs.reduce((s, a) => s + (a.rawTrimp !== undefined ? a.rawTrimp : (a.trimp || 0)), 0);
      const eventBonusSurvivalHp = Math.round((totalCalories - rawTotalCalories) + (totalTrimp - rawTotalTrimp) * 1.5);

      return {
        name: h.name,
        guild: h.guild,
        rpgClass: h.rpgClass,
        age: h.age,
        maxHr: h.maxHr,
        avatar: h.avatar,
        stravaId: h.stravaId,
        score: heroTotalDmg,
        totalDamage: heroTotalDmg,
        physDmg: agg.physDmg,
        magDmg: agg.magDmg,
        critDmg: heroCritDmg,
        maxGap: agg.maxGap,
        validWorkouts: agg.validCount,
        totalDuration: validSeasonActs.reduce((s, a) => s + (a.duration || 0), 0),
        totalCalories: totalCalories,
        rawTotalCalories: rawTotalCalories,
        totalTrimp: totalTrimp,
        rawTotalTrimp: rawTotalTrimp,
        eventBonusSurvivalHp: eventBonusSurvivalHp,
        totalElevation: validSeasonActs.reduce((s, a) => s + (a.elevation || 0), 0),
        zone2Count: validSeasonActs.filter(a => a.isZone2).length,
        // 計分專用 (已含 GM 限時活動加成)；畫面上顯示的 bpm / 次數仍使用上方原始值
        scoreMaxGap: Math.round((agg.scoreMaxGap || 0) * 10) / 10,
        scoreZone2: Math.round(validSeasonActs.reduce((s, a) => s + (a.isZone2 ? (a.scoreWeight ?? 1) : 0), 0) * 100) / 100,
        scoreWorkouts: Math.round(validSeasonActs.reduce((s, a) => s + (a.scoreWeight ?? 1), 0) * 100) / 100,
        scoreDuration: Math.round(validSeasonActs.reduce((s, a) => s + (a.durationScore ?? a.duration ?? 0), 0) * 10) / 10,
        scoreElevation: Math.round(validSeasonActs.reduce((s, a) => s + (a.elevation || 0) * (a.scoreWeight ?? 1), 0))
      };
    });

    // 6. Build Guilds List (公會總傷害為所屬英雄總輸出之和)
    const guilds = Object.keys(guildMembers).map(gName => {
      const gHeroes = heroStatsList.filter(h => h.guild === gName);
      const gDmg = gHeroes.reduce((s, h) => s + (h.totalDamage || 0), 0);
      const gValidCount = gHeroes.reduce((s, h) => s + (h.validWorkouts || 0), 0);
      const meta = GUILD_COLOR_MAP[gName] || { badge: '🛡️', color: '#64748b' };
      return {
        name: gName,
        badge: meta.badge,
        color: meta.color,
        members: guildMembers[gName],
        totalDamage: gDmg,
        score: gDmg,
        validWorkouts: gValidCount
      };
    });

    // 7. Calculate Total Server-wide Season Damage
    const totalSeasonPhys = heroStatsList.reduce((s, h) => s + (h.physDmg || 0), 0);
    const totalSeasonMag = heroStatsList.reduce((s, h) => s + (h.magDmg || 0), 0);
    const totalSeasonCrit = heroStatsList.reduce((s, h) => s + (h.critDmg || 0), 0);
    const totalSeasonDmg = totalSeasonPhys + totalSeasonMag + totalSeasonCrit;

    // 8. Pre-calculate Live Classic & RPG Expansion Statistics
    const classicStats = calculateLiveClassicStats({ heroes, guilds, activities: activities.filter(a => a.isValidAttack) });
    const rpgStats = calculateLiveRPGStats({ heroes, guilds, activities: activities.filter(a => a.isValidAttack) });

    // Attach RPG combatPower onto heroStatsList
    const rpgMapByName = {};
    (rpgStats.heroRpgList || []).forEach(r => { rpgMapByName[r.name] = r.combatPower || 0; });
    heroStatsList.forEach(h => { h.combatPower = rpgMapByName[h.name] || 0; });

    const liveClassic = { ...classicConfig, ...classicStats, seasonStart: seasonStartStr, seasonEnd: seasonEndStr };
    const liveRpg = { ...rpgConfig, ...rpgStats, seasonStart: seasonStartStr, seasonEnd: seasonEndStr };
    const liveBoss = {
      ...bossConfig,
      name: bossConfig.name || '🌩️ 墮落雷神・索爾 (Fallen Thor)',
      subtitle: '世界 Boss 討伐戰 (全伺服器合作模式)',
      maxHp: bossConfig.maxHp || 350000,
      currentHp: bossConfig.currentHp !== undefined ? bossConfig.currentHp : Math.max(0, (bossConfig.maxHp || 350000) - totalSeasonDmg),
      seasonStart: seasonStartStr,
      seasonEnd: seasonEndStr,
      avatar: bossConfig.avatar || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
      description: bossConfig.description || '索爾受到雷霆魔劍侵蝕陷入瘋狂！全服英雄透過每日嚴格汗水鍛鍊（單次達 30 分鐘），轉化為物理與魔法攻擊！',
      rules: bossConfig.rules || { minDurationMinutes: 30.0, physMultiplier: 1.0, magicMultiplier: 15.0, critMultiplier: 100.0 }
    };

    gameState = {
      activeMode: activeMode,
      seasonStart: seasonStartStr,
      seasonEnd: seasonEndStr,
      boss: liveBoss,
      classic: liveClassic,
      rpg: liveRpg,
      faction: factionConfig,
      survival: survivalConfig,
      base: baseConfig,
      bingo: bingoConfig,
      gmOps: gmOpsConfig,
      excludeKeywords: excludeKeywords,
      dailyHealth: dailyHealthRows,
      mobileModes: configMap.mobile_modes_config || gameState?.mobileModes || {},
      devices: deviceRows,
      guilds: guilds,
      heroes: heroes,
      activities: activities,
      heroStats: heroStatsList,
      snapshots: snapshots,
      archivedSeasons: snapshots,
      classic0717: gameState?.classic0717 || window.frozenClassic0717,
      summary: {
        minDurationMinutes: minDurGlobal,
        totalPhys: totalSeasonPhys,
        totalMag: totalSeasonMag,
        totalCrit: totalSeasonCrit,
        totalDamage: totalSeasonDmg
      }
    };

    if (typeof window.evaluateAllHeroesBadges === 'function') {
      gameState.heroBadges = window.evaluateAllHeroesBadges(gameState);
    }

    // 雲端設定是否完整載入 (GM 後台寫入前會檢查，避免以預設值覆蓋正式設定)
    window.__dbSyncOk = Array.isArray(configData) && configData.length > 0;
    window.gameState = gameState;
    window.heroStatsList = heroStatsList;
    window.calculateLiveClassicStats = calculateLiveClassicStats;
    window.calculateLiveRPGStats = calculateLiveRPGStats;
    // 前台 (game.js) 與後台 (admin.js) 皆監聽此事件進行重新渲染，避免同一次同步重複渲染兩次
    window.dispatchEvent(new CustomEvent("gameStateSynced", { detail: gameState }));

  } catch (err) {
    window.__dbSyncOk = false;
    console.error('Supabase Database Sync Error:', err);
    try {
      if (typeof window.showToast === 'function') window.showToast('⚠️ 雲端資料同步失敗，目前顯示的可能不是最新數據，請稍後再按一次同步。', 'error');
      else if (typeof window.showAdminToast === 'function') window.showAdminToast('⚠️ 雲端資料同步失敗，為保護正式資料，GM 儲存功能已暫停，請重新整理頁面。', true);
    } catch (e) {}
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = syncBtnOrigHtml;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// 同步去重：同一時間只會有一個同步請求在執行 (避免載入時重複抓取 / 連點同步按鈕)
let __syncInFlight = null;
function syncFromDatabaseDeduped() {
  if (!__syncInFlight) {
    __syncInFlight = syncFromDatabaseCore().finally(() => { __syncInFlight = null; });
  }
  return __syncInFlight;
}

// Global Alias for backwards compatibility
window.syncFromGoogleSheet = syncFromDatabaseDeduped;
window.syncFromDatabase = syncFromDatabaseDeduped;

document.addEventListener("DOMContentLoaded", () => {
  syncFromDatabaseDeduped();
  // setInterval(syncFromDatabase, SYNC_CONFIG.pollIntervalSeconds * 1000); // 停止自動重整，改由手動觸發
});
