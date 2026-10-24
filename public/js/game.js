/**
 * 鋼鐵英雄紀元 (Iron Heroes Era) - Frontend Game Engine (v2.2 旗艦三資料片版)
 * 資料片一：經典競技模式 (Classic Arena)
 * 資料片二：RPG 職業天賦模式 (RPG Class & Talent System)
 * 資料片三：世界 Boss 討伐戰 (PvE Raid)
 * 通用功能：冒險者戰情室 (Data Viewer) & 過往英雄史 (Chronicles)
 */

// -------------------------------------------------------------
// AVATAR HELPER
// -------------------------------------------------------------
function getHeroAvatar(name) {
  const h = window.gameState?.heroes?.find(hx => hx.name === name);
  return h?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`;
}
function renderHeroTag(name, extraClasses = "px-2 py-1 rounded-lg bg-slate-900 border border-slate-700") {
  const avatarHtml = (typeof window.renderHeroAvatarHtml === 'function')
    ? window.renderHeroAvatarHtml(name, getHeroAvatar(name), 'w-5 h-5', 'rounded-full')
    : `<img src="${getHeroAvatar(name)}" class="w-4 h-4 rounded-full object-cover bg-slate-800">`;
  const titlePill = (typeof window.renderHeroCustomTitleHtml === 'function')
    ? window.renderHeroCustomTitleHtml(name)
    : '';
  return `<span class="cursor-pointer hover:bg-slate-800 transition inline-flex items-center space-x-1.5 ${extraClasses}" onclick="openHeroDetailModal(${jsArg(name)})">
            ${avatarHtml}
            <span class="font-bold text-white text-xs">${name}</span>
            ${titlePill}
          </span>`;
}

let badgeWallShowOnlyUnlocked = false;

let gameState = null;
let heroStatsList = [];
let currentMainTab = 'classic';

// HTML / inline-JS 參數安全跳脫 (Strava 運動標題、英雄名稱含引號或 < > 時，不會破壞版面或被注入 HTML)
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function jsArg(str) {
  return escapeHtml(JSON.stringify(String(str ?? '')));
}
window.escapeHtml = escapeHtml;
window.jsArg = jsArg;
let selectedViewerHero = 'Weber';
let selectedChronicle = 'classic_0717';

let viewerSortCol = 'date';
let viewerSortAsc = false;
let soundEnabled = false;

// RPG Class Metadata (Unified Sunny Athletic Palette)
const RPG_CLASSES = {
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
window.RPG_CLASSES = RPG_CLASSES;

// Audio completely disabled per user requirement (zero sound/music on open or interaction)
const AudioFX = {
  ctx: null,
  init() {},
  playTone() {},
  playAttack() {},
  playCrit() {}
};

function toggleSound() {
  soundEnabled = false;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const borderCol = (type === 'attack' || type === 'error') ? 'border-rose-500/60 bg-rose-950/90 text-rose-200' : 'border-amber-500/60 bg-slate-900/90 text-amber-200';
  toast.className = `p-3 rounded-2xl border shadow-2xl text-xs flex items-center justify-between space-x-2 toast-animate backdrop-blur-md ${borderCol}`;
  toast.innerHTML = `
    <div class="flex items-center space-x-2">
      <span class="text-base">${type === 'attack' ? '⚡' : '📢'}</span>
      <span>${msg}</span>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.5s ease-out';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// Builtin Classic 0717 Frozen Data
window.frozenClassic0717 = {
  id: "classic_0717",
  type: "classic",
  seasonTitle: "2026 S1 • 0717 經典競技模式",
  seasonPeriod: "2026/05/01 ~ 2026/07/01 (共 62 天)",
  archivedAt: "2026/07/17 02:36:16",
  status: "completed",
  statusLabel: "🏁 本賽季已圓滿結束 (歷史數據已封存)",
  isVisible: true,
  champions: {
    teamAerobic: [
      { rank: 1, name: "咪咪胡胡", score: 100.0, badge: "🥇" },
      { rank: 2, name: "Cake", score: 61.89, badge: "🥈" },
      { rank: 3, name: "嘿喲嘿喲拔蘿蔔", score: 43.19, badge: "🥉" },
      { rank: 4, name: "天琳琳地琳琳", score: 5.54, badge: "" }
    ],
    heroAerobic: [
      { rank: 1, name: "Naomi", guild: "咪咪胡胡", score: 100.0, badge: "🥇" },
      { rank: 2, name: "Kerker", guild: "Cake", score: 55.26, badge: "🥈" },
      { rank: 3, name: "Mooooo", guild: "嘿喲嘿喲拔蘿蔔", score: 45.15, badge: "🥉" },
      { rank: 4, name: "Calla", guild: "Cake", score: 14.3, badge: "" },
      { rank: 5, name: "Weber", guild: "咪咪胡胡", score: 11.3, badge: "" }
    ],
    teamAnaerobic: [
      { rank: 1, name: "咪咪胡胡", score: 90.04, badge: "🥇" },
      { rank: 2, name: "Cake", score: 83.62, badge: "🥈" },
      { rank: 3, name: "嘿喲嘿喲拔蘿蔔", score: 36.43, badge: "🥉" },
      { rank: 4, name: "天琳琳地琳琳", score: 4.92, badge: "" }
    ],
    heroAnaerobic: [
      { rank: 1, name: "Naomi", guild: "咪咪胡胡", score: 77.41, badge: "🥇" },
      { rank: 2, name: "Calla", guild: "Cake", score: 70.74, badge: "🥈" },
      { rank: 3, name: "Kerker", guild: "Cake", score: 55.26, badge: "🥉" }
    ]
  },
  teamMetrics: [
    {
      metric: "🏋️ 鋼鐵紀律 (人均出勤)",
      unit: "次",
      leaderboard: [
        { rank: "🥇 1", team: "咪咪胡胡", value: "17.0" },
        { rank: "🥈 2", team: "Cake", value: "15.5" },
        { rank: "🥉 3", team: "嘿喲嘿喲拔蘿蔔", value: "7.5" }
      ]
    },
    {
      metric: "⏱️ 精神時光屋 (人均時長)",
      unit: "分鐘",
      leaderboard: [
        { rank: "🥇 1", team: "咪咪胡胡", value: "891.0" },
        { rank: "🥈 2", team: "Cake", value: "715.8" },
        { rank: "🥉 3", team: "嘿喲嘿喲拔蘿蔔", value: "378.7" }
      ]
    },
    {
      metric: "🔋 燃脂發電機 (人均熱量)",
      unit: "kcal",
      leaderboard: [
        { rank: "🥇 1", team: "咪咪胡胡", value: "4,188" },
        { rank: "🥈 2", team: "Cake", value: "3,518" },
        { rank: "🥉 3", team: "嘿喲嘿喲拔蘿蔔", value: "1,805" }
      ]
    },
    {
      metric: "🚀 引擎過載 (人均衝力 TRIMP)",
      unit: "TRIMP",
      leaderboard: [
        { rank: "🥇 1", team: "咪咪胡胡", value: "2,101.5" },
        { rank: "🥈 2", team: "Cake", value: "924.7" },
        { rank: "🥉 3", team: "嘿喲嘿喲拔蘿蔔", value: "873.2" }
      ]
    },
    {
      metric: "🟢 有氧大師 (人均有氧次數)",
      unit: "次",
      leaderboard: [
        { rank: "🥇 1", team: "咪咪胡胡", value: "5.5" },
        { rank: "🥈 2", team: "Cake", value: "3.5" },
        { rank: "🥉 3", team: "嘿喲嘿喲拔蘿蔔", value: "2.5" }
      ]
    },
    {
      metric: "🦍 絕對力量 (人均落差 Gap)",
      unit: "bpm",
      leaderboard: [
        { rank: "🥇 1", team: "Cake", value: "649.9" },
        { rank: "🥈 2", team: "咪咪胡胡", value: "520.5" },
        { rank: "🥉 3", team: "嘿喲嘿喲拔蘿蔔", value: "184.9" }
      ]
    },
    {
      metric: "💥 效率之王 (人均密度)",
      unit: "分",
      leaderboard: [
        { rank: "🥇 1", team: "咪咪胡胡", value: "8.97" },
        { rank: "🥈 2", team: "Cake", value: "4.60" },
        { rank: "🥉 3", team: "嘿喲嘿喲拔蘿蔔", value: "4.00" }
      ]
    },
    {
      metric: "🥵 燃燒殆盡 (人均痛苦 Suffer)",
      unit: "分",
      leaderboard: [
        { rank: "🥇 1", team: "咪咪胡胡", value: "503.3" },
        { rank: "🥈 2", team: "嘿喲嘿喲拔蘿蔔", value: "205.2" },
        { rank: "🥉 3", team: "Cake", value: "204.2" }
      ]
    }
  ]
};

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (typeof window.syncFromDatabase === 'function') {
    await window.syncFromDatabase();
  }
  if (!window.gameState) {
    await fetchGameData();
  } else {
    gameState = window.gameState;
  }
  if (!urlParams.get('nosse')) {
    initRealtimeSSE();
  }
  renderAllGameViews();
  const reqTab = urlParams.get('tab');
  if (reqTab) {
    switchMainTab(reqTab);
  }
  if (window.lucide) lucide.createIcons();
});

async function fetchGameData() {
  if (window.gameState) {
    gameState = window.gameState;
    setupImmersiveNavigation(gameState.activeMode || 'world_boss');
    return;
  }
  try {
    const res = await fetch('/api/state');
    if (res.ok && !window.gameState) {
      gameState = await res.json();
    }
  } catch (e) {}

  if (!gameState && !window.gameState) {
    try {
      const fb = await fetch('/data/game_data.json');
      if (fb.ok && !window.gameState) gameState = await fb.json();
    } catch(e) {}
  }

  if (window.gameState) gameState = window.gameState;
  const effectiveMode = gameState?.activeMode || 'world_boss';
  if (gameState) gameState.activeMode = effectiveMode;
  setupImmersiveNavigation(effectiveMode);
}

/**
 * 沉浸式導航欄建構：展示 GM 當前啟用的資料片 + 通用戰情室 + 歷史名人堂
 */
function setupImmersiveNavigation(mode) {
  const container = document.getElementById('nav-tabs-container');
  if (!container) return;

  let activeTabName = 'classic';
  let activeTabIcon = 'trophy';
  let activeTabLabel = '資料片一：經典競技模式';
  let activeTabMobileLabel = '資料片一•經典';

  if (window.isMobileMode && window.isMobileMode(mode)) {
    const mm = window.MOBILE_MODE_META[mode];
    activeTabName = mode; activeTabIcon = mm.lucide; activeTabLabel = `資料片${mm.num}：${mm.name}`; activeTabMobileLabel = mm.short;
  } else if (mode === 'faction_war') {
    activeTabName = 'faction'; activeTabIcon = 'swords'; activeTabLabel = '資料片四：雙城激戰'; activeTabMobileLabel = '資料片四•雙城';
  } else if (mode === 'survival') {
    activeTabName = 'survival'; activeTabIcon = 'skull'; activeTabLabel = '資料片五：飢餓法則'; activeTabMobileLabel = '資料片五•飢餓';
  } else if (mode === 'base_builder') {
    activeTabName = 'base'; activeTabIcon = 'castle'; activeTabLabel = '資料片六：鋼鐵要塞'; activeTabMobileLabel = '資料片六•要塞';
  } else if (mode === 'bingo') {
    activeTabName = 'bingo'; activeTabIcon = 'grid'; activeTabLabel = '資料片七：戰神拼圖'; activeTabMobileLabel = '資料片七•拼圖';
  } else if (mode === 'rpg_talent' || mode === 'rpg') {
    activeTabName = 'rpg';
    activeTabIcon = 'sword';
    activeTabLabel = '資料片二：RPG 職業天賦模式';
    activeTabMobileLabel = '資料片二•天賦';
  } else if (mode === 'world_boss' || mode === 'boss') {
    activeTabName = 'boss';
    activeTabIcon = 'swords';
    activeTabLabel = '資料片三：世界 Boss 討伐戰';
    activeTabMobileLabel = '資料片三•Boss';
  } else {
    activeTabName = 'classic';
    activeTabIcon = 'trophy';
    activeTabLabel = '資料片一：經典競技模式';
    activeTabMobileLabel = '資料片一•經典';
  }

  container.innerHTML = `
    <button id="nav-btn-active-expansion" onclick="switchMainTab('${activeTabName}')" class="justify-center px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md">
      <i data-lucide="${activeTabIcon}" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-200 flex-shrink-0"></i>
      <span class="sm:hidden truncate">${activeTabMobileLabel}</span>
      <span class="hidden sm:inline">${activeTabLabel}</span>
      <span class="hidden md:inline-block px-1.5 py-0.2 rounded-full bg-slate-900/60 text-amber-300 text-[10px]">進行中</span>
    </button>

    <button id="nav-btn-viewer" onclick="switchMainTab('viewer')" class="justify-center px-2 sm:px-3 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition text-slate-400 hover:text-white flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap">
      <i data-lucide="user-search" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 flex-shrink-0"></i>
      <span class="sm:hidden truncate">冒險者戰情室</span>
      <span class="hidden sm:inline">冒險者戰情室</span>
    </button>

    <button id="nav-btn-chronicles" onclick="switchMainTab('chronicles')" class="justify-center px-2 sm:px-3 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition text-slate-400 hover:text-white flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap">
      <i data-lucide="scroll" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 flex-shrink-0"></i>
      <span class="truncate">過往英雄史</span>
    </button>
  `;

  const reqTab = new URLSearchParams(window.location.search).get('tab');
  // 重新渲染 (例如按下同步、上傳大頭貼) 時，保留玩家目前所在的分頁，不要強制跳回資料片頁；只有首次載入才採用網址 ?tab= 參數
  let targetTab;
  if (window.__navInitialized) {
    targetTab = (currentMainTab === 'viewer' || currentMainTab === 'chronicles') ? currentMainTab : activeTabName;
  } else {
    targetTab = reqTab || activeTabName;
    window.__navInitialized = true;
  }
  switchMainTab(targetTab);
  if (window.lucide) lucide.createIcons();
}

function goToActiveExpansion() {
  const effectiveMode = gameState?.activeMode || 'classic';
  currentMainTab = 'expansion';
  setupImmersiveNavigation(effectiveMode);
}

function switchMainTab(tab) {
  currentMainTab = tab;
  const allTabs = ['classic', 'rpg', 'boss', 'faction', 'survival', 'base', 'bingo', 'expedition', 'dream', 'flame', 'monastery', 'viewer', 'chronicles'];
  allTabs.forEach(t => {
    const content = document.getElementById(`tab-content-${t}`);
    if (content) {
      if (t === tab) content.classList.remove('hidden');
      else content.classList.add('hidden');
    }
  });

  const activeExpBtn = document.getElementById('nav-btn-active-expansion');
  const viewerBtn = document.getElementById('nav-btn-viewer');
  const chronBtn = document.getElementById('nav-btn-chronicles');

  const inactiveCls = 'justify-center px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition text-slate-400 hover:text-white flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap';
  const activeCls = 'justify-center px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-md flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap';

  // Reset tab button styles
  if (activeExpBtn) activeExpBtn.className = inactiveCls;
  if (viewerBtn) viewerBtn.className = inactiveCls;
  if (chronBtn) chronBtn.className = inactiveCls;

  if (tab === 'viewer') {
    if (viewerBtn) viewerBtn.className = activeCls;
    loadHeroViewerData();
  } else if (tab === 'chronicles') {
    if (chronBtn) chronBtn.className = activeCls;
    renderChroniclesView();
  } else {
    if (activeExpBtn) activeExpBtn.className = activeCls;
    if (tab === 'classic') renderClassicModeView();
    if (tab === 'rpg') renderRPGClassTalentView();
    if (tab === 'boss') renderWorldBossView();
    if (tab === 'faction') renderFactionWarView();
    if (tab === 'survival') renderSurvivalView();
    if (tab === 'base') renderBaseBuilderView();
    if (tab === 'bingo') renderBingoView();
    if (window.isMobileMode && window.isMobileMode(tab)) window.renderMobileModeView(tab);
  }

  if (window.lucide) lucide.createIcons();
}

function initRealtimeSSE() {
  try {
    const sse = new EventSource('/api/stream');
    sse.addEventListener('new_attack', (e) => {
      AudioFX.playAttack();
      try {
        const act = JSON.parse(e.data);
        showToast(`${act.hero} 完成鍛鍊！造成 ${(act.damage || 0).toLocaleString()} 點傷害！`, 'attack');
      } catch (err) {}
      syncFromGoogleSheet();
    });
    sse.addEventListener('game_updated', () => {
      // Supabase 為唯一資料來源：收到本地伺服器廣播時重新向雲端同步，而不是直接採用本地 JSON 檔 (避免舊資料蓋掉畫面)
      if (typeof window.syncFromDatabase === 'function') window.syncFromDatabase();
    });
  } catch (e) {}
}

function renderAllGameViews() {
  if (window.gameState) gameState = window.gameState;
  if (window.heroStatsList && window.heroStatsList.length > 0) {
    heroStatsList = window.heroStatsList;
  } else if (gameState?.heroStats && gameState.heroStats.length > 0) {
    heroStatsList = gameState.heroStats;
  }
  if (!gameState) return;

  if (typeof window.evaluateAllHeroesBadges === 'function') {
    gameState.heroBadges = window.evaluateAllHeroesBadges(gameState);
  }

  const activeMode = gameState?.activeMode || "classic";
  renderGMLiveBroadcastBanner();
  setupImmersiveNavigation(activeMode);
  renderActiveExpansionBadge();
  if (activeMode === 'classic') renderClassicModeView();
  if (activeMode === 'rpg' || activeMode === 'rpg_talent') renderRPGClassTalentView();
  if (activeMode === 'boss' || activeMode === 'world_boss') renderWorldBossView();
  if (activeMode === 'faction_war') renderFactionWarView();
  if (activeMode === 'survival') renderSurvivalView();
  if (activeMode === 'base_builder') renderBaseBuilderView();
  if (activeMode === 'bingo') renderBingoView();
  if (window.isMobileMode && window.isMobileMode(activeMode)) window.renderMobileModeView(activeMode);
  populateViewerDropdowns();
  populateChroniclesDropdown();

  if (window.lucide) lucide.createIcons();
}

/**
 * 渲染頂部 GM 限時積分加倍活動 (進行中 / 即將開始預告) 與 壽星/天氣特效全服廣播橫幅
 */
function renderGMLiveBroadcastBanner() {
  const bannerContainer = document.getElementById('gm-live-broadcast-banner');
  if (!bannerContainer) return;

  const gmOps = gameState?.gmOps || {};
  const events = Array.isArray(gmOps.events) ? gmOps.events.filter(e => e.enabled !== false) : [];
  const todayYMD = (typeof window.getTodayYMD === 'function') ? window.getTodayYMD() : '';

  const activeEvents = [];
  const upcomingEvents = [];

  events.forEach(ev => {
    const sDate = (typeof window.normalizeDateYMD === 'function') ? window.normalizeDateYMD(ev.startDate) : ev.startDate;
    const eDate = (typeof window.normalizeDateYMD === 'function') ? window.normalizeDateYMD(ev.endDate || ev.startDate) : (ev.endDate || ev.startDate);
    if (!sDate) return;
    if (sDate <= todayYMD && (eDate || sDate) >= todayYMD) {
      activeEvents.push({ ...ev, sDate, eDate: eDate || sDate });
    } else if (sDate > todayYMD) {
      upcomingEvents.push({ ...ev, sDate, eDate: eDate || sDate });
    }
  });

  upcomingEvents.sort((a, b) => a.sDate.localeCompare(b.sDate));

  // 檢查目前有無生效中的英雄頭像特效 (壽星/大太陽/淋雨/爆氣)
  const activeHeroFxList = [];
  (gameState?.heroes || []).forEach(h => {
    if (typeof window.getHeroActiveFx === 'function') {
      const fxInfo = window.getHeroActiveFx(h.name, gameState);
      if (fxInfo && ((fxInfo.fx && fxInfo.fx !== 'none') || fxInfo.customTitle)) {
        activeHeroFxList.push({
          name: h.name,
          guild: h.guild,
          avatar: h.avatar,
          fxInfo
        });
      }
    }
  });

  const htmlBlocks = [];

  // 1. 今日正在生效的限時加成活動
  activeEvents.forEach(ev => {
    const sign = Number(ev.bonusPct) >= 0 ? `+${ev.bonusPct}%` : `${ev.bonusPct}%`;
    htmlBlocks.push(`
      <div class="bg-gradient-to-r from-amber-950/90 via-rose-950/85 to-slate-900/95 border-2 border-amber-400/80 rounded-2xl px-4 py-3 shadow-xl glow-border-gold flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/60 flex items-center justify-center text-2xl animate-bounce flex-shrink-0">
            ${ev.icon || '⚡'}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">🔥 限時活動生效中</span>
              <span class="text-sm sm:text-base font-black text-white">${escapeHtml(ev.title || '全服限時加成活動')}</span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-amber-400 text-slate-950 shadow">全服得分 / 補血 ${sign}</span>
            </div>
            <p class="text-xs text-amber-200/90 mt-0.5">
              📅 生效期間：<span class="font-mono font-bold text-white">${ev.sDate} ~ ${ev.eDate}</span>
              ${ev.note ? ` • <span>${ev.note}</span>` : ' • 期間內完成有效運動，所有資料片 (含手機同步資料片) 得分自動加成！'}
            </p>
          </div>
        </div>
      </div>
    `);
  });

  // 2. 即將開始的預告活動
  upcomingEvents.forEach(ev => {
    const sign = Number(ev.bonusPct) >= 0 ? `+${ev.bonusPct}%` : `${ev.bonusPct}%`;
    htmlBlocks.push(`
      <div class="bg-gradient-to-r from-cyan-950/75 via-slate-900/90 to-indigo-950/75 border border-cyan-400/50 rounded-2xl px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-xl flex-shrink-0">
            ${ev.icon || '⏳'}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">⏳ 即將開始 • 活動預告</span>
              <span class="text-xs sm:text-sm font-black text-white">${escapeHtml(ev.title || '限時加成預告')}</span>
              <span class="px-2 py-0.2 rounded-full text-[11px] font-mono font-bold bg-cyan-400/20 text-cyan-200 border border-cyan-400/40">預計加成 ${sign}</span>
            </div>
            <p class="text-[11px] text-slate-300 mt-0.5">
              📅 預定開啟時間：<span class="font-mono font-bold text-cyan-300">${ev.sDate} ~ ${ev.eDate}</span>
              ${ev.note ? ` • ${ev.note}` : ' • 請各位英雄提前暖身備戰！'}
            </p>
          </div>
        </div>
      </div>
    `);
  });

  // 3. 壽星慶典 / 特殊天氣狀態英雄焦點橫幅
  if (activeHeroFxList.length > 0) {
    htmlBlocks.push(`
      <div class="bg-slate-900/90 border border-amber-500/40 rounded-2xl px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">✨ 全服焦點英雄狀態</span>
          <div class="flex flex-wrap items-center gap-2">
            ${activeHeroFxList.map(item => `
              <span onclick="openHeroDetailModal(${jsArg(item.name)})" class="cursor-pointer inline-flex items-center space-x-1.5 bg-slate-950/90 hover:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 transition">
                ${window.renderHeroAvatarHtml(item.name, item.avatar, 'w-6 h-6', 'rounded-full')}
                <span class="font-bold text-white">${item.name}</span>
                ${window.renderHeroCustomTitleHtml(item.name)}
              </span>
            `).join('')}
          </div>
        </div>
        <button onclick="celebrateActiveHeroFx()" class="px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-slate-950 font-black text-[11px] shadow transition active:scale-95">
          🎉 點此發送全服喝采！
        </button>
      </div>
    `);
  }

  bannerContainer.innerHTML = htmlBlocks.join('');
}

function celebrateActiveHeroFx() {
  AudioFX.playCrit();
  const heroesWithFx = (gameState?.heroes || []).filter(h => {
    const fx = window.getHeroActiveFx ? window.getHeroActiveFx(h.name, gameState) : null;
    return fx && ((fx.fx && fx.fx !== 'none') || fx.customTitle);
  });
  const names = heroesWithFx.map(h => h.name).join('、') || '全體鋼鐵英雄';
  showToast(`🎉 獻上熱烈喝采與祝福給：${names}！汗水不滅！`, 'info');
}


function renderActiveExpansionBadge() {
  const badgeEl = document.getElementById('active-expansion-badge');
  if (!badgeEl) return;
  const mode = gameState?.activeMode || 'classic';
  let label = '🏆 進行中：資料片一 • 經典競技模式';
  if (mode === 'rpg_talent' || mode === 'rpg') label = '⚔️ 進行中：資料片二 • RPG 職業天賦模式';
  if (mode === 'world_boss' || mode === 'boss') label = '🐉 進行中：資料片三 • 世界 Boss 討伐戰 (PvE Raid)';
  if (mode === 'faction_war') label = '⚔️ 進行中：資料片四 • 雙城激戰 (陣營 PVE)';
  if (mode === 'survival') label = '☠️ 進行中：資料片五 • 飢餓法則 (大逃殺)';
  if (mode === 'base_builder') label = '🏰 進行中：資料片六 • 鋼鐵要塞 (共同建設)';
  if (window.isMobileMode && window.isMobileMode(mode)) { const mm = window.MOBILE_MODE_META[mode]; label = `${mm.icon} 進行中：資料片${mm.num} • ${mm.name} (📱 手機同步)`; }
  if (mode === 'bingo') label = '🧩 進行中：資料片七 • 戰神拼圖 (全服解鎖)';
  badgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 animate-pulse"></span>${label}`;
}

// -------------------------------------------------------------
// 1. EXPANSION 1: 經典競技模式 (Classic Guild Arena)
// -------------------------------------------------------------

function calculateLiveClassicMetrics() {
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

function renderClassicModeView() {
  const minDurEl = document.getElementById('classic-min-dur-text');
  if (minDurEl) minDurEl.textContent = gameState?.summary?.minDurationMinutes || gameState?.boss?.rules?.minDurationMinutes || 30;
  const champContainer = document.getElementById('classic-champions-container');
  const metricContainer = document.getElementById('classic-metrics-container');
  const guildTableContainer = document.getElementById('classic-guild-table-container');

  if (!champContainer || !metricContainer) return;

  const seasonStartStr = gameState?.seasonStart || gameState?.boss?.seasonStart || "2026/08/12";
  const seasonEndStr = gameState?.seasonEnd || gameState?.boss?.seasonEnd || "2026/08/31";
  const classicPeriodEl = document.getElementById("classic-period-text");
  if (classicPeriodEl) classicPeriodEl.innerText = `競賽區間：${seasonStartStr} ~ ${seasonEndStr}`;

  const classicData = calculateLiveClassicMetrics();
  const champs = classicData.champions;
  const metrics = classicData.teamMetrics;
  const guildList = classicData.guildList;

  // 4 Podiums
  champContainer.innerHTML = `
    <div class="bg-slate-900/80 border border-emerald-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 class="text-sm font-bold text-emerald-400">🟢 團隊有氧總冠軍 (滿分100)</h3>
        <span class="text-[10px] text-slate-400">衝力40% + 熱量30% + 有氧30%</span>
      </div>
      <div class="space-y-1.5">
        ${(champs.teamAerobic || []).map(t => `
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
            <span class="font-bold text-white">${t.badge || ''} ${t.name}</span>
            <span class="font-rpg font-bold text-emerald-400">${t.score} 分</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="bg-slate-900/80 border border-emerald-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 class="text-sm font-bold text-emerald-400">🟢 個人有氧總冠軍 (滿分100)</h3>
        <span class="text-[10px] text-slate-400">個人綜合加權高標法</span>
      </div>
      <div class="space-y-1.5">
        ${(champs.heroAerobic || []).slice(0, 5).map(h => `
          <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-emerald-500/50 transition">
            <span class="font-bold text-white">${h.badge || ''} ${h.name} <span class="text-[10px] text-slate-400 font-normal">(${h.guild})</span></span>
            <span class="font-rpg font-bold text-emerald-400">${h.score} 分</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="bg-slate-900/80 border border-rose-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 class="text-sm font-bold text-rose-400">🔴 團隊無氧總冠軍 (滿分100)</h3>
        <span class="text-[10px] text-slate-400">落差50% + 密度30% + 出勤20%</span>
      </div>
      <div class="space-y-1.5">
        ${(champs.teamAnaerobic || []).map(t => `
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
            <span class="font-bold text-white">${t.badge || ''} ${t.name}</span>
            <span class="font-rpg font-bold text-rose-400">${t.score} 分</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="bg-slate-900/80 border border-rose-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 class="text-sm font-bold text-rose-400">🔴 個人無氧總冠軍 (滿分100)</h3>
        <span class="text-[10px] text-slate-400">落差40% + 密度30% + MaxHR15% + 出勤15%</span>
      </div>
      <div class="space-y-1.5">
        ${(champs.heroAnaerobic || []).slice(0, 5).map(h => `
          <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-rose-500/50 transition">
            <span class="font-bold text-white">${h.badge || ''} ${h.name} <span class="text-[10px] text-slate-400 font-normal">(${h.guild})</span></span>
            <span class="font-rpg font-bold text-rose-400">${h.score} 分</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // 8 Metrics
  metricContainer.innerHTML = metrics.map(m => `
    <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
      <span class="text-xs font-bold text-slate-200 block truncate">${m.metric}</span>
      <div class="space-y-1">
        ${m.leaderboard.map(item => `
          <div class="flex justify-between text-[11px]">
            <span class="text-slate-400">${item.rank} ${item.team}</span>
            <span class="font-mono font-bold text-amber-400">${item.value} ${m.unit}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Guild Summary Table
  if (guildTableContainer) {
    guildTableContainer.innerHTML = `
      <table class="w-full text-left text-xs">
        <thead class="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
          <tr>
            <th class="p-3">🛡️ 公會名稱</th>
            <th class="p-3">👥 成員名冊</th>
            <th class="p-3">🏋️ 人均出勤</th>
            <th class="p-3">⏱️ 人均時長</th>
            <th class="p-3">🔋 人均熱量</th>
            <th class="p-3">🚀 人均衝力</th>
            <th class="p-3">🦍 人均落差</th>
            <th class="p-3">💥 人均密度</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 text-slate-300">
          ${guildList.map(g => `
            <tr class="hover:bg-slate-950/40 transition">
              <td class="p-3 font-bold text-white flex items-center space-x-1.5">
                <span>${g.badge}</span>
                <span>${g.name}</span>
              </td>
              <td class="p-3 text-slate-400 font-mono text-[11px]">
                <div class="flex flex-wrap gap-1.5">
                  ${(g.members || []).map(m => renderHeroTag(m)).join('')}
                </div>
              </td>
              <td class="p-3 font-mono text-amber-300">${g.perWorkouts} 次</td>
              <td class="p-3 font-mono">${g.perDuration} 分</td>
              <td class="p-3 font-mono text-rose-400">${g.perCalories} kcal</td>
              <td class="p-3 font-mono text-cyan-300">${g.perTrimp}</td>
              <td class="p-3 font-mono text-purple-300">${g.perGap} bpm</td>
              <td class="p-3 font-mono">${g.perDensity}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

// -------------------------------------------------------------
// 2. EXPANSION 2: RPG 職業天賦模式 (RPG Class & Talent System)
// -------------------------------------------------------------

function calculateRpgViewStats() {
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

function renderRPGClassTalentView() {
  const mastersContainer = document.getElementById('rpg-class-masters-container');
  const synergyContainer = document.getElementById('rpg-guild-synergy-container');
  const rosterContainer = document.getElementById('rpg-hero-roster-container');

  if (!mastersContainer || !synergyContainer) return;

  const seasonStartStr = gameState?.seasonStart || gameState?.boss?.seasonStart || "2026/08/12";
  const seasonEndStr = gameState?.seasonEnd || gameState?.boss?.seasonEnd || "2026/08/31";
  const rpgPeriodEl = document.getElementById("rpg-period-text");
  if (rpgPeriodEl) rpgPeriodEl.innerText = `修煉區間：${seasonStartStr} ~ ${seasonEndStr}`;

  const data = calculateRpgViewStats();
  const masters = data.classMasters;
  const synergyList = data.guildSynergyList;
  const heroList = data.heroRpgList;

  // 1. 5 Class Master Podiums
  mastersContainer.innerHTML = Object.keys(RPG_CLASSES).map(cName => {
    const cls = RPG_CLASSES[cName];
    const master = masters[cName];
    return `
      <div class="bg-slate-950 p-3.5 rounded-2xl border ${cls.bg} space-y-2 relative overflow-hidden">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold flex items-center space-x-1">
            <span>${cls.badge}</span>
            <span>${cls.name}之王</span>
          </span>
          <span class="text-[10px] opacity-80">${cls.enName}</span>
        </div>
        ${master ? `
          <div class="flex items-center space-x-2.5 pt-1 cursor-pointer hover:opacity-80" onclick="openHeroDetailModal(${jsArg(master.name)})">
            <div class="w-9 h-9 rounded-xl bg-slate-800 overflow-hidden border border-slate-700 flex-shrink-0">
              <img src="${master.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${master.name}`}" class="w-full h-full object-cover">
            </div>
            <div class="min-w-0">
              <span class="font-bold text-white text-xs truncate block">${master.name}</span>
              <span class="text-[10px] text-slate-400">${master.guild}</span>
            </div>
          </div>
          <div class="text-right pt-1 border-t border-slate-800/80">
            <span class="text-[10px] text-slate-400 block">職業戰力</span>
            <span class="font-rpg font-bold text-sm text-amber-400">${master.combatPower.toLocaleString()}</span>
          </div>
        ` : `
          <div class="text-center py-4 text-slate-500 text-xs">(尚無冒險者)</div>
        `}
      </div>
    `;
  }).join('');

  // 2. Guild Synergy Leaderboard
  const maxGuildPower = Math.max(1, ...synergyList.map(s => s.totalPower));
  synergyContainer.innerHTML = synergyList.map(g => {
    const pct = Math.round((g.totalPower / maxGuildPower) * 100);
    return `
      <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 space-y-2">
        <div class="flex flex-wrap items-center justify-between text-xs gap-2">
          <div class="flex items-center space-x-2">
            <span>${g.badge}</span>
            <span class="font-bold text-white text-sm">${g.guild}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">${g.synergyTag}</span>
            <div class="flex space-x-1">
              ${g.uniqueClasses.map(c => `<span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300">${RPG_CLASSES[c]?.badge || ''} ${c}</span>`).join('')}
            </div>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block">公會羈絆戰力</span>
            <span class="font-rpg font-bold text-amber-400 text-sm">${g.totalPower.toLocaleString()} CP</span>
          </div>
        </div>
        <div class="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${g.color};"></div>
        </div>
      </div>
    `;
  }).join('');

  // 3. Hero Class Roster Table
  if (rosterContainer) {
    rosterContainer.innerHTML = `
      <table class="w-full text-left text-xs">
        <thead class="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
          <tr>
            <th class="p-3">👤 冒險者</th>
            <th class="p-3">🛡️ 公會</th>
            <th class="p-3">⚔️ 職業專精</th>
            <th class="p-3">✨ 專屬天賦被動</th>
            <th class="p-3">🏋️ 出勤 / 燃脂</th>
            <th class="p-3">🚀 TRIMP / 落差</th>
            <th class="p-3 text-right">⚡ RPG 戰鬥評分 (CP)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60 text-slate-300">
          ${heroList.map(h => `
            <tr class="hover:bg-slate-950/40 transition cursor-pointer" onclick="openHeroDetailModal(${jsArg(h.name)})">
              <td class="p-3 font-bold text-white flex items-center space-x-2">
                <div class="w-7 h-7 rounded-lg bg-slate-800 overflow-hidden border border-slate-700 flex-shrink-0">
                  <img src="${h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`}" class="w-full h-full object-cover">
                </div>
                <span>${h.name}</span>
              </td>
              <td class="p-3"><span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">${h.guild}</span></td>
              <td class="p-3">
                <span class="px-2 py-0.5 rounded text-[11px] font-bold ${h.classMeta.bg}">
                  ${h.classMeta.badge} ${h.rpgClass}
                </span>
              </td>
              <td class="p-3 text-[11px] text-slate-400">
                <span class="font-bold text-slate-200">${h.classMeta.passiveName}</span>：${h.classMeta.passiveDesc}
              </td>
              <td class="p-3 font-mono">${Math.round(h.workouts * 10) / 10}次 • ${Math.round(h.zone2 * 10) / 10}次燃脂</td>
              <td class="p-3 font-mono text-cyan-300">${Math.round(h.trimp * 10) / 10} • 落差 ${Math.round(h.maxGap * 10) / 10}</td>
              <td class="p-3 text-right font-mono font-bold text-amber-400 text-sm">${h.combatPower.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

// -------------------------------------------------------------
// 3. EXPANSION 3: 世界 Boss 討伐戰 (PvE Raid)
// -------------------------------------------------------------

function renderWorldBossView() {
  const boss = gameState?.boss || {};
  const maxHp = boss.maxHp || 350000;

  // Damage breakdown (普攻總和 + 魔攻總和 + 單次最大Gap爆擊)
  let totalPhys = 0, totalMag = 0, totalCrit = 0, totalDmg = 0;
  if (heroStatsList && heroStatsList.length > 0) {
    heroStatsList.forEach(h => {
      totalPhys += (h.physDmg || 0);
      totalMag += (h.magDmg || 0);
      totalCrit += (h.critDmg || 0);
      totalDmg += (h.totalDamage || 0);
    });
  }

  const currentHp = Math.max(0, maxHp - totalDmg);
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));

  const nameEl = document.getElementById('boss-name-text');
  const descEl = document.getElementById('boss-desc-text');
  const hpEl = document.getElementById('boss-hp-text');
  const pctEl = document.getElementById('boss-hp-pct');
  const barEl = document.getElementById('boss-hp-bar');

  if (nameEl) nameEl.innerText = boss.name || '🌩️ 墮落雷神・索爾';
  if (descEl) descEl.innerText = boss.description || '';
  if (hpEl) hpEl.innerText = currentHp.toLocaleString();
  if (pctEl) pctEl.innerText = `(${hpPct.toFixed(1)}%)`;
  if (barEl) barEl.style.width = `${hpPct}%`;

  const avatarEl = document.getElementById('boss-avatar-img');
  if (avatarEl && boss.avatar) avatarEl.src = boss.avatar;

  const seasonStart = gameState?.seasonStart || boss.seasonStart || "2026/08/12";
  const seasonEnd = gameState?.seasonEnd || boss.seasonEnd || "2026/08/31";

  const seasonPeriodEl = document.getElementById("boss-season-period");
  if (seasonPeriodEl) seasonPeriodEl.innerText = `討伐戰區間：${seasonStart} ~ ${seasonEnd}`;

  const statTot = document.getElementById('stat-total-damage');
  const statPhy = document.getElementById('stat-phys-dmg');
  const statMag = document.getElementById('stat-mag-dmg');
  const statCri = document.getElementById('stat-crit-dmg');

  if (statTot) statTot.innerText = totalDmg.toLocaleString();
  if (statPhy) statPhy.innerText = totalPhys.toLocaleString();
  if (statMag) statMag.innerText = totalMag.toLocaleString();
  if (statCri) statCri.innerText = totalCrit.toLocaleString();

  // MVP List
  const mvpContainer = document.getElementById('mvp-hero-list');
  if (mvpContainer && heroStatsList) {
    mvpContainer.innerHTML = '';
    const sorted = [...heroStatsList].sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
    sorted.forEach((hero, index) => {
      const card = document.createElement('div');
      const isTop1 = index === 0;
      const isTop3 = index < 3;
      card.className = `p-3.5 rounded-2xl border transition flex items-center justify-between space-x-3 cursor-pointer hover:border-amber-500/60 ${
        isTop1 ? 'bg-amber-950/20 border-amber-500/50 glow-border-gold' : (isTop3 ? 'bg-slate-950/60 border-slate-700' : 'bg-slate-950/40 border-slate-800/80')
      }`;
      card.onclick = () => openHeroDetailModal(hero.name);
      const bossHeroAvatar = typeof window.renderHeroAvatarHtml === 'function'
        ? window.renderHeroAvatarHtml(hero, 'w-10 h-10', 'rounded-xl')
        : `<div class="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700 flex-shrink-0"><img src="${hero.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${hero.name}`}" class="w-full h-full object-cover"></div>`;
      const bossHeroTitle = typeof window.renderHeroCustomTitleHtml === 'function'
        ? window.renderHeroCustomTitleHtml(hero.name)
        : '';
      card.innerHTML = `
        <div class="flex items-center space-x-3 flex-1 min-w-0">
          <div class="w-7 text-center font-black font-rpg text-sm ${isTop1 ? 'text-amber-400 text-base' : (isTop3 ? 'text-cyan-400' : 'text-slate-500')}">
            ${isTop1 ? '👑' : `#${index + 1}`}
          </div>
          ${bossHeroAvatar}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <h4 class="text-sm font-black text-white truncate">${hero.name}</h4>
              ${bossHeroTitle}
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">${hero.guild}</span>
            </div>
            <p class="text-[11px] text-slate-400 mt-0.5">
              出勤 ${hero.validWorkouts || 0} 次 • 普攻 ${(hero.physDmg || 0).toLocaleString()} • 魔攻 ${(hero.magDmg || 0).toLocaleString()} • 💥 爆擊 ${(hero.critDmg || 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div class="text-right">
          <span class="text-[10px] text-slate-400 block">總輸出</span>
          <span class="text-base font-black font-rpg text-amber-400">${(hero.totalDamage || 0).toLocaleString()}</span>
        </div>
      `;
      mvpContainer.appendChild(card);
    });
  }

  // Guild Contributions
  const guildContainer = document.getElementById('guild-contribution-list');
  if (guildContainer && gameState?.guilds && heroStatsList) {
    guildContainer.innerHTML = '';
    const guildStats = {};
    (gameState.guilds || []).forEach(g => { guildStats[g.name] = { ...g, totalDamage: 0 }; });
    heroStatsList.forEach(h => { if (guildStats[h.guild]) guildStats[h.guild].totalDamage += (h.totalDamage || 0); });
    const totalAllDmg = Object.values(guildStats).reduce((acc, g) => acc + g.totalDamage, 0) || 1;
    const sortedGuilds = Object.values(guildStats).sort((a, b) => b.totalDamage - a.totalDamage);
    sortedGuilds.forEach(g => {
      const pct = ((g.totalDamage / totalAllDmg) * 100).toFixed(1);
      const div = document.createElement('div');
      div.className = 'space-y-1.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800';
      div.innerHTML = `
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center space-x-1.5">
            <span>${g.badge || '🛡️'}</span>
            <span class="font-bold text-white">${g.name}</span>
          </div>
          <span class="font-rpg font-bold text-amber-400">${g.totalDamage.toLocaleString()} (${pct}%)</span>
        </div>
        <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${g.color || '#f59e0b'};"></div>
        </div>
      `;
      guildContainer.appendChild(div);
    });
  }

  // Combat Feed
  const feedContainer = document.getElementById('battle-combat-feed');
  if (feedContainer && gameState?.activities) {
    feedContainer.innerHTML = '';
    const recent = gameState.activities.filter(a => a.isValidAttack).slice(0, 15);
    recent.forEach(a => {
      const div = document.createElement('div');
      div.className = 'bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 text-[11px] flex items-center justify-between space-x-2 hover:border-amber-500/40 transition';
      const isNumericStrava = /^\d+$/.test(String(a.id));
      const idBadge = isNumericStrava
        ? `<a href="https://www.strava.com/activities/${a.id}" target="_blank" class="text-[10px] text-orange-400 font-mono hover:underline">#${a.id} ↗</a>`
        : `<span class="text-[10px] text-amber-400 font-mono">手動</span>`;
      div.innerHTML = `
        <div class="flex items-center space-x-2 min-w-0 flex-1">
          <span class="text-xs">⚔️</span>
          <div class="min-w-0">
            <div class="flex items-center space-x-1.5">
              <span class="font-bold text-slate-200 truncate cursor-pointer hover:underline" onclick="openHeroDetailModal(${jsArg(a.hero)})">${a.hero}</span>
              <span class="text-[10px] text-slate-400">(${a.guild})</span>
              ${idBadge}
            </div>
            <span class="text-slate-500 text-[10px] truncate block">${escapeHtml(a.title || '自主訓練')} (${a.duration}分 • 心率 ${a.avgHr}/${a.maxHr})</span>
          </div>
        </div>
        <span class="font-mono font-bold text-amber-400 flex-shrink-0 text-xs">🗡️+🔮 ${(a.damage || 0).toLocaleString()}</span>
      `;
      feedContainer.appendChild(div);
    });
  }
}

// -------------------------------------------------------------
// 4. GLOBAL TOOL: 冒險者戰情室 (Hero Data Viewer & Radar)
// -------------------------------------------------------------

function populateViewerDropdowns() {
  const select = document.getElementById('viewer-hero-select');
  if (!select || !gameState?.heroes) return;

  select.innerHTML = '';
  const isRpgMode = (gameState?.activeMode === 'rpg_talent' || gameState?.activeMode === 'rpg');
  
  const heroesArr = Array.isArray(gameState.heroes) ? gameState.heroes : Object.values(gameState.heroes || {});
  const sortedHeroes = heroesArr.sort((a,b) => {
      if((a.guild||'') !== (b.guild||'')) return (a.guild||'').localeCompare(b.guild||'');
      if((a.rpgClass||'') !== (b.rpgClass||'')) return (a.rpgClass || '').localeCompare(b.rpgClass || '');
      return a.name.localeCompare(b.name);
  });
  sortedHeroes.forEach(h => {

    const opt = document.createElement('option');
    opt.value = h.name;
    opt.innerText = isRpgMode 
      ? `${h.name} (${h.guild} • ${h.rpgClass || '狂戰士'})`
      : `${h.name} (${h.guild})`;
    if (h.name === selectedViewerHero) opt.selected = true;
    select.appendChild(opt);
  });
  loadHeroViewerData();
}

function loadHeroViewerData() {
  const select = document.getElementById('viewer-hero-select');
  if (select) selectedViewerHero = select.value;

  const hero = gameState?.heroes?.find(h => h.name === selectedViewerHero) || { name: selectedViewerHero, guild: "自由英雄", age: 35, maxHr: 185, rpgClass: "狂戰士" };
  const heroActs = (gameState?.activities || []).filter(a => a.hero === selectedViewerHero);
  const heroStat = heroStatsList?.find(h => h.name === selectedViewerHero) || {};

  const seasonStartStr = gameState?.seasonStart || gameState?.boss?.seasonStart || "2026/08/12";
  const seasonEndStr = gameState?.seasonEnd || gameState?.boss?.seasonEnd || "2026/08/31";
  const startD = parseActivityDate(seasonStartStr);
  const endD = parseActivityDate(seasonEndStr);
  if (endD) endD.setHours(23, 59, 59, 999);

  const inSeasonActs = heroActs.filter(a => {
    if (a.isExcluded || a.isValidAttack === false) return false;
    const aDate = parseActivityDate(a.date || a.time);
    if (aDate && startD && endD) {
      return aDate >= startD && aDate <= endD;
    }
    return a.inSeason !== false;
  });

  const totalDmg = heroStat.totalDamage || 0;
  const totalDur = inSeasonActs.reduce((acc, a) => acc + (a.duration || 0), 0);
  const totalCal = inSeasonActs.reduce((acc, a) => acc + (a.calories || 0), 0);
  const cls = RPG_CLASSES[hero.rpgClass || '狂戰士'] || RPG_CLASSES['狂戰士'];

  // HUD Header
  const hudContainer = document.getElementById('hero-profile-hud');
  if (hudContainer) {
    const avatarHtml = typeof window.renderHeroAvatarHtml === 'function'
      ? window.renderHeroAvatarHtml(hero, 'w-14 h-14', 'rounded-2xl')
      : `<div class="w-14 h-14 rounded-2xl bg-slate-800 overflow-hidden border-2 border-cyan-500/50 shadow-lg shadow-cyan-950 flex-shrink-0"><img src="${hero.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${hero.name}`}" class="w-full h-full object-cover"></div>`;
    const customTitleHtml = typeof window.renderHeroCustomTitleHtml === 'function'
      ? window.renderHeroCustomTitleHtml(hero.name)
      : '';
    const unlockedCount = Object.keys(gameState?.heroBadges?.[hero.name] || {}).length;
    const totalBadges = (window.BADGE_CATALOG || []).length || 100;

    hudContainer.innerHTML = `
      <div class="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-950 p-4 rounded-2xl border border-cyan-500/30 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center space-x-3.5">
          ${avatarHtml}
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg font-black text-white">${hero.name}</h3>
              ${customTitleHtml}
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700">${hero.guild}</span>
              ${(gameState?.activeMode === 'rpg_talent' || gameState?.activeMode === 'rpg') ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${cls.bg}">${cls.badge} ${cls.name}</span>` : ''}
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-700">年齡 ${hero.age} 歲</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-600/50">🎖️ 徽章 ${unlockedCount} / ${totalBadges}</span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              預估最大心率 (220-年齡)：<span class="font-mono font-bold text-cyan-400">${hero.maxHr} bpm</span> • 累計有效鍛鍊 <span class="font-mono font-bold text-amber-400">${heroStat.validWorkouts || 0}</span> 次
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
            <span class="text-[10px] text-slate-400 block">有氧燃脂 Zone 2</span>
            <span class="text-xs font-mono font-bold text-emerald-400">${Math.round(0.60 * hero.maxHr)} ~ ${Math.round(0.75 * hero.maxHr)} bpm</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
            <span class="text-[10px] text-slate-400 block">極限無氧 Zone 5</span>
            <span class="text-xs font-mono font-bold text-rose-400">&gt; ${Math.round(0.85 * hero.maxHr)} bpm</span>
          </div>
        </div>
      </div>
    `;
  }

  // Contextual KPI Cards according to Active Expansion Mode
  const activeMode = gameState?.activeMode || "classic";
  const kpiContainer = document.getElementById('hero-kpi-cards');
  if (kpiContainer) {
    if (activeMode === "classic") {
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🏋️ 累計有效出勤</span>
          <span class="text-lg font-black font-rpg text-amber-400">${heroStat.validWorkouts || 0} 次</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⏱️ 總運動時長</span>
          <span class="text-lg font-black font-rpg text-cyan-400">${Math.round(totalDur)} 分鐘</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🔋 總燃燒熱量</span>
          <span class="text-lg font-black font-rpg text-rose-400">${Math.round(totalCal).toLocaleString()} kcal</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🦍 最高無氧落差</span>
          <span class="text-lg font-black font-rpg text-purple-400">${heroStat.maxGap || 0} bpm</span>
        </div>
      `;
    } else if (activeMode === "rpg_talent" || activeMode === "rpg") {
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⚡ RPG 戰鬥評分 (CP)</span>
          <span class="text-lg font-black font-rpg text-amber-400">${(heroStat.combatPower || heroStat.totalDamage || 0).toLocaleString()} CP</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⏱️ 總修煉時長</span>
          <span class="text-lg font-black font-rpg text-cyan-400">${Math.round(totalDur)} 分鐘</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🔥 總能量消耗</span>
          <span class="text-lg font-black font-rpg text-rose-400">${Math.round(totalCal).toLocaleString()} kcal</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">✨ 職業天賦專精</span>
          <span class="text-xs font-bold text-purple-300 block truncate mt-1">${cls.badge} ${cls.name} (${cls.passiveName})</span>
        </div>
      `;
    } else if (activeMode === "world_boss") {
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⚔️ 當前賽季對王總傷害</span>
          <span class="text-lg font-black font-rpg text-amber-400">${totalDmg.toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🔥 魔法攻擊 (TRIMP)</span>
          <span class="text-lg font-black font-rpg text-blue-400">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🗡️ 物理普攻 (Calories)</span>
          <span class="text-lg font-black font-rpg text-rose-400">${Math.round(heroStat.totalCalories || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">💥 物理狂化 (MaxGap)</span>
          <span class="text-lg font-black font-rpg text-purple-400">${heroStat.maxGap || 0}</span>
        </div>
      `;
    } else if (activeMode === "faction_war") {
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🔥 攻城總傷害</span>
          <span class="text-lg font-black font-rpg text-rose-400">${Math.round((heroStat.totalTrimp || 0) * 10 + (heroStat.scoreMaxGap ?? heroStat.maxGap ?? 0) * 100).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🛠️ 城牆總修復量</span>
          <span class="text-lg font-black font-rpg text-cyan-400">${Math.round((heroStat.totalCalories || 0) + (heroStat.scoreZone2 ?? heroStat.zone2Count ?? 0) * 5000).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🚀 無氧引擎 (TRIMP)</span>
          <span class="text-lg font-black font-rpg text-rose-300">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🟢 有氧大師 (Zone2)</span>
          <span class="text-lg font-black font-rpg text-cyan-300">${heroStat.zone2Count || 0} 次</span>
        </div>
      `;
    } else if (activeMode === "survival") {
      const svState = window.computeSurvivalState(gameState);
      const { currentHp, isDead } = window.computeSurvivalHeroHp(heroStat, svState);
      const activeDays = window.countHeroActiveDays(gameState, hero.name);
      
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] ${isDead ? 'text-red-500' : 'text-emerald-400'} block">❤️ 當前生存值</span>
          <span class="text-lg font-black font-rpg ${isDead ? 'text-slate-600' : 'text-amber-400'}">${Math.max(0, currentHp).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🍖 狩獵總熱量 (基礎HP)</span>
          <span class="text-lg font-black font-rpg text-rose-400">+${Math.round(heroStat.totalCalories || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🎒 搜刮總物資 (外加HP)</span>
          <span class="text-lg font-black font-rpg text-blue-400">+${Math.round((heroStat.totalTrimp || 0) * 1.5).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⏱️ 荒野堅持天數 (有運動的天數)</span>
          <span class="text-lg font-black font-rpg text-cyan-400">${activeDays} 天</span>
        </div>
      `;
    } else if (activeMode === "base_builder") {
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🌳 提供木材</span>
          <span class="text-lg font-black font-rpg text-emerald-400">${Math.round(heroStat.totalCalories || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⚙️ 煉製鋼鐵</span>
          <span class="text-lg font-black font-rpg text-blue-400">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🔮 魔法神石</span>
          <span class="text-lg font-black font-rpg text-purple-400">${Math.round((heroStat.scoreMaxGap ?? heroStat.maxGap ?? 0) * 10 + (heroStat.scoreZone2 ?? heroStat.zone2Count ?? 0) * 50).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⏱️ 工地總時長</span>
          <span class="text-lg font-black font-rpg text-cyan-400">${Math.round(totalDur)} 分鐘</span>
        </div>
      `;
    } else if (window.isMobileMode && window.isMobileMode(activeMode)) {
      kpiContainer.innerHTML = window.renderMobileModeKpiHtml(activeMode, hero.name);
    } else if (activeMode === "bingo") {
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">💥 心跳超載 (TRIMP)</span>
          <span class="text-lg font-black font-rpg text-blue-400">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🔥 大熱量引擎</span>
          <span class="text-lg font-black font-rpg text-rose-400">${Math.round(heroStat.totalCalories || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🟢 完美 Zone 2</span>
          <span class="text-lg font-black font-rpg text-emerald-400">${heroStat.zone2Count || 0} 次</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🦍 限界突破 (MaxGap)</span>
          <span class="text-lg font-black font-rpg text-purple-400">${heroStat.maxGap || 0}</span>
        </div>
      `;
    }
  }

  // Heart Rate Zone Distribution
  const zoneCard = document.getElementById('hero-hr-zone-card');
  if (zoneCard) {
    const totalActsCount = Math.max(1, heroActs.length);
    let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
    heroActs.forEach(a => {
      const avg = a.avgHr || 0;
      const m = hero.maxHr || 185;
      if (avg < 0.60 * m) z1++;
      else if (avg <= 0.75 * m) z2++;
      else if (avg <= 0.85 * m) z3++;
      else if (avg <= 0.90 * m) z4++;
      else z5++;
    });

    const p1 = ((z1 / totalActsCount) * 100).toFixed(1);
    const p2 = ((z2 / totalActsCount) * 100).toFixed(1);
    const p3 = ((z3 / totalActsCount) * 100).toFixed(1);
    const p4 = ((z4 / totalActsCount) * 100).toFixed(1);
    const p5 = ((z5 / totalActsCount) * 100).toFixed(1);

    zoneCard.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <span class="font-bold text-slate-200">💓 心率強度區間分佈分析</span>
        <span class="text-[11px] text-slate-400 font-mono">共 ${heroActs.length} 次運動</span>
      </div>
      <div class="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex">
        <div style="width: ${p1}%;" class="bg-slate-600" title="Zone 1 恢復: ${p1}%"></div>
        <div style="width: ${p2}%;" class="bg-emerald-500" title="Zone 2 有氧燃脂: ${p2}%"></div>
        <div style="width: ${p3}%;" class="bg-amber-500" title="Zone 3 有氧耐力: ${p3}%"></div>
        <div style="width: ${p4}%;" class="bg-orange-500" title="Zone 4 乳酸閾值: ${p4}%"></div>
        <div style="width: ${p5}%;" class="bg-rose-500" title="Zone 5 極限無氧: ${p5}%"></div>
      </div>
      <div class="grid grid-cols-5 gap-2 text-center text-[10px] pt-1">
        <div class="text-slate-400">🚶 Z1 恢復 (${p1}%)</div>
        <div class="text-emerald-400 font-bold">🟢 Z2 燃脂 (${p2}%)</div>
        <div class="text-amber-400">🟡 Z3 耐力 (${p3}%)</div>
        <div class="text-orange-400">🟠 Z4 閾值 (${p4}%)</div>
        <div class="text-rose-400 font-bold">🔴 Z5 極限 (${p5}%)</div>
      </div>
    `;
  }

  renderHeroHealthCard(hero.name);
  renderHeroBadgesWall(hero.name);
  filterViewerActivities();
}

/**
 * 📱 手機同步 App 健康數據卡 (預備功能)：只有在該英雄有每日健康數據時才顯示
 */
function renderHeroHealthCard(heroName) {
  const wallCard = document.getElementById('hero-badges-wall-card');
  let card = document.getElementById('hero-health-card');
  const summary = typeof window.getHeroHealthSummary === 'function' ? window.getHeroHealthSummary(gameState, heroName, 7) : null;
  if (!summary) {
    if (card) card.remove();
    return;
  }
  if (!card && wallCard && wallCard.parentNode) {
    card = document.createElement('div');
    card.id = 'hero-health-card';
    card.className = 'bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg';
    wallCard.parentNode.insertBefore(card, wallCard);
  }
  if (!card) return;
  const fmt = (v, digits = 0) => (v === null || v === undefined) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
  const sleepTxt = summary.avgSleepMin ? `${Math.floor(summary.avgSleepMin / 60)}h ${Math.round(summary.avgSleepMin % 60)}m` : '—';
  card.innerHTML = `
    <div class="flex items-center justify-between text-xs">
      <span class="font-bold text-slate-200">📱 近 7 天身體狀態 (手機同步)</span>
      <span class="text-[11px] text-slate-400 font-mono">最後更新 ${escapeHtml(String(summary.lastDate || ''))}</span>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">👣 平均步數</span><span class="font-rpg font-bold text-amber-400">${fmt(summary.avgSteps)}</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">😴 平均睡眠</span><span class="font-rpg font-bold text-cyan-400">${sleepTxt}</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">💓 靜止心率</span><span class="font-rpg font-bold text-rose-400">${fmt(summary.avgRestingHr)} bpm</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">⚡ 活動分鐘</span><span class="font-rpg font-bold text-emerald-400">${fmt(summary.avgActiveMin)} 分</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-1" title="僅部分品牌提供，僅供參考、不計分"><span class="text-[10px] text-slate-400 block">🌿 HRV (參考)</span><span class="font-rpg font-bold text-amber-300">${fmt(summary.avgHrv, 1)} ms</span></div>
    </div>`;
}

let activeBadgeCategoryFilter = 'ALL';
let inspectedBadgeId = null;

function setBadgeCategoryFilter(cat) {
  activeBadgeCategoryFilter = cat || 'ALL';
  renderHeroBadgesWall(selectedViewerHero);
}

function buildBadgeInspectorHtml(heroName, badgeId) {
  const catalog = window.BADGE_CATALOG || [];
  const unlockedMap = gameState?.heroBadges?.[heroName] || {};
  const rarityMeta = window.BADGE_RARITY_META || {};

  let targetBadge = catalog.find(b => b.id === badgeId);
  if (!targetBadge) {
    // Default to first unlocked badge of this hero, or first badge in catalog
    targetBadge = catalog.find(b => unlockedMap[b.id]) || catalog[0];
  }
  if (!targetBadge) return '';

  const unlocked = unlockedMap[targetBadge.id];
  const rMeta = rarityMeta[targetBadge.rarity] || rarityMeta.common || { label: '普通', color: 'text-slate-200', border: 'border-slate-600', bg: 'bg-slate-900/90' };
  const numStr = `#${String(targetBadge.num).padStart(3, '0')}`;

  if (unlocked) {
    return `
      <div class="bg-slate-950/90 border ${rMeta.border} rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-md">
        <div class="flex items-start sm:items-center space-x-3">
          <div class="w-11 h-11 rounded-xl ${rMeta.bg} border ${rMeta.border} flex items-center justify-center text-2xl flex-shrink-0">
            ${targetBadge.icon}
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs sm:text-sm font-black text-white">${targetBadge.name}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border ${rMeta.border} ${rMeta.color}">${rMeta.label} ${numStr}</span>
              <span class="text-[10px] font-bold text-slate-400">• ${targetBadge.cat}</span>
            </div>
            <p class="text-[11px] text-slate-200 mt-1"><strong class="text-amber-400">📜 取得條件：</strong>${targetBadge.desc}</p>
          </div>
        </div>
        <div class="flex flex-wrap sm:flex-col sm:items-end justify-between gap-1 text-[11px] border-t sm:border-t-0 border-slate-800/80 pt-1.5 sm:pt-0 flex-shrink-0">
          <span class="text-slate-300"><strong class="text-cyan-400">📅 何時取得：</strong><span class="font-mono font-bold text-white">${unlocked.unlockedAt}</span></span>
          <span class="text-slate-400 truncate max-w-[240px]"><strong class="text-emerald-400">🏃 達成紀錄：</strong>${escapeHtml(unlocked.actTitle || '榮譽解鎖')}</span>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl text-slate-500 flex-shrink-0">
            🔒
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-bold text-slate-300">神秘未解鎖徽章</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">${numStr} • ${targetBadge.cat}</span>
            </div>
            <p class="text-[11px] text-slate-400 mt-0.5"><strong class="text-amber-400/80">📜 取得條件：</strong>？？？ (尚未達成，保持運動探索或點選上方其他英雄偷看已解鎖線索！)</p>
          </div>
        </div>
        <span class="text-[10px] font-mono text-slate-500 flex-shrink-0">📅 尚未解鎖</span>
      </div>
    `;
  }
}

function inspectBadgeOnWall(heroName, badgeId) {
  inspectedBadgeId = badgeId;
  const inspectorEl = document.getElementById('badge-mobile-inspector');
  if (inspectorEl) {
    inspectorEl.innerHTML = buildBadgeInspectorHtml(heroName, badgeId);
  }
  document.querySelectorAll('.badge-slot-item[data-badge-id]').forEach(el => {
    if (el.getAttribute('data-badge-id') === badgeId) {
      el.classList.add('ring-2', 'ring-amber-400');
    } else {
      el.classList.remove('ring-2', 'ring-amber-400');
    }
  });
}

/**
 * 渲染冒險者戰情室 100 格永久榮譽徽章牆 (支援擴充至 500 格 + 前台迷霧探索模式 + 手機點按檢視面板)
 * - 已解鎖徽章：完整顯示圖示、名稱、稀有度光暈，Hover 或手機點擊立即顯示「何時取得」與「取得條件」
 * - 未解鎖徽章：隱藏名稱與取得條件（顯示 🔒 神秘未解鎖徽章），鼓勵玩家透過觀看其他英雄的徽章牆探索蒐集條件！
 */
function renderHeroBadgesWall(heroName) {
  const wallCard = document.getElementById('hero-badges-wall-card');
  if (!wallCard) return;

  const catalog = window.BADGE_CATALOG || [];
  if (catalog.length === 0) {
    wallCard.innerHTML = '';
    return;
  }

  if (!gameState?.heroBadges && typeof window.evaluateAllHeroesBadges === 'function') {
    window.evaluateAllHeroesBadges(gameState);
  }

  const unlockedMap = gameState?.heroBadges?.[heroName] || {};
  const unlockedCount = Object.keys(unlockedMap).length;
  const totalCount = catalog.length;
  const pct = totalCount > 0 ? ((unlockedCount / totalCount) * 100).toFixed(1) : '0.0';

  const categories = ['ALL', ...Array.from(new Set(catalog.map(b => b.cat)))];
  const filteredBadges = activeBadgeCategoryFilter === 'ALL'
    ? catalog
    : catalog.filter(b => b.cat === activeBadgeCategoryFilter);

  const rarityMeta = window.BADGE_RARITY_META || {};
  const badgeStartYMD = (typeof window.normalizeDateYMD === 'function' && gameState?.gmOps?.badgeStartDate)
    ? window.normalizeDateYMD(gameState.gmOps.badgeStartDate)
    : (gameState?.gmOps?.badgeStartDate || '');

  const defaultInspected = (inspectedBadgeId && filteredBadges.some(b => b.id === inspectedBadgeId))
    ? inspectedBadgeId
    : ((filteredBadges.find(b => unlockedMap[b.id]) || filteredBadges[0])?.id || null);

  wallCard.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
      <div class="flex items-center space-x-2.5">
        <div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg shadow flex-shrink-0">
          🎖️
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h4 class="text-sm font-black text-white tracking-wide">${heroName} 的永久榮譽徽章展櫃</h4>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              已解鎖 ${unlockedCount} / ${totalCount} 枚 (${pct}%)
            </span>
            ${badgeStartYMD ? `
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700" title="GM 已設定徽章累計起始時間，僅採計該日(含)以後之運動紀錄">
                ⏰ 起算日：${badgeStartYMD} 起
              </span>
            ` : ''}
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">
            💡 點擊或滑鼠移至徽章即可查看「<strong class="text-cyan-300">何時取得</strong>」與「<strong class="text-amber-300">取得條件</strong>」。未解鎖徽章處於迷霧狀態，快去切換觀看其他英雄的徽章牆尋找線索吧！
          </p>
        </div>
      </div>

      <!-- 進度條 -->
      <div class="w-full sm:w-48">
        <div class="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
          <span>蒐集完成度</span>
          <span class="text-amber-400 font-bold">${unlockedCount} / ${totalCount}</span>
        </div>
        <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-cyan-400 transition-all duration-500" style="width: ${Math.min(100, parseFloat(pct))}%"></div>
        </div>
      </div>
    </div>

    <!-- 分類篩選器 -->
    <div class="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px]">
      ${categories.map(cat => {
        const isAct = activeBadgeCategoryFilter === cat;
        const catTotal = cat === 'ALL' ? catalog.length : catalog.filter(b => b.cat === cat).length;
        const catUnlocked = cat === 'ALL'
          ? unlockedCount
          : catalog.filter(b => b.cat === cat && unlockedMap[b.id]).length;
        return `
          <button onclick="setBadgeCategoryFilter(${jsArg(cat)})" class="px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition border ${
            isAct
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
              : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
          }">
            ${cat === 'ALL' ? '🌟 全部徽章' : cat} <span class="font-mono text-[10px] ${isAct ? 'text-slate-900' : 'text-slate-500'}">(${catUnlocked}/${catTotal})</span>
          </button>
        `;
      }).join('')}
    </div>

    <!-- 手機與電腦通用：點擊徽章即時詳情檢視列 (避免手機懸浮框被裁切) -->
    <div id="badge-mobile-inspector">
      ${buildBadgeInspectorHtml(heroName, defaultInspected)}
    </div>

    <!-- 100 格徽章網格 (手機 4 欄不截斷四字成語、平板 6~8 欄、桌機 10 欄，支援未來無縫擴充至 500 格) -->
    <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 pt-1 max-h-[380px] overflow-y-auto lg:max-h-none lg:overflow-visible pr-1">
      ${filteredBadges.map(b => {
        const unlocked = unlockedMap[b.id];
        const rMeta = rarityMeta[b.rarity] || rarityMeta.common || { label: '普通', color: 'text-slate-200', border: 'border-slate-600', bg: 'bg-slate-900/90', glow: '' };
        const numStr = `#${String(b.num).padStart(3, '0')}`;
        const isSelected = b.id === defaultInspected;

        if (unlocked) {
          return `
            <div tabindex="0" data-badge-id="${b.id}" onclick="inspectBadgeOnWall(${jsArg(heroName)}, ${jsArg(b.id)})" class="badge-slot-item relative group flex flex-col items-center justify-center px-1.5 py-2 rounded-xl border ${rMeta.border} ${rMeta.bg} ${rMeta.glow} ${isSelected ? 'ring-2 ring-amber-400' : ''} cursor-pointer select-none">
              <span class="absolute top-1 left-1.5 text-[8px] font-mono text-slate-400">${numStr}</span>
              <span class="text-xl sm:text-2xl my-1 transform group-hover:scale-110 transition">${b.icon}</span>
              <span class="text-[10px] sm:text-[11px] font-bold ${rMeta.color} w-full text-center leading-tight break-words">${b.name}</span>

              <!-- 懸浮提示框 (桌機 Hover 顯示何時取得 & 取得條件) -->
              <div class="badge-tooltip-box hidden sm:block">
                <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
                  <span class="font-black text-white">${b.icon} ${b.name}</span>
                  <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border ${rMeta.border} ${rMeta.color}">${rMeta.label} ${numStr}</span>
                </div>
                <div class="space-y-1 text-[10px]">
                  <p class="text-slate-300"><strong class="text-amber-400">📜 取得條件：</strong>${b.desc}</p>
                  <p class="text-slate-300"><strong class="text-cyan-400">📅 何時取得：</strong><span class="font-mono">${unlocked.unlockedAt}</span></p>
                  <p class="text-slate-400 truncate"><strong class="text-emerald-400">🏃 達成紀錄：</strong>${escapeHtml(unlocked.actTitle || '榮譽解鎖')}</p>
                </div>
              </div>
            </div>
          `;
        } else {
          return `
            <div tabindex="0" data-badge-id="${b.id}" onclick="inspectBadgeOnWall(${jsArg(heroName)}, ${jsArg(b.id)})" class="badge-slot-item badge-slot-locked relative group flex flex-col items-center justify-center px-1.5 py-2 rounded-xl border border-slate-800/80 bg-slate-950/70 ${isSelected ? 'ring-2 ring-amber-400' : ''} cursor-pointer select-none">
              <span class="absolute top-1 left-1.5 text-[8px] font-mono text-slate-600">${numStr}</span>
              <span class="text-lg sm:text-xl my-1 text-slate-600">🔒</span>
              <span class="text-[10px] font-mono text-slate-600 whitespace-nowrap text-center leading-tight">？？？</span>

              <!-- 未解鎖神秘提示框 (不劇透未蒐集條件) -->
              <div class="badge-tooltip-box hidden sm:block">
                <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
                  <span class="font-bold text-slate-400">🔒 神秘未解鎖徽章</span>
                  <span class="text-[9px] font-mono text-slate-500">${numStr} • ${b.cat}</span>
                </div>
                <div class="space-y-1 text-[10px]">
                  <p class="text-slate-400"><strong class="text-amber-400/80">📜 取得條件：</strong>？？？ (尚未達成，保持運動探索或點選其他冒險者偷看線索！)</p>
                  <p class="text-slate-500"><strong class="text-slate-400">📅 何時取得：</strong>尚未解鎖</p>
                </div>
              </div>
            </div>
          `;
        }
      }).join('')}
    </div>
  `;
}

function filterViewerActivities() {
  const tbody = document.getElementById('viewer-activities-tbody');
  const mobileList = document.getElementById('viewer-activities-mobile-list');
  const countLabel = document.getElementById('viewer-record-count');
  if (!tbody) return;

  const heroActs = (gameState?.activities || []).filter(a => a.hero === selectedViewerHero);
  const query = (document.getElementById('viewer-search-input')?.value || '').toLowerCase().trim();
  const sportFilter = document.getElementById('viewer-sport-filter')?.value || '';

  let filtered = heroActs.filter(a => {
    if (sportFilter && a.type !== sportFilter) return false;
    if (query) {
      const matchTitle = (a.title || a.name || '').toLowerCase().includes(query);
      const matchId = String(a.id || '').toLowerCase().includes(query);
      if (!matchTitle && !matchId) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let va = a[viewerSortCol];
    let vb = b[viewerSortCol];
    if (viewerSortCol === 'id') {
      // Strava ID 為數字字串，需轉數字比較；手動補登 ID 排在最後
      va = /^\d+$/.test(String(a.id)) ? Number(a.id) : -1;
      vb = /^\d+$/.test(String(b.id)) ? Number(b.id) : -1;
    }
    if (viewerSortCol === 'date') {
      va = parseActivityDate(a.date || a.time)?.getTime() || 0;
      vb = parseActivityDate(b.date || b.time)?.getTime() || 0;
    }
    if (va < vb) return viewerSortAsc ? -1 : 1;
    if (va > vb) return viewerSortAsc ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = '';
  if (mobileList) mobileList.innerHTML = '';
  if (countLabel) countLabel.innerText = `共 ${filtered.length} 筆歷程`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-slate-500">查無符合條件的運動紀錄</td></tr>`;
    if (mobileList) {
      mobileList.innerHTML = `<div class="p-6 text-center text-slate-500 text-xs">查無符合條件的運動紀錄</div>`;
    }
    return;
  }

  const activeMode = gameState?.activeMode || "classic";
  const thScoreCol = document.getElementById("th-viewer-score-col");
  if (thScoreCol) {
    if (activeMode === "classic") thScoreCol.innerText = "🔥 燃脂熱量";
    else if (activeMode === "rpg_talent" || activeMode === "rpg") thScoreCol.innerText = "⚡ 獲得戰力 (CP)";
    else if (activeMode === "faction_war") thScoreCol.innerText = "🔥 攻城(DPS)";
    else if (activeMode === "survival") thScoreCol.innerText = "❤️ 獲取生存值";
    else if (activeMode === "base_builder") thScoreCol.innerText = "🪵 煉製建材";
    else if (window.isMobileMode && window.isMobileMode(activeMode)) thScoreCol.innerText = `${window.MOBILE_MODE_META[activeMode].icon} 資料片貢獻`;
    else if (activeMode === "bingo") thScoreCol.innerText = "🧩 衝力指標";
    else thScoreCol.innerText = "⚔️ 造成傷害";
  }

  filtered.forEach(a => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-900/60 transition ${a.isExcluded ? 'opacity-40 line-through bg-rose-950/20' : ((a.isSuspectedDuplicate && !a.duplicateIncluded) ? 'opacity-60' : '')}`;

    const isNumericStrava = /^\d+$/.test(String(a.id));
    const sourceBadge = isNumericStrava 
      ? `<a href="https://www.strava.com/activities/${a.id}" target="_blank" class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30 transition"><span>#${a.id}</span> ↗</a>`
      : (a.source === 'apple_health' || a.source === 'health_connect')
        ? (() => { const m = window.getActivitySourceMeta(a); return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-600" title="${escapeHtml(m.label)}">${m.icon} ${escapeHtml(m.brand || m.label)}</span>`; })()
        : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">手動補登</span>`;

    const bonusTag = (a.eventBonusPct > 0 && a.isValidAttack && !a.isExcluded)
      ? `<span class="ml-1 inline-flex items-center px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[9px] font-bold" title="${a.eventBonusLabel || '限時活動加成'}">+${a.eventBonusPct}%</span>`
      : '';

    let scoreColHtml = "";
    const isDupNotCounted = a.isSuspectedDuplicate && !a.duplicateIncluded;
    if (a.isExcluded) {
      scoreColHtml = `<span class="text-rose-400 font-bold">GM作廢</span>`;
    } else if (isDupNotCounted) {
      scoreColHtml = `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300 text-[10px] font-bold whitespace-nowrap" title="與紀錄 #${escapeHtml(a.duplicateOf || '')} 的運動時間重疊，系統判定為多來源重複上傳；GM 可於後台勾選納入計算">⚠️ 疑似重複(不計分)</span>`;
    } else if (!a.isValidAttack) {
      scoreColHtml = `<span class="text-slate-500">${a.inSeason ? `未滿${gameState?.summary?.minDurationMinutes || 30}分` : "非本賽季"}</span>`;
    } else {
      if (activeMode === "classic") {
        scoreColHtml = `<span class="text-amber-400 font-bold">${Math.round(a.calories || 0)} kcal</span>${bonusTag}`;
      } else if (activeMode === "rpg_talent" || activeMode === "rpg") {
        scoreColHtml = `<span class="text-purple-400 font-bold">${Math.round(a.combatPower || a.damage || 0).toLocaleString()} CP</span>${bonusTag}`;
      } else if (activeMode === "faction_war") {
        scoreColHtml = `<span class="text-rose-400 font-bold">🔥 ${Math.round((a.trimp || 0)*10 + (a.gapScore ?? a.gapVal ?? 0)*100).toLocaleString()}</span>${bonusTag}`;
      } else if (activeMode === "survival") {
        scoreColHtml = `<span class="text-emerald-400 font-bold">❤️ +${Math.round((a.calories || 0) + (a.trimp || 0)*1.5).toLocaleString()}</span>${bonusTag}`;
      } else if (activeMode === "base_builder") {
        scoreColHtml = `<span class="text-emerald-400 font-bold">🪵 ${Math.round(a.calories || 0).toLocaleString()}</span>${bonusTag}`;
      } else if (window.isMobileMode && window.isMobileMode(activeMode)) {
        scoreColHtml = `<span class="text-amber-400 font-bold">${window.getMobileModeActivityLabel(activeMode, a)}</span>${bonusTag}`;
      } else if (activeMode === "bingo") {
        scoreColHtml = `<span class="text-blue-400 font-bold">🧩 ${Math.round(a.trimp || 0).toLocaleString()}</span>${bonusTag}`;
      } else {
        scoreColHtml = `<span class="text-amber-400 font-bold">⚔️ ${(a.damage || 0).toLocaleString()}</span>${bonusTag}`;
      }
    }

    tr.innerHTML = `
      <td class="p-3">${sourceBadge}</td>
      <td class="p-3 font-mono text-slate-400">${a.date || a.time}</td>
      <td class="p-3">${renderHeroTag(a.hero, "bg-transparent border-0 p-0 hover:bg-transparent font-bold hover:text-cyan-400")}</td>
      <td class="p-3"><span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">${a.guild}</span></td>
      <td class="p-3 font-mono">${a.duration}分</td>
      <td class="p-3 font-mono text-amber-300">${a.avgHr}</td>
      <td class="p-3 font-mono text-rose-400">${a.maxHr}</td>
      <td class="p-3 font-mono" title="原始生理熱量: ${Math.round(a.rawCalories ?? a.calories)} kcal">${Math.round(a.rawCalories ?? a.calories)}</td>
      <td class="p-3 font-mono text-purple-300">${a.gap}</td>
      <td class="p-3 font-mono text-emerald-300">${a.trimp}</td>
      <td class="p-3"><span class="text-[10px]">${a.zoneLabel || '🟢 有氧燃脂'}</span></td>
      <td class="p-3 font-mono">${scoreColHtml}</td>
    `;

    tbody.appendChild(tr);

    if (mobileList) {
      const card = document.createElement('div');
      card.className = `p-3.5 space-y-2.5 bg-slate-950/40 ${a.isExcluded ? 'opacity-40 line-through bg-rose-950/20' : ((a.isSuspectedDuplicate && !a.duplicateIncluded) ? 'opacity-60' : '')}`;
      card.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
            <span class="font-mono text-xs font-bold text-slate-300 whitespace-nowrap">${a.date || a.time}</span>
            ${sourceBadge}
          </div>
          <div class="flex items-center space-x-1.5 flex-shrink-0">
            <span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">${a.guild}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">${a.zoneLabel || '🟢 有氧燃脂'}</span>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center space-x-2">
            ${renderHeroTag(a.hero, "bg-transparent border-0 p-0 hover:bg-transparent font-bold text-white")}
            <span class="text-xs font-mono font-bold text-cyan-400">⏱️ ${a.duration} 分鐘</span>
          </div>
          <div class="text-xs font-mono font-black">
            ${scoreColHtml}
          </div>
        </div>

        <div class="grid grid-cols-4 gap-1.5 pt-1 text-center">
          <div class="bg-slate-900/90 border border-slate-800/80 rounded-lg py-1 px-1.5">
            <span class="text-[9px] text-slate-500 block">均心率</span>
            <span class="text-[11px] font-mono font-bold text-amber-300">${a.avgHr}</span>
          </div>
          <div class="bg-slate-900/90 border border-slate-800/80 rounded-lg py-1 px-1.5">
            <span class="text-[9px] text-slate-500 block">峰心率</span>
            <span class="text-[11px] font-mono font-bold text-rose-400">${a.maxHr}</span>
          </div>
          <div class="bg-slate-900/90 border border-slate-800/80 rounded-lg py-1 px-1.5">
            <span class="text-[9px] text-slate-500 block">原始熱量</span>
            <span class="text-[11px] font-mono font-bold text-slate-200">${Math.round(a.rawCalories ?? a.calories)}</span>
          </div>
          <div class="bg-slate-900/90 border border-slate-800/80 rounded-lg py-1 px-1.5">
            <span class="text-[9px] text-slate-500 block">衝力/落差</span>
            <span class="text-[11px] font-mono font-bold text-emerald-300">${a.trimp}/${a.gap}</span>
          </div>
        </div>
      `;
      mobileList.appendChild(card);
    }
  });
}

function sortViewerTable(col) {
  if (viewerSortCol === col) viewerSortAsc = !viewerSortAsc;
  else { viewerSortCol = col; viewerSortAsc = false; }
  filterViewerActivities();
}

// -------------------------------------------------------------
// INTERACTIVE HERO DETAIL MODAL (彈出式個人英雄戰力卡)
// -------------------------------------------------------------

function openHeroDetailModal(heroName) {
  const modal = document.getElementById('modal-hero-profile');
  const title = document.getElementById('modal-hero-profile-title');
  const content = document.getElementById('modal-hero-profile-content');
  if (!modal || !content || !heroName) return;

  const cleanName = String(heroName).trim();
  const hero = gameState?.heroes?.find(h => (h.name || "").trim() === cleanName) || {
    name: cleanName,
    guild: (gameState?.activities || []).find(a => (a.hero || "").trim() === cleanName)?.guild || "自由英雄",
    age: 35,
    maxHr: 185,
    rpgClass: "狂戰士"
  };
  const heroStat = (heroStatsList || []).find(h => (h.name || "").trim() === cleanName) || {};
  const heroActs = (gameState?.activities || []).filter(a => (a.hero || "").trim() === cleanName);
  const cls = RPG_CLASSES[hero.rpgClass || "狂戰士"] || RPG_CLASSES["狂戰士"];

  const seasonStartStr = gameState?.seasonStart || gameState?.boss?.seasonStart || "2026/08/12";
  const seasonEndStr = gameState?.seasonEnd || gameState?.boss?.seasonEnd || "2026/08/31";
  const startD = parseActivityDate(seasonStartStr);
  const endD = parseActivityDate(seasonEndStr);
  if (endD) endD.setHours(23, 59, 59, 999);

  const inSeasonActs = heroActs.filter(a => {
    if (a.isExcluded || a.isValidAttack === false) return false;
    const aDate = parseActivityDate(a.date || a.time);
    if (aDate && startD && endD) {
      return aDate >= startD && aDate <= endD;
    }
    return a.inSeason !== false;
  });

  const totalDmg = heroStat.totalDamage || 0;
  const totalDur = inSeasonActs.reduce((acc, a) => acc + (a.duration || 0), 0);
  const totalCal = inSeasonActs.reduce((acc, a) => acc + (a.calories || 0), 0);

  const modalAvatarHtml = typeof window.renderHeroAvatarHtml === 'function'
    ? window.renderHeroAvatarHtml(hero, 'w-14 h-14', 'rounded-xl')
    : `<div class="w-14 h-14 rounded-lg bg-slate-800 overflow-hidden border-2 border-slate-700 flex-shrink-0 relative"><img src="${hero.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${hero.name}`}" class="w-full h-full object-cover"></div>`;
  const modalCustomTitle = typeof window.renderHeroCustomTitleHtml === 'function'
    ? window.renderHeroCustomTitleHtml(hero.name)
    : '';

  title.innerHTML = `
    <div class="flex items-center space-x-3 w-full">
      ${modalAvatarHtml}
      <div class="flex-grow">
        <div class="flex flex-wrap items-center justify-between w-full gap-2">
           <div class="flex items-center flex-wrap gap-1.5">
               <span class="font-bold text-white tracking-wide text-lg">${hero.name}</span>
               ${modalCustomTitle}
               <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px]">${hero.guild}</span>
               ${(gameState?.activeMode === 'rpg_talent' || gameState?.activeMode === 'rpg' || (currentMainTab === 'chronicles' && getAllSnapshots().find(s => s.id === selectedChronicle)?.type === 'rpg')) ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${cls.bg} ml-1">${cls.badge} ${cls.name}</span>` : ''}
           </div>
           
           <!-- 明確的上傳按鈕 -->
           <label class="cursor-pointer flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-lg transition shadow-lg text-emerald-400">
              <i data-lucide="image-plus" class="w-4 h-4"></i>
              <span class="text-xs font-bold whitespace-nowrap">上傳大頭貼</span>
              <input type="file" accept="image/jpeg, image/png, image/webp" class="hidden" onchange="handleAvatarUpload(${jsArg(hero.name)}, this)" />
           </label>
        </div>
      </div>
    </div>
  `;

  const activeMode = gameState?.activeMode || "classic";
  let modalCardsHtml = "";
  if (activeMode === "classic") {
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">有效出勤</span>
        <span class="font-rpg font-bold text-amber-400 text-sm">${heroStat.validWorkouts || 0} 次</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">累計時長</span>
        <span class="font-rpg font-bold text-cyan-400 text-sm">${Math.round(totalDur)} 分</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">總熱量</span>
        <span class="font-rpg font-bold text-rose-400 text-sm">${Math.round(totalCal).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">最高落差</span>
        <span class="font-rpg font-bold text-purple-400 text-sm">${heroStat.maxGap || 0}</span>
      </div>
    `;
  } else if (activeMode === "rpg_talent" || activeMode === "rpg") {
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">RPG 總戰力</span>
        <span class="font-rpg font-bold text-purple-400 text-sm">${(heroStat.combatPower || heroStat.totalDamage || 0).toLocaleString()} CP</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">累計時長</span>
        <span class="font-rpg font-bold text-cyan-400 text-sm">${Math.round(totalDur)} 分</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">總能量</span>
        <span class="font-rpg font-bold text-rose-400 text-sm">${Math.round(totalCal).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">天賦專精</span>
        <span class="font-bold text-amber-400 text-xs block truncate mt-1">${cls.badge} ${cls.name}</span>
      </div>
    `;
  } else if (activeMode === "world_boss") {
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">對王總傷害</span>
        <span class="font-rpg font-bold text-amber-400 text-sm">${Math.round(totalDmg).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">累計時長</span>
        <span class="font-rpg font-bold text-cyan-400 text-sm">${Math.round(totalDur)} 分</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">魔法攻擊 (TRIMP)</span>
        <span class="font-rpg font-bold text-blue-400 text-sm">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">物理狂化 (MaxGap)</span>
        <span class="font-rpg font-bold text-purple-400 text-sm">${heroStat.maxGap || 0}</span>
      </div>
    `;
  } else if (activeMode === "faction_war") {
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">攻城傷害</span>
        <span class="font-rpg font-bold text-rose-400 text-sm">${Math.round((heroStat.totalTrimp || 0) * 10 + (heroStat.scoreMaxGap ?? heroStat.maxGap ?? 0) * 100).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">修復量</span>
        <span class="font-rpg font-bold text-cyan-400 text-sm">${Math.round((heroStat.totalCalories || 0) + (heroStat.scoreZone2 ?? heroStat.zone2Count ?? 0) * 5000).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">無氧 (TRIMP)</span>
        <span class="font-rpg font-bold text-rose-300 text-sm">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">有氧 (Zone2)</span>
        <span class="font-rpg font-bold text-cyan-300 text-sm">${heroStat.zone2Count || 0} 次</span>
      </div>
    `;
  } else if (activeMode === "survival") {
    const svState = window.computeSurvivalState(gameState);
    const { currentHp, isDead } = window.computeSurvivalHeroHp(heroStat, svState);
    const activeDays = window.countHeroActiveDays(gameState, cleanName);
    
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] ${isDead ? 'text-red-500' : 'text-emerald-400'} block">當前生存值</span>
        <span class="font-rpg font-bold ${isDead ? 'text-slate-600' : 'text-amber-400'} text-sm">${Math.max(0, currentHp).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">狩獵熱量 (HP)</span>
        <span class="font-rpg font-bold text-rose-400 text-sm">+${Math.round(heroStat.totalCalories || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">搜刮物資 (TRIMP)</span>
        <span class="font-rpg font-bold text-blue-400 text-sm">+${Math.round((heroStat.totalTrimp || 0) * 1.5).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">有運動的天數</span>
        <span class="font-rpg font-bold text-cyan-400 text-sm">${activeDays} 荒野日</span>
      </div>
    `;
  } else if (activeMode === "base_builder") {
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">提供木材</span>
        <span class="font-rpg font-bold text-emerald-400 text-sm">${Math.round(heroStat.totalCalories || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">煉製鋼鐵</span>
        <span class="font-rpg font-bold text-blue-400 text-sm">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">魔法神石</span>
        <span class="font-rpg font-bold text-purple-400 text-sm">${Math.round((heroStat.scoreMaxGap ?? heroStat.maxGap ?? 0) * 10 + (heroStat.scoreZone2 ?? heroStat.zone2Count ?? 0) * 50).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">累計時長</span>
        <span class="font-rpg font-bold text-cyan-400 text-sm">${Math.round(totalDur)} 分</span>
      </div>
    `;
  } else if (window.isMobileMode && window.isMobileMode(activeMode)) {
    modalCardsHtml = window.renderMobileModeKpiHtml(activeMode, cleanName).replace(/p-3\.5 rounded-2xl/g, 'p-3 rounded-xl text-center').replace(/text-lg font-black/g, 'text-sm font-bold');
  } else if (activeMode === "bingo") {
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">MVP 貢獻點數</span>
        <span class="font-rpg font-bold text-amber-400 text-sm">${Math.round((heroStat.totalCalories || 0) + (heroStat.totalTrimp || 0) * 10 + (heroStat.scoreMaxGap ?? heroStat.maxGap ?? 0) * 50 + (heroStat.scoreZone2 ?? heroStat.zone2Count ?? 0) * 1000).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">大熱量引擎</span>
        <span class="font-rpg font-bold text-rose-400 text-sm">${Math.round(heroStat.totalCalories || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">心跳超載 (TRIMP)</span>
        <span class="font-rpg font-bold text-blue-400 text-sm">${Math.round(heroStat.totalTrimp || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">完美 Zone 2</span>
        <span class="font-rpg font-bold text-emerald-400 text-sm">${heroStat.zone2Count || 0} 次</span>
      </div>
    `;
  }

  // Build unlocked badges mini-showcase inside Hero Detail Modal
  const catalog = window.BADGE_CATALOG || [];
  const rarityMeta = window.BADGE_RARITY_META || {};
  const unlockedMap = gameState?.heroBadges?.[hero.name] || {};
  const unlockedBadgesList = catalog.filter(b => unlockedMap[b.id]);

  const modalBadgesHtml = `
    <div class="bg-slate-950/90 p-3 rounded-2xl border border-amber-500/30 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
        <span class="font-bold text-amber-300 text-xs flex items-center space-x-1.5">
          <span>🎖️ 已解鎖榮譽徽章 (${unlockedBadgesList.length} / ${catalog.length || 100})</span>
        </span>
        <button onclick="jumpToHeroBadgesWall(${jsArg(hero.name)})" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/50 border border-cyan-800/60 px-2 py-0.5 rounded-lg transition">
          前往戰情室 100 格徽章牆 ➔
        </button>
      </div>
      ${unlockedBadgesList.length === 0 ? `
        <p class="text-[11px] text-slate-500 py-2 text-center">尚未解鎖任何榮譽徽章</p>
      ` : `
        <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto py-1">
          ${unlockedBadgesList.map(b => {
            const u = unlockedMap[b.id];
            const rMeta = rarityMeta[b.rarity] || rarityMeta.common || { color: 'text-slate-200', border: 'border-slate-700', bg: 'bg-slate-900' };
            return `
              <div class="inline-flex items-center space-x-1 px-2 py-1 rounded-lg border ${rMeta.border} ${rMeta.bg} text-[10px] cursor-help" title="【${b.name}】&#10;📜 取得條件：${b.desc}&#10;📅 何時取得：${u.unlockedAt}&#10;🏃 達成紀錄：${escapeHtml(u.actTitle || '')}">
                <span>${b.icon}</span>
                <span class="font-bold ${rMeta.color}">${b.name}</span>
              </div>
            `;
          }).join('')}
        </div>
        <p class="text-[10px] text-slate-500">💡 滑鼠移至徽章上方可偷看該徽章的「取得條件」與「何時取得」</p>
      `}
    </div>
  `;

  content.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
      ${modalCardsHtml}
    </div>

    ${modalBadgesHtml}

    <div class="space-y-2">
      <div class="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
        <span class="font-bold text-slate-200">🏃 近期運動歷程 (共 ${heroActs.length} 筆)</span>
      </div>
      <div class="max-h-52 overflow-y-auto space-y-1.5 pr-1 text-xs">
        ${heroActs.slice(0, 10).map(a => {
          const isNumericStrava = /^\d+$/.test(String(a.id));
          const idLink = isNumericStrava 
            ? `<a href="https://www.strava.com/activities/${a.id}" target="_blank" class="text-[10px] text-orange-400 hover:underline">#${a.id} ↗</a>`
            : `<span class="text-[10px] text-amber-400">手動</span>`;
          const bonusPill = (a.eventBonusPct > 0 && a.isValidAttack && !a.isExcluded)
            ? `<span class="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold" title="${a.eventBonusLabel || '活動加成'}">⚡+${a.eventBonusPct}%</span>`
            : '';
          
          let actScoreTag = "";
          if (activeMode === "classic") {
            actScoreTag = `<span class="font-mono font-bold text-amber-400 text-xs">${Math.round(a.calories || 0)} kcal</span>`;
          } else if (activeMode === "rpg_talent" || activeMode === "rpg") {
            actScoreTag = `<span class="font-mono font-bold text-purple-400 text-xs">⚡ ${Math.round(a.combatPower || a.damage || 0).toLocaleString()} CP</span>`;
          } else if (activeMode === "world_boss" || activeMode === "boss") {
            actScoreTag = `<span class="font-rpg font-bold text-amber-400 text-xs">⚔️ ${(a.damage || 0).toLocaleString()}</span>`;
          } else if (activeMode === "faction_war") {
            actScoreTag = `<span class="font-rpg font-bold text-rose-400 text-xs">🔥 攻 ${Math.round((a.trimp || 0)*10 + (a.gapScore ?? a.gapVal ?? 0)*100).toLocaleString()}</span>`;
          } else if (activeMode === "survival") {
            actScoreTag = `<span class="font-rpg font-bold text-emerald-400 text-xs">❤️ +${Math.round((a.calories || 0) + (a.trimp || 0)*1.5).toLocaleString()}</span>`;
          } else if (activeMode === "base_builder") {
            actScoreTag = `<span class="font-rpg font-bold text-emerald-400 text-xs">🪵 ${Math.round(a.calories || 0).toLocaleString()}</span>`;
          } else if (activeMode === "bingo") {
            actScoreTag = `<span class="font-rpg font-bold text-blue-400 text-xs">🧩 ${Math.round(a.trimp || 0).toLocaleString()} TRIMP</span>`;
          } else if (window.isMobileMode && window.isMobileMode(activeMode)) {
            actScoreTag = `<span class="font-rpg font-bold text-amber-400 text-xs">${window.getMobileModeActivityLabel(activeMode, a)}</span>`;
          }
          if (a.isSuspectedDuplicate && !a.duplicateIncluded) {
            actScoreTag = `<span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300 text-[10px] font-bold">⚠️ 疑似重複(不計分)</span>`;
          }

          return `
            <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <div class="flex items-center space-x-1.5">
                  <span class="font-bold text-white">${escapeHtml(a.title || a.type)}</span>
                  ${idLink}
                  ${bonusPill}
                </div>
                <span class="text-[10px] text-slate-400 font-mono">${a.date || a.time} • ${a.duration}分 • 心率 ${a.avgHr}/${a.maxHr} • ${Math.round(a.rawCalories ?? a.calories)}kcal</span>
              </div>
              ${actScoreTag}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function jumpToHeroBadgesWall(heroName) {
  closeHeroProfileModal();
  selectedViewerHero = heroName;
  const sel = document.getElementById('viewer-hero-select');
  if (sel) sel.value = heroName;
  switchMainTab('viewer');
  setTimeout(() => {
    const wallEl = document.getElementById('hero-badges-wall-card');
    if (wallEl) wallEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

function closeHeroProfileModal() {
  const modal = document.getElementById('modal-hero-profile');
  if (modal) modal.classList.add('hidden');
}

// -------------------------------------------------------------
// 5. GLOBAL TOOL: 過往英雄史 (Chronicles of Past Heroes)
// -------------------------------------------------------------

function getAllSnapshots() {
  if (gameState?.snapshots && Array.isArray(gameState.snapshots)) {
    return gameState.snapshots;
  }
  return [window.frozenClassic0717];
}

function populateChroniclesDropdown() {
  const select = document.getElementById('chronicles-season-select');
  if (!select) return;

  const currentSelectVal = select.value;
  select.innerHTML = '';

  const snapshots = getAllSnapshots();
  const visibleSnapshots = snapshots.filter(s => s && s.isVisible !== false);

  if (visibleSnapshots.length === 0) {
    select.innerHTML = `<option value="">(目前無可顯示的歷史快照)</option>`;
    return;
  }

  visibleSnapshots.forEach(arc => {
    const opt = document.createElement('option');
    opt.value = arc.id;
    const typeIcon = arc.type === 'classic' ? '🏆' : (arc.type === 'rpg' ? '⚔️' : (arc.type === 'survival' ? '☠️' : ((window.MOBILE_MODE_META || {})[arc.type]?.icon || '🐉')));
    opt.innerText = `${typeIcon} ${arc.seasonTitle || arc.id} (${arc.seasonPeriod || ''})`;
    select.appendChild(opt);
  });

  if (currentSelectVal && visibleSnapshots.some(s => s.id === currentSelectVal)) {
    select.value = currentSelectVal;
  } else if (visibleSnapshots.length > 0) {
    select.value = visibleSnapshots[0].id;
    selectedChronicle = visibleSnapshots[0].id;
  }
}

function switchChronicleSeason() {
  const select = document.getElementById('chronicles-season-select');
  if (select) selectedChronicle = select.value;
  renderChroniclesView();
}

function renderSurvivalSnapshotHtml(snap) {
  const sv = snap.survival || {};
  const list = Array.isArray(snap.heroSurvival) ? snap.heroSurvival : [];
  const alive = list.filter(h => !h.isDead);
  return `
    <div class="mb-6 bg-slate-900 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-lg">
      <h2 class="text-xl font-black text-amber-500 mb-1">【資料片五】飢餓法則 (Survival Rules)</h2>
      <p class="text-slate-300 text-sm">荒野毒圈逐日擴張，唯有靠狩獵 (熱量) 與搜刮 (TRIMP) 撐到最後的英雄才能存活。以下為賽季結算當下凍結的生存榜。</p>
    </div>
    <div class="bg-slate-900/80 p-5 rounded-3xl border border-amber-500/40 shadow-xl space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">☠️ 飢餓法則歷史快照</span>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🔒 時間凍結</span>
        <span class="text-xs text-slate-400 font-mono">${escapeHtml(snap.seasonPeriod || '')}</span>
      </div>
      <h2 class="text-2xl font-black text-white font-title">${escapeHtml(snap.seasonTitle || '')}</h2>
      <p class="text-xs text-slate-300">初始 ${Number(sv.maxHp || 0).toLocaleString()} HP • 共 ${sv.days || 0} 天毒圈 • 累計扣血 ${Number(sv.penalty || 0).toLocaleString()} HP • 存活 <strong class="text-emerald-400">${alive.length}</strong> / ${list.length} 人</p>
      <p class="text-[11px] text-slate-500 font-mono">封存時間：${escapeHtml(snap.archivedAt || '')}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
      ${list.length === 0 ? '<div class="col-span-full p-6 text-center text-slate-500">此快照沒有英雄資料</div>' : ''}
      ${list.map((h, i) => `
        <div class="bg-slate-900/80 p-4 border rounded-2xl ${h.isDead ? 'border-slate-800 opacity-50 grayscale' : 'border-amber-500/40'}">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 min-w-0">
              <span class="text-xs font-mono text-slate-500">#${i + 1}</span>
              <span class="font-bold text-white truncate">${escapeHtml(h.name)}</span>
              <span class="text-[10px] text-slate-500">(${escapeHtml(h.guild || '')})</span>
            </div>
            <span class="text-[10px] font-bold ${h.isDead ? 'text-red-500' : 'text-emerald-400'}">${h.isDead ? '☠️ 淘汰' : (i === 0 ? '👑 存活' : '🟢 存活')}</span>
          </div>
          <div class="flex justify-between text-[11px] text-slate-400 mt-2">
            <span>最終生存值</span>
            <span class="font-mono font-bold text-amber-400">${Math.max(0, Number(h.currentHp) || 0).toLocaleString()}</span>
          </div>
          <div class="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>狩獵 +${Math.floor(h.food || 0).toLocaleString()}</span>
            <span>搜刮 +${Math.floor(h.scavenge || 0).toLocaleString()}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMobileSnapshotHtml(snap) {
  const meta = (window.MOBILE_MODE_META || {})[snap.type] || { num: '', icon: '📱', name: '手機同步資料片' };
  const rows = Array.isArray(snap.leaderboard) ? snap.leaderboard : [];
  return `
    <div class="bg-slate-900/80 p-5 rounded-3xl border border-amber-500/40 shadow-xl space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">${meta.icon} 資料片${meta.num}・${escapeHtml(meta.name)} 歷史快照</span>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🔒 時間凍結</span>
        <span class="text-xs text-slate-400 font-mono">${escapeHtml(snap.seasonPeriod || '')}</span>
      </div>
      <h2 class="text-2xl font-black text-white font-title">${escapeHtml(snap.seasonTitle || '')}</h2>
      <p class="text-xs text-slate-300">${escapeHtml(snap.summaryText || '')}</p>
      <p class="text-[11px] text-slate-500 font-mono">封存時間：${escapeHtml(snap.archivedAt || '')}</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-amber-400">🛡️ 公會排名</h3>
        ${(snap.guilds || []).map((g, i) => `<div class="flex justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"><span class="font-bold text-white">${i === 0 ? '🥇 ' : ''}${escapeHtml(g.name)}</span><span class="font-rpg font-bold text-amber-400">${escapeHtml(String(g.value))}</span></div>`).join('') || '<div class="text-slate-500 text-xs">無資料</div>'}
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-amber-400">🏅 英雄排名</h3>
        ${rows.map((h, i) => `<div class="flex justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"><span class="font-bold text-white">#${i + 1} ${escapeHtml(h.name)} <span class="text-slate-500 font-normal">${escapeHtml(h.detail || '')}</span></span><span class="font-rpg font-bold text-amber-400">${escapeHtml(String(h.value))}</span></div>`).join('') || '<div class="text-slate-500 text-xs">無資料</div>'}
      </div>
    </div>`;
}

function renderChroniclesView() {
  let lore = "";
  const container = document.getElementById("chronicles-dynamic-content");
  if (!container) return;
  // GM 設為「隱藏」的快照不在前台顯示
  const snapshots = getAllSnapshots().filter(s => s && s.isVisible !== false);
  const snap = snapshots.find(s => s.id === selectedChronicle) || snapshots[0];

  if (!snap) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500">尚無可顯示的歷史快照</div>`;
    return;
  }

  if (snap.type === "survival") {
    container.innerHTML = renderSurvivalSnapshotHtml(snap);
    return;
  }
  if (window.isMobileMode && window.isMobileMode(snap.type)) {
    container.innerHTML = renderMobileSnapshotHtml(snap);
    return;
  }

  if (snap.type === "world_boss" || snap.type === "boss") {
    lore = `<div class="mb-4 bg-slate-900 border-l-4 border-rose-500 p-4 rounded-r-xl shadow-lg"><h2 class="text-xl font-black text-rose-500 mb-1">【資料片三】世界 Boss 討伐 (World Raid)</h2><p class="text-slate-300 text-sm">上古神獸降臨！這次我們沒有對手，因為全伺服器必須團結一致，將熱量化為物理重擊、將 TRIMP 化為無情的魔法火砲。用無氧極限 (MaxGap) 觸發爆擊，在賽季結束前將這個怪物的血條削成灰燼！</p></div>`;
  } else if (snap.type === "rpg" || snap.type === "rpg_talent") {
    lore = `<div class="mb-6 bg-slate-900 border-l-4 border-blue-500 p-4 rounded-r-xl shadow-lg"><h2 class="text-xl font-black text-blue-400 mb-1">【資料片二】RPG 職業覺醒 (Class Talents)</h2><p class="text-slate-300 text-sm">英雄們覺醒了專屬的天賦：狂戰士靠高心跳壓榨極限，遊俠依賴平穩的燃脂區間堆疊傷害，聖騎士化身團隊的血牛，而刺客則尋求極致的痛苦密度。找出你的定位，發揮 100% 的職業加成吧！</p></div>`;
  } else {
    lore = `<div class="mb-6 bg-slate-900 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-lg"><h2 class="text-xl font-black text-amber-500 mb-1">【資料片一】經典競技 (Classic Arena)</h2><p class="text-slate-300 text-sm">在這個最初的競技場，靠的是最純粹的汗水與毅力。沒有花俏的魔法防護，只有真實的痛苦轉換為榮耀。團隊的勝敗，取決於每一個人的參與度，只要有人偷懶跌破 30 分鐘門檻，都會拖累整個公會的均分！</p></div>`;
  }

  // =========================================================================
  // CASE 1: Classic Mode Snapshot (1:1 with Live Classic Arena)
  // =========================================================================
  if (snap.type === "classic" || snap.classicData || (snap.champions && !snap.classMasters && !snap.boss)) {
    const classic = snap.classicData || snap;
    const champs = classic.champions || {};
    const teamMetrics = classic.teamMetrics || [];
    const guildList = classic.guildList || [];

    container.innerHTML = lore + `
      <div class="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 p-6 rounded-3xl border border-amber-500/40 shadow-xl space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center space-x-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">🏛️ 經典競技歷史快照</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🔒 時間凍結</span>
            <span class="text-xs text-slate-400 font-mono">${snap.seasonPeriod || ""}</span>
          </div>
          <span class="text-[11px] text-slate-400 font-mono">封存時間：${snap.archivedAt || "歷史預載"}</span>
        </div>
        <h2 class="text-2xl font-black text-white font-title">${snap.seasonTitle}</h2>
        <p class="text-xs text-slate-300 flex items-center space-x-1.5">
          <span>🔒</span>
          <span class="font-bold text-amber-300">${snap.statusLabel || "本賽季已圓滿結算 (歷史數據已凍結)"}</span>
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-slate-900/80 border border-emerald-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-bold text-emerald-400">🟢 團隊有氧總冠軍 (滿分100)</h3>
            <span class="text-[10px] text-slate-400">衝力40% + 熱量30% + 有氧30%</span>
          </div>
          <div class="space-y-1.5">
            ${(champs.teamAerobic || []).map(t => `
              <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span class="font-bold text-white">${t.badge || ""} ${t.name}</span>
                <span class="font-rpg font-bold text-emerald-400">${t.score} 分</span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="bg-slate-900/80 border border-emerald-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-bold text-emerald-400">🟢 個人有氧總冠軍 (滿分100)</h3>
            <span class="text-[10px] text-slate-400">個人綜合加權高標法</span>
          </div>
          <div class="space-y-1.5">
            ${(champs.heroAerobic || []).map(h => `
              <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-emerald-500/50 transition">
                <span class="font-bold text-white">${h.badge || ""} ${h.name} <span class="text-[10px] text-slate-400 font-normal">(${h.guild || ""})</span></span>
                <span class="font-rpg font-bold text-emerald-400">${h.score} 分</span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="bg-slate-900/80 border border-rose-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-bold text-rose-400">🔴 團隊無氧總冠軍 (滿分100)</h3>
            <span class="text-[10px] text-slate-400">落差50% + 密度30% + 出勤20%</span>
          </div>
          <div class="space-y-1.5">
            ${(champs.teamAnaerobic || []).map(t => `
              <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                <span class="font-bold text-white">${t.badge || ""} ${t.name}</span>
                <span class="font-rpg font-bold text-rose-400">${t.score} 分</span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="bg-slate-900/80 border border-rose-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-bold text-rose-400">🔴 個人無氧總冠軍 (滿分100)</h3>
            <span class="text-[10px] text-slate-400">落差40% + 密度30% + MaxHR15% + 出勤15%</span>
          </div>
          <div class="space-y-1.5">
            ${(champs.heroAnaerobic || []).map(h => `
              <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-rose-500/50 transition">
                <span class="font-bold text-white">${h.badge || ""} ${h.name} <span class="text-[10px] text-slate-400 font-normal">(${h.guild || ""})</span></span>
                <span class="font-rpg font-bold text-rose-400">${h.score} 分</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2">
          <i data-lucide="medal" class="w-4 h-4 text-amber-400"></i>
          <span>🏆 團隊八大核心生理指標榜 (人均數據)</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          ${teamMetrics.map(m => `
            <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <span class="text-xs font-bold text-slate-200 block truncate">${m.metric}</span>
              <div class="space-y-1">
                ${m.leaderboard.map(item => `
                  <div class="flex justify-between text-[11px]">
                    <span class="text-slate-400">${item.rank} ${item.team}</span>
                    <span class="font-mono font-bold text-amber-400">${item.value} ${m.unit}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      ${guildList && guildList.length > 0 ? `
        <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center space-x-2">
            <i data-lucide="shield" class="w-4 h-4 text-cyan-400"></i>
            <span>🛡️ 公會成員出勤與戰力統計矩陣 (歷史封存)</span>
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th class="p-3">🛡️ 公會名稱</th>
                  <th class="p-3">👥 成員名冊</th>
                  <th class="p-3">🏋️ 人均出勤</th>
                  <th class="p-3">⏱️ 人均時長</th>
                  <th class="p-3">🔋 人均熱量</th>
                  <th class="p-3">🚀 人均衝力</th>
                  <th class="p-3">🦍 人均落差</th>
                  <th class="p-3">💥 人均密度</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60 text-slate-300">
                ${guildList.map(g => `
                  <tr class="hover:bg-slate-950/40 transition">
                    <td class="p-3 font-bold text-white flex items-center space-x-1.5">
                      <span>${g.badge || "🛡️"}</span>
                      <span>${g.name}</span>
                    </td>
                    <td class="p-3 text-slate-400 font-mono text-[11px]">
                      ${(g.members || []).map(m => `<span class="cursor-pointer hover:underline text-slate-300" onclick="openHeroDetailModal(${jsArg(m)})">${m}</span>`).join("、")}
                    </td>
                    <td class="p-3 font-mono text-amber-300">${g.perWorkouts} 次</td>
                    <td class="p-3 font-mono">${g.perDuration} 分</td>
                    <td class="p-3 font-mono text-rose-400">${g.perCalories} kcal</td>
                    <td class="p-3 font-mono text-cyan-300">${g.perTrimp}</td>
                    <td class="p-3 font-mono text-purple-300">${g.perGap} bpm</td>
                    <td class="p-3 font-mono">${g.perDensity}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      ` : ""}
    `;
  }

  // =========================================================================
  // CASE 2: RPG Class & Talent Mode Snapshot (1:1 with Live RPG View)
  // =========================================================================
  else if (snap.type === "rpg" || snap.type === "rpg_talent" || snap.classMasters) {
    const masters = snap.classMasters || {};
    const synergyList = snap.guildSynergyList || [];
    const heroList = snap.heroRpgList || snap.heroStats || [];
    const maxGuildPower = Math.max(1, ...synergyList.map(s => s.totalPower || 1));

    container.innerHTML = lore + `
      <div class="bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 p-6 rounded-3xl border border-purple-500/50 shadow-xl space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center space-x-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">🏛️ RPG 職業天賦歷史快照</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">🔒 時間凍結</span>
            <span class="text-xs text-slate-400 font-mono">${snap.seasonPeriod || ""}</span>
          </div>
          <span class="text-[11px] text-slate-400 font-mono">封存時間：${snap.archivedAt || ""}</span>
        </div>
        <h2 class="text-2xl font-black text-white font-title">${snap.seasonTitle}</h2>
        <p class="text-xs text-slate-300 flex items-center space-x-1.5">
          <span>🔒</span>
          <span class="font-bold text-purple-300">${snap.statusLabel || "本賽季職業爭霸已圓滿結算封存"}</span>
        </p>
      </div>

      <!-- 5 Class Master Podiums -->
      <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2">
          <i data-lucide="crown" class="w-4 h-4 text-amber-400"></i>
          <span>👑 五大職業首席大師王座 (歷史榜首)</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          ${Object.keys(RPG_CLASSES).map(cName => {
            const cls = RPG_CLASSES[cName];
            const master = masters[cName];
            return `
              <div class="bg-slate-950 p-3.5 rounded-2xl border ${cls.bg} space-y-2 relative overflow-hidden">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold flex items-center space-x-1">
                    <span>${cls.badge}</span>
                    <span>${cls.name}之王</span>
                  </span>
                  <span class="text-[10px] opacity-80">${cls.enName}</span>
                </div>
                ${master ? `
                  <div class="flex items-center space-x-2.5 pt-1 cursor-pointer hover:opacity-80 transition" onclick="openHeroDetailModal(${jsArg(master.name)})">
                    <div class="w-9 h-9 rounded-xl bg-slate-800 overflow-hidden border border-slate-700 flex-shrink-0">
                      <img src="${master.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${master.name}`}" class="w-full h-full object-cover">
                    </div>
                    <div class="min-w-0">
                      <span class="font-bold text-white text-xs truncate block">${master.name}</span>
                      <span class="text-[10px] text-slate-400">${master.guild}</span>
                    </div>
                  </div>
                  <div class="text-right pt-1 border-t border-slate-800/80">
                    <span class="text-[10px] text-slate-400 block">職業戰力</span>
                    <span class="font-rpg font-bold text-sm text-amber-400">${(master.combatPower || 0).toLocaleString()}</span>
                  </div>
                ` : `
                  <div class="text-center py-4 text-slate-500 text-xs">(尚無冒險者)</div>
                `}
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Guild Synergy Leaderboard -->
      <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2">
          <i data-lucide="shield-check" class="w-4 h-4 text-cyan-400"></i>
          <span>🛡️ 公會天賦羈絆戰力排行榜 (歷史封存)</span>
        </h3>
        <div class="space-y-3">
          ${synergyList.map(g => {
            const pct = Math.round(((g.totalPower || 0) / maxGuildPower) * 100);
            return `
              <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div class="flex flex-wrap items-center justify-between text-xs gap-2">
                  <div class="flex items-center space-x-2">
                    <span>${g.badge || "🛡️"}</span>
                    <span class="font-bold text-white text-sm">${g.guild || g.name}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">${g.synergyTag || "小隊羈絆"}</span>
                    <div class="flex space-x-1">
                      ${(g.uniqueClasses || []).map(c => `<span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300">${RPG_CLASSES[c]?.badge || ""} ${c}</span>`).join("")}
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-[10px] text-slate-400 block">公會羈絆總戰力</span>
                    <span class="font-rpg font-bold text-amber-400 text-sm">${(g.totalPower || 0).toLocaleString()} CP</span>
                  </div>
                </div>
                <div class="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
                  <div class="h-full rounded-full" style="width: ${pct}%; background-color: ${g.color || "#f59e0b"};"></div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Hero Class Roster Table -->
      <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2">
          <i data-lucide="users" class="w-4 h-4 text-purple-400"></i>
          <span>👥 全服英雄職業專精與 RPG 戰力總表 (歷史封存)</span>
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
              <tr>
                <th class="p-3">👤 冒險者</th>
                <th class="p-3">🛡️ 公會</th>
                <th class="p-3">⚔️ 職業專精</th>
                <th class="p-3">✨ 專屬天賦被動</th>
                <th class="p-3">🏋️ 出勤 / 燃脂</th>
                <th class="p-3">🚀 TRIMP / 落差</th>
                <th class="p-3 text-right">⚡ RPG 戰鬥評分 (CP)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 text-slate-300">
              ${heroList.map(h => {
                const meta = RPG_CLASSES[h.rpgClass] || RPG_CLASSES["狂戰士"];
                return `
                  <tr class="hover:bg-slate-950/40 transition cursor-pointer" onclick="openHeroDetailModal(${jsArg(h.name)})">
                    <td class="p-3 font-bold text-white flex items-center space-x-2">
                      <div class="w-7 h-7 rounded-lg bg-slate-800 overflow-hidden border border-slate-700 flex-shrink-0">
                        <img src="${h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`}" class="w-full h-full object-cover">
                      </div>
                      <span>${h.name}</span>
                    </td>
                    <td class="p-3"><span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">${h.guild}</span></td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded text-[11px] font-bold ${meta.bg}">
                        ${meta.badge} ${h.rpgClass}
                      </span>
                    </td>
                    <td class="p-3 text-[11px] text-slate-400">
                      <span class="font-bold text-slate-200">${meta.passiveName}</span>：${meta.passiveDesc}
                    </td>
                    <td class="p-3 font-mono">${h.workouts || 0}次 • ${h.zone2 || 0}次燃脂</td>
                    <td class="p-3 font-mono text-cyan-300">${h.trimp || 0} • 落差 ${h.maxGap || 0}</td>
                    <td class="p-3 text-right font-mono font-bold text-amber-400 text-sm">${(h.combatPower || h.totalDamage || 0).toLocaleString()}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // CASE 3: World Boss Raid Snapshot (1:1 with Live World Boss View)
  // =========================================================================
  else {
    const boss = snap.boss || {};
    const summary = {
      totalDamage: snap.totalDamage || 0,
      totalPhys: snap.physDmg || 0,
      totalMag: snap.magDmg || 0,
      totalCrit: snap.critDmg || 0,
      ...(snap.summary || {})
    };
    ['totalDamage', 'totalPhys', 'totalMag', 'totalCrit'].forEach(k => { summary[k] = Number(summary[k]) || 0; });
    const heroList = (snap.heroStats || snap.allHeroes || snap.topHeroes || []).sort((a,b) => (b.totalDamage || b.score || 0) - (a.totalDamage || a.score || 0));
    const guildList = snap.guildContributions || snap.guilds || [];
    const activities = snap.activities || [];

    const maxHp = boss.maxHp || snap.bossMaxHp || 350000;
    const currHp = Math.max(0, maxHp - (summary.totalDamage || 0));
    const hpPct = Math.max(0, Math.min(100, (currHp / maxHp) * 100));

    container.innerHTML = lore + `
      <div class="bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-950 p-6 rounded-3xl border border-rose-500/40 shadow-xl space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center space-x-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">🏛️ 世界 Boss 歷史快照</span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">🔒 時間凍結</span>
            <span class="text-xs text-slate-400 font-mono">${snap.seasonPeriod || ""}</span>
          </div>
          <span class="text-[11px] text-slate-400 font-mono">封存時間：${snap.archivedAt || ""}</span>
        </div>
        <h2 class="text-2xl font-black text-white font-title">${snap.seasonTitle || boss.name}</h2>
        <p class="text-xs text-slate-300 flex items-center space-x-1.5">
          <span>🔒</span>
          <span class="font-bold text-amber-300">${snap.statusLabel || "本賽季討伐戰已圓滿結算封存"}</span>
        </p>
      </div>

      <!-- Boss Banner -->
      <div class="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 shadow-2xl relative overflow-hidden glow-border-red">
        <div class="flex flex-col lg:flex-row items-center justify-between gap-6">
          <div class="flex items-center space-x-4 flex-1">
            <div class="w-24 h-24 rounded-2xl overflow-hidden border-2 border-rose-500/50 shadow-xl shadow-rose-900/40 relative flex-shrink-0">
              <img src="${boss.avatar || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80"}" class="w-full h-full object-cover">
              <span class="absolute bottom-0 inset-x-0 bg-rose-950/80 text-rose-300 text-[10px] font-black text-center py-0.5">WORLD BOSS</span>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="text-xs text-rose-400 font-bold tracking-wider uppercase">資料片三 • 全伺服器合作模式 (歷史紀錄)</span>
              </div>
              <h2 class="text-2xl sm:text-3xl font-black text-white font-title tracking-wide mt-0.5">
                ${boss.name || "🌩️ 墮落雷神・索爾"}
              </h2>
              <p class="text-xs font-mono font-bold text-amber-300 mt-1">
                討伐戰區間：${snap.seasonPeriod || ""}
              </p>
            </div>
          </div>

          <div class="w-full lg:w-96 space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            <div class="flex items-baseline justify-between">
              <span class="text-xs font-bold text-slate-400">魔王最終剩餘血量</span>
              <div class="text-right">
                <span class="text-lg font-black font-rpg text-rose-400">${currHp.toLocaleString()}</span>
                <span class="text-xs text-slate-500 font-mono">/ ${maxHp.toLocaleString()}</span>
                <span class="text-xs font-bold text-amber-400 ml-1">(${hpPct.toFixed(1)}%)</span>
              </div>
            </div>
            <div class="w-full h-5 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700 relative">
              <div class="h-full rounded-full boss-hp-bar" style="width: ${hpPct}%;"></div>
            </div>
            <div class="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              <span>戰役結算狀態：<span class="text-emerald-400 font-bold">已封存</span></span>
              <span class="text-amber-400 font-bold">全服總輸出：<span>${summary.totalDamage.toLocaleString()}</span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3 Damage Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-amber-400">🗡️ 物理普攻總和</div>
            <div class="text-2xl font-black font-rpg text-white">${summary.totalPhys.toLocaleString()}</div>
            <p class="text-[11px] text-slate-400 mt-0.5">熱量真實傷害 1:1 累加</p>
          </div>
          <div class="text-2xl">🔥</div>
        </div>
        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-cyan-400">🔮 魔法衝力總和</div>
            <div class="text-2xl font-black font-rpg text-white">${summary.totalMag.toLocaleString()}</div>
            <p class="text-[11px] text-slate-400 mt-0.5">TRIMP 放大 15 倍轉換</p>
          </div>
          <div class="text-2xl">⚡</div>
        </div>
        <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-rose-400">💥 爆擊傷害總和</div>
            <div class="text-2xl font-black font-rpg text-white">${summary.totalCrit.toLocaleString()}</div>
            <p class="text-[11px] text-slate-400 mt-0.5">取賽季最高單次落差 ×100</p>
          </div>
          <div class="text-2xl">💥</div>
        </div>
      </div>

      <!-- MVP Hero Leaderboard & Guild War Output -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div class="flex items-center space-x-2">
              <i data-lucide="crown" class="w-5 h-5 text-amber-400"></i>
              <h3 class="text-base font-bold text-white">🏆 討伐軍 MVP 傷害排行榜 (歷史榮譽榜)</h3>
            </div>
            <span class="text-xs text-slate-400">點選英雄查看歷史戰力卡</span>
          </div>

          <div class="space-y-2.5">
            ${heroList.map((hero, index) => {
              const isTop1 = index === 0;
              const isTop3 = index < 3;
              return `
                <div onclick="openHeroDetailModal(${jsArg(hero.name)})" class="p-3.5 rounded-2xl border transition flex items-center justify-between space-x-3 cursor-pointer hover:border-amber-500/60 ${
                  isTop1 ? "bg-amber-950/20 border-amber-500/50 glow-border-gold" : (isTop3 ? "bg-slate-950/60 border-slate-700" : "bg-slate-950/40 border-slate-800/80")
                }">
                  <div class="flex items-center space-x-3 flex-1 min-w-0">
                    <div class="w-7 text-center font-black font-rpg text-sm ${isTop1 ? "text-amber-400 text-base" : (isTop3 ? "text-cyan-400" : "text-slate-500")}">
                      ${hero.badge || (isTop1 ? "👑" : `#${index + 1}`)}
                    </div>
                    <div class="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700 flex-shrink-0">
                      <img src="${hero.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${hero.name}`}" class="w-full h-full object-cover">
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center space-x-2">
                        <h4 class="text-sm font-black text-white truncate">${hero.name}</h4>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">${hero.guild}</span>
                      </div>
                      <p class="text-[11px] text-slate-400 mt-0.5">
                        出勤 ${hero.validWorkouts || 0} 次 • 普攻 ${(hero.physDmg || 0).toLocaleString()} • 魔攻 ${(hero.magDmg || 0).toLocaleString()} • 💥 爆擊 ${(hero.critDmg || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-[10px] text-slate-400 block">總輸出</span>
                    <span class="text-base font-black font-rpg text-amber-400">${(hero.totalDamage || 0).toLocaleString()}</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <div class="space-y-6">
          <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <div class="flex items-center space-x-2">
                <i data-lucide="shield" class="w-5 h-5 text-cyan-400"></i>
                <h3 class="text-sm font-bold text-white">🛡️ 各公會歷史輸出總和</h3>
              </div>
            </div>
            <div class="space-y-3">
              ${guildList.map(g => {
                const totalAll = summary.totalDamage || 1;
                const pct = (((g.totalDamage || 0) / totalAll) * 100).toFixed(1);
                return `
                  <div class="space-y-1.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                    <div class="flex items-center justify-between text-xs">
                      <div class="flex items-center space-x-1.5">
                        <span>${g.badge || "🛡️"}</span>
                        <span class="font-bold text-white">${g.name}</span>
                      </div>
                      <span class="font-rpg font-bold text-amber-400">${(g.totalDamage || 0).toLocaleString()} (${pct}%)</span>
                    </div>
                    <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                      <div class="h-full rounded-full" style="width: ${pct}%; background-color: ${g.color || "#f59e0b"};"></div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (window.lucide) lucide.createIcons();
}
/**
 * 📸 WYSIWYG 真・現場畫面 100% 完整深拷貝快照 (所見即所得)
 * 直接封存當前遊戲看板上的所有數值、出勤與戰功，不丟失任何手動打卡！
 */
async function captureCurrentLiveSnapshot(customName) {
  const activeMode = gameState?.activeMode || "world_boss";
  const bossData = gameState?.boss || {};
  let defaultTitle = "2026 S1 季末結算快照";
  if (activeMode === "classic") defaultTitle = "2026 S1 • 經典競技結算快照";
  else if (activeMode === "rpg_talent") defaultTitle = "2026 S1 • RPG 職業天賦結算快照";
  else if (activeMode === "world_boss") defaultTitle = `${bossData.name || "世界 Boss 討伐戰"} (現場結算快照)`;

  const title = customName || prompt("請輸入快照名稱 (Snapshot Title)：", defaultTitle);
  if (!title) return;

  const now = new Date();
  const timeStampStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  let snapPayload = null;

  if (activeMode === "classic") {
    snapPayload = {
      id: `snapshot_classic_${Date.now()}`,
      type: "classic",
      seasonTitle: title.trim(),
      seasonPeriod: `${bossData.seasonStart || "2026/07/27"} ~ ${bossData.seasonEnd || "2026/08/11"}`,
      archivedAt: timeStampStr,
      status: "completed",
      statusLabel: "🏁 本賽季經典競技已圓滿結算封存",
      isVisible: true,
      classicData: gameState?.classic0717 || window.frozenClassic0717 || {}
    };
  } else if (activeMode === "rpg_talent" || activeMode === "rpg") {
    const heroList = (heroStatsList || gameState?.heroes || []).map(h => {
      const cls = RPG_CLASSES[h.rpgClass || "狂戰士"] || RPG_CLASSES["狂戰士"];
      return {
        ...h,
        rpgClass: h.rpgClass || "狂戰士",
        combatPower: h.combatPower || h.totalDamage || 0
      };
    }).sort((a, b) => (b.combatPower || 0) - (a.combatPower || 0));

    const classMasters = {};
    Object.keys(RPG_CLASSES).forEach(cName => {
      const cand = heroList.find(h => h.rpgClass === cName);
      if (cand) classMasters[cName] = cand;
    });

    snapPayload = {
      id: `snapshot_rpg_${Date.now()}`,
      type: "rpg",
      seasonTitle: title.trim(),
      seasonPeriod: `${bossData.seasonStart || "2026/08/12"} ~ ${bossData.seasonEnd || "2026/08/31"}`,
      archivedAt: timeStampStr,
      status: "completed",
      statusLabel: "🏁 本賽季職業天賦爭霸已圓滿結算封存",
      isVisible: true,
      classMasters: classMasters,
      guildSynergyList: gameState?.guilds || [],
      heroRpgList: heroList
    };
  } else {
    // World Boss
    const sortedHeroes = [...(heroStatsList || [])].sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
    const summary = gameState?.summary || {
      totalPhys: sortedHeroes.reduce((s, h) => s + (h.physDmg || 0), 0),
      totalMag: sortedHeroes.reduce((s, h) => s + (h.magDmg || 0), 0),
      totalCrit: sortedHeroes.reduce((s, h) => s + (h.critDmg || 0), 0),
      totalDamage: sortedHeroes.reduce((s, h) => s + (h.totalDamage || 0), 0)
    };

    const guildStats = {};
    (gameState?.guilds || []).forEach(g => { guildStats[g.name] = { ...g, totalDamage: 0 }; });
    sortedHeroes.forEach(h => { if (guildStats[h.guild]) guildStats[h.guild].totalDamage += (h.totalDamage || 0); });
    const sortedGuilds = Object.values(guildStats).sort((a, b) => b.totalDamage - a.totalDamage);

    const maxHp = bossData.maxHp || 350000;
    const finalHp = bossData.currentHp !== undefined ? bossData.currentHp : Math.max(0, maxHp - summary.totalDamage);

    snapPayload = {
      id: `snapshot_boss_${Date.now()}`,
      type: "world_boss",
      seasonTitle: title.trim(),
      seasonPeriod: `${bossData.seasonStart || "2026/08/12"} ~ ${bossData.seasonEnd || "2026/08/31"}`,
      archivedAt: timeStampStr,
      status: "completed",
      statusLabel: "🏁 本賽季討伐戰已圓滿結算封存",
      isVisible: true,
      boss: {
        name: bossData.name || "🌩️ 墮落雷神・索爾 (Fallen Thor)",
        avatar: bossData.avatar || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
        description: bossData.description || "索爾受到雷霆魔劍侵蝕陷入瘋狂！全服英雄透過每日汗水鍛鍊，轉化為真實輸出！",
        maxHp: maxHp,
        currentHp: finalHp,
        seasonStart: bossData.seasonStart || "2026/08/12",
        seasonEnd: bossData.seasonEnd || "2026/08/31"
      },
      summary: summary,
      heroStats: sortedHeroes.map((h, idx) => ({
        rank: idx + 1,
        name: h.name,
        guild: h.guild,
        avatar: h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`,
        validWorkouts: h.validWorkouts || 0,
        physDmg: h.physDmg || 0,
        magDmg: h.magDmg || 0,
        critDmg: h.critDmg || 0,
        totalDamage: h.totalDamage || 0,
        maxGap: h.maxGap || 0,
        badge: idx === 0 ? "👑" : (idx === 1 ? "🥈" : (idx === 2 ? "🥉" : ""))
      })),
      guildContributions: sortedGuilds,
      activities: (gameState?.activities || []).filter(a => a.isValidAttack).slice(0, 25)
    };
  }

  try {
    const res = await fetch("/api/snapshots/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: snapPayload })
    });
    if (res.ok) {
      alert(`🎉 快照【${title}】建立成功！已 100% 複製當前現場戰況並封存至【過往英雄史】！`);
      if (gameState) {
        if (!gameState.snapshots) gameState.snapshots = [];
        gameState.snapshots.unshift(snapPayload);
        gameState.archivedSeasons = gameState.snapshots;
      }
      populateChroniclesDropdown();
    }
  } catch (e) {
    alert(`🎉 快照【${title}】已於本地建立！`);
  }
}
window.captureCurrentLiveSnapshot = captureCurrentLiveSnapshot;


window.addEventListener("gameStateSynced", (e) => {
  if (e.detail) {
    gameState = e.detail;
    if (gameState.heroStats) heroStatsList = gameState.heroStats;
    renderAllGameViews();
  }
});

// -------------------------------------------------------------
// EXPANSION 4: 雙城激戰 (Faction War)
// -------------------------------------------------------------
function renderFactionWarView() {
  const container = document.getElementById("tab-content-faction");
  if (!container) return;

  const summary = gameState?.summary || {};
  const guildList = gameState?.guilds || [];
  
  // 假設兩大陣營：依據公會分兩組 (如果公會少於2，手動切半)
  let faction1 = { name: gameState?.faction?.f1Name || "🟢 均衡聯盟", hp: gameState?.faction?.baseHp || 500000, dmg: 0, repair: 0, guilds: [] };
  let faction2 = { name: gameState?.faction?.f2Name || "🔴 狂怒部落", hp: gameState?.faction?.baseHp || 500000, dmg: 0, repair: 0, guilds: [] };
  
  guildList.forEach((g, idx) => {
      const isF1 = idx % 2 === 0;
      const targetF = isF1 ? faction1 : faction2;
      targetF.guilds.push(g.name);
      
      const gHeroes = (gameState?.heroStats || []).filter(h => h.guild === g.name);
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

  container.innerHTML = `
    <!-- Lore / Story -->
    <div class="mb-6 bg-slate-900 border-l-4 border-emerald-500 p-4 rounded-r-xl shadow-lg">
      <h2 class="text-xl font-black text-emerald-400 mb-1">【資料片四】雙城激戰 (Faction War)</h2>
      <p class="text-slate-300 text-sm leading-relaxed">
        戰火蔓延！全服公會已被強制編入兩大對立陣營。<br>
        ⚔️ <strong>摧毀敵城：</strong> 你的極限無氧化為猛烈砲火！<span class="text-rose-400 font-mono font-bold tracking-wider">[ 攻城傷害 = TRIMP × 10 + MaxGap × 100 ]</span><br>
        🛡️ <strong>修復我城：</strong> 你的穩定有氧化為物資修補己方！<span class="text-cyan-400 font-mono font-bold tracking-wider">[ 修復量 = Calories + Zone2打卡次數 × 5000 ]</span><br>
        <div class="mt-2 text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
          <p><span class="text-amber-500 font-bold">⏱️ 系統判斷規則：</span> 所有數據僅採計單次持續 <strong>${gameState?.summary?.minDurationMinutes || gameState?.boss?.rules?.minDurationMinutes || 30}分鐘</strong> 以上的運動。</p>
          <p>• <strong>Zone2：</strong>該次運動平均心率落在個人最大心率 (MaxHR) 60% ~ 75% 之間。</p>
          <p>• <strong>MaxGap：</strong>單次最高心率 - 單次平均心率。</p>
          <p>• <strong>TRIMP：</strong>時間 × (均心率÷MaxHR) × <i>e</i>^(1.92×(均心率÷MaxHR))</p>
        </div>
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
      
      <!-- Faction 1 -->
      <div class="bg-slate-900/80 rounded-3xl p-6 border border-emerald-500/30 relative overflow-hidden text-center glow-border-green">
        <div class="text-xs text-emerald-500 font-bold mb-2">守護陣營</div>
        <h3 class="text-3xl font-black text-white font-title mb-4">${faction1.name}</h3>
        <p class="text-xs text-slate-400 mb-4">所屬公會：${faction1.guilds.join(', ') || '無'}</p>
        <div class="mb-2">
            <span class="text-sm font-bold text-slate-400">主城血量</span>
            <div class="text-4xl font-rpg font-black text-emerald-400">${f1CurrentHp.toLocaleString()}</div>
        </div>
        <div class="w-full h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
            <div class="h-full bg-emerald-500" style="width: ${f1Pct}%"></div>
        </div>
        <div class="mt-4 flex justify-between text-xs text-slate-500">
            <span>承受打擊: <b class="text-rose-400">${faction2.dmg.toLocaleString()}</b></span>
            <span>修復值: <b class="text-cyan-400">+${faction1.repair.toLocaleString()}</b></span>
        </div>
      </div>

      <!-- Faction 2 -->
      <div class="bg-slate-900/80 rounded-3xl p-6 border border-rose-500/30 relative overflow-hidden text-center glow-border-red">
        <div class="text-xs text-rose-500 font-bold mb-2">狂怒陣營</div>
        <h3 class="text-3xl font-black text-white font-title mb-4">${faction2.name}</h3>
        <p class="text-xs text-slate-400 mb-4">所屬公會：${faction2.guilds.join(', ') || '無'}</p>
        <div class="mb-2">
            <span class="text-sm font-bold text-slate-400">主城血量</span>
            <div class="text-4xl font-rpg font-black text-rose-400">${f2CurrentHp.toLocaleString()}</div>
        </div>
        <div class="w-full h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
            <div class="h-full bg-rose-500" style="width: ${f2Pct}%"></div>
        </div>
        <div class="mt-4 flex justify-between text-xs text-slate-500">
            <span>承受打擊: <b class="text-rose-400">${faction1.dmg.toLocaleString()}</b></span>
            <span>修復值: <b class="text-cyan-400">+${faction2.repair.toLocaleString()}</b></span>
        </div>
      </div>

    </div>

    <!-- 陣營英雄戰績板 -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 mt-6">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2">
          <i data-lucide="swords" class="w-4 h-4 text-emerald-400"></i>
          <span>🛡️ 陣營傭兵戰略貢獻榜</span>
        </h3>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
           <h4 class="text-xs font-bold text-rose-400 mb-2">🔥 攻城毀滅者 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">TRIMP×10 + MaxGap×100</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, dmg: (h.totalTrimp || 0) * 10 + (h.scoreMaxGap ?? h.maxGap ?? 0) * 100
             })).sort((a,b)=>b.dmg-a.dmg).slice(0, 10).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-rose-500/50 transition">
                  <div class="flex items-center space-x-2">
                      <span class="font-bold text-slate-500 w-4">${i+1}.</span>
                      <span class="font-bold text-white">${h.avatar ? `<img src="${h.avatar}" class="inline-block w-4 h-4 rounded-full mr-1 object-cover">` : ''}${h.name}</span>
                      <span class="text-[9px] text-slate-500">${h.guild}</span>
                  </div>
                  <span class="font-rpg font-bold text-rose-400">${h.dmg.toLocaleString()}</span>
               </div>
             `).join('')}
           </div>
        </div>
        <div>
           <h4 class="text-xs font-bold text-cyan-400 mb-2">🛠️ 城牆守護者 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">Cal. + Zone2×5000</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, rep: (h.scoreZone2 ?? h.zone2Count ?? 0) * 5000 + (h.totalCalories || 0)
             })).sort((a,b)=>b.rep-a.rep).slice(0, 10).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-cyan-500/50 transition">
                  <div class="flex items-center space-x-2">
                      <span class="font-bold text-slate-500 w-4">${i+1}.</span>
                      <span class="font-bold text-white">${h.avatar ? `<img src="${h.avatar}" class="inline-block w-4 h-4 rounded-full mr-1 object-cover">` : ''}${h.name}</span>
                      <span class="text-[9px] text-slate-500">${h.guild}</span>
                  </div>
                  <span class="font-rpg font-bold text-cyan-400">+${h.rep.toLocaleString()}</span>
               </div>
             `).join('')}
           </div>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// EXPANSION 5: 飢餓法則 (Survival Battle Royale)
// -------------------------------------------------------------
function renderSurvivalView() {
  const container = document.getElementById("tab-content-survival");
  if (!container) return;

  const heroList = gameState?.heroStats || [];
  const sv = window.computeSurvivalState(gameState);
  const decayPerDay = sv.decayPerDay;
  const currentPenalty = sv.penalty;
  const maxHp = sv.maxHp;

  const survivingHeroes = heroList.map(h => {
      const hp = window.computeSurvivalHeroHp(h, sv); // 狩獵補血 = Calories / 搜刮物資 = TRIMP × 1.5
      return { ...h, ...hp };
  }).sort((a,b) => b.currentHp - a.currentHp);

  const scheduleNote = (sv.schedule || []).length > 1
    ? `<br><span class="text-[11px] text-amber-300">☣️ 毒圈擴張紀錄：${sv.schedule.map(s => `${s.from.slice(5)} 起每日 -${s.perDay}`).join(' ➜ ')}</span>`
    : '';

  container.innerHTML = `
    <!-- Lore / Story -->
    <div class="mb-6 bg-slate-900 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-lg">
      <h2 class="text-xl font-black text-amber-500 mb-1">【資料片五】飢餓法則 (Survival Rules)</h2>
      <p class="text-slate-300 text-sm leading-relaxed">
        身處嚴酷的荒野沙漠，每個人開局擁有 ${maxHp.toLocaleString()} 點生存值。${sv.seasonOver ? '本賽季已結束，毒圈停止擴張' : `每天毒圈都會自動剝奪大家 ${decayPerDay.toLocaleString()} 點生命線`}（第 ${sv.days} 天，目前全服已流失 ${currentPenalty.toLocaleString()} HP）！${scheduleNote}<br>
        🍖 <strong>外出狩獵與搜刮：</strong> <span class="text-emerald-400 font-mono font-bold tracking-wider">[ 狩獵補血 = Calories × 1 ]</span> / <span class="text-amber-300 font-mono font-bold tracking-wider">[ 搜刮物資 = TRIMP × 1.5 ]</span><br>
        ☠️ <strong>淘汰與結算：</strong> <span class="text-rose-400 font-mono font-bold tracking-wider">[ 最終生存HP = 最大血量 - (天數 × 每日衰減) + 狩獵補血 + 搜刮物資 ]</span>
      <br>🔁 <strong>浴火重生：</strong>生存值歸零的英雄不會永久淘汰，只要再去完成有效運動、補回 HP，就能立刻重返荒野！</p>
      <div class="mt-2 text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
          <p><span class="text-amber-500 font-bold">⏱️ 系統判斷規則：</span> 所有鍛鍊僅採計單次持續 <strong>${gameState?.summary?.minDurationMinutes || gameState?.boss?.rules?.minDurationMinutes || 30}分鐘</strong> 以上的運動。</p>
          <p>• <strong>TRIMP (衝力)：</strong>計算方式為 時間 × (均心率÷MaxHR) × <i>e</i>^(1.92×(均心率÷MaxHR))</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${survivingHeroes.length === 0 ? `<div class="col-span-full p-6 text-center text-slate-500 text-sm bg-slate-900/60 border border-slate-800 rounded-2xl">目前尚無冒險者資料，請稍候同步或由 GM 於後台新增英雄。</div>` : ''}
      ${survivingHeroes.map((h, i) => {
        const survAvatarHtml = typeof window.renderHeroAvatarHtml === 'function'
          ? window.renderHeroAvatarHtml(h, 'w-10 h-10', 'rounded-xl')
          : `<div class="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden border border-slate-700"><img src="${h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`}" class="w-full h-full object-cover"></div>`;
        const survTitleHtml = typeof window.renderHeroCustomTitleHtml === 'function'
          ? window.renderHeroCustomTitleHtml(h.name)
          : '';
        const badgeCnt = Object.keys(gameState?.heroBadges?.[h.name] || {}).length;
        return `
        <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-900/80 p-4 border rounded-2xl cursor-pointer transition ${h.isDead ? 'border-slate-800 opacity-50 grayscale' : 'border-amber-500/40 relative overflow-hidden hover:border-amber-400'}">
            <div class="flex items-center space-x-3 mb-3">
               ${survAvatarHtml}
               <div>
                  <div class="flex flex-wrap items-center gap-1">
                    <h4 class="font-bold text-white">${h.name} <span class="text-[10px] text-slate-500">(${h.guild})</span></h4>
                    ${survTitleHtml}
                  </div>
                  <p class="text-[10px] ${h.isDead ? 'text-red-500' : 'text-emerald-400'} font-bold">
                    ${h.isDead ? '☠️ 已被荒野吞噬（去運動補血即可復活）' : '🟢 存活中'} • <span class="text-amber-300">🎖️ ${badgeCnt} 徽章</span>
                  </p>
               </div>
               ${i === 0 && !h.isDead ? '<span class="absolute top-2 right-2 text-2xl">👑</span>' : ''}
            </div>
            <div class="text-[10px] text-slate-400 flex justify-between mb-1">
               <span>生存值HP <span class="text-[8px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded ml-1">= 初始 - 毒圈 + 熱量 + 衝力</span></span>
               <span class="text-amber-400 font-mono text-sm font-bold">${Math.max(0, h.currentHp).toLocaleString()}</span>
            </div>
            <div class="w-full h-1.5 ${h.isDead ? 'bg-slate-800' : 'bg-slate-900'} rounded-full overflow-hidden">
               <div class="h-full bg-amber-500" style="width: ${h.isDead ? 0 : Math.min(100, Math.max(0, (h.currentHp/maxHp)*100))}%"></div>
            </div>
            <div class="mt-3 pt-2 border-t border-slate-800 flex justify-between text-[9px] text-slate-500">
               <span>狩獵熱量: +${Math.floor(h.food).toLocaleString()}</span>
               <span>搜刮物資: +${Math.floor(h.scavenge).toLocaleString()}</span>
            </div>
        </div>
      `}).join('')}
    </div>
  `;
}

// -------------------------------------------------------------
// EXPANSION 6: 鋼鐵要塞 (Base Builder)
// -------------------------------------------------------------
function renderBaseBuilderView() {
  const container = document.getElementById("tab-content-base");
  if (!container) return;

  const heroList = gameState?.heroStats || [];
  let totalWood = 0, totalSteel = 0, totalMana = 0;
  heroList.forEach(h => {
     totalWood += (h.totalCalories || 0); // Calories = Wood
     totalSteel += (h.totalTrimp || 0);   // TRIMP = Steel
     totalMana += (h.scoreMaxGap ?? h.maxGap ?? 0) * 10 + (h.scoreZone2 ?? h.zone2Count ?? 0) * 50; // Mana
  });

  // Level thresholds (configurable via GM panel or default 10k/500/500)
  const getLevel = (wood, steel, mana) => {
      let lvl = 1;
      const baseW = Number(gameState?.base?.woodTarget) || 10000;
      const baseS = Number(gameState?.base?.steelTarget) || 500;
      const baseM = Number(gameState?.base?.manaTarget) || 500;
      let wReq = baseW, sReq = baseS, mReq = baseM;
      const wStep = Math.max(100, Math.round(baseW * 1.5));
      const sStep = Math.max(50, Math.round(baseS * 1.5));
      const mStep = Math.max(50, Math.round(baseM * 1.5));
      while (wood >= wReq && steel >= sReq && mana >= mReq && lvl < 10) {
          lvl++; wReq += wStep; sReq += sStep; mReq += mStep;
      }
      return { lvl, nW: wReq, nS: sReq, nM: mReq };
  };

  const status = getLevel(totalWood, totalSteel, totalMana);

  container.innerHTML = `
    <!-- Lore / Story -->
    <div class="mb-6 bg-slate-900 border-l-4 border-blue-500 p-4 rounded-r-xl shadow-lg">
      <h2 class="text-xl font-black text-blue-400 mb-1">【資料片六】鋼鐵要塞 (Iron Fortress)</h2>
      <p class="text-slate-300 text-sm leading-relaxed">
        這不是一個人的戰鬥，全服玩家的汗水將化作資源，我們正在合力升級這座村莊基地！<br>
        🌳 <strong>糧倉與木材：</strong> 燃燒熱量提供基礎建材。<span class="text-emerald-400 font-mono font-bold tracking-wider">[ 木材產量 = Calories ]</span><br>
        ⚙️ <strong>兵工廠鋼鐵：</strong> 引擎過載練出來的厚實鋼鐵。<span class="text-blue-400 font-mono font-bold tracking-wider">[ 鋼鐵產量 = TRIMP ]</span><br>
        🔮 <strong>魔法神石：</strong> 精準的心率控制提煉出高階資源。<span class="text-purple-400 font-mono font-bold tracking-wider">[ 神石產量 = MaxGap × 10 + Zone2次數 × 50 ]</span><br>
        <span class="text-rose-300">⚠️ 升級存在「偏食危機」！如果大家只跑有氧，鋼鐵量太少，全村等級就會卡死升不上去！</span>
      </p>
      <div class="mt-2 text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
          <p><span class="text-amber-500 font-bold">⏱️ 系統判斷規則：</span> 所有鍛鍊僅採計單次持續 <strong>${gameState?.summary?.minDurationMinutes || gameState?.boss?.rules?.minDurationMinutes || 30}分鐘</strong> 以上的運動。</p>
          <p>• <strong>Zone2：</strong>該次運動平均心率落在個人最大心率 (MaxHR) 60% ~ 75% 之間。</p>
          <p>• <strong>MaxGap：</strong>單次最高心率 - 單次平均心率。</p>
          <p>• <strong>TRIMP (鋼鐵)：</strong>時間 × (均心率÷MaxHR) × <i>e</i>^(1.92×(均心率÷MaxHR))</p>
      </div>
    </div>

    <div class="bg-slate-950 border border-slate-800 rounded-3xl p-6 relative overflow-hidden mb-6 glow-border-cyan text-center">
       <span class="text-xs font-bold text-slate-500">全服終極要塞</span>
       <h3 class="text-4xl text-white font-black font-title mb-2">鐵峰堡壘</h3>
       <div class="inline-block bg-blue-900/50 text-blue-300 px-4 py-1 rounded-full border border-blue-500/50 mb-6 font-bold tracking-wide">
         當前等級：Level ${status.lvl}
       </div>
       
       <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-slate-900 p-4 rounded-2xl border ${totalWood >= status.nW ? 'border-emerald-500' : 'border-slate-800'}">
             <div class="text-2xl mb-1">🌳 木材庫存</div>
             <div class="text-xl font-mono text-white mb-2">${totalWood.toLocaleString()} <span class="text-xs text-slate-500">/ ${status.nW.toLocaleString()} (升級需求)</span></div>
             <div class="w-full h-2 bg-slate-950 rounded-full"><div class="h-full bg-emerald-500" style="width: ${Math.min(100, (totalWood/status.nW)*100)}%"></div></div>
          </div>
          <div class="bg-slate-900 p-4 rounded-2xl border ${totalSteel >= status.nS ? 'border-blue-500' : 'border-slate-800'}">
             <div class="text-2xl mb-1">⚙️ 鋼鐵錠庫存</div>
             <div class="text-xl font-mono text-white mb-2">${Math.round(totalSteel).toLocaleString()} <span class="text-xs text-slate-500">/ ${status.nS.toLocaleString()} (升級需求)</span></div>
             <div class="w-full h-2 bg-slate-950 rounded-full"><div class="h-full bg-blue-500" style="width: ${Math.min(100, (totalSteel/status.nS)*100)}%"></div></div>
          </div>
          <div class="bg-slate-900 p-4 rounded-2xl border ${totalMana >= status.nM ? 'border-purple-500' : 'border-slate-800'}">
             <div class="text-2xl mb-1">🔮 魔法原石</div>
             <div class="text-xl font-mono text-white mb-2">${totalMana.toLocaleString()} <span class="text-xs text-slate-500">/ ${status.nM.toLocaleString()} (升級需求)</span></div>
             <div class="w-full h-2 bg-slate-950 rounded-full"><div class="h-full bg-purple-500" style="width: ${Math.min(100, (totalMana/status.nM)*100)}%"></div></div>
          </div>
       </div>
    </div>

    <!-- 鋼鐵要塞貢獻榜 -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 mt-6">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2">
          <i data-lucide="hammer" class="w-4 h-4 text-blue-400"></i>
          <span>👷 要塞工程隊卓越傑出貢獻榜</span>
        </h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
           <h4 class="text-xs font-bold text-emerald-400 mb-2">🌳 頂級伐木工 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">總卡路里</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalCalories || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 5).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-emerald-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-emerald-400 font-bold">${h.res.toLocaleString()}</span>
               </div>
             `).join('')}
           </div>
        </div>
        <div>
           <h4 class="text-xs font-bold text-blue-400 mb-2">⚙️ 鋼鐵礦工 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">總TRIMP</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalTrimp || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 5).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex items-center justify-between cursor-pointer hover:border-blue-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden">
                     <span class="text-slate-500 font-bold mr-1">${i+1}.</span>
                     ${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-xs w-full justify-start truncate")}
                  </div>
                  <span class="text-blue-400 font-bold font-mono pl-3 shrink-0">${Math.round(h.res).toLocaleString()}</span>
               </div>
             `).join('')}
           </div>
        </div>
        <div>
           <h4 class="text-xs font-bold text-purple-400 mb-2">🔮 魔法煉金術師 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">Gap×10+Z2×50</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: ((h.scoreMaxGap ?? h.maxGap ?? 0) * 10 + (h.scoreZone2 ?? h.zone2Count ?? 0) * 50)
             })).sort((a,b)=>b.res-a.res).slice(0, 5).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-purple-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-purple-400 font-bold">${h.res.toLocaleString()}</span>
               </div>
             `).join('')}
           </div>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// EXPANSION 7: 遺跡拼圖 (Relic Bingo)
// -------------------------------------------------------------
function renderBingoView() {
  const container = document.getElementById("tab-content-bingo");
  if (!container) return;

  const acts = (gameState?.activities || []).filter(a => a.isValidAttack);
  const m = gameState?.bingo?.multiplier || 1.0;
  
  // 9 Check conditions
  const wSum = (list) => list.reduce((s, a) => s + (a.scoreWeight ?? 1), 0); // 限時活動期間的運動以加成倍率計數
  const c1 = wSum(acts.filter(a => a.duration >= 60)) >= Math.ceil(10 * m);
  const c2 = wSum(acts.filter(a => a.isZone2)) >= Math.ceil(20 * m);
  const c3 = acts.reduce((s, a) => s + (a.trimp || 0), 0) >= 3000 * m;
  const c4 = wSum(acts.filter(a => a.gapVal >= 70)) >= Math.ceil(5 * m);
  const c5 = (gameState?.heroStats || []).filter(h => (h.scoreWorkouts ?? h.validWorkouts ?? 0) >= 10).length >= Math.max(1, Math.ceil(3 * m));
  const c6 = acts.reduce((s, a) => s + (a.calories || 0), 0) >= 50000 * m;
  const c7 = (gameState?.heroStats || []).filter(h => (h.scoreMaxGap ?? h.maxGap ?? 0) >= 80).length >= Math.max(1, Math.ceil(2 * m));
  const c8 = acts.filter(a => a.isManual).length <= Math.max(1, Math.floor(5 / m)); // Reward for auto-sync hardware
  const c9 = true; // Free space

  const grid = [
     { key: "長征先鋒", desc: `全服累計 ${Math.ceil(10 * m)} 次超過 1 小時的訓練`, ok: c1 },
     { key: "燃脂大師", desc: `解鎖 ${Math.ceil(20 * m)} 次完美的 Zone 2 綠色指標`, ok: c2 },
     { key: "心跳超載", desc: `全服累積引擎衝力 TRIMP 破 ${Math.ceil(3000 * m).toLocaleString()}`, ok: c3 },
     { key: "爆發限界", desc: `出現 ${Math.ceil(5 * m)} 次落差大於 70 的魔鬼心率訓練`, ok: c4 },
     { key: "紀律部隊", desc: `伺服器至少有 ${Math.max(1, Math.ceil(3 * m))} 人達成 10 次出勤`, ok: c5 },
     { key: "脂肪燃燒者", desc: `全服大熱量！總計燃燒 ${(50000 * m).toLocaleString()} 卡路里`, ok: c6 },
     { key: "死神擦肩", desc: `尋找 ${Math.max(1, Math.ceil(2 * m))} 名極限 MaxGap 突破 80 的勇者`, ok: c7 },
     { key: "真金不怕火", desc: `賽季手動打卡(無穿戴數據) 次數控制在 ${Math.max(1, Math.floor(5 / m))} 次內`, ok: c8 },
     { key: "冒險起點", desc: "中央免費贈送的補給空間", ok: c9 },
  ];

  container.innerHTML = `
    <!-- Lore / Story -->
    <div class="mb-6 bg-slate-900 border-l-4 border-fuchsia-500 p-4 rounded-r-xl shadow-lg">
      <h2 class="text-xl font-black text-fuchsia-400 mb-1">【資料片七】戰神拼圖 (Relic Bingo)</h2>
      <p class="text-slate-300 text-sm leading-relaxed">
        這一次我們不比數值暴力，比的是「精準解題」與「團隊溝通」！<br>
        全服共享一張龐大的九宮格石板，每一格都有專屬的「解鎖條件」。<br>
        <span class="text-fuchsia-300">💡 提示：每天在群組討論一下，有人該去刷 Zone2 燃脂框、有人必須挑戰重訓補足 MaxGap 落差！誰能把九宮格全部照亮？</span>
      </p>
    </div>

    <div class="max-w-3xl mx-auto bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <h3 class="text-center text-2xl font-bold text-white mb-6">👁️‍🗨️ 古代英雄傳承石板</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${grid.map(g => `
              <div class="aspect-square flex flex-col justify-center items-center text-center p-4 rounded-2xl border-2 transition-all 
                ${g.ok ? 'bg-fuchsia-900/30 border-fuchsia-500 shadow-[0_0_15px_rgba(217,70,239,0.3)] glow-border-purple' : 'bg-slate-900/50 border-slate-800 opacity-60'}">
                 <div class="text-3xl mb-2">${g.ok ? '✅' : '🔒'}</div>
                 <h4 class="font-bold text-white text-sm mb-1">${g.key}</h4>
                 <p class="text-[10px] text-slate-400">${g.desc}</p>
              </div>
            `).join('')}
        </div>
    </div>

    <!-- 戰神拼圖貢獻 MVP -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 mt-6">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 mt-8">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2">
          <i data-lucide="users" class="w-5 h-5 text-fuchsia-400"></i>
          <span>🏆 戰神拼圖 (各板塊領跑者)</span>
        </h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        <!-- 卡路里貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-rose-400 mb-2">🔥 脂肪燃燒者 <span class="text-[9px] text-slate-500 ml-1">總卡路里</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalCalories || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-rose-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-rose-400 font-bold font-mono">${Math.round(h.res).toLocaleString()} kcal</span>
               </div>
             `).join('')}
           </div>
        </div>

        <!-- 訓練時長貢獻 (這需要在 hero 活動算, 但簡單點用出勤次數替代或時長) -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-amber-400 mb-2">⌚ 紀律部隊 <span class="text-[9px] text-slate-500 ml-1">總出勤次數</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreWorkouts ?? h.validWorkouts ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-amber-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-amber-400 font-bold font-mono">${Math.round(h.res).toLocaleString()} 次</span>
               </div>
             `).join('')}
           </div>
        </div>

        <!-- Zone2 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-emerald-400 mb-2">🟢 燃脂大師 <span class="text-[9px] text-slate-500 ml-1">Zone 2 次數</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreZone2 ?? h.zone2Count ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-emerald-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-emerald-400 font-bold font-mono">${Math.round(h.res).toLocaleString()} 次</span>
               </div>
             `).join('')}
           </div>
        </div>

        <!-- TRIMP 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-blue-400 mb-2">⚙️ 心跳超載 <span class="text-[9px] text-slate-500 ml-1">累積衝力 TRIMP</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalTrimp || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-blue-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-blue-400 font-bold font-mono">${Math.round(h.res).toLocaleString()}</span>
               </div>
             `).join('')}
           </div>
        </div>

        
        <!-- Elevation 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-teal-400 mb-2">🏔️ 征服巔峰 <span class="text-[9px] text-slate-500 ml-1">累積爬升 (Elevation)</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreElevation ?? h.totalElevation ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-teal-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-teal-400 font-bold font-mono">${Math.round(h.res).toLocaleString()} m</span>
               </div>
             `).join('')}
           </div>
        </div>

        <!-- MaxGap 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-purple-400 mb-2">限界突破 <span class="text-[9px] text-slate-500 ml-1">最高落差 MaxGap</span></h4>
           <div class="space-y-2">
             ${(gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreMaxGap ?? h.maxGap ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => `
               <div onclick="openHeroDetailModal(${jsArg(h.name)})" class="bg-slate-950 p-2 text-xs rounded-xl border border-slate-800 flex justify-between cursor-pointer hover:border-purple-500/50 transition">
                  <div class="flex items-center space-x-1.5 w-full overflow-hidden"><span class="text-slate-500 font-bold mr-1">${i+1}.</span>${renderHeroTag(h.name, "bg-transparent border-0 p-0 text-[11px] font-bold w-full justify-start truncate")}</div>
                  <span class="text-purple-400 font-bold font-mono">${Math.round(h.res).toLocaleString()}</span>
               </div>
             `).join('')}
           </div>
        </div>

      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// USER AVATAR UPLOAD
// -------------------------------------------------------------
window.handleAvatarUpload = function(heroName, inputElement) {
  if (!inputElement.files || inputElement.files.length === 0) return;
  const file = inputElement.files[0];
  
  if (!file.type.startsWith('image/')) {
    alert("請上傳有效的圖片檔案！");
    return;
  }
  
  if (typeof showToast === 'function') showToast("🖼️ 正在處理並壓縮圖片...", "blue");

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 150; // Limited size to save Supabase bandwidth
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions (Cover logic)
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // Simple scaling
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to WebP for extremely low file size
      canvas.toBlob(async (blob) => {
        try {
          if (typeof showToast === 'function') showToast("上傳至 Supabase 雲端中...", "blue");
          const hexName = Array.from(new TextEncoder().encode(heroName)).map(b => b.toString(16).padStart(2, '0')).join('');
          const fileName = `hero_${hexName}.webp`;
          
          let publicUrl = await supabase.uploadFile('avatars', fileName, blob, 'image/webp');
          publicUrl += "?t=" + Date.now(); // Cache busting
          
          const updatedRows = await supabase.update('heroes', `name=eq.${encodeURIComponent(heroName)}`, { avatar: publicUrl });
          if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
            throw new Error(`資料庫中找不到英雄【${heroName}】，頭像未更新`);
          }
          if (typeof showToast === 'function') showToast("🎉 頭像更新成功！", "green");
          
          // Re-render
          const hero = gameState?.heroes?.find(h => h.name === heroName);
          if (hero) hero.avatar = publicUrl;
          if (typeof window.syncFromDatabase === 'function') await window.syncFromDatabase();
          openHeroDetailModal(heroName);
          if (window.lucide) lucide.createIcons();
        } catch (err) {
          console.error(err);
          if (typeof showToast === 'function') showToast("❌ 頭像更新失敗: " + err.message, "error");
        } finally {
          inputElement.value = '';
        }
      }, 'image/webp', 0.85); // 85% quality WebP
    }
    img.src = e.target.result;
  }
  reader.readAsDataURL(file);
}
