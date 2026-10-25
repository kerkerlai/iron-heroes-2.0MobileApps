/**
 * 鋼鐵英雄紀元 (Iron Heroes Era) - 傳奇徽章圖鑑與 GM 現場活動特效引擎 (v4.0)
 * -------------------------------------------------------------------------
 * 1. 支援 100 枚預設徽章，採宣告式規則引擎 (Declarative Rule Engine)，可無縫擴充至 500+ 枚徽章。
 * 2. 支援「戰爭迷霧 (Fog of War)」：前台隱藏未解鎖徽章條件（僅顯示 ❓），但玩家可透過查看他人已解鎖徽章得知條件；GM 後台則可一覽全服完整圖鑑與條件。
 * 3. 支援 GM 頭像特效 (🎂壽星 / ☀️大太陽 / 🌧️淋雨 / 🔥爆氣) 與自訂稱號、到期日自動卸下。
 * 4. 支援 GM 限時積分加倍活動日曆 (可回溯新增/修改/刪除 %、前台自動顯示「⏳預告」與「🔥進行中」橫幅、7 大資料片通用乘算)。
 */

// ============================================================================
// 1. AVATAR FX PRESETS & RENDERING HELPERS
// ============================================================================
const AVATAR_FX_PRESETS = {
  none: {
    key: 'none',
    label: '無特效 (預設)',
    icon: '',
    ringClass: '',
    pillClass: 'bg-slate-800 text-slate-300 border-slate-600',
    defaultTitle: ''
  },
  birthday: {
    key: 'birthday',
    label: '🎂 壽星慶典 (流光金框 + 皇冠蛋糕)',
    icon: '🎂',
    ringClass: 'avatar-fx-birthday',
    pillClass: 'bg-gradient-to-r from-amber-500/30 to-pink-500/30 text-amber-200 border-amber-400/70 shadow-sm shadow-amber-500/20',
    defaultTitle: '🎂 本日壽星'
  },
  sunny: {
    key: 'sunny',
    label: '☀️ 烈日戰神 (驕陽金芒 + 大太陽特效)',
    icon: '☀️',
    ringClass: 'avatar-fx-sunny',
    pillClass: 'bg-gradient-to-r from-orange-500/30 to-amber-500/30 text-amber-300 border-orange-400/70 shadow-sm shadow-orange-500/20',
    defaultTitle: '☀️ 烈日戰神'
  },
  rainy: {
    key: 'rainy',
    label: '🌧️ 風雨行者 (雨水波紋 + 淋雨特效)',
    icon: '🌧️',
    ringClass: 'avatar-fx-rainy',
    pillClass: 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-200 border-cyan-400/70 shadow-sm shadow-cyan-500/20',
    defaultTitle: '🌧️ 風雨行者'
  },
  aura: {
    key: 'aura',
    label: '🔥 爆氣覺醒 (鬥氣烈焰 + 賽亞人特效)',
    icon: '🔥',
    ringClass: 'avatar-fx-aura',
    pillClass: 'bg-gradient-to-r from-rose-600/30 to-amber-500/30 text-rose-200 border-rose-500/70 shadow-sm shadow-rose-500/20',
    defaultTitle: '🔥 爆氣覺醒'
  }
};

window.AVATAR_FX_PRESETS = AVATAR_FX_PRESETS;

const EVENT_THEME_PRESETS = {
  // 主鍵與 GM 後台下拉選單 (admin.html #gm-event-theme) 的 value 一一對應
  typhoon:  { key: 'typhoon',  icon: '🌪️', label: '🌪️ 颱風假防颱特訓',   defaultBonus: 20, badgeClass: 'bg-cyan-950/90 text-cyan-300 border-cyan-500/60' },
  rain:     { key: 'rain',     icon: '🌧️', label: '🌧️ 豪雨特報乘風破浪', defaultBonus: 20, badgeClass: 'bg-blue-950/90 text-blue-300 border-blue-500/60' },
  sunny:    { key: 'sunny',    icon: '☀️', label: '☀️ 烈日高溫戰神獎勵', defaultBonus: 20, badgeClass: 'bg-amber-950/90 text-amber-300 border-amber-500/60' },
  weekend:  { key: 'weekend',  icon: '🎉', label: '🎉 週末狂熱雙倍衝刺', defaultBonus: 20, badgeClass: 'bg-purple-950/90 text-purple-300 border-purple-500/60' },
  birthday: { key: 'birthday', icon: '🎂', label: '🎂 英雄壽星同慶日',   defaultBonus: 20, badgeClass: 'bg-pink-950/90 text-pink-300 border-pink-500/60' },
  custom:   { key: 'custom',   icon: '⚡', label: '⚡ GM 神秘突襲加倍',  defaultBonus: 20, badgeClass: 'bg-rose-950/90 text-rose-300 border-rose-500/60' }
};
// 舊版主題鍵值別名 (相容先前已儲存的活動資料)
EVENT_THEME_PRESETS.rainstorm = EVENT_THEME_PRESETS.rain;
EVENT_THEME_PRESETS.sunny_boost = EVENT_THEME_PRESETS.sunny;
EVENT_THEME_PRESETS.birthday_party = EVENT_THEME_PRESETS.birthday;
EVENT_THEME_PRESETS.special = EVENT_THEME_PRESETS.custom;

window.EVENT_THEME_PRESETS = EVENT_THEME_PRESETS;

function normalizeDateYMD(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim().replace(/-/g, '/').split(/\s+/)[0];
  const parts = s.split('/');
  if (parts.length !== 3) return '';
  const y = parts[0];
  const m = String(parseInt(parts[1], 10)).padStart(2, '0');
  const d = String(parseInt(parts[2], 10)).padStart(2, '0');
  if (isNaN(parseInt(y, 10)) || isNaN(parseInt(m, 10)) || isNaN(parseInt(d, 10))) return '';
  return `${y}/${m}/${d}`;
}

function getTodayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

window.normalizeDateYMD = normalizeDateYMD;
window.getTodayYMD = getTodayYMD;

/**
 * 日期字串 YYYY/MM/DD 加減天數 (以本地時區午夜計算，不受時分影響)
 */
function addDaysYMD(ymd, n) {
  const norm = normalizeDateYMD(ymd);
  if (!norm) return '';
  const [y, m, d] = norm.split('/').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
}

function diffDaysYMD(fromYMD, toYMD) {
  const a = normalizeDateYMD(fromYMD), b = normalizeDateYMD(toYMD);
  if (!a || !b) return 0;
  const [y1, m1, d1] = a.split('/').map(Number);
  const [y2, m2, d2] = b.split('/').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

window.addDaysYMD = addDaysYMD;
window.diffDaysYMD = diffDaysYMD;

/**
 * 【資料片五：飢餓法則】統一的毒圈扣血計算 (前台主畫面 / 戰情室 / 英雄卡 / GM 快照共用同一套邏輯)
 * - 毒圈於賽季開始後「每過一個午夜」扣一次血 (開賽當天 0 次，第 2 天 1 次 ...)。
 * - 賽季結束日之後不再扣血。
 * - 支援分段扣血 (survival.decaySchedule = [{ from: 'YYYY/MM/DD', perDay: 200 }, ...])：
 *   GM 中途調高每日扣血時只影響「生效日之後」的天數，不會回溯把過去的天數一起加重扣血。
 */
function computeSurvivalState(state, now) {
  const st = state || window.gameState || {};
  const cfg = st.survival || {};
  const maxHp = Number(cfg.maxHp) > 0 ? Number(cfg.maxHp) : 3000;
  const baseDecay = Number.isFinite(Number(cfg.decayPerDay)) && cfg.decayPerDay !== '' && cfg.decayPerDay !== null && cfg.decayPerDay !== undefined
    ? Number(cfg.decayPerDay) : 200;

  const startYMD = normalizeDateYMD(st.seasonStart || '');
  const endYMD = normalizeDateYMD(st.seasonEnd || '');
  const nowDate = now instanceof Date ? now : new Date();
  const todayYMD = `${nowDate.getFullYear()}/${String(nowDate.getMonth() + 1).padStart(2, '0')}/${String(nowDate.getDate()).padStart(2, '0')}`;
  const refYMD = (endYMD && todayYMD > endYMD) ? endYMD : todayYMD;

  const schedule = (Array.isArray(cfg.decaySchedule) ? cfg.decaySchedule : [])
    .map(s => ({ from: normalizeDateYMD(s.from), perDay: Number(s.perDay) }))
    .filter(s => s.from && Number.isFinite(s.perDay))
    .sort((a, b) => a.from.localeCompare(b.from));

  const decayOn = (ymd) => {
    if (schedule.length === 0) return baseDecay;
    let v = schedule[0].perDay;
    for (const s of schedule) { if (s.from <= ymd) v = s.perDay; else break; }
    return v;
  };

  const days = startYMD ? Math.max(0, diffDaysYMD(startYMD, refYMD)) : 0;
  let penalty = 0;
  const dailyPenalties = [{ ymd: startYMD || refYMD, penalty: 0 }];
  for (let i = 1; i <= days; i++) {
    const dYMD = addDaysYMD(startYMD, i);
    penalty += decayOn(dYMD);
    dailyPenalties.push({ ymd: dYMD, penalty });
  }
  const totalDays = startYMD ? (days + 1) : 1;

  const seasonOver = Boolean(endYMD && todayYMD > endYMD);
  const nextTickYMD = addDaysYMD(refYMD, 1);
  const currentDecay = decayOn(seasonOver ? refYMD : nextTickYMD);

  return { maxHp, decayPerDay: currentDecay, days, totalDays, penalty, dailyPenalties, schedule, startYMD, endYMD, refYMD, seasonOver };
}

function computeSurvivalHeroHp(heroStat, survivalState, state) {
  const sv = survivalState || computeSurvivalState(state);
  const food = Number(heroStat?.totalCalories) || 0;
  const scavenge = (Number(heroStat?.totalTrimp) || 0) * 1.5;
  const currentHp = Math.floor(sv.maxHp - sv.penalty + food + scavenge);
  const totalDays = sv.totalDays || ((sv.days || 0) + 1);

  // 計算「荒野堅持天數」= 開賽至今的存活天數 (每一天結束時生存值 > 0 的天數)
  const st = state || window.gameState || {};
  const heroName = heroStat?.name || '';
  const dailyPens = Array.isArray(sv.dailyPenalties) && sv.dailyPenalties.length > 0
    ? sv.dailyPenalties
    : [{ ymd: sv.refYMD || '', penalty: sv.penalty || 0 }];

  let survivedDays = 0;
  if (heroStat && typeof heroStat.survivedDays === 'number' && !Array.isArray(st.activities)) {
    survivedDays = heroStat.survivedDays;
  } else if (Array.isArray(st.activities) && heroName && sv.startYMD) {
    // 依日期統計該英雄在賽季中每日補充的 HP (Calories + TRIMP * 1.5)
    const dailyRegenMap = {};
    st.activities.forEach(a => {
      if (a.hero !== heroName || !a.isValidAttack || a.isExcluded) return;
      const ymd = normalizeDateYMD(a.date || a.time);
      if (!ymd) return;
      const regen = (Number(a.calories) || 0) + (Number(a.trimp) || 0) * 1.5;
      dailyRegenMap[ymd] = (dailyRegenMap[ymd] || 0) + regen;
    });
    let cumRegen = 0;
    dailyPens.forEach(dp => {
      if (dp.ymd && dailyRegenMap[dp.ymd]) cumRegen += dailyRegenMap[dp.ymd];
      const hpOnDay = Math.floor(sv.maxHp - dp.penalty + cumRegen);
      if (hpOnDay > 0) survivedDays += 1;
    });
  } else {
    dailyPens.forEach(dp => {
      const hpOnDay = Math.floor(sv.maxHp - dp.penalty + food + scavenge);
      if (hpOnDay > 0) survivedDays += 1;
    });
  }

  return { currentHp, isDead: currentHp <= 0, food, scavenge, survivedDays, totalDays };
}

/**
 * 英雄在本賽季「開賽至今的存活天數」(荒野堅持天數)
 */
function countHeroSurvivalDays(state, heroName, survivalState) {
  const st = state || window.gameState || {};
  const sv = survivalState || computeSurvivalState(st);
  const heroStat = (st.heroStats || window.heroStatsList || []).find(h => h.name === heroName) || { name: heroName };
  return computeSurvivalHeroHp(heroStat, sv, st).survivedDays;
}

/**
 * 英雄在本賽季中「有完成有效運動的天數」(同一天練兩次只算 1 天)
 */
function countHeroActiveDays(state, heroName) {
  const st = state || window.gameState || {};
  const days = new Set();
  (st.activities || []).forEach(a => {
    if (a.hero === heroName && a.isValidAttack) {
      const ymd = normalizeDateYMD(a.date || a.time);
      if (ymd) days.add(ymd);
    }
  });
  return days.size;
}

window.computeSurvivalState = computeSurvivalState;
window.computeSurvivalHeroHp = computeSurvivalHeroHp;
window.countHeroSurvivalDays = countHeroSurvivalDays;
window.countHeroActiveDays = countHeroActiveDays;

// ============================================================================
// 📱 手機同步 App 擴充資料 (預備功能)：資料來源標示與每日健康數據彙整
// ============================================================================
const ACTIVITY_SOURCE_META = {
  strava: { icon: '🟠', label: 'Strava' },
  apple_health: { icon: '🍎', label: 'Apple 健康' },
  health_connect: { icon: '🤖', label: 'Health Connect' },
  manual: { icon: '✍️', label: 'GM 手動補登' }
};
const ORIGIN_APP_BRANDS = [
  [/garmin/i, '⌚ Garmin'], [/xiaomi|mi\.health|mifit|wearable/i, '⌚ 小米'], [/samsung|shealth/i, '⌚ Samsung'],
  [/fitbit/i, '⌚ Fitbit'], [/huami|zepp|amazfit/i, '⌚ Amazfit'], [/polar/i, '⌚ Polar'], [/coros/i, '⌚ COROS'],
  [/suunto/i, '⌚ Suunto'], [/oura/i, '💍 Oura'], [/whoop/i, '⌚ WHOOP'], [/com\.apple/i, '⌚ Apple Watch']
];

function getActivitySourceMeta(act) {
  const base = ACTIVITY_SOURCE_META[act?.source] || ACTIVITY_SOURCE_META.strava;
  let brand = '';
  if (act?.deviceName) brand = `⌚ ${act.deviceName}`;
  else if (act?.originApp) {
    const hit = ORIGIN_APP_BRANDS.find(([re]) => re.test(act.originApp));
    if (hit) brand = hit[1];
  }
  return { ...base, brand };
}

/**
 * 彙整英雄最近 N 天的每日健康數據 (步數 / 睡眠 / 靜止心率 / 活動分鐘 / HRV)；沒有資料時回傳 null
 */
function getHeroHealthSummary(state, heroName, days = 7) {
  const st = state || window.gameState || {};
  const rows = (st.dailyHealth || []).filter(r => r.hero === heroName).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length === 0) return null;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const recent = rows.filter(r => String(r.date) >= cutoff);
  const avg = (field) => {
    const vals = recent.map(r => Number(r[field])).filter(v => Number.isFinite(v) && v > 0);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const latest = (field) => {
    const r = rows.slice().reverse().find(x => Number(x[field]) > 0);
    return r ? Number(r[field]) : null;
  };
  return {
    days: recent.length,
    avgSteps: avg('steps'),
    avgSleepMin: avg('sleep_minutes'),
    avgRestingHr: avg('resting_hr'),
    avgHrv: avg('hrv_ms'),
    avgSpo2: avg('spo2_pct'),
    avgActiveMin: avg('active_minutes'),
    lastDate: rows[rows.length - 1]?.date || ''
  };
}

window.getActivitySourceMeta = getActivitySourceMeta;
window.getHeroHealthSummary = getHeroHealthSummary;

/**
 * 取得某位英雄目前生效中的頭像特效與稱號 (若已過期則自動失效，但保留歷史紀錄供徽章解鎖)
 */
function getHeroActiveFx(heroName, state) {
  const cleanName = typeof heroName === 'object' && heroName !== null ? (heroName.name || '') : String(heroName || '');
  const targetState = state || window.gameState || {};
  const gmOps = targetState.gmOps || {};
  const fxRecord = gmOps.heroFx?.[cleanName];
  if (!fxRecord) return { fx: 'none', type: 'none', customTitle: '', isExpired: false, preset: AVATAR_FX_PRESETS.none, history: [] };

  const todayYMD = getTodayYMD();
  const expYMD = normalizeDateYMD(fxRecord.expiresAt);
  const isExpired = Boolean(expYMD && expYMD < todayYMD);

  const rawFxKey = fxRecord.fx || fxRecord.type || 'none';
  const activeFxKey = (!isExpired && rawFxKey && AVATAR_FX_PRESETS[rawFxKey]) ? rawFxKey : 'none';
  const activeTitle = !isExpired ? (fxRecord.customTitle || '').trim() : '';

  return {
    fx: activeFxKey,
    type: activeFxKey,
    customTitle: activeTitle,
    expiresAt: expYMD,
    isExpired: isExpired,
    preset: AVATAR_FX_PRESETS[activeFxKey] || AVATAR_FX_PRESETS.none,
    history: Array.isArray(fxRecord.history) ? fxRecord.history : (rawFxKey && rawFxKey !== 'none' ? [rawFxKey] : [])
  };
}

window.getHeroActiveFx = getHeroActiveFx;

/**
 * 渲染帶有 GM 動態邊框特效與角標的英雄頭像 HTML
 * 支援兩種呼叫簽名：
 *   1) renderHeroAvatarHtml(heroObj, sizeClass, roundedClass)
 *   2) renderHeroAvatarHtml(heroName, avatarUrl, sizeClass, roundedClass)
 */
function bcEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderHeroAvatarHtml(heroOrName, avatarUrlOrSize, sizeClass = 'w-10 h-10', roundedClass = 'rounded-xl') {
  let heroName = '';
  let avatarUrl = '';
  let finalSize = sizeClass;
  let finalRounded = roundedClass;

  if (typeof heroOrName === 'object' && heroOrName !== null) {
    heroName = heroOrName.name || '英雄';
    avatarUrl = heroOrName.avatar || '';
    finalSize = avatarUrlOrSize || 'w-10 h-10';
    finalRounded = sizeClass && sizeClass !== 'w-10 h-10' ? sizeClass : 'rounded-xl';
  } else {
    heroName = String(heroOrName || '英雄');
    if (typeof avatarUrlOrSize === 'string' && /^(w-|h-)\S*(\s|$)/.test(avatarUrlOrSize) && !/^https?:|^data:|\//.test(avatarUrlOrSize)) {
      // Called as renderHeroAvatarHtml('Kerker', 'w-10 h-10', 'rounded-xl')
      const hObj = (window.gameState?.heroes || []).find(h => h.name === heroName);
      avatarUrl = hObj?.avatar || '';
      finalSize = avatarUrlOrSize;
      finalRounded = sizeClass && sizeClass !== 'w-10 h-10' ? sizeClass : 'rounded-xl';
    } else {
      avatarUrl = avatarUrlOrSize || '';
    }
  }

  const fallbackUrl = avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(heroName)}`;
  const fxInfo = getHeroActiveFx(heroName);
  const hasFx = fxInfo.fx && fxInfo.fx !== 'none';

  return `
    <div class="relative inline-flex flex-shrink-0 ${finalSize} ${finalRounded} ${hasFx ? fxInfo.preset.ringClass : 'border border-slate-700'} bg-slate-800 select-none">
      <img src="${bcEsc(fallbackUrl)}" alt="${bcEsc(heroName)}" class="w-full h-full object-cover ${finalRounded}">
      ${hasFx ? `<span class="avatar-fx-overlay avatar-fx-overlay-${fxInfo.fx} ${finalRounded}"></span>` : ''}
      ${hasFx && fxInfo.preset.icon ? `<span class="avatar-fx-corner-badge" title="${bcEsc(fxInfo.customTitle || fxInfo.preset.label)}">${fxInfo.preset.icon}</span>` : ''}
    </div>
  `;
}

window.renderHeroAvatarHtml = renderHeroAvatarHtml;

/**
 * 渲染英雄自訂小稱號標籤 HTML
 */
function renderHeroCustomTitleHtml(heroName) {
  const fxInfo = getHeroActiveFx(heroName);
  if (!fxInfo.customTitle && (!fxInfo.fx || fxInfo.fx === 'none')) return '';
  const displayTitle = fxInfo.customTitle || fxInfo.preset.defaultTitle;
  if (!displayTitle) return '';
  return `<span class="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-black border ${fxInfo.preset.pillClass} ml-1 whitespace-nowrap">${bcEsc(displayTitle)}</span>`;
}

window.renderHeroCustomTitleHtml = renderHeroCustomTitleHtml;

/**
 * 計算單筆運動日期是否命中任何 GM 限時積分加倍活動
 */
function getActivityEventBonus(actDateStr, gmOpsConfig) {
  const actYMD = normalizeDateYMD(actDateStr);
  if (!actYMD) return { bonusPct: 0, multiplier: 1.0, matchedEvents: [] };

  const events = Array.isArray(gmOpsConfig?.events) ? gmOpsConfig.events : [];
  const matched = [];
  let totalBonusPct = 0;

  events.forEach(ev => {
    if (ev.enabled === false) return;
    const startYMD = normalizeDateYMD(ev.startDate);
    const endYMD = normalizeDateYMD(ev.endDate || ev.startDate);
    const pct = parseFloat(ev.bonusPct) || 0;
    if (!startYMD || pct === 0) return;

    if (actYMD >= startYMD && actYMD <= (endYMD || startYMD)) {
      totalBonusPct += pct;
      matched.push({
        id: ev.id,
        title: ev.title || '限時活動',
        icon: ev.icon || '⚡',
        bonusPct: pct,
        startDate: startYMD,
        endDate: endYMD || startYMD
      });
    }
  });

  const multiplier = Math.max(0.1, 1 + (totalBonusPct / 100));
  return {
    bonusPct: totalBonusPct,
    multiplier: multiplier,
    matchedEvents: matched
  };
}

window.getActivityEventBonus = getActivityEventBonus;

// ============================================================================
// 2. RARITY DEFINITIONS (5 Tiers)
// ============================================================================
const BADGE_RARITY_META = {
  common: {
    key: 'common',
    label: '銅牌 • 初心者',
    shortLabel: '銅牌',
    frameHex: '#d97706',
    color: 'text-orange-200',
    bg: 'bg-orange-950/40',
    border: 'border-2 border-orange-600/90 bg-gradient-to-br from-orange-950/60 to-amber-950/40 text-orange-200 shadow-[inset_0_0_8px_rgba(217,119,6,0.25)]',
    glow: 'hover:border-orange-400 shadow-[0_0_10px_rgba(217,119,6,0.22)]',
    tagClass: 'bg-orange-950/90 text-orange-300 border-orange-600'
  },
  rare: {
    key: 'rare',
    label: '銀牌 • 精銳',
    shortLabel: '銀牌',
    frameHex: '#22d3ee',
    color: 'text-cyan-200',
    bg: 'bg-cyan-950/40',
    border: 'border-2 border-cyan-400/90 bg-gradient-to-br from-slate-800/80 via-cyan-950/60 to-slate-900/80 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.28)]',
    glow: 'hover:border-cyan-300 shadow-[0_0_14px_rgba(6,182,212,0.32)]',
    tagClass: 'bg-cyan-950 text-cyan-200 border-cyan-500'
  },
  epic: {
    key: 'epic',
    label: '金牌 • 史詩',
    shortLabel: '金牌',
    frameHex: '#fbbf24',
    color: 'text-amber-300',
    bg: 'bg-amber-950/50',
    border: 'border-2 border-amber-400 bg-gradient-to-br from-yellow-900/60 via-amber-950/70 to-orange-950/60 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.38)]',
    glow: 'hover:border-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.45)]',
    tagClass: 'bg-amber-950 text-amber-300 border-amber-400'
  },
  legendary: {
    key: 'legendary',
    label: '紫金 • 傳奇',
    shortLabel: '紫金',
    frameHex: '#c084fc',
    color: 'text-purple-200',
    bg: 'bg-purple-950/50',
    border: 'border-2 border-purple-400 bg-gradient-to-br from-purple-900/75 via-fuchsia-950/65 to-amber-950/50 text-purple-100 shadow-[0_0_20px_rgba(192,132,252,0.48)]',
    glow: 'hover:border-purple-300 shadow-[0_0_22px_rgba(168,85,247,0.55)]',
    tagClass: 'bg-purple-950 text-purple-200 border-purple-400'
  },
  mythic: {
    key: 'mythic',
    label: '彩級 • 殿堂神話',
    shortLabel: '彩級',
    frameHex: '#f43f5e',
    color: 'text-rose-200',
    bg: 'bg-rose-950/60',
    border: 'border-2 border-rose-400 bg-gradient-to-br from-rose-900/80 via-purple-900/70 to-amber-900/80 text-amber-100 ring-1 ring-amber-300/60 shadow-[0_0_24px_rgba(244,63,94,0.6)]',
    glow: 'hover:border-amber-300 shadow-[0_0_26px_rgba(244,63,94,0.68)]',
    tagClass: 'bg-gradient-to-r from-rose-900 via-purple-900 to-amber-900 text-amber-200 border-rose-400'
  }
};

window.BADGE_RARITY_META = BADGE_RARITY_META;

// ============================================================================
// 3. DECLARATIVE 100-BADGE CATALOG (Extensible to 500+ via registerBadges)
// ============================================================================
const BADGE_CATALOG = [
  // --------------------------------------------------------------------------
  // 系列一：【鋼鐵紀律】出勤次數系列 (#001 ~ #010)
  // --------------------------------------------------------------------------
  { id: 'b001', num: 1, category: '1. 鋼鐵紀律 (出勤)', name: '初出茅廬', icon: '🌱', rarity: 'common', condition: '生涯完成第 1 次有效運動打卡', rule: { type: 'workouts_count', min: 1 } },
  { id: 'b002', num: 2, category: '1. 鋼鐵紀律 (出勤)', name: '習慣養成', icon: '🥾', rarity: 'common', condition: '生涯累計完成 5 次有效運動', rule: { type: 'workouts_count', min: 5 } },
  { id: 'b003', num: 3, category: '1. 鋼鐵紀律 (出勤)', name: '鐵血新兵', icon: '🛡️', rarity: 'common', condition: '生涯累計完成 10 次有效運動', rule: { type: 'workouts_count', min: 10 } },
  { id: 'b004', num: 4, category: '1. 鋼鐵紀律 (出勤)', name: '精銳戰士', icon: '⚔️', rarity: 'rare', condition: '生涯累計完成 25 次有效運動', rule: { type: 'workouts_count', min: 25 } },
  { id: 'b005', num: 5, category: '1. 鋼鐵紀律 (出勤)', name: '百戰老兵', icon: '🏅', rarity: 'epic', condition: '生涯累計完成 50 次有效運動', rule: { type: 'workouts_count', min: 50 } },
  { id: 'b006', num: 6, category: '1. 鋼鐵紀律 (出勤)', name: '鋼鐵先鋒', icon: '🦅', rarity: 'epic', condition: '生涯累計完成 75 次有效運動', rule: { type: 'workouts_count', min: 75 } },
  { id: 'b007', num: 7, category: '1. 鋼鐵紀律 (出勤)', name: '百練成鋼', icon: '👑', rarity: 'legendary', condition: '生涯累計完成 100 次有效運動', rule: { type: 'workouts_count', min: 100 } },
  { id: 'b008', num: 8, category: '1. 鋼鐵紀律 (出勤)', name: '不滅金身', icon: '🔥', rarity: 'legendary', condition: '生涯累計完成 150 次有效運動', rule: { type: 'workouts_count', min: 150 } },
  { id: 'b009', num: 9, category: '1. 鋼鐵紀律 (出勤)', name: '傳奇半神', icon: '⚡', rarity: 'mythic', condition: '生涯累計完成 200 次有效運動', rule: { type: 'workouts_count', min: 200 } },
  { id: 'b010', num: 10, category: '1. 鋼鐵紀律 (出勤)', name: '永動神話', icon: '🌌', rarity: 'mythic', condition: '生涯累計完成 300 次有效運動', rule: { type: 'workouts_count', min: 300 } },

  // --------------------------------------------------------------------------
  // 系列二：【人間火爐】卡路里燃燒系列 (#011 ~ #020)
  // --------------------------------------------------------------------------
  { id: 'b011', num: 11, category: '2. 人間火爐 (熱量)', name: '消滅雞排', icon: '🍗', rarity: 'common', condition: '單次運動消耗達 300 kcal 以上', rule: { type: 'single_cal', min: 300 } },
  { id: 'b012', num: 12, category: '2. 人間火爐 (熱量)', name: '手搖飲粉碎者', icon: '🧋', rarity: 'common', condition: '單次運動消耗達 500 kcal 以上', rule: { type: 'single_cal', min: 500 } },
  { id: 'b013', num: 13, category: '2. 人間火爐 (熱量)', name: '便當終結者', icon: '🍱', rarity: 'rare', condition: '單次運動消耗達 800 kcal 以上', rule: { type: 'single_cal', min: 800 } },
  { id: 'b014', num: 14, category: '2. 人間火爐 (熱量)', name: '火鍋還債王', icon: '🍲', rarity: 'epic', condition: '單次運動消耗突破 1,000 kcal', rule: { type: 'single_cal', min: 1000 } },
  { id: 'b015', num: 15, category: '2. 人間火爐 (熱量)', name: '核能反應爐', icon: '🌋', rarity: 'legendary', condition: '單次運動消耗突破 1,500 kcal', rule: { type: 'single_cal', min: 1500 } },
  { id: 'b016', num: 16, category: '2. 人間火爐 (熱量)', name: '燃脂學徒', icon: '🕯️', rarity: 'common', condition: '生涯累積消耗熱量達 5,000 kcal', rule: { type: 'total_cal', min: 5000 } },
  { id: 'b017', num: 17, category: '2. 人間火爐 (熱量)', name: '營火守護者', icon: '🔥', rarity: 'rare', condition: '生涯累積消耗熱量達 15,000 kcal', rule: { type: 'total_cal', min: 15000 } },
  { id: 'b018', num: 18, category: '2. 人間火爐 (熱量)', name: '烈陽熔爐', icon: '☀️', rarity: 'epic', condition: '生涯累積消耗熱量達 30,000 kcal', rule: { type: 'total_cal', min: 30000 } },
  { id: 'b019', num: 19, category: '2. 人間火爐 (熱量)', name: '超新星爆發', icon: '☄️', rarity: 'legendary', condition: '生涯累積消耗熱量達 50,000 kcal', rule: { type: 'total_cal', min: 50000 } },
  { id: 'b020', num: 20, category: '2. 人間火爐 (熱量)', name: '焚天炎帝', icon: '🐉', rarity: 'mythic', condition: '生涯累積消耗熱量達 100,000 kcal', rule: { type: 'total_cal', min: 100000 } },

  // --------------------------------------------------------------------------
  // 系列三：【精神時光屋】耐力時長系列 (#021 ~ #030)
  // --------------------------------------------------------------------------
  { id: 'b021', num: 21, category: '3. 精神時光屋 (時長)', name: '漸入佳境', icon: '⏳', rarity: 'common', condition: '單次運動持續達 45 分鐘以上', rule: { type: 'single_dur', min: 45 } },
  { id: 'b022', num: 22, category: '3. 精神時光屋 (時長)', name: '一小時俱樂部', icon: '🕐', rarity: 'common', condition: '單次運動持續達 60 分鐘以上', rule: { type: 'single_dur', min: 60 } },
  { id: 'b023', num: 23, category: '3. 精神時光屋 (時長)', name: '耐力長征', icon: '🏃', rarity: 'rare', condition: '單次運動持續達 90 分鐘以上', rule: { type: 'single_dur', min: 90 } },
  { id: 'b024', num: 24, category: '3. 精神時光屋 (時長)', name: '雙倍時光', icon: '🔋', rarity: 'epic', condition: '單次運動持續達 120 分鐘 (2小時) 以上', rule: { type: 'single_dur', min: 120 } },
  { id: 'b025', num: 25, category: '3. 精神時光屋 (時長)', name: '苦行高僧', icon: '🏔️', rarity: 'legendary', condition: '單次運動持續達 180 分鐘 (3小時) 以上', rule: { type: 'single_dur', min: 180 } },
  { id: 'b026', num: 26, category: '3. 精神時光屋 (時長)', name: '五百分刻度', icon: '⏱️', rarity: 'common', condition: '生涯累積運動時長達 500 分鐘', rule: { type: 'total_dur', min: 500 } },
  { id: 'b027', num: 27, category: '3. 精神時光屋 (時長)', name: '千分試煉', icon: '⌚', rarity: 'rare', condition: '生涯累積運動時長達 1,000 分鐘', rule: { type: 'total_dur', min: 1000 } },
  { id: 'b028', num: 28, category: '3. 精神時光屋 (時長)', name: '時間領主', icon: '🧭', rarity: 'epic', condition: '生涯累積運動時長達 2,500 分鐘', rule: { type: 'total_dur', min: 2500 } },
  { id: 'b029', num: 29, category: '3. 精神時光屋 (時長)', name: '五千分壯遊', icon: '🌌', rarity: 'legendary', condition: '生涯累積運動時長達 5,000 分鐘', rule: { type: 'total_dur', min: 5000 } },
  { id: 'b030', num: 30, category: '3. 精神時光屋 (時長)', name: '萬分永恆', icon: '♾️', rarity: 'mythic', condition: '生涯累積運動時長達 10,000 分鐘', rule: { type: 'total_dur', min: 10000 } },

  // --------------------------------------------------------------------------
  // 系列四：【引擎超載】心率與無氧爆發系列 (#031 ~ #040)
  // --------------------------------------------------------------------------
  { id: 'b031', num: 31, category: '4. 引擎超載 (心率)', name: '引擎熱身', icon: '💓', rarity: 'common', condition: '單次運動平均心率達 140 bpm 以上', rule: { type: 'single_avghr', min: 140 } },
  { id: 'b032', num: 32, category: '4. 引擎超載 (心率)', name: '渦輪增壓', icon: '🚀', rarity: 'rare', condition: '單次運動平均心率達 155 bpm 以上', rule: { type: 'single_avghr', min: 155 } },
  { id: 'b033', num: 33, category: '4. 引擎超載 (心率)', name: '紅線超轉', icon: '🩸', rarity: 'epic', condition: '單次運動平均心率達 170 bpm 以上', rule: { type: 'single_avghr', min: 170 } },
  { id: 'b034', num: 34, category: '4. 引擎超載 (心率)', name: '心臟爆擊', icon: '⚡', rarity: 'rare', condition: '單次運動最高心率達 180 bpm 以上', rule: { type: 'single_maxhr', min: 180 } },
  { id: 'b035', num: 35, category: '4. 引擎超載 (心率)', name: '突破天際', icon: '💥', rarity: 'legendary', condition: '單次運動最高心率達 190 bpm 以上', rule: { type: 'single_maxhr', min: 190 } },
  { id: 'b036', num: 36, category: '4. 引擎超載 (心率)', name: '落差覺醒', icon: '🦍', rarity: 'common', condition: '單次無氧心率落差 (MaxGap) 達 40 bpm', rule: { type: 'single_gap', min: 40 } },
  { id: 'b037', num: 37, category: '4. 引擎超載 (心率)', name: '狂暴落差', icon: '🗡️', rarity: 'rare', condition: '單次無氧心率落差 (MaxGap) 達 55 bpm', rule: { type: 'single_gap', min: 55 } },
  { id: 'b038', num: 38, category: '4. 引擎超載 (心率)', name: '魔鬼間歇', icon: '👹', rarity: 'epic', condition: '單次無氧心率落差 (MaxGap) 達 70 bpm', rule: { type: 'single_gap', min: 70 } },
  { id: 'b039', num: 39, category: '4. 引擎超載 (心率)', name: '死神擦肩', icon: '☠️', rarity: 'legendary', condition: '單次無氧心率落差 (MaxGap) 達 85 bpm', rule: { type: 'single_gap', min: 85 } },
  { id: 'b040', num: 40, category: '4. 引擎超載 (心率)', name: '奧術超載', icon: '🔮', rarity: 'epic', condition: '單次運動訓練衝力 (TRIMP) 突破 150 點', rule: { type: 'single_trimp', min: 150 } },

  // --------------------------------------------------------------------------
  // 系列五：【燃脂大師】Zone 2 有氧巡航系列 (#041 ~ #050)
  // --------------------------------------------------------------------------
  { id: 'b041', num: 41, category: '5. 燃脂大師 (Zone2)', name: '綠色初體驗', icon: '🟢', rarity: 'common', condition: '首次達成 Zone 2 有氧燃脂區間 (60%~75% MaxHR)', rule: { type: 'zone2_count', min: 1 } },
  { id: 'b042', num: 42, category: '5. 燃脂大師 (Zone2)', name: '穩定巡航', icon: '🍃', rarity: 'common', condition: '生涯累計達成 5 次 Zone 2 有氧訓練', rule: { type: 'zone2_count', min: 5 } },
  { id: 'b043', num: 43, category: '5. 燃脂大師 (Zone2)', name: '有氧節奏', icon: '🌿', rarity: 'rare', condition: '生涯累計達成 10 次 Zone 2 有氧訓練', rule: { type: 'zone2_count', min: 10 } },
  { id: 'b044', num: 44, category: '5. 燃脂大師 (Zone2)', name: '森林遊俠', icon: '🌲', rarity: 'rare', condition: '生涯累計達成 20 次 Zone 2 有氧訓練', rule: { type: 'zone2_count', min: 20 } },
  { id: 'b045', num: 45, category: '5. 燃脂大師 (Zone2)', name: '龜息大法', icon: '🐢', rarity: 'epic', condition: '生涯累計達成 35 次 Zone 2 有氧訓練', rule: { type: 'zone2_count', min: 35 } },
  { id: 'b046', num: 46, category: '5. 燃脂大師 (Zone2)', name: '綠光宗師', icon: '💚', rarity: 'epic', condition: '生涯累計達成 50 次 Zone 2 有氧訓練', rule: { type: 'zone2_count', min: 50 } },
  { id: 'b047', num: 47, category: '5. 燃脂大師 (Zone2)', name: '深海呼吸', icon: '🌊', rarity: 'legendary', condition: '生涯累計達成 75 次 Zone 2 有氧訓練', rule: { type: 'zone2_count', min: 75 } },
  { id: 'b048', num: 48, category: '5. 燃脂大師 (Zone2)', name: '有氧大帝', icon: '👑', rarity: 'mythic', condition: '生涯累計達成 100 次 Zone 2 有氧訓練', rule: { type: 'zone2_count', min: 100 } },
  { id: 'b049', num: 49, category: '5. 燃脂大師 (Zone2)', name: '長效燃脂', icon: '🔋', rarity: 'rare', condition: '單次 Zone 2 有氧訓練且時長滿 60 分鐘', rule: { type: 'single_zone2_dur', min: 60 } },
  { id: 'b050', num: 50, category: '5. 燃脂大師 (Zone2)', name: '永動巡航艦', icon: '🛸', rarity: 'epic', condition: '單次 Zone 2 有氧訓練且時長滿 90 分鐘', rule: { type: 'single_zone2_dur', min: 90 } },

  // --------------------------------------------------------------------------
  // 系列六：【時間管理大師】特殊作息系列 (#051 ~ #060)
  // --------------------------------------------------------------------------
  { id: 'b051', num: 51, category: '6. 時間管理 (作息)', name: '破曉先鋒', icon: '🐓', rarity: 'rare', condition: '在清晨 05:00 ~ 06:59 之間開始有效運動', rule: { type: 'hour_range', startHour: 5, endHour: 6 } },
  { id: 'b052', num: 52, category: '6. 時間管理 (作息)', name: '晨光戰士', icon: '☀️', rarity: 'common', condition: '在早晨 07:00 ~ 08:59 之間開始有效運動', rule: { type: 'hour_range', startHour: 7, endHour: 8 } },
  { id: 'b053', num: 53, category: '6. 時間管理 (作息)', name: '午休偷練王', icon: '🍱', rarity: 'rare', condition: '在午間 11:00 ~ 13:59 之間開始有效運動', rule: { type: 'hour_range', startHour: 11, endHour: 13 } },
  { id: 'b054', num: 54, category: '6. 時間管理 (作息)', name: '下午茶燃脂', icon: '☕', rarity: 'common', condition: '在午後 14:00 ~ 16:59 之間開始有效運動', rule: { type: 'hour_range', startHour: 14, endHour: 16 } },
  { id: 'b055', num: 55, category: '6. 時間管理 (作息)', name: '黃昏突擊隊', icon: '🌆', rarity: 'common', condition: '在傍晚 17:00 ~ 18:59 下班時段開始運動', rule: { type: 'hour_range', startHour: 17, endHour: 18 } },
  { id: 'b056', num: 56, category: '6. 時間管理 (作息)', name: '星光跑者', icon: '🌙', rarity: 'common', condition: '在晚間 19:00 ~ 20:59 之間開始有效運動', rule: { type: 'hour_range', startHour: 19, endHour: 20 } },
  { id: 'b057', num: 57, category: '6. 時間管理 (作息)', name: '夜行刺客', icon: '🦉', rarity: 'rare', condition: '在深夜 21:00 ~ 22:59 之間開始有效運動', rule: { type: 'hour_range', startHour: 21, endHour: 22 } },
  { id: 'b058', num: 58, category: '6. 時間管理 (作息)', name: '午夜幽靈', icon: '🧛', rarity: 'epic', condition: '在半夜 23:00 ~ 04:59 之間進行有效運動', rule: { type: 'hour_range', startHour: 23, endHour: 4 } },
  { id: 'b059', num: 59, category: '6. 時間管理 (作息)', name: '週一粉碎者', icon: '💼', rarity: 'rare', condition: '累計在「星期一」完成 5 次有效運動', rule: { type: 'weekday_count', day: 1, min: 5 } },
  { id: 'b060', num: 60, category: '6. 時間管理 (作息)', name: '七曜全勤王', icon: '📅', rarity: 'epic', condition: '生涯集滿週一至週日每一天都曾有運動紀錄', rule: { type: 'all_weekdays' } },

  // --------------------------------------------------------------------------
  // 系列七：【不滅連斬】連續打卡連擊系列 (#061 ~ #070)
  // --------------------------------------------------------------------------
  { id: 'b061', num: 61, category: '7. 不滅連斬 (連擊)', name: '二連擊', icon: '✌️', rarity: 'common', condition: '連續 2 天都有完成有效運動打卡', rule: { type: 'streak_days', min: 2 } },
  { id: 'b062', num: 62, category: '7. 不滅連斬 (連擊)', name: '三連斬', icon: '🔥', rarity: 'rare', condition: '連續 3 天都有完成有效運動打卡', rule: { type: 'streak_days', min: 3 } },
  { id: 'b063', num: 63, category: '7. 不滅連斬 (連擊)', name: '五連絕世', icon: '🖐️', rarity: 'epic', condition: '連續 5 天都有完成有效運動打卡', rule: { type: 'streak_days', min: 5 } },
  { id: 'b064', num: 64, category: '7. 不滅連斬 (連擊)', name: '七日大滿貫', icon: '🌈', rarity: 'legendary', condition: '連續 7 天每天都有完成有效運動', rule: { type: 'streak_days', min: 7 } },
  { id: 'b065', num: 65, category: '7. 不滅連斬 (連擊)', name: '十日暴走', icon: '🔟', rarity: 'legendary', condition: '連續 10 天每天都有完成有效運動', rule: { type: 'streak_days', min: 10 } },
  { id: 'b066', num: 66, category: '7. 不滅連斬 (連擊)', name: '雙週鐵人', icon: '🤖', rarity: 'mythic', condition: '連續 14 天每天都有完成有效運動', rule: { type: 'streak_days', min: 14 } },
  { id: 'b067', num: 67, category: '7. 不滅連斬 (連擊)', name: '單日二刀流', icon: '⚡', rarity: 'rare', condition: '在同一天內完成 2 次以上有效運動', rule: { type: 'same_day_count', min: 2 } },
  { id: 'b068', num: 68, category: '7. 不滅連斬 (連擊)', name: '單日三連星', icon: '🌪️', rarity: 'epic', condition: '在同一天內完成 3 次以上有效運動', rule: { type: 'same_day_count', min: 3 } },
  { id: 'b069', num: 69, category: '7. 不滅連斬 (連擊)', name: '週末雙響砲', icon: '🏖️', rarity: 'rare', condition: '在同一個週末 (週六與週日連續兩天) 都有運動', rule: { type: 'weekend_both' } },
  { id: 'b070', num: 70, category: '7. 不滅連斬 (連擊)', name: '單週五練狂人', icon: '🏋️', rarity: 'epic', condition: '在同一個日曆週內完成 5 次以上有效運動', rule: { type: 'week_count', min: 5 } },

  // --------------------------------------------------------------------------
  // 系列八：【十項全能】多元運動武器庫系列 (#071 ~ #080)
  // --------------------------------------------------------------------------
  { id: 'b071', num: 71, category: '8. 十項全能 (多元)', name: '疾風跑者', icon: '👟', rarity: 'common', condition: '完成過 1 次 Run (跑步) 類型有效運動', rule: { type: 'sport_count', sports: ['run', 'virtualrun', 'trailrun'], min: 1 } },
  { id: 'b072', num: 72, category: '8. 十項全能 (多元)', name: '馬拉松之魂', icon: '🏃‍♂️', rarity: 'epic', condition: '累計完成 15 次 Run (跑步) 類型有效運動', rule: { type: 'sport_count', sports: ['run', 'virtualrun', 'trailrun'], min: 15 } },
  { id: 'b073', num: 73, category: '8. 十項全能 (多元)', name: '鋼鐵巨石', icon: '🏋️', rarity: 'common', condition: '完成過 1 次 WeightTraining (重量訓練) 運動', rule: { type: 'sport_count', sports: ['weighttraining', 'workout', 'crossfit'], min: 1 } },
  { id: 'b074', num: 74, category: '8. 十項全能 (多元)', name: '健身房地縛靈', icon: '💪', rarity: 'epic', condition: '累計完成 20 次重訓或一般鍛鍊', rule: { type: 'sport_count', sports: ['weighttraining', 'workout', 'crossfit'], min: 20 } },
  { id: 'b075', num: 75, category: '8. 十項全能 (多元)', name: '破風騎士', icon: '🚴', rarity: 'rare', condition: '完成過 1 次 Ride (自行車騎乘) 運動', rule: { type: 'sport_count', sports: ['ride', 'virtualride', 'ebikeride'], min: 1 } },
  { id: 'b076', num: 76, category: '8. 十項全能 (多元)', name: '水中蛟龍', icon: '🏊', rarity: 'rare', condition: '完成過 1 次 Swim (游泳) 運動', rule: { type: 'sport_count', sports: ['swim'], min: 1 } },
  { id: 'b077', num: 77, category: '8. 十項全能 (多元)', name: '登山健將', icon: '⛰️', rarity: 'rare', condition: '生涯累積爬升高度 (Elevation) 突破 300 公尺', rule: { type: 'total_elev', min: 300 } },
  { id: 'b078', num: 78, category: '8. 十項全能 (多元)', name: '聖母峰挑戰者', icon: '🏔️', rarity: 'legendary', condition: '生涯累積爬升高度突破 2,000 公尺', rule: { type: 'total_elev', min: 2000 } },
  { id: 'b079', num: 79, category: '8. 十項全能 (多元)', name: '雙修武器大師', icon: '🎭', rarity: 'rare', condition: '生涯體驗過 2 種以上不同的運動項目類型', rule: { type: 'unique_sports', min: 2 } },
  { id: 'b080', num: 80, category: '8. 十項全能 (多元)', name: '三棲全能王', icon: '🌈', rarity: 'epic', condition: '生涯體驗過 3 種以上不同的運動項目類型', rule: { type: 'unique_sports', min: 3 } },
  { id: 'b301', num: 301, category: '8. 十項全能 (多元)', name: '三公里起跑', icon: '🏃', rarity: 'common', condition: '單次跑步 (Run) 距離達 3 公里以上', rule: { type: 'single_sport_dist', sports: ['run', 'virtualrun', 'trailrun'], min: 3 } },
  { id: 'b302', num: 302, category: '8. 十項全能 (多元)', name: '五公里破風', icon: '🏃', rarity: 'rare', condition: '單次跑步 (Run) 距離達 5 公里以上', rule: { type: 'single_sport_dist', sports: ['run', 'virtualrun', 'trailrun'], min: 5 } },
  { id: 'b303', num: 303, category: '8. 十項全能 (多元)', name: '十公里痛快', icon: '🏃', rarity: 'epic', condition: '單次跑步 (Run) 距離突破 10 公里', rule: { type: 'single_sport_dist', sports: ['run', 'virtualrun', 'trailrun'], min: 10 } },
  { id: 'b304', num: 304, category: '8. 十項全能 (多元)', name: '半馬征服者', icon: '🏃', rarity: 'legendary', condition: '單次跑步 (Run) 距離突破 21 公里 (半程馬拉松)', rule: { type: 'single_sport_dist', sports: ['run', 'virtualrun', 'trailrun'], min: 21 } },
  { id: 'b305', num: 305, category: '8. 十項全能 (多元)', name: '全馬神話', icon: '🏃', rarity: 'mythic', condition: '單次跑步 (Run) 距離突破 42 公里 (全程馬拉松)', rule: { type: 'single_sport_dist', sports: ['run', 'virtualrun', 'trailrun'], min: 42 } },
  { id: 'b306', num: 306, category: '8. 十項全能 (多元)', name: '十里輕騎', icon: '🚴', rarity: 'common', condition: '單次自行車騎乘 (Ride) 距離達 10 公里以上', rule: { type: 'single_sport_dist', sports: ['ride', 'virtualride', 'ebikeride'], min: 10 } },
  { id: 'b307', num: 307, category: '8. 十項全能 (多元)', name: '三十里巡航', icon: '🚴', rarity: 'rare', condition: '單次自行車騎乘 (Ride) 距離達 30 公里以上', rule: { type: 'single_sport_dist', sports: ['ride', 'virtualride', 'ebikeride'], min: 30 } },
  { id: 'b308', num: 308, category: '8. 十項全能 (多元)', name: '五十里破風手', icon: '🚴', rarity: 'epic', condition: '單次自行車騎乘 (Ride) 距離突破 50 公里', rule: { type: 'single_sport_dist', sports: ['ride', 'virtualride', 'ebikeride'], min: 50 } },
  { id: 'b309', num: 309, category: '8. 十項全能 (多元)', name: '百公里鐵騎王', icon: '🚴', rarity: 'legendary', condition: '單次自行車騎乘 (Ride) 距離突破 100 公里', rule: { type: 'single_sport_dist', sports: ['ride', 'virtualride', 'ebikeride'], min: 100 } },

  // --------------------------------------------------------------------------
  // 系列九：【幸運彩蛋】趣味巧合與奇蹟系列 (#081 ~ #090)
  // --------------------------------------------------------------------------
  { id: 'b081', num: 81, category: '9. 幸運彩蛋 (奇蹟)', name: '壓線合格大師', icon: '🐢', rarity: 'rare', condition: '單次有效運動時長剛好落在 30.0 ~ 30.9 分鐘之間 (多一秒都不練！)', rule: { type: 'just_pass_dur', min: 30, max: 30.9 } },
  { id: 'b082', num: 82, category: '9. 幸運彩蛋 (奇蹟)', name: '強迫症福音', icon: '📏', rarity: 'rare', condition: '單次運動時長剛好整數 60.0 分鐘，或熱量剛好為整百 (如 300/400/500 kcal)', rule: { type: 'exact_round' } },
  { id: 'b083', num: 83, category: '9. 幸運彩蛋 (奇蹟)', name: '幸運 777', icon: '🎰', rarity: 'epic', condition: '單次運動的熱量、時長或心率數值中含有「77」幸運數字', rule: { type: 'lucky_77' } },
  { id: 'b084', num: 84, category: '9. 幸運彩蛋 (奇蹟)', name: '佛系養生拳', icon: '🧘', rarity: 'rare', condition: '運動滿 30 分鐘且平均心率維持在 110 bpm 以下', rule: { type: 'zen_hr', maxAvgHr: 110 } },
  { id: 'b085', num: 85, category: '9. 幸運彩蛋 (奇蹟)', name: '濃縮高爆彈', icon: '💣', rarity: 'epic', condition: '運動時長 35 分鐘以內，卻狂燒 400 kcal 以上高密度熱量', rule: { type: 'high_density_cal', maxDur: 35, minCal: 400 } },
  { id: 'b086', num: 86, category: '9. 幸運彩蛋 (奇蹟)', name: '孤獨求敗', icon: '🦅', rarity: 'epic', condition: '在某一天成為全伺服器唯一有出門運動打卡的英雄', rule: { type: 'solo_day' } },
  { id: 'b087', num: 87, category: '9. 幸運彩蛋 (奇蹟)', name: '英雄所見略同', icon: '🤝', rarity: 'common', condition: '與另一位冒險者在同一天完成有效運動打卡', rule: { type: 'same_day_partner' } },
  { id: 'b088', num: 88, category: '9. 幸運彩蛋 (奇蹟)', name: '節慶還債團', icon: '🎉', rarity: 'epic', condition: '在特殊節日 (1/1、2/14、2/28、4/4、5/1、8/8、10/10、11/11、12/25、12/31) 出門運動', rule: { type: 'holiday_workout' } },
  { id: 'b089', num: 89, category: '9. 幸運彩蛋 (奇蹟)', name: '乘風破浪', icon: '⚡', rarity: 'epic', condition: '在 GM 開啟的「限時積分加倍活動日 (如颱風/豪雨/狂熱日)」完成運動打卡', rule: { type: 'gm_event_workout' } },
  { id: 'b090', num: 90, category: '9. 幸運彩蛋 (奇蹟)', name: '自我超越者', icon: '📈', rarity: 'rare', condition: '在完成 5 次運動後，再次刷新個人生涯單次最高熱量紀錄', rule: { type: 'personal_record_break', afterCount: 5 } },

  // --------------------------------------------------------------------------
  // 系列十：【殿堂神話】傳奇榮耀與 GM 特典系列 (#091 ~ #100)
  // --------------------------------------------------------------------------
  { id: 'b091', num: 91, category: '10. 殿堂神話 (傳奇)', name: '創世先驅', icon: '🏛️', rarity: 'rare', condition: '成為《鋼鐵英雄紀元》名冊上的正式註冊冒險者並留下一筆紀錄', rule: { type: 'workouts_count', min: 1 } },
  { id: 'b092', num: 92, category: '10. 殿堂神話 (傳奇)', name: '屠龍勇士', icon: '🗡️', rarity: 'epic', condition: '生涯累積造成超過 50,000 點總討伐傷害 (普攻+魔攻)', rule: { type: 'total_dmg', min: 50000 } },
  { id: 'b093', num: 93, category: '10. 殿堂神話 (傳奇)', name: '荒野求生專家', icon: '🩸', rarity: 'epic', condition: '生涯累積狩獵與搜刮恢復達 5,000 HP 生存能量', rule: { type: 'total_survival_regen', min: 5000 } },
  { id: 'b094', num: 94, category: '10. 殿堂神話 (傳奇)', name: '皇家工程師', icon: '🏰', rarity: 'epic', condition: '生涯累積貢獻超過 1,000 點 TRIMP 鋼鐵資源', rule: { type: 'total_trimp', min: 1000 } },
  { id: 'b095', num: 95, category: '10. 殿堂神話 (傳奇)', name: '痛苦耐受王', icon: '💎', rarity: 'legendary', condition: '生涯累積痛苦指數 (Suffer Score) 突破 1,000 分', rule: { type: 'total_suffer', min: 1000 } },
  { id: 'b096', num: 96, category: '10. 殿堂神話 (傳奇)', name: '壽星降臨', icon: '🎂', rarity: 'legendary', condition: '曾獲得 GM 頒發的「🎂 壽星慶典」頭像光環祝福或手動授勳', rule: { type: 'gm_fx', fx: 'birthday' } },
  { id: 'b097', num: 97, category: '10. 殿堂神話 (傳奇)', name: '晴天戰神', icon: '☀️', rarity: 'legendary', condition: '曾獲得 GM 頒發的「☀️ 烈日戰神」頭像光環榮譽或手動授勳', rule: { type: 'gm_fx', fx: 'sunny' } },
  { id: 'b098', num: 98, category: '10. 殿堂神話 (傳奇)', name: '雨中戰神', icon: '🌧️', rarity: 'legendary', condition: '曾獲得 GM 頒發的「🌧️ 風雨行者」頭像光環榮譽或手動授勳', rule: { type: 'gm_fx', fx: 'rainy' } },
  { id: 'b099', num: 99, category: '10. 殿堂神話 (傳奇)', name: '爆氣覺醒', icon: '🔥', rarity: 'legendary', condition: '曾獲得 GM 頒發的「🔥 爆氣覺醒」頭像光環榮譽或手動授勳', rule: { type: 'gm_fx', fx: 'aura' } },
  { id: 'b100', num: 100, category: '10. 殿堂神話 (傳奇)', name: '鋼鐵大滿貫', icon: '👑', rarity: 'mythic', condition: '生涯累計解鎖達 50 枚以上傳奇徽章的殿堂級英雄', rule: { type: 'badge_collector', min: 50 } },
  { id: 'b310', num: 310, category: '10. 殿堂神話 (傳奇)', name: '賽季新王', icon: '👑', rarity: 'rare', condition: '於已封存的歷代賽季快照中，累計奪得 1 次資料片個人總冠軍 / MVP 榜首', rule: { type: 'snapshot_champion', min: 1 } },
  { id: 'b311', num: 311, category: '10. 殿堂神話 (傳奇)', name: '雙冠連霸王', icon: '👑', rarity: 'epic', condition: '於已封存的歷代賽季快照中，累計奪得 2 次資料片個人總冠軍 / MVP 榜首', rule: { type: 'snapshot_champion', min: 2 } },
  { id: 'b312', num: 312, category: '10. 殿堂神話 (傳奇)', name: '三冠王朝霸主', icon: '👑', rarity: 'legendary', condition: '於已封存的歷代賽季快照中，累計奪得 3 次資料片個人總冠軍 / MVP 榜首', rule: { type: 'snapshot_champion', min: 3 } },
  { id: 'b313', num: 313, category: '10. 殿堂神話 (傳奇)', name: '五冠不朽神帝', icon: '👑', rarity: 'mythic', condition: '於已封存的歷代賽季快照中，累計奪得 5 次資料片個人總冠軍 / MVP 榜首', rule: { type: 'snapshot_champion', min: 5 } },
  { id: 'b314', num: 314, category: '10. 殿堂神話 (傳奇)', name: '初登頒獎台', icon: '🏆', rarity: 'common', condition: '於已封存的歷代賽季快照中，個人排名站上全服前三名 (Top 3) 達 1 次', rule: { type: 'snapshot_podium', min: 1 } },
  { id: 'b315', num: 315, category: '10. 殿堂神話 (傳奇)', name: '頒獎台常客', icon: '🏆', rarity: 'rare', condition: '於已封存的歷代賽季快照中，個人排名站上全服前三名 (Top 3) 達 3 次', rule: { type: 'snapshot_podium', min: 3 } },
  { id: 'b316', num: 316, category: '10. 殿堂神話 (傳奇)', name: '五度奪牌名將', icon: '🏆', rarity: 'epic', condition: '於已封存的歷代賽季快照中，個人排名站上全服前三名 (Top 3) 達 5 次', rule: { type: 'snapshot_podium', min: 5 } },
  { id: 'b317', num: 317, category: '10. 殿堂神話 (傳奇)', name: '十度無雙戰神', icon: '🏆', rarity: 'legendary', condition: '於已封存的歷代賽季快照中，個人排名站上全服前三名 (Top 3) 達 10 次', rule: { type: 'snapshot_podium', min: 10 } },
  { id: 'b318', num: 318, category: '10. 殿堂神話 (傳奇)', name: '冠軍小隊功臣', icon: '🛡️', rarity: 'rare', condition: '於已封存的歷代賽季快照中，所屬公會奪得總冠軍(或全服合作通關)且本人有出勤貢獻達 1 季', rule: { type: 'snapshot_guild_win', min: 1 } },
  { id: 'b319', num: 319, category: '10. 殿堂神話 (傳奇)', name: '三冠王朝核心', icon: '🛡️', rarity: 'epic', condition: '於已封存的歷代賽季快照中，所屬公會奪得總冠軍(或全服合作通關)且本人有出勤貢獻達 3 季', rule: { type: 'snapshot_guild_win', min: 3 } },
  { id: 'b320', num: 320, category: '10. 殿堂神話 (傳奇)', name: '五冠榮耀元勳', icon: '🛡️', rarity: 'mythic', condition: '於已封存的歷代賽季快照中，所屬公會奪得總冠軍(或全服合作通關)且本人有出勤貢獻達 5 季', rule: { type: 'snapshot_guild_win', min: 5 } },
  { id: 'b321', num: 321, category: '10. 殿堂神話 (傳奇)', name: '賽季見證者', icon: '📜', rarity: 'common', condition: '於已封存的歷代賽季快照中，累計有實際出勤參戰紀錄達 1 個賽季', rule: { type: 'snapshot_veteran', min: 1 } },
  { id: 'b322', num: 322, category: '10. 殿堂神話 (傳奇)', name: '三朝鋼鐵元老', icon: '📜', rarity: 'epic', condition: '於已封存的歷代賽季快照中，累計有實際出勤參戰紀錄達 3 個賽季', rule: { type: 'snapshot_veteran', min: 3 } },
  { id: 'b323', num: 323, category: '10. 殿堂神話 (傳奇)', name: '五朝不朽活化石', icon: '📜', rarity: 'mythic', condition: '於已封存的歷代賽季快照中，累計有實際出勤參戰紀錄達 5 個賽季', rule: { type: 'snapshot_veteran', min: 5 } }
];

BADGE_CATALOG.forEach(b => {
  b.cat = b.cat || b.category;
  b.desc = b.desc || b.condition;
});

window.BADGE_CATALOG = BADGE_CATALOG;

/**
 * 擴充接口：未來若要從 100 個擴充至 500 個徽章，只需呼叫 registerCustomBadges([...]) 即可動態掛載！
 */
window.registerCustomBadges = function(newBadgesArray) {
  if (!Array.isArray(newBadgesArray)) return;
  const existingIds = new Set(BADGE_CATALOG.map(b => b.id));
  newBadgesArray.forEach(nb => {
    if (nb && nb.id && !existingIds.has(nb.id)) {
      const cat = nb.cat || nb.category || '擴充徽章系列';
      const desc = nb.desc || nb.condition || '';
      BADGE_CATALOG.push({
        num: nb.num || (BADGE_CATALOG.length + 1),
        category: cat,
        cat: cat,
        condition: desc,
        desc: desc,
        rarity: nb.rarity || 'rare',
        ...nb
      });
      existingIds.add(nb.id);
    }
  });
};

/**
 * 擴充接口 (外掛式徽章模組)：例如 mobileBadges.js 的「📱 手機健康徽章 #101~#300」。
 * - 外掛徽章「不會」被推入 BADGE_CATALOG：經典 100 枚的結果、編號與「大滿貫收藏家」計數完全不受影響。
 * - plugin 介面：
 *     id: 'mobile'
 *     getCatalog(state) → 目前「生效中」的額外徽章陣列 (未啟用時回傳 [])
 *     getAllBadges()    → 全部額外徽章 (不論是否啟用，供 findBadgeById / GM 圖鑑查詢)
 *     evaluate(ctx)     → 於經典徽章計算完成後呼叫，直接把解鎖紀錄寫入 ctx.resultByHero[hero][badgeId]
 */
const BADGE_PLUGINS = [];
window.registerBadgePlugin = function(plugin) {
  if (!plugin || !plugin.id) return;
  const idx = BADGE_PLUGINS.findIndex(p => p.id === plugin.id);
  if (idx >= 0) BADGE_PLUGINS.splice(idx, 1, plugin); else BADGE_PLUGINS.push(plugin);
  __activeCatalogCache = { key: '', list: BADGE_CATALOG };
};

let __activeCatalogCache = { key: '', list: BADGE_CATALOG };
/**
 * 取得目前生效的徽章圖鑑：經典 BADGE_CATALOG + 已啟用外掛的徽章 (如 GM 開啟手機同步時的 200 枚健康徽章)
 */
window.getActiveBadgeCatalog = function(state) {
  const st = state || window.gameState || {};
  const extras = [];
  BADGE_PLUGINS.forEach(p => {
    try {
      const list = typeof p.getCatalog === 'function' ? p.getCatalog(st) : [];
      if (Array.isArray(list) && list.length) extras.push(...list);
    } catch (e) { console.warn('[Badges] plugin getCatalog 失敗', p.id, e); }
  });
  if (extras.length === 0) return BADGE_CATALOG;
  const key = `${BADGE_CATALOG.length}|${extras.length}|${extras[0].id}|${extras[extras.length - 1].id}`;
  if (__activeCatalogCache.key !== key) __activeCatalogCache = { key, list: BADGE_CATALOG.concat(extras) };
  return __activeCatalogCache.list;
};

/**
 * 徽章總數：{ total, classicTotal, mobileTotal } (mobileTotal 為目前生效中的外掛徽章數，未啟用時為 0)
 */
window.getBadgeTotals = function(state) {
  const classicTotal = BADGE_CATALOG.length;
  const total = window.getActiveBadgeCatalog(state).length;
  return { total, classicTotal, mobileTotal: total - classicTotal };
};

/**
 * 依 ID 查詢徽章 (經典 + 所有外掛徽章，不論是否啟用；供 GM 手動授勳 / 顯示歷史紀錄)
 */
window.findBadgeById = function(badgeId) {
  const hit = BADGE_CATALOG.find(b => b.id === badgeId);
  if (hit) return hit;
  for (const p of BADGE_PLUGINS) {
    const list = typeof p.getAllBadges === 'function' ? (p.getAllBadges() || []) : [];
    const found = list.find(b => b.id === badgeId);
    if (found) return found;
  }
  return null;
};

// ============================================================================
// 4. SINGLE-PASS O(N) CHRONOLOGICAL BADGE EVALUATION ENGINE
// ============================================================================
const SPECIAL_HOLIDAY_MMDD = new Set([
  '01/01', '02/14', '02/28', '04/04', '05/01', '08/08', '10/10', '11/11', '12/25', '12/31'
]);

function getISOWeekKey(d) {
  if (!d || isNaN(d.getTime())) return '';
  const temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * 對全服所有英雄執行一次性生涯徽章運算，記錄每個徽章「首次達成的精確時間與運動名稱」
 */
function evaluateAllHeroesBadges(state) {
  const targetState = state || window.gameState || {};
  const heroes = targetState.heroes || [];
  const allActivities = targetState.activities || [];
  const gmOps = targetState.gmOps || {};
  const minDur = targetState.summary?.minDurationMinutes || 30;
  const badgeStartYMD = normalizeDateYMD(gmOps.badgeStartDate || '');

  // 只採計未作廢、達最低有效時長、且符合 GM 設定之「徽章計算開始時間 (badgeStartDate)」(含) 之後的運動
  const validCareerActs = allActivities.filter(a => {
    if (a.isExcluded || (Number(a.duration) || 0) < minDur) return false;
    // 疑似重複上傳 (未經 GM 勾選納入) 不採計徽章
    if (a.isSuspectedDuplicate && !a.duplicateIncluded) return false;
    if (badgeStartYMD) {
      const actYMD = normalizeDateYMD(a.date || a.time);
      if (!actYMD || actYMD < badgeStartYMD) return false;
    }
    return true;
  });

  // 統計每一天有哪些英雄打卡 (供「孤獨求敗」與「英雄所見略同」判定)
  const dateHeroSetMap = {};
  validCareerActs.forEach(a => {
    const ymd = normalizeDateYMD(a.date || a.time);
    if (!ymd) return;
    if (!dateHeroSetMap[ymd]) dateHeroSetMap[ymd] = new Set();
    dateHeroSetMap[ymd].add(a.hero);
  });

  const resultByHero = {};
  const classicBadgeIds = new Set(BADGE_CATALOG.map(b => b.id));

  heroes.forEach(h => {
    const heroName = h.name;
    // 由舊到新排序該英雄的所有生涯有效運動
    const heroActsAsc = validCareerActs
      .filter(a => a.hero === heroName)
      .slice()
      .sort((a, b) => {
        const da = (window.parseActivityDate ? window.parseActivityDate(a.date || a.time) : new Date(a.date || a.time))?.getTime() || 0;
        const db = (window.parseActivityDate ? window.parseActivityDate(b.date || b.time) : new Date(b.date || b.time))?.getTime() || 0;
        return da - db;
      });

    const unlockedMap = {}; // badgeId -> { unlockedAt, actName, actId }

    // 1. 先載入 GM 手動頒發或永久保存的徽章紀錄
    const manualHeroBadges = gmOps.manualBadges?.[heroName] || {};
    Object.keys(manualHeroBadges).forEach(bId => {
      if (manualHeroBadges[bId]) {
        const reasonStr = manualHeroBadges[bId].actTitle || manualHeroBadges[bId].reason || 'GM 榮譽授勳';
        unlockedMap[bId] = {
          unlockedAt: manualHeroBadges[bId].unlockedAt || getTodayYMD(),
          actName: reasonStr,
          actTitle: reasonStr
        };
      }
    });

    // 2. 檢查 GM 頭像特效歷史紀錄 (壽星/大太陽/淋雨/爆氣)
    const fxInfo = getHeroActiveFx(heroName, targetState);
    const fxHistorySet = new Set(fxInfo.history || []);
    if (fxInfo.fx && fxInfo.fx !== 'none') fxHistorySet.add(fxInfo.fx);

    BADGE_CATALOG.forEach(badge => {
      if (badge.rule?.type === 'gm_fx' && fxHistorySet.has(badge.rule.fx) && !unlockedMap[badge.id]) {
        const fxLabel = `獲得 GM【${AVATAR_FX_PRESETS[badge.rule.fx]?.label || badge.name}】祝福`;
        unlockedMap[badge.id] = {
          unlockedAt: normalizeDateYMD(gmOps.heroFx?.[heroName]?.updatedAt) || getTodayYMD(),
          actName: fxLabel,
          actTitle: fxLabel
        };
      }
    });

    // 3. 逐步由舊到新累積生涯狀態，精準捕捉「第一次達成」的日期！
    let cumWorkouts = 0;
    let cumCal = 0;
    let cumDur = 0;
    let cumElev = 0;
    let cumZone2 = 0;
    let cumDmg = 0;
    let cumSurvivalRegen = 0;
    let cumTrimp = 0;
    let cumSuffer = 0;
    let bestSingleCal = 0;

    const weekdayCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const seenWeekdays = new Set();
    const dayActCountMap = {};
    const weekActCountMap = {};
    const sportCountMap = {};
    const uniqueSportsSet = new Set();

    let currentStreak = 0;
    let lastUniqueYMD = '';

    heroActsAsc.forEach(act => {
      const actDateObj = window.parseActivityDate ? window.parseActivityDate(act.date || act.time) : new Date(act.date || act.time);
      const ymd = normalizeDateYMD(act.date || act.time) || '歷史紀錄';
      const actLabel = act.title || act.name || act.type || '自主鍛鍊';
      const rawCal = Number(act.rawCalories !== undefined ? act.rawCalories : act.calories) || 0;
      const rawTrimp = Number(act.rawTrimp !== undefined ? act.rawTrimp : act.trimp) || 0;
      const dur = Number(act.duration) || 0;
      const avgHr = Number(act.avgHr) || 0;
      const maxHr = Number(act.maxHr) || 0;
      const gap = Number(act.gapVal !== undefined ? act.gapVal : act.gap) || Math.max(0, maxHr - avgHr);
      const elev = Number(act.elevation) || 0;
      const dist = Number(act.distance) || 0;
      const suffer = Number(act.rawSuffer !== undefined ? act.rawSuffer : act.suffer) || 0;
      // 徽章一律採計原始數值 (不含 GM 限時活動加成)，與其他徽章判定標準一致
      const bossRules = targetState.boss?.rules || {};
      const dmg = Math.round(rawCal * (Number(bossRules.physMultiplier) || 1) + rawTrimp * (Number(bossRules.magicMultiplier) || 15));
      const sportLower = String(act.type || 'workout').toLowerCase().trim();

      cumWorkouts += 1;
      cumCal += rawCal;
      cumDur += dur;
      cumElev += elev;
      if (act.isZone2) cumZone2 += 1;
      cumDmg += dmg;
      cumSurvivalRegen += (rawCal + rawTrimp * 1.5);
      cumTrimp += rawTrimp;
      cumSuffer += suffer;

      // 檢查是否刷新個人最高熱量紀錄 (至少第 N 次運動後)
      const isNewCalPR = (cumWorkouts > 1 && rawCal > bestSingleCal);
      if (rawCal > bestSingleCal) bestSingleCal = rawCal;

      // 運動類型統計
      sportCountMap[sportLower] = (sportCountMap[sportLower] || 0) + 1;
      uniqueSportsSet.add(sportLower);

      // 單日次數與連續天數統計
      dayActCountMap[ymd] = (dayActCountMap[ymd] || 0) + 1;
      if (ymd !== lastUniqueYMD) {
        if (lastUniqueYMD) {
          const prevD = new Date(lastUniqueYMD);
          const currD = new Date(ymd);
          const diffDays = Math.round((currD - prevD) / 86400000);
          if (diffDays === 1) {
            currentStreak += 1;
          } else {
            currentStreak = 1;
          }
        } else {
          currentStreak = 1;
        }
        lastUniqueYMD = ymd;
      }

      let hour = -1;
      let weekday = -1;
      let weekKey = '';
      let isWeekendBoth = false;
      if (actDateObj && !isNaN(actDateObj.getTime())) {
        hour = actDateObj.getHours();
        weekday = actDateObj.getDay(); // 0=Sun .. 6=Sat
        weekdayCounts[weekday] = (weekdayCounts[weekday] || 0) + 1;
        seenWeekdays.add(weekday);
        weekKey = getISOWeekKey(actDateObj);
        if (weekKey) weekActCountMap[weekKey] = (weekActCountMap[weekKey] || 0) + 1;

        // 檢查週末雙響砲 (若今天是週日，看昨天週六有無運動；若今天是週六，看明天週日會在週日時觸發)
        if (weekday === 0) {
          const satDate = new Date(actDateObj.getTime() - 86400000);
          const satYMD = `${satDate.getFullYear()}/${String(satDate.getMonth() + 1).padStart(2, '0')}/${String(satDate.getDate()).padStart(2, '0')}`;
          if (dayActCountMap[satYMD] > 0) isWeekendBoth = true;
        }
      }

      const mmdd = ymd.length >= 10 ? ymd.slice(5, 10) : '';
      const heroesOnDay = dateHeroSetMap[ymd] ? dateHeroSetMap[ymd].size : 1;
      const evBonus = getActivityEventBonus(ymd, gmOps);

      // 對尚未解鎖的徽章進行規則比對
      BADGE_CATALOG.forEach(badge => {
        if (unlockedMap[badge.id]) return; // 已解鎖過，保留最早解鎖紀錄
        const r = badge.rule;
        if (!r) return;

        let matched = false;
        switch (r.type) {
          case 'workouts_count':
            matched = cumWorkouts >= r.min;
            break;
          case 'single_cal':
            matched = rawCal >= r.min;
            break;
          case 'total_cal':
            matched = cumCal >= r.min;
            break;
          case 'single_dur':
            matched = dur >= r.min;
            break;
          case 'total_dur':
            matched = cumDur >= r.min;
            break;
          case 'single_avghr':
            matched = avgHr >= r.min;
            break;
          case 'single_maxhr':
            matched = maxHr >= r.min;
            break;
          case 'single_gap':
            matched = gap >= r.min;
            break;
          case 'single_trimp':
            matched = rawTrimp >= r.min;
            break;
          case 'zone2_count':
            matched = cumZone2 >= r.min;
            break;
          case 'single_zone2_dur':
            matched = Boolean(act.isZone2 && dur >= r.min);
            break;
          case 'hour_range':
            if (hour >= 0) {
              if (r.startHour <= r.endHour) {
                matched = (hour >= r.startHour && hour <= r.endHour);
              } else {
                // 跨午夜 (如 23:00 ~ 04:59)
                matched = (hour >= r.startHour || hour <= r.endHour);
              }
            }
            break;
          case 'weekday_count':
            matched = (weekdayCounts[r.day] || 0) >= r.min;
            break;
          case 'all_weekdays':
            matched = seenWeekdays.size >= 7;
            break;
          case 'streak_days':
            matched = currentStreak >= r.min;
            break;
          case 'same_day_count':
            matched = (dayActCountMap[ymd] || 0) >= r.min;
            break;
          case 'weekend_both':
            matched = isWeekendBoth;
            break;
          case 'week_count':
            matched = Boolean(weekKey && (weekActCountMap[weekKey] || 0) >= r.min);
            break;
          case 'sport_count': {
            const targetSports = Array.isArray(r.sports) ? r.sports : [r.sport];
            const sumSport = targetSports.reduce((acc, sp) => acc + (sportCountMap[sp] || 0), 0);
            matched = sumSport >= r.min;
            break;
          }
          case 'single_sport_dist': {
            const targetSports = Array.isArray(r.sports) ? r.sports : [r.sport];
            matched = targetSports.includes(sportLower) && dist >= r.min;
            break;
          }
          case 'total_elev':
            matched = cumElev >= r.min;
            break;
          case 'unique_sports':
            matched = uniqueSportsSet.size >= r.min;
            break;
          case 'just_pass_dur':
            matched = (dur >= r.min && dur <= r.max);
            break;
          case 'exact_round':
            matched = (Math.abs(dur - 60) < 0.01) || (rawCal >= 100 && Math.round(rawCal) % 100 === 0);
            break;
          case 'lucky_77':
            matched = String(Math.round(rawCal)).includes('77') || String(Math.round(dur)).includes('77') || String(Math.round(avgHr)).includes('77') || String(Math.round(maxHr)).includes('77');
            break;
          case 'zen_hr':
            matched = (avgHr > 0 && avgHr <= r.maxAvgHr);
            break;
          case 'high_density_cal':
            matched = (dur <= r.maxDur && rawCal >= r.minCal);
            break;
          case 'solo_day':
            matched = (heroesOnDay === 1);
            break;
          case 'same_day_partner':
            matched = (heroesOnDay >= 2);
            break;
          case 'holiday_workout':
            matched = SPECIAL_HOLIDAY_MMDD.has(mmdd);
            break;
          case 'gm_event_workout':
            matched = (evBonus.bonusPct > 0);
            break;
          case 'personal_record_break':
            matched = (cumWorkouts >= (r.afterCount || 5) && isNewCalPR);
            break;
          case 'total_dmg':
            matched = cumDmg >= r.min;
            break;
          case 'total_survival_regen':
            matched = cumSurvivalRegen >= r.min;
            break;
          case 'total_trimp':
            matched = cumTrimp >= r.min;
            break;
          case 'total_suffer':
            matched = cumSuffer >= r.min;
            break;
          default:
            if (typeof r.customCheck === 'function') {
              matched = Boolean(r.customCheck(act, { cumWorkouts, cumCal, cumDur }));
            }
            break;
        }

        if (matched) {
          unlockedMap[badge.id] = {
            unlockedAt: act.date || act.time || ymd,
            actName: actLabel,
            actTitle: actLabel,
            actId: act.id
          };
        }
      });
    });

    resultByHero[heroName] = unlockedMap;
  });

  // 3.5 自動掃描已封存之歷史賽季快照 (snapshots)，頒發歷代賽季榮耀系列徽章 (b310~b323)
  evaluateSnapshotHonorBadges(targetState, heroes, resultByHero);

  // 4. 檢查「大滿貫收藏家」類型徽章 (如解鎖滿 50 枚徽章)
  //    只計算經典圖鑑 (BADGE_CATALOG) 內的徽章，外掛徽章 (如 GM 手動授勳的手機健康徽章) 不影響此計數
  heroes.forEach(h => {
    const heroName = h.name;
    const unlockedMap = resultByHero[heroName] || {};
    const classicUnlocked = Object.keys(unlockedMap).filter(bId => classicBadgeIds.has(bId));
    const currentUnlockedCount = classicUnlocked.length;
    BADGE_CATALOG.forEach(badge => {
      if (!unlockedMap[badge.id] && badge.rule?.type === 'badge_collector') {
        if (currentUnlockedCount >= (badge.rule.min || 50)) {
          const colLabel = `累積解鎖達 ${currentUnlockedCount} 枚徽章`;
          // 以「第 N 枚徽章」的解鎖日期作為達成日期 (固定不變，不會每天跳成今天)
          const sortedDates = classicUnlocked.map(bId => normalizeDateYMD(unlockedMap[bId].unlockedAt)).filter(Boolean).sort();
          const nthDate = sortedDates[(badge.rule.min || 50) - 1] || sortedDates[sortedDates.length - 1] || getTodayYMD();
          unlockedMap[badge.id] = {
            unlockedAt: nthDate,
            actName: colLabel,
            actTitle: colLabel
          };
        }
      }
    });
  });

  // 5. 外掛徽章模組 (如 📱 手機健康徽章)：在經典徽章全部算完後才執行，不會影響經典徽章結果
  BADGE_PLUGINS.forEach(p => {
    if (typeof p.evaluate !== 'function') return;
    try {
      p.evaluate({ state: targetState, heroes, resultByHero, validCareerActs, minDur, badgeStartYMD });
    } catch (e) {
      console.warn('[Badges] plugin evaluate 失敗', p.id, e);
    }
  });

  if (targetState && typeof targetState === 'object') {
    targetState.heroBadges = resultByHero;
  }
  return resultByHero;
}

/**
 * 掃描已封存且顯示中的歷史賽季快照 (gameState.snapshots)，自動計算：
 *  - snapshot_champion: 個人總冠軍 / 榜首 / MVP 次數
 *  - snapshot_podium:   個人全服前三名 (Top 3) 次數
 *  - snapshot_guild_win: 所屬公會奪冠(或全服合作通關)且本人有出勤貢獻之賽季數
 *  - snapshot_veteran:  有實際出勤參戰紀錄之賽季數
 */
function evaluateSnapshotHonorBadges(targetState, heroes, resultByHero) {
  const rawSnaps = Array.isArray(targetState?.snapshots) ? targetState.snapshots : [];
  // 由舊到新排序，讓達成日期與賽季名稱精準對應第 N 次達成的快照
  const visibleSnaps = rawSnaps
    .filter(s => s && s.isVisible !== false)
    .slice()
    .sort((a, b) => {
      const da = normalizeDateYMD(a.archivedAt || a.seasonEnd || a.createdAt) || '0000/00/00';
      const db = normalizeDateYMD(b.archivedAt || b.seasonEnd || b.createdAt) || '0000/00/00';
      return da.localeCompare(db);
    });
  if (!visibleSnaps.length) return;

  const heroGuildFallback = {};
  (heroes || []).forEach(h => { if (h && h.name) heroGuildFallback[h.name] = h.guild || ''; });

  const statsByHero = {};
  (heroes || []).forEach(h => {
    statsByHero[h.name] = {
      champions: [], // [{ date, label }]
      podiums: [],
      guildWins: [],
      veterans: []
    };
  });

  const hasPositiveContribution = (row) => {
    if (!row || typeof row !== 'object') return false;
    return (Number(row.workouts) || 0) > 0 ||
           (Number(row.dmg) || 0) > 0 ||
           (Number(row.total) || 0) > 0 ||
           (Number(row.power) || 0) > 0 ||
           (Number(row.aerobicScore) || 0) > 0 ||
           (Number(row.anaerobicScore) || 0) > 0 ||
           (Number(row.regen) || 0) > 0 ||
           (Number(row.km) || 0) > 0 ||
           (Number(row.totalDamage) || 0) > 0 ||
           (Number(row.fullDays) || 0) > 0 ||
           (Number(row.days) || 0) > 0 ||
           (Number(row.totalXp) || 0) > 0 ||
           (Number(row.count) || 0) > 0 ||
           (Number(row.lines) || 0) > 0;
  };

  visibleSnaps.forEach(snap => {
    const snapDate = normalizeDateYMD(snap.archivedAt || snap.seasonEnd || snap.createdAt) || getTodayYMD();
    const snapTitle = snap.seasonTitle || snap.title || '歷史賽季';
    const v = snap.view || snap || {};
    const mode = v.mode || snap.mode || 'classic';

    const championsMap = new Map(); // heroName -> reason
    const podiumMap = new Map();    // heroName -> reason
    const veteranSet = new Set();   // heroName
    const winningGuilds = new Set();
    let isCoopVictory = false;

    const addChamp = (name, title) => {
      if (name && statsByHero[name] && !championsMap.has(name)) {
        championsMap.set(name, `【${snapTitle}】${title}`);
      }
    };
    const addPodium = (name, rank) => {
      if (name && statsByHero[name] && !podiumMap.has(name)) {
        podiumMap.set(name, `【${snapTitle}】全服第 ${rank} 名`);
      }
    };
    const addTop3FromList = (list) => {
      if (!Array.isArray(list)) return;
      const activeList = list.filter(hasPositiveContribution);
      activeList.forEach((row, idx) => {
        if (row?.name && statsByHero[row.name]) {
          veteranSet.add(row.name);
          if (idx === 0) addChamp(row.name, '個人榜首總冠軍');
          if (idx < 3) addPodium(row.name, idx + 1);
        }
      });
    };

    if (mode === 'classic') {
      const aeroChamp = v.champions?.aerobic || snap.aerobicChampion;
      const anaChamp = v.champions?.anaerobic || snap.anaerobicChampion;
      if (aeroChamp?.name && hasPositiveContribution(aeroChamp)) {
        addChamp(aeroChamp.name, '有氧總冠軍');
        addPodium(aeroChamp.name, 1);
        veteranSet.add(aeroChamp.name);
      }
      if (anaChamp?.name && hasPositiveContribution(anaChamp)) {
        addChamp(anaChamp.name, '無氧總冠軍');
        addPodium(anaChamp.name, 1);
        veteranSet.add(anaChamp.name);
      }
      const board = Array.isArray(v.heroBoard) ? v.heroBoard : (Array.isArray(snap.heroBoard) ? snap.heroBoard : []);
      const aeroSorted = board.filter(hasPositiveContribution).slice().sort((a, b) => (Number(b.aerobicScore) || 0) - (Number(a.aerobicScore) || 0));
      const anaSorted = board.filter(hasPositiveContribution).slice().sort((a, b) => (Number(b.anaerobicScore) || 0) - (Number(a.anaerobicScore) || 0));
      addTop3FromList(aeroSorted);
      addTop3FromList(anaSorted);
      const gBoard = Array.isArray(v.guildBoard) ? v.guildBoard : (Array.isArray(snap.guildBoard) ? snap.guildBoard : []);
      if (gBoard[0]?.name) winningGuilds.add(gBoard[0].name);
    } else if (mode === 'rpg_talent' || mode === 'rpg') {
      const mvp = v.mvp || snap.mvp;
      if (mvp?.name && hasPositiveContribution(mvp)) addChamp(mvp.name, '全服總 MVP');
      const ranking = Array.isArray(v.heroRanking) ? v.heroRanking : (Array.isArray(snap.rpgHeroRanking) ? snap.rpgHeroRanking : []);
      addTop3FromList(ranking);
      const gRank = Array.isArray(v.guildRanking) ? v.guildRanking : (Array.isArray(snap.rpgGuildRanking) ? snap.rpgGuildRanking : []);
      if (gRank[0]?.name) winningGuilds.add(gRank[0].name);
    } else if (mode === 'world_boss' || mode === 'boss') {
      const mvp = v.mvp || snap.mvp;
      if (mvp?.name && hasPositiveContribution(mvp)) addChamp(mvp.name, '屠龍首席 MVP');
      const board = Array.isArray(v.dmgBoard) ? v.dmgBoard : (Array.isArray(snap.bossLeaderboard) ? snap.bossLeaderboard : []);
      addTop3FromList(board);
      const gBoard = Array.isArray(v.guildBoard) ? v.guildBoard : [];
      if (gBoard[0]?.name) winningGuilds.add(gBoard[0].name);
      if (v.boss && Number(v.boss.currHp) <= 0) isCoopVictory = true;
    } else if (mode === 'faction_war') {
      const f1 = Array.isArray(v.f1) ? v.f1 : [];
      const f2 = Array.isArray(v.f2) ? v.f2 : [];
      const combined = [...f1, ...f2].filter(hasPositiveContribution).sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
      if (f1[0]?.name && hasPositiveContribution(f1[0])) addChamp(f1[0].name, '陣營首席戰神');
      if (f2[0]?.name && hasPositiveContribution(f2[0])) addChamp(f2[0].name, '陣營首席戰神');
      addTop3FromList(combined);
      const sum1 = Number(v.sum1) || 0;
      const sum2 = Number(v.sum2) || 0;
      if (sum1 > sum2 && v.split?.[1]) v.split[1].forEach(g => winningGuilds.add(g));
      else if (sum2 > sum1 && v.split?.[2]) v.split[2].forEach(g => winningGuilds.add(g));
    } else if (mode === 'survival') {
      const list = Array.isArray(v.list) ? v.list : [];
      addTop3FromList(list);
      const gBoard = Array.isArray(v.guildBoard) ? v.guildBoard : [];
      if (gBoard[0]?.name) winningGuilds.add(gBoard[0].name);
    } else if (mode === 'base_builder') {
      const contrib = Array.isArray(v.contrib) ? v.contrib : [];
      addTop3FromList(contrib);
      if (v.allDone) isCoopVictory = true;
      const gBoard = Array.isArray(v.guildBoard) ? v.guildBoard : [];
      if (gBoard[0]?.name) winningGuilds.add(gBoard[0].name);
    } else if (mode === 'bingo') {
      const board = Array.isArray(v.board) ? v.board : [];
      addTop3FromList(board);
      const gBoard = Array.isArray(v.guildBoard) ? v.guildBoard : [];
      if (gBoard[0]?.name) winningGuilds.add(gBoard[0].name);
    } else {
      // 手機同步資料片 (expedition / dream / flame / monastery)
      const d = v.data || v || {};
      const hList = Array.isArray(d.heroes) ? d.heroes : [];
      addTop3FromList(hList);
      const gList = Array.isArray(d.guilds) ? d.guilds : [];
      if (gList[0]?.name) winningGuilds.add(gList[0].name);
      if (d.victory) isCoopVictory = true;
    }

    // 補充掃描快照內的 activities，確保有實際出勤的英雄都計入 veteranSet
    if (Array.isArray(snap.activities)) {
      snap.activities.forEach(a => {
        if (a && a.hero && !a.isExcluded && statsByHero[a.hero]) veteranSet.add(a.hero);
      });
    }

    Object.keys(statsByHero).forEach(heroName => {
      const st = statsByHero[heroName];
      if (championsMap.has(heroName)) st.champions.push({ date: snapDate, label: championsMap.get(heroName) });
      if (podiumMap.has(heroName)) st.podiums.push({ date: snapDate, label: podiumMap.get(heroName) });
      if (veteranSet.has(heroName)) {
        st.veterans.push({ date: snapDate, label: `參戰【${snapTitle}】` });
        const heroGuild = snap.heroInfo?.[heroName]?.guild || heroGuildFallback[heroName] || '';
        if (isCoopVictory || (heroGuild && winningGuilds.has(heroGuild))) {
          st.guildWins.push({ date: snapDate, label: `【${snapTitle}】冠軍公會/全服通關功臣` });
        }
      }
    });
  });

  // 比對 b310~b323 規則並寫入 resultByHero
  const snapshotBadges = BADGE_CATALOG.filter(b => b.rule && String(b.rule.type || '').startsWith('snapshot_'));
  Object.keys(statsByHero).forEach(heroName => {
    const unlockedMap = resultByHero[heroName];
    if (!unlockedMap) return;
    const st = statsByHero[heroName];
    snapshotBadges.forEach(badge => {
      if (unlockedMap[badge.id]) return;
      const r = badge.rule;
      let arr = [];
      if (r.type === 'snapshot_champion') arr = st.champions;
      else if (r.type === 'snapshot_podium') arr = st.podiums;
      else if (r.type === 'snapshot_guild_win') arr = st.guildWins;
      else if (r.type === 'snapshot_veteran') arr = st.veterans;
      if (arr.length >= (r.min || 1)) {
        const hit = arr[(r.min || 1) - 1] || arr[arr.length - 1];
        unlockedMap[badge.id] = {
          unlockedAt: hit.date || getTodayYMD(),
          actName: hit.label,
          actTitle: hit.label
        };
      }
    });
  });
}

// ============================================================================
// 5. MULTI-TIER PROGRESSIVE BADGE SLOT ENGINE (132 格進階升框系統)
//    - 將「同項目、不同難度門檻」的徽章合併為單一 UI 徽章格 (Slot)
//    - 依達成的最高階級自動換上【銅牌 / 銀牌 / 金牌 / 紫金 / 彩級】外框
//    - 英雄卡與資料庫仍保留完整 331 階獨立達成紀錄與計數
// ============================================================================
const SLOT_DEFINITIONS = [
  // 經典系列 1~10 (22 個多階合併格 + 35 個獨立特殊格 = 57 格)
  { id: 'slot_workouts', name: '鋼鐵出勤王', icon: '⚔️', badgeIds: ['b001','b002','b003','b004','b005','b006','b007','b008','b009','b010'] },
  { id: 'slot_single_cal', name: '暴食粉碎者', icon: '🍲', badgeIds: ['b011','b012','b013','b014','b015'] },
  { id: 'slot_total_cal', name: '人間熔爐', icon: '🔥', badgeIds: ['b016','b017','b018','b019','b020'] },
  { id: 'slot_single_dur', name: '耐力長征者', icon: '⏳', badgeIds: ['b021','b022','b023','b024','b025'] },
  { id: 'slot_total_dur', name: '時間領主', icon: '🧭', badgeIds: ['b026','b027','b028','b029','b030'] },
  { id: 'slot_single_avghr', name: '引擎超轉', icon: '🚀', badgeIds: ['b031','b032','b033'] },
  { id: 'slot_single_maxhr', name: '極限心跳', icon: '💥', badgeIds: ['b034','b035'] },
  { id: 'slot_single_gap', name: '無氧落差王', icon: '👹', badgeIds: ['b036','b037','b038','b039'] },
  { id: 'slot_zone2_count', name: '有氧燃脂宗師', icon: '💚', badgeIds: ['b041','b042','b043','b044','b045','b046','b047','b048'] },
  { id: 'slot_single_zone2_dur', name: '長效有氧巡航', icon: '🛸', badgeIds: ['b049','b050'] },
  { id: 'slot_streak_days', name: '不滅連斬', icon: '🔥', badgeIds: ['b061','b062','b063','b064','b065','b066'] },
  { id: 'slot_same_day_count', name: '單日多連星', icon: '⚡', badgeIds: ['b067','b068'] },
  { id: 'slot_sport_run', name: '馬拉松跑魂', icon: '🏃‍♂️', badgeIds: ['b071','b072'] },
  { id: 'slot_sport_weight', name: '重訓巨石', icon: '🏋️', badgeIds: ['b073','b074'] },
  { id: 'slot_total_elev', name: '巔峰攀登者', icon: '🏔️', badgeIds: ['b077','b078'] },
  { id: 'slot_unique_sports', name: '多棲武器大師', icon: '🌈', badgeIds: ['b079','b080'] },
  { id: 'slot_run_dist', name: '破風長跑', icon: '🏃', badgeIds: ['b301','b302','b303','b304','b305'] },
  { id: 'slot_ride_dist', name: '百里鐵騎', icon: '🚴', badgeIds: ['b306','b307','b308','b309'] },
  { id: 'slot_season_champion', name: '歷代賽季霸主', icon: '👑', badgeIds: ['b310','b311','b312','b313'] },
  { id: 'slot_season_podium', name: '榮耀領獎台', icon: '🏆', badgeIds: ['b314','b315','b316','b317'] },
  { id: 'slot_season_guild_win', name: '冠軍公會功臣', icon: '🛡️', badgeIds: ['b318','b319','b320'] },
  { id: 'slot_season_veteran', name: '百戰元老', icon: '📜', badgeIds: ['b321','b322','b323'] },

  // 手機健康系列 11~26 (50 個多階合併格 + 25 個獨立彩蛋格 = 75 格)
  { id: 'slot_mh_single_steps', name: '單日步數突破', icon: '👣', badgeIds: ['b101','b102','b103','b104','b105','b106','b107','b108','b109','b110','b111','b112'] },
  { id: 'slot_mh_total_steps', name: '萬里長征總步數', icon: '🗺️', badgeIds: ['b113','b114','b115','b116','b117','b118','b119','b120','b121','b122'] },
  { id: 'slot_mh_10k_days', name: '萬步達標天數', icon: '🎯', badgeIds: ['b123','b124','b125','b126'] },
  { id: 'slot_mh_streak_8k', name: '八千步連擊', icon: '🔥', badgeIds: ['b127','b128','b129','b130'] },
  { id: 'slot_mh_streak_10k', name: '萬步連擊神話', icon: '⚡', badgeIds: ['b131','b132','b133','b134','b135','b136','b137'] },
  { id: 'slot_mh_week_steps', name: '單週步數霸主', icon: '📅', badgeIds: ['b138','b139'] },
  { id: 'slot_mh_sleep7_days', name: '優質睡眠累積', icon: '😴', badgeIds: ['b140','b141','b142','b143','b144','b145','b146'] },
  { id: 'slot_mh_sleep7_streak', name: '連夜好眠連擊', icon: '🌙', badgeIds: ['b147','b148','b149','b150','b151'] },
  { id: 'slot_mh_week_sleep', name: '全週睡飽大師', icon: '🛌', badgeIds: ['b152','b153'] },
  { id: 'slot_mh_bed23_days', name: '早睡養生達人', icon: '🕚', badgeIds: ['b154','b155','b156','b157'] },
  { id: 'slot_mh_bed_streak', name: '早睡連擊王', icon: '🌠', badgeIds: ['b158','b159'] },
  { id: 'slot_mh_wake_early_days', name: '晨型破曉者', icon: '🌅', badgeIds: ['b160','b161','b162','b163'] },
  { id: 'slot_mh_early_both_streak', name: '早睡早起連擊', icon: '☀️', badgeIds: ['b164','b165','b166','b167'] },
  { id: 'slot_mh_reg_bed7', name: '規律入睡生理鐘', icon: '🕰️', badgeIds: ['b168','b169','b170'] },
  { id: 'slot_mh_reg_bed_long', name: '長效入睡定時器', icon: '⏱️', badgeIds: ['b171','b178'] },
  { id: 'slot_mh_reg_wake7', name: '規律晨起生理鐘', icon: '⏰', badgeIds: ['b172','b173','b174'] },
  { id: 'slot_mh_reg_wake_long', name: '長效晨起定時器', icon: '🔔', badgeIds: ['b175','b179'] },
  { id: 'slot_mh_weekend_wake', name: '週末不賴床', icon: '🏖️', badgeIds: ['b176','b177'] },
  { id: 'slot_mh_single_active', name: '單日活動分鐘', icon: '⚡', badgeIds: ['b180','b181','b182','b183','b184'] },
  { id: 'slot_mh_week_active', name: '單週活動分鐘', icon: '🔥', badgeIds: ['b185','b186','b187','b188'] },
  { id: 'slot_mh_active30_days', name: '活力30分天數', icon: '💪', badgeIds: ['b189','b190','b191'] },
  { id: 'slot_mh_active30_streak', name: '活力30分連擊', icon: '🚀', badgeIds: ['b192','b193'] },
  { id: 'slot_mh_single_rhr', name: '超低靜止心率', icon: '💓', badgeIds: ['b194','b195','b196','b197','b198','b199'] },
  { id: 'slot_mh_rhr_drop', name: '心肺進化降幅', icon: '📉', badgeIds: ['b200','b201','b202','b203'] },
  { id: 'slot_mh_rhr_rolling', name: '連續低心率穩定', icon: '🫀', badgeIds: ['b204','b205'] },
  { id: 'slot_mh_rhr_days', name: '靜心觀測紀錄', icon: '🩺', badgeIds: ['b206','b207'] },
  { id: 'slot_mh_single_kcal', name: '單日活動熱量', icon: '🔥', badgeIds: ['b208','b209','b210','b211','b212','b213'] },
  { id: 'slot_mh_total_kcal', name: '累積活動總熱量', icon: '🌋', badgeIds: ['b214','b215','b216','b217','b218'] },
  { id: 'slot_mh_week_kcal', name: '單週燃脂狂潮', icon: '☄️', badgeIds: ['b219','b220'] },
  { id: 'slot_mh_wk_steps', name: '運動日萬步雙修', icon: '🏃', badgeIds: ['b221','b222','b223'] },
  { id: 'slot_mh_wk_sleep_before', name: '睡飽再戰', icon: '🔋', badgeIds: ['b224','b225','b226'] },
  { id: 'slot_mh_wk_sleep_after', name: '練後黃金修復', icon: '🛌', badgeIds: ['b227','b228'] },
  { id: 'slot_mh_iron_week', name: '文武雙全鐵人週', icon: '🛡️', badgeIds: ['b230','b233','b234'] },
  { id: 'slot_mh_allround_days', name: '三環全滿天數', icon: '⭕', badgeIds: ['b231','b232'] },
  { id: 'slot_mh_sync_days', name: '雲端同步累積', icon: '📡', badgeIds: ['b235','b236','b237','b238','b239','b240','b241'] },
  { id: 'slot_mh_sync_streak', name: '雲端同步連擊', icon: '🔗', badgeIds: ['b242','b243','b244','b245'] },
  { id: 'slot_mh_weekend_steps', name: '週末健行王', icon: '🥾', badgeIds: ['b247','b248','b249','b250'] },
  { id: 'slot_mh_workday_rhythm', name: '平日全勤節奏', icon: '💼', badgeIds: ['b251','b255'] },
  { id: 'slot_mh_weekend_sleep', name: '週末睡眠修復', icon: '🛌', badgeIds: ['b252','b253'] },
  { id: 'slot_mh_who_weeks', name: 'WHO運動量達標週', icon: '🌍', badgeIds: ['b256','b257'] },
  { id: 'slot_mh_70k_weeks', name: '週行七萬步', icon: '🦵', badgeIds: ['b258','b259'] },
  { id: 'slot_mh_hrv_mastery', name: 'HRV身心平衡', icon: '🌿', badgeIds: ['b260','b261','b262','b265'] },
  { id: 'slot_mh_hrv_trend', name: 'HRV巔峰突破', icon: '📈', badgeIds: ['b263','b264'] },
  { id: 'slot_mh_spo2', name: '高地血氧飽和', icon: '🫁', badgeIds: ['b266','b267','b268','b269'] },
  { id: 'slot_mh_balance_days', name: '三維完美平衡日', icon: '☯️', badgeIds: ['b284','b285','b286','b287'] },
  { id: 'slot_mh_balance_streak', name: '完美平衡連擊', icon: '🌟', badgeIds: ['b288','b289'] },
  { id: 'slot_mh_morning_night_combo', name: '晨練夜眠黃金律', icon: '🌅', badgeIds: ['b290','b291'] },
  { id: 'slot_mh_collector', name: '健康徽章大滿貫', icon: '🎖️', badgeIds: ['b292','b293','b294','b295','b296'] },
  { id: 'slot_mh_endurance_steps', name: '百萬步萬里神行', icon: '👟', badgeIds: ['b297','b299'] },
  { id: 'slot_mh_supreme_king', name: '三冠至尊傳奇', icon: '👑', badgeIds: ['b298','b300'] }
];

const BADGE_TO_SLOT_DEF = new Map();
SLOT_DEFINITIONS.forEach(def => {
  def.badgeIds.forEach(bId => BADGE_TO_SLOT_DEF.set(bId, def));
});

/**
 * 將目前生效的徽章圖鑑濃縮為「進階升框徽章格 (Badge Slots)」陣列。
 * - 若傳入 heroName，會一併附上該英雄在此格的已解鎖最高階級、外框稀有度、進度標籤與下一階目標。
 */
window.getActiveBadgeSlots = function(state, heroName) {
  const st = state || window.gameState || {};
  const catalog = window.getActiveBadgeCatalog(st);
  const byId = new Map(catalog.map(b => [b.id, b]));
  const heroUnlockedMap = (heroName && st.heroBadges && st.heroBadges[heroName]) ? st.heroBadges[heroName] : {};

  // 為確保全服戰爭迷霧判定 (isGloballyRevealed)：檢查是否有任何一位英雄已解鎖該階
  const allHeroesBadges = st.heroBadges || {};
  const isBadgeUnlockedByAnyone = (bId) => {
    for (const hKey of Object.keys(allHeroesBadges)) {
      if (allHeroesBadges[hKey] && allHeroesBadges[hKey][bId]) return true;
    }
    return false;
  };

  const seenSlotIds = new Set();
  const slots = [];

  catalog.forEach(b => {
    const def = BADGE_TO_SLOT_DEF.get(b.id);
    const slotId = def ? def.id : b.id;
    if (seenSlotIds.has(slotId)) return;
    seenSlotIds.add(slotId);

    const tiers = def
      ? def.badgeIds.map(id => byId.get(id)).filter(Boolean)
      : [b];
    if (!tiers.length) return;

    const firstTier = tiers[0];
    const isMultiTier = tiers.length > 1;
    const totalTiers = tiers.length;

    const unlockedTiers = [];
    let highestUnlockedIdx = -1;
    tiers.forEach((tb, idx) => {
      const rec = heroUnlockedMap[tb.id];
      if (rec) {
        unlockedTiers.push({ badge: tb, tierIndex: idx, record: rec });
        highestUnlockedIdx = idx;
      }
    });

    const unlockedCount = unlockedTiers.length;
    const isUnlocked = unlockedCount > 0;
    const isMaxed = unlockedCount >= totalTiers;
    const currentTier = highestUnlockedIdx >= 0 ? tiers[highestUnlockedIdx] : null;
    const currentRecord = currentTier ? heroUnlockedMap[currentTier.id] : null;
    const nextTier = highestUnlockedIdx + 1 < totalTiers ? tiers[highestUnlockedIdx + 1] : null;
    const displayBadge = currentTier || firstTier;
    const rarity = isUnlocked ? (currentTier.rarity || 'common') : (firstTier.rarity || 'common');
    const anyGloballyRevealed = tiers.some(tb => isBadgeUnlockedByAnyone(tb.id));

    const seriesName = def ? def.name : firstTier.name;
    const slotIcon = def ? def.icon : firstTier.icon;
    const displayName = isMultiTier
      ? (currentTier ? `${seriesName}・${currentTier.name}` : seriesName)
      : firstTier.name;

    const levelTag = isMultiTier
      ? (isUnlocked ? (isMaxed ? '★MAX' : `Lv.${unlockedCount}/${totalTiers}`) : `0/${totalTiers}`)
      : (isUnlocked ? '★達成' : '');

    slots.push({
      id: slotId,
      slotNum: slots.length + 1,
      category: firstTier.category || firstTier.cat,
      cat: firstTier.cat || firstTier.category,
      name: seriesName,
      seriesName,
      currentTierName: currentTier ? currentTier.name : '',
      displayName,
      icon: slotIcon,
      rarity,
      isMultiTier,
      totalTiers,
      tiers,
      unlockedTiers,
      unlockedCount,
      isUnlocked,
      isMaxed,
      currentTier,
      currentRecord,
      nextTier,
      displayBadge,
      levelTag,
      anyGloballyRevealed,
      condition: displayBadge.condition || displayBadge.desc || '',
      desc: displayBadge.desc || displayBadge.condition || ''
    });
  });

  return slots;
};

/**
 * 依 slotId 或任一成員 badgeId 查詢對應的進階徽章格 (Slot)
 */
window.findBadgeSlot = function(slotOrBadgeId, state, heroName) {
  if (!slotOrBadgeId) return null;
  const slots = window.getActiveBadgeSlots(state, heroName);
  const direct = slots.find(s => s.id === slotOrBadgeId);
  if (direct) return direct;
  return slots.find(s => s.tiers.some(t => t.id === slotOrBadgeId)) || null;
};

/**
 * 取得某位英雄在「徽章格 (132格)」與「總階數 (331階)」雙軌進度統計
 */
window.getHeroBadgeSlotProgress = function(heroName, state) {
  const st = state || window.gameState || {};
  const slots = window.getActiveBadgeSlots(st, heroName);
  const unlockedSlots = slots.filter(s => s.isUnlocked).length;
  const maxedSlots = slots.filter(s => s.isMaxed).length;
  const totalSlots = slots.length;
  const unlockedTiers = slots.reduce((sum, s) => sum + s.unlockedCount, 0);
  const totalTiers = slots.reduce((sum, s) => sum + s.totalTiers, 0);
  return {
    unlockedSlots,
    maxedSlots,
    totalSlots,
    slotPct: totalSlots > 0 ? Math.round((unlockedSlots / totalSlots) * 100) : 0,
    unlockedTiers,
    totalTiers,
    tierPct: totalTiers > 0 ? Math.round((unlockedTiers / totalTiers) * 100) : 0
  };
};

window.evaluateAllHeroesBadges = evaluateAllHeroesBadges;
window.evaluateSnapshotHonorBadges = evaluateSnapshotHonorBadges;
window.SLOT_DEFINITIONS = SLOT_DEFINITIONS;
