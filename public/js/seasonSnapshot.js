/**
 * 鋼鐵英雄紀元 2.0 — 賽季快照共用模組 (前台 index.html 與 GM 後台 admin.html 共用)
 *
 * 「時間凍結」1:1 原則：
 *   1. 每個資料片都有 buildXView(state) 把現場畫面需要的數字整理成「純資料 view model」。
 *   2. 前台現場畫面與「過往英雄史」快照用同一個 render 函式吃同一份 view model，版面 100% 一致。
 *   3. 建立快照時另外凍結每位英雄的顯示資訊 (大頭貼網址 / 公會 / 徽章數 / GM 稱號特效 / 出征狀態)。
 *
 * 本檔只做計算與資料整理，不碰 DOM；不得宣告與 game.js / admin.js 衝突的全域 const。
 */

// RPG Class Metadata (Unified Sunny Athletic Palette)
const SNAP_RPG_CLASSES = {
  '狂戰士': {
    name: '狂戰士',
    enName: 'Berserker',
    badge: '⚔️',
    color: '#FC4C02',
    bg: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
    passiveName: '血性狂暴 (Bloodrage)',
    passiveDesc: '無氧落差 (Gap) 獲得 +30% 額外戰力加成，大重量力竭突破。'
  },
  '聖騎士': {
    name: '聖騎士',
    enName: 'Paladin',
    badge: '🛡️',
    color: '#D97706',
    bg: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
    passiveName: '鋼鐵壁壘 (Iron Bastion)',
    passiveDesc: '出勤次數 × 150 點聖光防禦值，痛苦承受力轉化為堅毅戰力。'
  },
  '遊俠': {
    name: '遊俠',
    enName: 'Ranger',
    badge: '🏹',
    color: '#059669',
    bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    passiveName: '精準巡航 (Precision Cruise)',
    passiveDesc: 'Zone 2 有氧燃脂次數獲得 +35% 加成，巡航耐力極致轉化。'
  },
  '大法師': {
    name: '大法師',
    enName: 'Grand Mage',
    badge: '🧙',
    color: '#0284C7',
    bg: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400',
    passiveName: '奧術過載 (Arcane Overload)',
    passiveDesc: '訓練衝力 TRIMP 放大 1.5 倍奧術增幅，心肺負荷戰力最高。'
  },
  '刺客': {
    name: '刺客',
    enName: 'Shadow Assassin',
    badge: '🗡️',
    color: '#334155',
    bg: 'bg-slate-800 border-slate-700 text-slate-300',
    passiveName: '致命密擊 (Lethal Density)',
    passiveDesc: '訓練密度 (Density) 獲得 2.0 倍暗影刺殺加成，短時極致爆發。'
  }
};
window.RPG_CLASSES = SNAP_RPG_CLASSES;

// -------------------------------------------------------------
// 資料片一：經典競技 (原 game.js calculateLiveClassicMetrics，原封不動搬移，只把資料來源改為參數)
// -------------------------------------------------------------
function computeClassicView(state) {
  const gameState = state || window.gameState || {};
  const heroes = gameState?.heroes || [];
  const guilds = gameState?.guilds || [];
  const activities = gameState?.activities || [];

  const validActs = activities.filter(a => a.isValidAttack);

  const heroDataMap = {};
  heroes.forEach(h => {
    heroDataMap[h.name] = {
      name: h.name,
      guild: h.guild,
      avatar: h.avatar,
      maxHr: h.maxHr || 185,
      workouts: 0,
      duration: 0,
      calories: 0,
      trimp: 0,
      zone2: 0,
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
      h.trimp += (a.trimp || 0);
      if (a.isZone2) h.zone2 += w;
      h.gapSum += (a.gapScore ?? a.gap ?? 0);
      h.maxGap = Math.max(h.maxGap, a.gapScore ?? a.gap ?? 0);
      h.suffer += (a.suffer || 0);
    }
  });

  Object.values(heroDataMap).forEach(h => {
    h.density = h.rawDuration > 0 ? (h.suffer / h.rawDuration) : 0;
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

// -------------------------------------------------------------
// 資料片二：RPG 職業天賦 (原 game.js calculateRpgViewStats，原封不動搬移)
// -------------------------------------------------------------
function computeRpgView(state) {
  const gameState = state || window.gameState || {};
  const RPG_CLASSES = SNAP_RPG_CLASSES;
  const heroes = gameState?.heroes || [];
  const guilds = gameState?.guilds || [];
  const activities = gameState?.activities || [];
  const validActs = activities.filter(a => a.isValidAttack);

  // Group stats by hero
  const heroRpgMap = {};
  heroes.forEach(h => {
    const heroClassKey = h.rpgClass || '狂戰士';
    const cls = RPG_CLASSES[heroClassKey] || RPG_CLASSES['狂戰士'];
    heroRpgMap[h.name] = {
      name: h.name,
      guild: h.guild,
      avatar: h.avatar,
      rpgClass: cls.name,
      classMeta: cls,
      workouts: 0,
      duration: 0,
      calories: 0,
      trimp: 0,
      zone2: 0,
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
      h.trimp += (a.trimp || 0);
      if (a.isZone2) h.zone2 += w;
      h.gapSum += (a.gapScore ?? a.gap ?? 0);
      h.maxGap = Math.max(h.maxGap, a.gapScore ?? a.gap ?? 0);
      h.suffer += (a.suffer || 0);
    }
  });

  // Calculate Combat Rating per Class
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

  // Class Masters (Top 1 for each class)
  const classMasters = {};
  Object.keys(RPG_CLASSES).forEach(cName => {
    const candidates = Object.values(heroRpgMap).filter(h => h.rpgClass === cName).sort((a, b) => b.combatPower - a.combatPower);
    classMasters[cName] = candidates[0] || null;
  });

  // Guild Synergy
  const guildSynergyList = guilds.map(g => {
    const members = g.members || [];
    const memberHeroes = members.map(m => heroRpgMap[m]).filter(Boolean);
    const rawPower = memberHeroes.reduce((s, h) => s + (h.combatPower || 0), 0);
    
    // Unique classes in this guild
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

// -------------------------------------------------------------
// 共用小工具
// -------------------------------------------------------------
function snapNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function snapMinDur(state) {
  return state?.summary?.minDurationMinutes || state?.boss?.rules?.minDurationMinutes || 30;
}
/** 只保留英雄卡需要的欄位 (scoreX 皆為已解析的計分值，render 端沿用現場的 ?? 寫法讀取) */
function snapSlimHeroStats(list) {
  return (list || []).map(h => ({
    name: h.name,
    guild: h.guild,
    validWorkouts: snapNum(h.validWorkouts),
    scoreWorkouts: snapNum(h.scoreWorkouts ?? h.validWorkouts ?? 0),
    totalCalories: snapNum(h.totalCalories),
    totalTrimp: snapNum(h.totalTrimp),
    scoreZone2: snapNum(h.scoreZone2 ?? h.zone2Count ?? 0),
    longCount: snapNum(h.longCount ?? 0),
    scoreLongCount: snapNum(h.scoreLongCount ?? h.longCount ?? 0),
    scoreMaxGap: snapNum(h.scoreMaxGap ?? h.maxGap ?? 0),
    scoreElevation: snapNum(h.scoreElevation ?? h.totalElevation ?? 0)
  }));
}
function snapHeroStatsOf(state) {
  return (state?.heroStats && state.heroStats.length ? state.heroStats : (window.heroStatsList || [])) || [];
}
function normalizeSnapshotType(type) {
  const t = String(type || '');
  if (t === 'rpg_talent') return 'rpg';
  if (t === 'boss') return 'world_boss';
  if (t === 'faction') return 'faction_war';
  if (t === 'base') return 'base_builder';
  return t || 'classic';
}

// -------------------------------------------------------------
// 資料片三：世界 Boss
// -------------------------------------------------------------
function buildBossView(state) {
  const st = state || window.gameState || {};
  const boss = st.boss || {};
  const heroes = snapHeroStatsOf(st);
  let totalPhys = 0, totalMag = 0, totalCrit = 0, totalDmg = 0;
  heroes.forEach(h => { totalPhys += (h.physDmg || 0); totalMag += (h.magDmg || 0); totalCrit += (h.critDmg || 0); totalDmg += (h.totalDamage || 0); });
  const guildStats = {};
  (st.guilds || []).forEach(g => { guildStats[g.name] = { name: g.name, badge: g.badge, color: g.color, members: g.members || [], totalDamage: 0 }; });
  heroes.forEach(h => { if (guildStats[h.guild]) guildStats[h.guild].totalDamage += (h.totalDamage || 0); });
  return {
    boss: { name: boss.name || '', description: boss.description || '', avatar: boss.avatar || '', maxHp: boss.maxHp || 350000 },
    seasonStart: st.seasonStart || boss.seasonStart || '2026/08/12',
    seasonEnd: st.seasonEnd || boss.seasonEnd || '2026/08/31',
    totals: { phys: totalPhys, mag: totalMag, crit: totalCrit, dmg: totalDmg },
    heroes: [...heroes].sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0)).map(h => ({
      name: h.name, guild: h.guild, validWorkouts: h.validWorkouts || 0,
      physDmg: h.physDmg || 0, magDmg: h.magDmg || 0, critDmg: h.critDmg || 0, totalDamage: h.totalDamage || 0
    })),
    guilds: Object.values(guildStats).sort((a, b) => b.totalDamage - a.totalDamage),
    hasGuilds: Boolean(st.guilds),
    feed: (st.activities || []).filter(a => a.isValidAttack).slice(0, 15).map(a => ({
      id: a.id, hero: a.hero, guild: a.guild, title: a.title, duration: a.duration, avgHr: a.avgHr, maxHr: a.maxHr, damage: a.damage || 0
    }))
  };
}

// -------------------------------------------------------------
// 資料片四：雙城激戰
// -------------------------------------------------------------
function buildFactionView(state) {
  // 陣營分配與攻城 / 修復計算在 renderFactionWarHtml 內 (與現場同一段程式)；這裡只凍結計算所需的原始輸入
  const st = state || window.gameState || {};
  const f = st.faction || {};
  return {
    guilds: (st.guilds || []).map(g => ({ name: g.name })),
    faction: { f1Name: f.f1Name, f2Name: f.f2Name, baseHp: f.baseHp, guildAssign: f.guildAssign },
    heroStats: snapSlimHeroStats(snapHeroStatsOf(st)),
    heroes: (st.heroes || []).map(h => ({ name: h.name, guild: h.guild })),
    minDur: snapMinDur(st)
  };
}

// -------------------------------------------------------------
// 資料片五：飢餓法則
// -------------------------------------------------------------
function buildSurvivalView(state) {
  const st = state || window.gameState || {};
  const sv = window.computeSurvivalState(st);
  const heroes = snapHeroStatsOf(st).map(h => {
    const hp = window.computeSurvivalHeroHp(h, sv, st); // 狩獵補血 = Calories / 搜刮物資 = TRIMP × 1.5
    return { name: h.name, guild: h.guild, currentHp: hp.currentHp, isDead: hp.isDead, food: hp.food, scavenge: hp.scavenge, survivedDays: hp.survivedDays, totalDays: hp.totalDays };
  }).sort((a, b) => b.currentHp - a.currentHp);
  return {
    sv: { maxHp: sv.maxHp, decayPerDay: sv.decayPerDay, penalty: sv.penalty, days: sv.days, totalDays: sv.totalDays, seasonOver: sv.seasonOver, schedule: sv.schedule || [] },
    heroes,
    minDur: snapMinDur(st)
  };
}

// -------------------------------------------------------------
// 資料片六：鋼鐵要塞
// -------------------------------------------------------------
function buildBaseView(state) {
  const st = state || window.gameState || {};
  return {
    heroStats: snapSlimHeroStats(snapHeroStatsOf(st)),
    base: { woodTarget: st.base?.woodTarget, steelTarget: st.base?.steelTarget, manaTarget: st.base?.manaTarget },
    minDur: snapMinDur(st)
  };
}

// -------------------------------------------------------------
// 資料片七：戰神拼圖 (九宮格條件需要活動明細，於建構時就先算好)
// -------------------------------------------------------------
function buildBingoView(state) {
  const st = state || window.gameState || {};
  const acts = (st.activities || []).filter(a => a.isValidAttack);
  const heroStats = snapSlimHeroStats(snapHeroStatsOf(st));
  const m = st.bingo?.multiplier || 1.0;
  const wSum = (list) => list.reduce((s, a) => s + (a.scoreWeight ?? 1), 0); // 限時活動期間的運動以加成倍率計數
  const c1 = wSum(acts.filter(a => a.duration >= 60)) >= Math.ceil(10 * m);
  const c2 = wSum(acts.filter(a => a.isZone2)) >= Math.ceil(20 * m);
  const c3 = acts.reduce((s, a) => s + (a.trimp || 0), 0) >= 3000 * m;
  const c4 = wSum(acts.filter(a => a.gapVal >= 70)) >= Math.ceil(5 * m);
  const c5 = heroStats.filter(h => (h.scoreWorkouts ?? h.validWorkouts ?? 0) >= 10).length >= Math.max(1, Math.ceil(3 * m));
  const c6 = acts.reduce((s, a) => s + (a.calories || 0), 0) >= 50000 * m;
  const c7 = heroStats.filter(h => (h.scoreMaxGap ?? h.maxGap ?? 0) >= 80).length >= Math.max(1, Math.ceil(2 * m));
  const c8 = acts.length >= Math.max(1, Math.ceil(5 * m)) && acts.filter(a => a.isManual).length <= Math.max(1, Math.floor(5 / m)); // Reward for auto-sync hardware
  const c9 = true; // Free space
  const grid = [
    { key: "長征先鋒", desc: `全服累計 ${Math.ceil(10 * m)} 次超過 1 小時的訓練`, ok: c1 },
    { key: "燃脂大師", desc: `解鎖 ${Math.ceil(20 * m)} 次完美的 Zone 2 綠色指標`, ok: c2 },
    { key: "心跳超載", desc: `全服累積引擎衝力 TRIMP 破 ${Math.ceil(3000 * m).toLocaleString()}`, ok: c3 },
    { key: "爆發限界", desc: `出現 ${Math.ceil(5 * m)} 次落差大於 70 的魔鬼心率訓練`, ok: c4 },
    { key: "紀律部隊", desc: `伺服器至少有 ${Math.max(1, Math.ceil(3 * m))} 人達成 10 次出勤`, ok: c5 },
    { key: "脂肪燃燒者", desc: `全服大熱量！總計燃燒 ${(50000 * m).toLocaleString()} 卡路里`, ok: c6 },
    { key: "死神擦肩", desc: `尋找 ${Math.max(1, Math.ceil(2 * m))} 名極限 MaxGap 突破 80 的勇者`, ok: c7 },
    { key: "真金不怕火", desc: `全服累積至少 ${Math.max(1, Math.ceil(5 * m))} 次有效運動，且手動打卡控制在 ${Math.max(1, Math.floor(5 / m))} 次內`, ok: c8 },
    { key: "冒險起點", desc: "中央免費贈送的補給空間", ok: c9 },
  ];
  return { grid, heroStats, multiplier: m };
}

// -------------------------------------------------------------
// 各資料片「每位英雄」計分小公式 (網頁現場 / 快照 / App 排行共用，只有這一份)
// -------------------------------------------------------------
/** 雙城激戰：個人攻城傷害 = TRIMP × 10 + MaxGap × 100；城牆修復 = Zone2 × 5000 + Calories */
function factionHeroScore(h) {
  return {
    dmg: (h.totalTrimp || 0) * 10 + (h.scoreMaxGap ?? h.maxGap ?? 0) * 100,
    rep: (h.scoreZone2 ?? h.zone2Count ?? 0) * 5000 + (h.totalCalories || 0)
  };
}
/** 雙城激戰：陣營分配與主城血量 (輸入 buildFactionView 的 view model) */
function computeFactionState(view) {
  const guildList = view?.guilds || [];
  const heroStats = view?.heroStats || [];
  const fcfg = view?.faction || {};
  const faction1 = { name: fcfg.f1Name || "🟢 均衡聯盟", hp: fcfg.baseHp || 500000, dmg: 0, repair: 0, guilds: [] };
  const faction2 = { name: fcfg.f2Name || "🔴 狂怒部落", hp: fcfg.baseHp || 500000, dmg: 0, repair: 0, guilds: [] };
  // 陣營分配：GM 後台可指定每個公會的陣營 (faction_config.guildAssign)；未指定者照舊依順序交錯分配
  const factionSplit = window.computeFactionSplit ? window.computeFactionSplit(guildList.map(g => g.name), fcfg.guildAssign) : null;
  guildList.forEach((g, idx) => {
    const isF1 = factionSplit ? factionSplit[1].includes(g.name) : idx % 2 === 0;
    const targetF = isF1 ? faction1 : faction2;
    targetF.guilds.push(g.name);
    const gHeroes = heroStats.filter(h => h.guild === g.name);
    const gTrimp = gHeroes.reduce((s, h) => s + (h.totalTrimp || 0), 0);
    const gZone2 = gHeroes.reduce((s, h) => s + (h.scoreZone2 ?? h.zone2Count ?? 0), 0);
    const gGap = gHeroes.reduce((s, h) => s + (h.scoreMaxGap ?? h.maxGap ?? 0), 0);
    const gCal = gHeroes.reduce((s, h) => s + (h.totalCalories || 0), 0);
    targetF.dmg += (gTrimp * 10) + (gGap * 100);
    targetF.repair += (gZone2 * 5000) + gCal;
  });
  const f1CurrentHp = Math.max(0, faction1.hp - faction2.dmg + faction1.repair);
  const f2CurrentHp = Math.max(0, faction2.hp - faction1.dmg + faction2.repair);
  const f1Pct = Math.min(100, Math.max(0, (f1CurrentHp / faction1.hp) * 100));
  const f2Pct = Math.min(100, Math.max(0, (f2CurrentHp / faction2.hp) * 100));
  return { faction1, faction2, f1CurrentHp, f2CurrentHp, f1Pct, f2Pct };
}
/** 鋼鐵要塞：個人資源 (木材 = Calories / 鋼鐵 = TRIMP / 神石 = MaxGap × 10 + Zone2 × 50) */
function baseHeroResources(h) {
  return {
    wood: (h.totalCalories || 0),
    steel: (h.totalTrimp || 0),
    mana: (h.scoreMaxGap ?? h.maxGap ?? 0) * 10 + (h.scoreZone2 ?? h.zone2Count ?? 0) * 50
  };
}
/** 鋼鐵要塞：全服資源總量與要塞等級 (門檻可由 GM 設定，預設 10k / 500 / 500) */
function computeBaseStatus(view) {
  const heroList = view?.heroStats || [];
  let totalWood = 0, totalSteel = 0, totalMana = 0;
  heroList.forEach(h => {
     const r = baseHeroResources(h); // Calories = Wood / TRIMP = Steel / Gap×10 + Z2×50 = Mana
     totalWood += r.wood;
     totalSteel += r.steel;
     totalMana += r.mana;
  });
  const getLevel = (wood, steel, mana) => {
      let lvl = 1;
      const baseW = Number(view?.base?.woodTarget) || 10000;
      const baseS = Number(view?.base?.steelTarget) || 500;
      const baseM = Number(view?.base?.manaTarget) || 500;
      let wReq = baseW, sReq = baseS, mReq = baseM;
      const wStep = Math.max(100, Math.round(baseW * 1.5));
      const sStep = Math.max(50, Math.round(baseS * 1.5));
      const mStep = Math.max(50, Math.round(baseM * 1.5));
      while (wood >= wReq && steel >= sReq && mana >= mReq && lvl < 10) {
          lvl++; wReq += wStep; sReq += sStep; mReq += mStep;
      }
      return { lvl, nW: wReq, nS: sReq, nM: mReq };
  };
  return { totalWood, totalSteel, totalMana, status: getLevel(totalWood, totalSteel, totalMana) };
}
window.computeBaseStatus = computeBaseStatus;
/** 戰神拼圖：六大板塊 (領跑者 = 該板塊數值最高且 > 0 的英雄) */
const BINGO_BOARDS = [
  { key: 'cal', label: '🔥 脂肪燃燒者', unit: 'kcal', get: h => (h.totalCalories || 0) },
  { key: 'wk', label: '⌚ 紀律部隊', unit: '次', get: h => (h.scoreWorkouts ?? h.validWorkouts ?? 0) },
  { key: 'z2', label: '🟢 燃脂大師', unit: '次', get: h => (h.scoreZone2 ?? h.zone2Count ?? 0) },
  { key: 'trimp', label: '⚙️ 心跳超載', unit: '', get: h => (h.totalTrimp || 0) },
  { key: 'long', label: '⏳ 長征先鋒', unit: '次', get: h => (h.scoreLongCount ?? h.longCount ?? 0) },
  { key: 'gap', label: '💥 限界突破', unit: '', get: h => (h.scoreMaxGap ?? h.maxGap ?? 0) }
];
function bingoBoardLeaders(heroStats) {
  return BINGO_BOARDS.map(b => {
    const top = [...(heroStats || [])].sort((x, y) => b.get(y) - b.get(x))[0];
    return top && b.get(top) > 0 ? top.name : null;
  });
}
window.factionHeroScore = factionHeroScore;
window.computeFactionState = computeFactionState;
window.baseHeroResources = baseHeroResources;
window.BINGO_BOARDS = BINGO_BOARDS;
window.bingoBoardLeaders = bingoBoardLeaders;

// -------------------------------------------------------------
// 英雄顯示資訊凍結 (大頭貼 / 公會 / 徽章數 / GM 稱號特效 / 出征狀態)
// -------------------------------------------------------------
function computeHeroActivityStatus(state, heroName, todayYMD) {
  const st = state || window.gameState || {};
  let last = '';
  (st.activities || []).forEach(a => {
    if (!a?.isValidAttack || a.hero !== heroName) return;
    const ymd = typeof window.normalizeDateYMD === 'function' ? window.normalizeDateYMD(a.date) : String(a.date || '').slice(0, 10).replace(/-/g, '/');
    if (ymd && ymd > last) last = ymd;
  });
  return heroActivityStatusFromLast(last, todayYMD);
}
function heroActivityStatusFromLast(last, todayYMD) {
  if (!last) return { text: '💤 尚未出征', tone: 'muted' };
  const today = todayYMD || (typeof window.getTodayYMD === 'function' ? window.getTodayYMD() : '');
  const diff = (today && typeof window.diffDaysYMD === 'function') ? window.diffDaysYMD(last, today) : null;
  if (diff !== null && diff <= 7) return { text: diff <= 0 ? '🔥 今日出征' : `🟢 ${diff} 天前出征`, tone: 'ok' };
  return { text: `💤 最近出征 ${last.slice(5)}`, tone: 'muted' };
}
function captureHeroDisplayInfo(state) {
  const st = state || window.gameState || {};
  const catalog = (window.getActiveBadgeCatalog ? window.getActiveBadgeCatalog(st) : window.BADGE_CATALOG) || [];
  const ids = new Set(catalog.map(b => b.id));
  const today = typeof window.getTodayYMD === 'function' ? window.getTodayYMD() : '';
  const badgesByHero = st.heroBadges || (typeof window.evaluateAllHeroesBadges === 'function' ? window.evaluateAllHeroesBadges(st) : {}) || {};
  const lastByHero = {};
  (st.activities || []).forEach(a => {
    if (!a?.isValidAttack || !a.hero) return;
    const ymd = typeof window.normalizeDateYMD === 'function' ? window.normalizeDateYMD(a.date) : '';
    if (ymd && (!lastByHero[a.hero] || ymd > lastByHero[a.hero])) lastByHero[a.hero] = ymd;
  });
  const heroes = {};
  (st.heroes || []).forEach(h => {
    if (!h?.name) return;
    const unlockedMap = badgesByHero[h.name] || {};
    const fx = typeof window.getHeroActiveFx === 'function' ? window.getHeroActiveFx(h.name, st) : null;
    const avatar = String(h.avatar || '');
    heroes[h.name] = {
      avatar: /^data:/i.test(avatar) ? '' : avatar, // 不存 base64，維持快照 JSON 精簡
      guild: h.guild || '',
      badges: [catalog.length ? Object.keys(unlockedMap).filter(id => ids.has(id)).length : Object.keys(unlockedMap).length, catalog.length],
      fx: fx && fx.fx && fx.fx !== 'none' ? fx.fx : '',
      title: fx ? (fx.customTitle || '') : '',
      status: heroActivityStatusFromLast(lastByHero[h.name] || '', today)
    };
  });
  const guilds = {};
  (st.guilds || []).forEach(g => { if (g?.name) guilds[g.name] = { badge: g.badge || '🛡️', color: g.color || '' }; });
  return { heroes, guilds, capturedYMD: today };
}

// -------------------------------------------------------------
// 建立 v2 賽季快照 (所有資料片共用入口)
// -------------------------------------------------------------
function buildModeView(mode, state) {
  const t = normalizeSnapshotType(mode);
  if (t === 'classic') return { ...computeClassicView(state), minDur: snapMinDur(state) };
  if (t === 'rpg') {
    const r = computeRpgView(state);
    // classMeta / avatar 由前台依職業名稱 & 凍結頭像還原，不重複存入快照
    const slim = (h) => { if (!h) return h; const { classMeta, avatar, ...rest } = h; return rest; };
    const masters = {};
    Object.keys(r.classMasters || {}).forEach(k => { masters[k] = slim(r.classMasters[k]); });
    return { heroRpgList: (r.heroRpgList || []).map(slim), classMasters: masters, guildSynergyList: r.guildSynergyList || [] };
  }
  if (t === 'world_boss') return buildBossView(state);
  if (t === 'faction_war') return buildFactionView(state);
  if (t === 'survival') return buildSurvivalView(state);
  if (t === 'base_builder') return buildBaseView(state);
  if (t === 'bingo') return buildBingoView(state);
  if (window.isMobileMode && window.isMobileMode(t)) {
    const r = window.computeMobileMode(t, state);
    return r ? { ...r, minDur: snapMinDur(state) } : null;
  }
  return null;
}

const SNAPSHOT_STATUS_LABELS = {
  classic: '🏁 本賽季已圓滿結算 (歷史數據已凍結)',
  rpg: '🏁 本賽季職業爭霸已圓滿結算封存',
  world_boss: '🏁 本賽季討伐戰已圓滿結算封存',
  faction_war: '🏁 雙城激戰已結算封存 (主城血量已凍結)',
  survival: '🏁 飢餓法則已結算封存 (生存榜已凍結)',
  base_builder: '🏁 鋼鐵要塞已結算封存 (資源與等級已凍結)',
  bingo: '🏁 戰神拼圖已結算封存 (石板已凍結)'
};

/**
 * @param {object} state  目前 gameState (可覆寫 seasonStart / seasonEnd)
 * @param {object} meta   { mode, title, seasonStart, seasonEnd, archivedAt }
 */
function buildSeasonSnapshot(state, meta = {}) {
  const st = state || window.gameState || {};
  const type = normalizeSnapshotType(meta.mode || st.activeMode);
  const seasonStart = meta.seasonStart || st.seasonStart || '';
  const seasonEnd = meta.seasonEnd || st.seasonEnd || '';
  const now = new Date();
  const archivedAt = meta.archivedAt || `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const isMobile = Boolean(window.isMobileMode && window.isMobileMode(type));
  const view = buildModeView(type, { ...st, seasonStart, seasonEnd });
  const display = captureHeroDisplayInfo(st);
  return {
    id: `snapshot_${type}_${Date.now()}`,
    type,
    schema: 2,
    seasonTitle: meta.title || '',
    seasonPeriod: `${seasonStart} ~ ${seasonEnd}`,
    archivedAt,
    status: 'completed',
    statusLabel: SNAPSHOT_STATUS_LABELS[type] || (isMobile ? '🏁 手機同步資料片已結算封存' : '🏁 本賽季已結算封存'),
    isVisible: true,
    view,
    heroInfo: display.heroes,
    guildInfo: display.guilds,
    capturedYMD: display.capturedYMD
  };
}

window.normalizeSnapshotType = normalizeSnapshotType;
window.computeClassicView = computeClassicView;
window.computeRpgView = computeRpgView;
window.buildBossView = buildBossView;
window.buildFactionView = buildFactionView;
window.buildSurvivalView = buildSurvivalView;
window.buildBaseView = buildBaseView;
window.buildBingoView = buildBingoView;
window.buildModeView = buildModeView;
window.computeHeroActivityStatus = computeHeroActivityStatus;
window.heroActivityStatusFromLast = heroActivityStatusFromLast;
window.captureHeroDisplayInfo = captureHeroDisplayInfo;
window.buildSeasonSnapshot = buildSeasonSnapshot;
