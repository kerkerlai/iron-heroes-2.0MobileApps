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
  // 統一大頭貼 (含 GM 特效、名字跳脫；過往英雄史中自動改讀凍結頭像)
  const avatarHtml = renderUnifiedAvatarHtml(name, 'w-5 h-5', 'rounded-full');
  const titlePill = renderUnifiedTitlePill(name);
  return `<span class="cursor-pointer hover:bg-slate-800 transition inline-flex items-center space-x-1.5 ${extraClasses}" onclick="openHeroDetailModal(${jsArg(name)})">
            ${avatarHtml}
            <span class="font-bold text-white text-xs">${escapeHtml(name)}</span>
            ${titlePill}
          </span>`;
}

// -------------------------------------------------------------
// 🎴 統一英雄卡 (Unified Hero Card) — 11 大資料片共用的「大頭貼優先」英雄呈現
//   基本資訊永不缺席：大頭貼 (含 GM 頭像特效) / 名字 / 公會 / 狀態 / 徽章數 (已解鎖 / 總數)
//   之後才接各資料片專屬指標 (分數、傷害、HP、里程、火種…)。樣式見 /css/heroCard.css
// -------------------------------------------------------------

/** 目前生效中的徽章目錄 (手機徽章由 getActiveBadgeCatalog 依 GM 設定決定是否納入) */
function getActiveBadgeCatalogList() {
  const st = window.gameState || gameState;
  const cat = window.getActiveBadgeCatalog ? window.getActiveBadgeCatalog(st) : (window.BADGE_CATALOG || []);
  return Array.isArray(cat) ? cat : [];
}
/** 徽章總數 (分母)：統一來源，取代過去寫死的 100 */
function getActiveBadgeTotal() {
  return getActiveBadgeCatalogList().length;
}
/** 某英雄已解鎖徽章數 / 總數 (只計算目前目錄內的徽章，避免分子大於分母) */
function getHeroBadgeProgress(heroName) {
  const frozenBadges = uhcFrozen ? uhcFrozenInfo(heroName)?.badges : null;
  if (Array.isArray(frozenBadges) && frozenBadges.length === 2) return { unlocked: Number(frozenBadges[0]) || 0, total: Number(frozenBadges[1]) || 0 };
  const st = window.gameState || gameState;
  const catalog = getActiveBadgeCatalogList();
  const unlockedMap = st?.heroBadges?.[heroName] || {};
  const ids = new Set(catalog.map(b => b.id));
  const unlocked = catalog.length ? Object.keys(unlockedMap).filter(id => ids.has(id)).length : Object.keys(unlockedMap).length;
  return { unlocked, total: catalog.length };
}
window.getActiveBadgeTotal = getActiveBadgeTotal;
window.getHeroBadgeProgress = getHeroBadgeProgress;

// 快照「時間凍結」顯示情境：渲染過往英雄史時，英雄卡改讀快照當下凍結的大頭貼 / 公會 / 徽章數 / 稱號 / 狀態
let uhcFrozen = null;
function withFrozenHeroInfo(ctx, fn) {
  const prev = uhcFrozen;
  uhcFrozen = ctx;
  try { return fn(); } finally { uhcFrozen = prev; }
}
function uhcFrozenInfo(heroName) {
  return uhcFrozen?.heroes?.[heroName] || null;
}
/** GM 頭像特效 / 稱號 (凍結情境下讀快照值；舊快照沒有凍結資料時不套用「現在」的特效) */
function uhcHeroFx(heroName) {
  if (uhcFrozen) {
    const info = uhcFrozenInfo(heroName);
    const presets = window.AVATAR_FX_PRESETS || {};
    const key = info?.fx && presets[info.fx] ? info.fx : 'none';
    return { fx: key, customTitle: info?.title || '', preset: presets[key] || { ringClass: '', pillClass: '', icon: '', defaultTitle: '' } };
  }
  return typeof window.getHeroActiveFx === 'function' ? window.getHeroActiveFx(heroName) : null;
}
window.withFrozenHeroInfo = withFrozenHeroInfo;

function uhcSafeColor(c, fallback = '#f59e0b') {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '').trim()) ? String(c).trim() : fallback;
}
function uhcFindHero(heroName) {
  const st = window.gameState || gameState;
  const live = (st?.heroes || []).find(h => h.name === heroName) || null;
  const info = uhcFrozen ? uhcFrozenInfo(heroName) : null;
  if (info) return { ...(live || {}), name: heroName, avatar: info.avatar || live?.avatar || '', guild: info.guild ?? live?.guild ?? '' };
  return live;
}
function uhcFindGuild(guildName) {
  const st = window.gameState || gameState;
  const live = (st?.guilds || []).find(g => g.name === guildName) || null;
  const info = uhcFrozen?.guilds?.[guildName];
  if (info) return { ...(live || {}), name: guildName, badge: info.badge || live?.badge || '🛡️', color: info.color || live?.color || '#64748b' };
  const resolved = typeof window.resolveGuildMeta === 'function' ? window.resolveGuildMeta(guildName, st?.gmOps) : null;
  if (live) {
    return {
      ...live,
      badge: resolved?.badge || live.badge || '🛡️',
      color: resolved?.color || live.color || '#64748b'
    };
  }
  if (guildName) {
    return {
      name: guildName,
      badge: resolved?.badge || '🛡️',
      color: resolved?.color || '#64748b',
      members: []
    };
  }
  return null;
}

/**
 * 大頭貼 (沿用 badgesCatalog.js 的 GM 頭像特效外框 / 動態疊層 / 角標)，名字與網址全部跳脫，
 * 名字含引號、空白、中日韓文字都不會破壞 HTML。
 */
function renderUnifiedAvatarHtml(heroName, sizeClass = 'uhc-avatar', roundedClass = 'rounded-2xl', avatarUrl = '') {
  const hero = uhcFindHero(heroName);
  const url = avatarUrl || hero?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(heroName)}`;
  const fxInfo = uhcHeroFx(heroName);
  const hasFx = Boolean(fxInfo && fxInfo.fx && fxInfo.fx !== 'none');
  const ring = hasFx ? (fxInfo.preset?.ringClass || '') : 'uhc-avatar-plain';
  return `<div class="relative inline-flex flex-shrink-0 ${sizeClass} ${roundedClass} ${ring} bg-slate-800 select-none">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(heroName)}" loading="lazy" class="w-full h-full object-cover ${roundedClass}">
      ${hasFx ? `<span class="avatar-fx-overlay avatar-fx-overlay-${escapeHtml(fxInfo.fx)} ${roundedClass}"></span>` : ''}
      ${hasFx && fxInfo.preset?.icon ? `<span class="avatar-fx-corner-badge" title="${escapeHtml(fxInfo.customTitle || fxInfo.preset.label || '')}">${fxInfo.preset.icon}</span>` : ''}
    </div>`;
}

/** GM 自訂稱號 / 特效稱號小標籤 + GM 皇家御賜限定榮譽標籤 (跳脫版) */
function renderUnifiedTitlePill(heroName) {
  const parts = [];
  const fxInfo = uhcHeroFx(heroName);
  if (fxInfo && (fxInfo.customTitle || (fxInfo.fx && fxInfo.fx !== 'none'))) {
    const title = fxInfo.customTitle || fxInfo.preset?.defaultTitle;
    if (title) {
      parts.push(`<span class="uhc-pill ${fxInfo.preset?.pillClass || ''}">${escapeHtml(title)}</span>`);
    }
  }
  if (!uhcFrozen && typeof window.getHeroGmExclusiveHonors === 'function') {
    const gmHonors = window.getHeroGmExclusiveHonors(heroName);
    gmHonors.forEach(h => {
      const pillTone = h.rarity === 'celestial'
        ? 'bg-gradient-to-r from-cyan-950 via-indigo-950 to-sky-900 text-cyan-200 border-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.45)]'
        : (h.rarity === 'sovereign'
          ? 'bg-gradient-to-r from-emerald-950 via-teal-900 to-amber-950 text-emerald-200 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.45)]'
          : 'bg-zinc-950 text-yellow-300 border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.45)]');
      parts.push(`<span class="uhc-pill ${pillTone}" title="👑 GM 皇家御賜【${escapeHtml(h.displayName)}】(Lv.${h.level}/${h.totalTiers})&#10;${escapeHtml(h.condition)}">${escapeHtml(h.icon)} ${escapeHtml(h.tierName)}</span>`);
    });
  }
  return parts.join('');
}

/** 公會標籤 (公會徽記 + 公會色) */
function renderUnifiedGuildPill(guildName) {
  if (!guildName) return `<span class="uhc-pill uhc-tone-muted">🛡️ 無公會</span>`;
  const g = uhcFindGuild(guildName);
  const color = uhcSafeColor(g?.color, '#64748b');
  return `<span class="uhc-pill" style="border-color:${color}99;" title="公會：${escapeHtml(guildName)}"><span class="uhc-guild-dot" style="background:${color}"></span>${escapeHtml(g?.badge || '🛡️')} ${escapeHtml(guildName)}</span>`;
}

/**
 * 統一英雄卡
 * @param {string} heroName 英雄名稱 (gameState.heroes[].name)
 * @param {object} opts
 *   rank      {number}   名次 (1 = 👑 金框)
 *   primary   {object}   主指標 { label, value, accent } — 顯示於卡片右上，大字
 *   metrics   {Array}    次要指標 [{ label, value, accent }]
 *   status    {Array|string} 狀態標籤 [{ text, tone: ok|bad|warn|info|gold|purple|muted }]
 *   guild     {string}   公會 (預設取 gameState.heroes 的 guild)
 *   compact   {boolean}  精簡版 (排行榜小清單)
 *   podium    {boolean}  直式置中王座版 (窄欄冠軍)
 *   dead      {boolean}  灰階 (飢餓法則淘汰)
 *   highlight {boolean}  金框強調 (預設 rank === 1)
 *   footHtml  {string}   卡片底部附加 HTML (呼叫端自行跳脫，例如血條)
 */
function renderUnifiedHeroCard(heroName, opts = {}) {
  const name = String(heroName ?? '');
  const hero = uhcFindHero(name);
  const guild = opts.guild ?? hero?.guild ?? '';
  const badge = getHeroBadgeProgress(name);
  const rank = Number(opts.rank) || 0;
  const highlight = opts.highlight ?? rank === 1;
  const esc = (v) => escapeHtml(v ?? '');
  const accentCls = (a) => /^[\w\s:\-\/\[\]#.]+$/.test(String(a || '')) ? String(a) : '';

  const statusList = (Array.isArray(opts.status) ? opts.status : (opts.status ? [{ text: opts.status }] : [])).filter(s => s && (s.text || s.text === 0));
  if (!statusList.length && opts.autoStatus !== false) statusList.push(uhcActivityStatus(name));
  const statusHtml = statusList.map(s => `<span class="uhc-pill uhc-tone-${['ok', 'bad', 'warn', 'info', 'gold', 'purple', 'muted'].includes(s.tone) ? s.tone : 'muted'}"${s.title ? ` title="${esc(s.title)}"` : ''}>${esc(s.text)}</span>`).join('');

  const rankHtml = rank > 0
    ? `<span class="uhc-rank ${rank <= 3 ? `uhc-rank-${rank}` : ''}">${rank === 1 ? '👑' : `#${rank}`}</span>`
    : '';
  const primaryHtml = opts.primary
    ? `<div class="uhc-primary"><span class="uhc-primary-label">${esc(opts.primary.label)}</span><span class="uhc-primary-value ${accentCls(opts.primary.accent)}">${esc(opts.primary.value)}</span></div>`
    : '';
  const metrics = (opts.metrics || []).filter(Boolean);
  const metricsHtml = metrics.length
    ? `<div class="uhc-metrics">${metrics.map(m => `<div class="uhc-metric"${m.title ? ` title="${esc(m.title)}"` : ''}><span class="uhc-metric-label">${esc(m.label)}</span><span class="uhc-metric-value ${accentCls(m.accent)}">${esc(m.value)}</span></div>`).join('')}</div>`
    : '';

  const cls = ['uhc', opts.compact ? 'uhc-compact' : '', opts.podium ? 'uhc-podium' : '', highlight ? 'uhc-top1' : '', opts.dead ? 'uhc-dead' : ''].filter(Boolean).join(' ');
  return `
    <div class="${cls}" role="button" tabindex="0" data-hero="${esc(name)}" aria-label="${esc(name)} 英雄卡"
         onclick="openHeroDetailModal(${jsArg(name)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openHeroDetailModal(${jsArg(name)});}">
      <div class="uhc-head">
        <div class="uhc-avatar-wrap">
          ${renderUnifiedAvatarHtml(name, 'uhc-avatar', opts.podium ? 'rounded-full' : 'rounded-2xl')}
          ${rankHtml}
        </div>
        <div class="uhc-info">
          <div class="uhc-name-row"><span class="uhc-name" title="${esc(name)}">${esc(name)}</span>${renderUnifiedTitlePill(name)}</div>
          <div class="uhc-tags">
            ${renderUnifiedGuildPill(guild)}
            <span class="uhc-pill uhc-badges" title="已解鎖徽章 / 徽章總數">🎖️ ${badge.unlocked} / ${badge.total}</span>
          </div>
          ${statusHtml ? `<div class="uhc-tags">${statusHtml}</div>` : ''}
        </div>
        ${opts.podium ? '' : primaryHtml}
      </div>
      ${opts.podium ? primaryHtml : ''}
      ${metricsHtml}
      ${opts.footHtml ? `<div class="uhc-foot">${opts.footHtml}</div>` : ''}
    </div>`;
}

/** 預設狀態：近 7 日是否有有效運動 (呼叫端沒給資料片專屬狀態時使用，確保「狀態」永不缺席) */
let uhcActivityCache = { ref: null, map: {} };
function uhcActivityStatus(heroName) {
  if (uhcFrozen) return uhcFrozenInfo(heroName)?.status || { text: '🏛️ 歷史參戰', tone: 'muted' };
  const st = window.gameState || gameState;
  const acts = st?.activities || [];
  if (uhcActivityCache.ref !== acts) {
    const map = {};
    acts.forEach(a => {
      if (!a?.isValidAttack || !a.hero) return;
      const ymd = typeof window.normalizeDateYMD === 'function' ? window.normalizeDateYMD(a.date) : String(a.date || '').slice(0, 10).replace(/-/g, '/');
      if (ymd && (!map[a.hero] || ymd > map[a.hero])) map[a.hero] = ymd;
    });
    uhcActivityCache = { ref: acts, map };
  }
  const last = uhcActivityCache.map[heroName];
  if (!last) return { text: '💤 尚未出征', tone: 'muted' };
  const today = typeof window.getTodayYMD === 'function' ? window.getTodayYMD() : '';
  const diff = (today && typeof window.diffDaysYMD === 'function') ? window.diffDaysYMD(last, today) : null;
  if (diff !== null && diff <= 7) return { text: diff <= 0 ? '🔥 今日出征' : `🟢 ${diff} 天前出征`, tone: 'ok' };
  return { text: `💤 最近出征 ${last.slice(5)}`, tone: 'muted' };
}

/** 英雄卡網格 (手機 1 欄、平板以上自動填滿) */
function renderUnifiedHeroGrid(cards, emptyText = '目前尚無冒險者資料') {
  const list = (cards || []).filter(Boolean);
  if (!list.length) return `<div class="p-6 text-center text-slate-500 text-sm bg-slate-900/60 border border-slate-800 rounded-2xl">${escapeHtml(emptyText)}</div>`;
  return `<div class="uhc-grid">${list.join('')}</div>`;
}
/** 精簡英雄卡直列清單 (排行榜 Top N) */
function renderUnifiedHeroList(cards, emptyText = '尚無資料') {
  const list = (cards || []).filter(Boolean);
  if (!list.length) return `<div class="p-3 text-center text-slate-500 text-xs">${escapeHtml(emptyText)}</div>`;
  return `<div class="uhc-list">${list.join('')}</div>`;
}
/** 公會成員頭像疊 (公會榜一眼看到成員是誰) */
function renderGuildAvatarStack(members, max = 12) {
  const arr = (members || []).filter(Boolean);
  const shown = arr.slice(0, max);
  const more = arr.length - shown.length;
  return `<span class="uhc-stack">${shown.map(n => `<span class="uhc-stack-item" title="${escapeHtml(n)}" onclick="event.stopPropagation();openHeroDetailModal(${jsArg(n)})">${renderUnifiedAvatarHtml(n, 'w-8 h-8', 'rounded-full')}</span>`).join('')}${more > 0 ? `<span class="uhc-stack-item inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300" style="line-height:1">+${more}</span>` : ''}</span>`;
}
window.renderUnifiedHeroCard = renderUnifiedHeroCard;
window.renderUnifiedHeroGrid = renderUnifiedHeroGrid;
window.renderUnifiedHeroList = renderUnifiedHeroList;
window.renderUnifiedAvatarHtml = renderUnifiedAvatarHtml;
window.renderGuildAvatarStack = renderGuildAvatarStack;

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

// RPG Class Metadata：定義已移至 /js/seasonSnapshot.js (前台與 GM 後台快照共用同一份)
const RPG_CLASSES = window.RPG_CLASSES;

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
  // 📱 App 內嵌模式：?hero=名稱 → 戰情室預設選這位英雄 (先與資料庫清洗規則對齊，避免含引號名稱找不到人)
  const reqHero = urlParams.get('hero');
  if (reqHero) { try { selectedViewerHero = typeof window.safeDisplayText === 'function' ? window.safeDisplayText(reqHero) : reqHero; } catch (e) {} }
  // 彈出式英雄戰力卡支援點擊背景遮罩或按下 Esc 關閉
  document.getElementById('modal-hero-profile')?.addEventListener('click', e => {
    if (e.target && e.target.id === 'modal-hero-profile') closeHeroProfileModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeHeroProfileModal();
  });
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
  const validInitialTab = ['viewer', 'chronicles', activeTabName].includes(reqTab) ? reqTab : activeTabName;
  // 重新渲染 (例如按下同步、上傳大頭貼) 時，保留玩家目前所在的分頁，不要強制跳回資料片頁；只有首次載入才採用網址 ?tab= 或 App 預選分頁
  let targetTab;
  if (window.__navInitialized) {
    targetTab = (currentMainTab === 'viewer' || currentMainTab === 'chronicles') ? currentMainTab : activeTabName;
  } else {
    targetTab = (window.__appReqTab === 'viewer' || window.__appReqTab === 'chronicles')
      ? window.__appReqTab
      : validInitialTab;
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
  ensureSeasonInfoBars();
  // 📱 通知 App 原生分頁列目前在哪一頁 (網頁內部切頁時，例如「在我的英雄查看完整資料」，讓 App 上方分頁高亮跟著變)
  try { if (window.IronAppBridge && window.IronAppBridge.postMessage) window.IronAppBridge.postMessage(tab === 'viewer' || tab === 'chronicles' ? tab : 'expansion'); } catch (e) {}

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
  populateViewerDropdowns();
  populateChroniclesDropdown();
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
  ensureSeasonInfoBars();

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

// 經典競技計分：計算本體已移至 /js/seasonSnapshot.js 的 computeClassicView(state)，讓賽季快照與現場使用同一套數字
function calculateLiveClassicMetrics() {
  return window.computeClassicView(gameState);
}

function renderClassicModeView() {
  const seasonStartStr = gameState?.seasonStart || gameState?.boss?.seasonStart || "2026/08/12";
  const seasonEndStr = gameState?.seasonEnd || gameState?.boss?.seasonEnd || "2026/08/31";
  renderClassicInto(id => document.getElementById(id), calculateLiveClassicMetrics(), {
    minDur: gameState?.summary?.minDurationMinutes || gameState?.boss?.rules?.minDurationMinutes || 30,
    periodText: `競賽區間：${seasonStartStr} ~ ${seasonEndStr}`
  });
}

/**
 * 經典競技畫面渲染 (現場與「過往英雄史」快照共用)
 * @param {Function} $  依 id 取元素 (現場 = document；快照 = 複製出來的版型)
 * @param {object} classicData computeClassicView() 的結果或快照凍結的同結構資料
 */
function renderClassicInto($, classicData, ctx = {}) {
  const minDurEl = $('classic-min-dur-text');
  if (minDurEl) minDurEl.textContent = ctx.minDur || 30;
  const champContainer = $('classic-champions-container');
  const metricContainer = $('classic-metrics-container');
  const guildTableContainer = $('classic-guild-table-container');

  if (!champContainer || !metricContainer) return;

  const classicPeriodEl = $("classic-period-text");
  if (classicPeriodEl && ctx.periodText) classicPeriodEl.innerText = ctx.periodText;

  const champs = { ...(classicData?.champions || {}) };
  const metrics = classicData?.teamMetrics || [];
  const guildList = classicData?.guildList || [];
  // 舊快照的英雄名次可能沒有 rank 欄位 → 以排列順序補上
  ['heroAerobic', 'heroAnaerobic', 'teamAerobic', 'teamAnaerobic'].forEach(k => {
    champs[k] = (champs[k] || []).map((h, idx) => ({ ...h, rank: h.rank ?? idx + 1 }));
  });

  // 英雄卡共用資料：有氧 / 無氧名次 (純呈現，不影響計分)
  const aeroByName = {}, anaeroByName = {}, rawByName = {};
  (champs.heroAerobic || []).forEach(h => { aeroByName[h.name] = h; });
  (champs.heroAnaerobic || []).forEach(h => { anaeroByName[h.name] = h; });
  (classicData?.heroList || []).forEach(h => { rawByName[h.name] = h; });
  const classicHeroCard = (name, extra = {}) => {
    const a = aeroByName[name], an = anaeroByName[name];
    const status = [];
    if (a) status.push({ text: `🟢 有氧 #${a.rank}`, tone: a.rank === 1 ? 'gold' : 'ok' });
    if (an) status.push({ text: `🔴 無氧 #${an.rank}`, tone: an.rank === 1 ? 'gold' : 'bad' });
    return renderUnifiedHeroCard(name, { status, ...extra });
  };

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
            <span class="font-bold text-white">${t.badge || ''} ${escapeHtml(t.name)}</span>
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
        ${renderUnifiedHeroList((champs.heroAerobic || []).slice(0, 5).map(h => classicHeroCard(h.name, { rank: h.rank, compact: true, primary: { label: '有氧總分', value: `${h.score} 分`, accent: 'text-emerald-400' } })))}
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
            <span class="font-bold text-white">${t.badge || ''} ${escapeHtml(t.name)}</span>
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
        ${renderUnifiedHeroList((champs.heroAnaerobic || []).slice(0, 5).map(h => classicHeroCard(h.name, { rank: h.rank, compact: true, primary: { label: '無氧總分', value: `${h.score} 分`, accent: 'text-rose-400' } })))}
      </div>
    </div>
  `;

  // 8 Metrics
  metricContainer.innerHTML = metrics.map(m => `
    <div class="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
      <span class="text-xs font-bold text-slate-200 block truncate">${escapeHtml(m.metric)}</span>
      <div class="space-y-1">
        ${(m.leaderboard || []).map(item => `
          <div class="flex justify-between text-[11px]">
            <span class="text-slate-400">${escapeHtml(item.rank)} ${escapeHtml(item.team)}</span>
            <span class="font-mono font-bold text-amber-400">${escapeHtml(item.value)} ${escapeHtml(m.unit)}</span>
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
                <span>${escapeHtml(g.badge || '🛡️')}</span>
                <span>${escapeHtml(g.name)}</span>
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

  // 全服英雄卡名冊 (依有氧名次排列；每位英雄都有大頭貼 + 公會 + 狀態 + 徽章數)
  const rosterContainer = $('classic-hero-roster-container');
  if (rosterContainer) {
    const r1 = (n) => Math.round((n || 0) * 10) / 10;
    rosterContainer.innerHTML = renderUnifiedHeroGrid((champs.heroAerobic || []).map(h => {
      const raw = rawByName[h.name] || {};
      const an = anaeroByName[h.name];
      return classicHeroCard(h.name, {
        primary: { label: '有氧 / 無氧', value: `${h.score} / ${an ? an.score : 0}`, accent: 'text-amber-400' },
        metrics: !rawByName[h.name] ? [] : [
          { label: '🏋️ 出勤', value: `${r1(raw.workouts)} 次` },
          { label: '🔋 熱量', value: `${Math.round(raw.calories || 0).toLocaleString()}`, accent: 'text-rose-300' },
          { label: '🚀 TRIMP', value: `${Math.round(raw.trimp || 0).toLocaleString()}`, accent: 'text-cyan-300' },
          { label: '🟢 Zone2', value: `${r1(raw.zone2)} 次`, accent: 'text-emerald-300' },
          { label: '🦍 最大落差', value: `${r1(raw.maxGap)} bpm`, accent: 'text-purple-300' },
          { label: '⏱️ 時長', value: `${Math.round(raw.duration || 0).toLocaleString()} 分` }
        ]
      });
    }));
  }
}

// -------------------------------------------------------------
// 2. EXPANSION 2: RPG 職業天賦模式 (RPG Class & Talent System)
// -------------------------------------------------------------

// RPG 職業戰力：計算本體已移至 /js/seasonSnapshot.js 的 computeRpgView(state)
function calculateRpgViewStats() {
  return window.computeRpgView(gameState);
}

function renderRPGClassTalentView() {
  const seasonStartStr = gameState?.seasonStart || gameState?.boss?.seasonStart || "2026/08/12";
  const seasonEndStr = gameState?.seasonEnd || gameState?.boss?.seasonEnd || "2026/08/31";
  renderRpgInto(id => document.getElementById(id), calculateRpgViewStats(), { periodText: `修煉區間：${seasonStartStr} ~ ${seasonEndStr}` });
}

/** RPG 職業天賦畫面渲染 (現場與快照共用；職業說明一律依職業名稱從 RPG_CLASSES 還原) */
function renderRpgInto($, data, ctx = {}) {
  const mastersContainer = $('rpg-class-masters-container');
  const synergyContainer = $('rpg-guild-synergy-container');
  const rosterContainer = $('rpg-hero-roster-container');

  if (!mastersContainer || !synergyContainer) return;

  const rpgPeriodEl = $("rpg-period-text");
  if (rpgPeriodEl && ctx.periodText) rpgPeriodEl.innerText = ctx.periodText;

  const metaOf = (h) => RPG_CLASSES[h?.rpgClass] || h?.classMeta || RPG_CLASSES['狂戰士'];
  const masters = data?.classMasters || {};
  const synergyList = (data?.guildSynergyList || []).map(g => ({ ...g, guild: g.guild || g.name, totalPower: Number(g.totalPower) || 0, uniqueClasses: g.uniqueClasses || [], badge: g.badge || '🛡️', synergyTag: g.synergyTag || '基礎小隊' }));
  const heroList = (data?.heroRpgList || data?.heroStats || []).map(h => ({ ...h, rpgClass: h.rpgClass || '狂戰士', classMeta: metaOf(h), combatPower: Number(h.combatPower ?? h.totalDamage) || 0, workouts: Number(h.workouts) || 0, zone2: Number(h.zone2) || 0, trimp: Number(h.trimp) || 0, maxGap: Number(h.maxGap) || 0 }));

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
        ${master ? renderUnifiedHeroCard(master.name, {
          podium: true, highlight: true,
          status: [{ text: `${cls.badge} ${cls.name}之王`, tone: 'gold' }],
          primary: { label: '職業戰力 (CP)', value: (Number(master.combatPower) || 0).toLocaleString(), accent: 'text-amber-400' }
        }) : `
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
            <span>${escapeHtml(g.badge)}</span>
            <span class="font-bold text-white text-sm">${escapeHtml(g.guild)}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">${escapeHtml(g.synergyTag)}</span>
            <div class="flex space-x-1">
              ${g.uniqueClasses.map(c => `<span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300">${RPG_CLASSES[c]?.badge || ''} ${escapeHtml(c)}</span>`).join('')}
            </div>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block">公會羈絆戰力</span>
            <span class="font-rpg font-bold text-amber-400 text-sm">${g.totalPower.toLocaleString()} CP</span>
          </div>
        </div>
        <div class="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${uhcSafeColor(g.color)};"></div>
        </div>
        ${(g.members || []).length ? `<div class="pt-0.5">${renderGuildAvatarStack(g.members)}</div>` : ''}
      </div>
    `;
  }).join('');

  // 3. Hero Class Roster (統一英雄卡：職業 / 天賦被動 / 出勤燃脂 / TRIMP 落差 / RPG 戰力)
  if (rosterContainer) {
    rosterContainer.classList.remove('overflow-x-auto');
    rosterContainer.innerHTML = renderUnifiedHeroGrid(heroList.map((h, idx) => renderUnifiedHeroCard(h.name, {
      rank: idx + 1,
      status: [{ text: `${h.classMeta.badge} ${h.rpgClass}`, tone: 'purple', title: h.classMeta.enName }],
      primary: { label: '⚡ RPG 戰力 (CP)', value: h.combatPower.toLocaleString(), accent: 'text-amber-400' },
      metrics: [
        { label: '🏋️ 出勤', value: `${Math.round(h.workouts * 10) / 10} 次` },
        { label: '🟢 燃脂', value: `${Math.round(h.zone2 * 10) / 10} 次`, accent: 'text-emerald-300' },
        { label: '🚀 TRIMP / 落差', value: `${Math.round(h.trimp * 10) / 10} / ${Math.round(h.maxGap * 10) / 10}`, accent: 'text-cyan-300' }
      ],
      footHtml: `<span class="font-bold text-slate-200">✨ ${escapeHtml(h.classMeta.passiveName)}</span>：${escapeHtml(h.classMeta.passiveDesc)}`
    })));
  }
}

// -------------------------------------------------------------
// 3. EXPANSION 3: 世界 Boss 討伐戰 (PvE Raid)
// -------------------------------------------------------------

function renderWorldBossView() {
  renderBossInto(id => document.getElementById(id), window.buildBossView({ ...gameState, heroStats: (heroStatsList && heroStatsList.length) ? heroStatsList : gameState?.heroStats }));
}

/**
 * 世界 Boss 畫面渲染 (現場與快照共用)
 * @param {object} v buildBossView() 的結果：{ boss, seasonStart, seasonEnd, totals, heroes, guilds, feed }
 */
function renderBossInto($, v, ctx = {}) {
  const boss = v?.boss || {};
  const maxHp = boss.maxHp || 350000;
  const totals = v?.totals || {};
  const totalPhys = Number(totals.phys) || 0, totalMag = Number(totals.mag) || 0, totalCrit = Number(totals.crit) || 0, totalDmg = Number(totals.dmg) || 0;
  const heroes = v?.heroes || [];

  const currentHp = Math.max(0, maxHp - totalDmg);
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));

  const nameEl = $('boss-name-text');
  const descEl = $('boss-desc-text');
  const hpEl = $('boss-hp-text');
  const pctEl = $('boss-hp-pct');
  const barEl = $('boss-hp-bar');

  if (nameEl) nameEl.innerText = boss.name || '🌩️ 墮落雷神・索爾';
  if (descEl) descEl.innerText = boss.description || '';
  if (hpEl) {
    hpEl.innerText = currentHp.toLocaleString();
    const maxEl = hpEl.nextElementSibling; // 「/ 最大血量」(原本寫死 350,000，改依 Boss 設定顯示)
    if (maxEl && /^\s*\//.test(maxEl.textContent || '')) maxEl.textContent = `/ ${maxHp.toLocaleString()}`;
  }
  if (pctEl) pctEl.innerText = `(${hpPct.toFixed(1)}%)`;
  if (barEl) barEl.style.width = `${hpPct}%`;

  const avatarEl = $('boss-avatar-img');
  if (avatarEl && boss.avatar) avatarEl.src = boss.avatar;

  const seasonPeriodEl = $("boss-season-period");
  if (seasonPeriodEl) seasonPeriodEl.innerText = `討伐戰區間：${v?.seasonStart || "2026/08/12"} ~ ${v?.seasonEnd || "2026/08/31"}`;
  const cd = $('countdown-text');
  if (cd) {
    if (ctx.frozen) {
      cd.innerText = '已封存';
    } else {
      const si = window.getSeasonInfo && window.getSeasonInfo();
      cd.innerText = !si ? '進行中'
        : si.phase === 'upcoming' ? `還有 ${si.left} 天開戰`
        : si.phase === 'ended' ? '討伐戰已結束'
        : (si.left === 0 ? '今天最後一天！' : `剩 ${si.left} 天`);
    }
  }

  const statTot = $('stat-total-damage');
  const statPhy = $('stat-phys-dmg');
  const statMag = $('stat-mag-dmg');
  const statCri = $('stat-crit-dmg');

  if (statTot) statTot.innerText = totalDmg.toLocaleString();
  if (statPhy) statPhy.innerText = totalPhys.toLocaleString();
  if (statMag) statMag.innerText = totalMag.toLocaleString();
  if (statCri) statCri.innerText = totalCrit.toLocaleString();

  // MVP List (統一英雄卡：大頭貼 / 公會 / 稱號 / 徽章數 + 總輸出與傷害拆解)
  const mvpContainer = $('mvp-hero-list');
  if (mvpContainer) {
    const sorted = [...heroes].sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
    mvpContainer.innerHTML = renderUnifiedHeroGrid(sorted.map((hero, index) => renderUnifiedHeroCard(hero.name, {
      rank: index + 1,
      guild: hero.guild,
      status: [
        index === 0 ? { text: '👑 討伐軍 MVP', tone: 'gold' } : null,
        { text: `⚔️ 出勤 ${hero.validWorkouts || 0} 次`, tone: (hero.validWorkouts || 0) > 0 ? 'ok' : 'muted' }
      ].filter(Boolean),
      primary: { label: '總輸出', value: (hero.totalDamage || 0).toLocaleString(), accent: 'text-amber-400' },
      metrics: [
        { label: '🗡️ 普攻', value: (hero.physDmg || 0).toLocaleString(), accent: 'text-amber-300' },
        { label: '🔮 魔攻', value: (hero.magDmg || 0).toLocaleString(), accent: 'text-cyan-300' },
        { label: '💥 爆擊', value: (hero.critDmg || 0).toLocaleString(), accent: 'text-rose-300' }
      ]
    })), '尚無討伐軍資料');
  }

  // Guild Contributions
  const guildContainer = $('guild-contribution-list');
  if (guildContainer && v?.hasGuilds !== false) {
    const sortedGuilds = [...(v?.guilds || [])].map(g => ({ ...g, totalDamage: Number(g.totalDamage) || 0 })).sort((a, b) => b.totalDamage - a.totalDamage);
    const totalAllDmg = sortedGuilds.reduce((acc, g) => acc + g.totalDamage, 0) || 1;
    guildContainer.innerHTML = sortedGuilds.map(g => {
      const pct = ((g.totalDamage / totalAllDmg) * 100).toFixed(1);
      return `
      <div class="space-y-1.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center space-x-1.5">
            <span>${escapeHtml(g.badge || '🛡️')}</span>
            <span class="font-bold text-white">${escapeHtml(g.name)}</span>
          </div>
          <span class="font-rpg font-bold text-amber-400">${g.totalDamage.toLocaleString()} (${pct}%)</span>
        </div>
        <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${uhcSafeColor(g.color)};"></div>
        </div>
        ${(g.members || []).length ? `<div class="pt-0.5">${renderGuildAvatarStack(g.members)}</div>` : ''}
      </div>`;
    }).join('');
  }

  // Combat Feed
  const feedContainer = $('battle-combat-feed');
  if (feedContainer) {
    feedContainer.innerHTML = (v?.feed || []).map(a => {
      const isNumericStrava = /^\d+$/.test(String(a.id));
      const idBadge = isNumericStrava
        ? `<a href="https://www.strava.com/activities/${a.id}" target="_blank" class="text-[10px] text-orange-400 font-mono hover:underline">#${a.id} ↗</a>`
        : `<span class="text-[10px] text-amber-400 font-mono">手動</span>`;
      return `
      <div class="bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 text-[11px] flex items-center justify-between space-x-2 hover:border-amber-500/40 transition">
        <div class="flex items-center space-x-2 min-w-0 flex-1">
          <span class="cursor-pointer" onclick="openHeroDetailModal(${jsArg(a.hero)})">${renderUnifiedAvatarHtml(a.hero, 'w-9 h-9', 'rounded-xl')}</span>
          <div class="min-w-0">
            <div class="flex items-center space-x-1.5">
              <span class="font-bold text-slate-200 truncate cursor-pointer hover:underline" onclick="openHeroDetailModal(${jsArg(a.hero)})">${escapeHtml(a.hero)}</span>
              <span class="text-[10px] text-slate-400">(${escapeHtml(a.guild)})</span>
              ${idBadge}
            </div>
            <span class="text-slate-500 text-[10px] truncate block">${escapeHtml(a.title || '自主訓練')} (${escapeHtml(a.duration)}分 • 心率 ${escapeHtml(a.avgHr)}/${escapeHtml(a.maxHr)})</span>
          </div>
        </div>
        <span class="font-mono font-bold text-amber-400 flex-shrink-0 text-xs">🗡️+🔮 ${(Number(a.damage) || 0).toLocaleString()}</span>
      </div>`;
    }).join('');
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
  const sf = document.getElementById('viewer-sport-filter');
  if (sf) {
    const cur = sf.value;
    const baseTypes = ['WeightTraining', 'Workout', 'Run', 'Ride', 'Swim'];
    const actTypes = (gameState.activities || []).map(a => a.type).filter(Boolean);
    const types = [...new Set([...baseTypes, ...actTypes])].sort();
    sf.innerHTML = '<option value="">全部運動類型</option>' + types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    sf.value = types.includes(cur) ? cur : '';
  }
  loadHeroViewerData();
}

function loadHeroViewerData(heroOverride) {
  const select = document.getElementById('viewer-hero-select');
  if (typeof heroOverride === 'string' && heroOverride) {
    selectedViewerHero = heroOverride;
    if (select) select.value = heroOverride;
  } else if (select && select.value) {
    selectedViewerHero = select.value;
  }

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
    const { unlocked: unlockedCount, total: totalBadges } = getHeroBadgeProgress(hero.name);

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
          <span class="text-[11px] text-slate-400 block">🔮 魔法攻擊 (魔攻)</span>
          <span class="text-lg font-black font-rpg text-blue-400">${Math.round(heroStat.magDmg || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🗡️ 物理普攻 (普攻)</span>
          <span class="text-lg font-black font-rpg text-rose-400">${Math.round(heroStat.physDmg ?? heroStat.totalCalories ?? 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">💥 物理狂化 (爆擊)</span>
          <span class="text-lg font-black font-rpg text-purple-400">${Math.round(heroStat.critDmg || 0).toLocaleString()}</span>
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
      const { currentHp, isDead, survivedDays, totalDays } = window.computeSurvivalHeroHp(heroStat, svState, gameState);
      
      kpiContainer.innerHTML = `
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] ${isDead ? 'text-red-500' : 'text-emerald-400'} block">❤️ 當前生存值</span>
          <span class="text-lg font-black font-rpg ${isDead ? 'text-slate-600' : 'text-amber-400'}">${Math.max(0, currentHp).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🍖 狩獵總熱量 (基礎HP)</span>
          <span class="text-lg font-black font-rpg text-rose-400">+${Math.floor(heroStat.totalCalories || 0).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">🎒 搜刮總物資 (外加HP)</span>
          <span class="text-lg font-black font-rpg text-blue-400">+${Math.floor((heroStat.totalTrimp || 0) * 1.5).toLocaleString()}</span>
        </div>
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 block">⏱️ 荒野堅持天數 (開賽至今存活天數)</span>
          <span class="text-lg font-black font-rpg text-cyan-400">${survivedDays} / ${totalDays} 天</span>
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
        <span class="font-bold text-slate-200">💓 心率強度區間比例</span>
        <span class="text-[11px] text-slate-400 font-mono">共 ${heroActs.length} 次運動</span>
      </div>
      <div class="grid grid-cols-5 gap-2 text-center text-[11px] pt-1">
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl py-2 px-1" title="Zone 1 恢復: ${p1}%">
          <div class="text-[10px] text-slate-400">🚶 Z1 恢復</div>
          <div class="font-mono font-bold text-slate-200 mt-0.5">${p1}%</div>
        </div>
        <div class="bg-emerald-950/30 border border-emerald-500/40 rounded-xl py-2 px-1" title="Zone 2 有氧燃脂: ${p2}%">
          <div class="text-[10px] text-emerald-400 font-bold">🟢 Z2 燃脂</div>
          <div class="font-mono font-black text-emerald-300 mt-0.5">${p2}%</div>
        </div>
        <div class="bg-amber-950/25 border border-amber-500/30 rounded-xl py-2 px-1" title="Zone 3 有氧耐力: ${p3}%">
          <div class="text-[10px] text-amber-400">🟡 Z3 耐力</div>
          <div class="font-mono font-bold text-amber-300 mt-0.5">${p3}%</div>
        </div>
        <div class="bg-orange-950/25 border border-orange-500/30 rounded-xl py-2 px-1" title="Zone 4 乳酸閾值: ${p4}%">
          <div class="text-[10px] text-orange-400">🟠 Z4 閾值</div>
          <div class="font-mono font-bold text-orange-300 mt-0.5">${p4}%</div>
        </div>
        <div class="bg-rose-950/30 border border-rose-500/40 rounded-xl py-2 px-1" title="Zone 5 極限無氧: ${p5}%">
          <div class="text-[10px] text-rose-400 font-bold">🔴 Z5 極限</div>
          <div class="font-mono font-black text-rose-300 mt-0.5">${p5}%</div>
        </div>
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
    <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">👣 平均步數</span><span class="font-rpg font-bold text-amber-400">${fmt(summary.avgSteps)}</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">😴 平均睡眠</span><span class="font-rpg font-bold text-cyan-400">${sleepTxt}</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">💓 靜止心率</span><span class="font-rpg font-bold text-rose-400">${fmt(summary.avgRestingHr)} bpm</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800"><span class="text-[10px] text-slate-400 block">⚡ 活動分鐘</span><span class="font-rpg font-bold text-emerald-400">${fmt(summary.avgActiveMin)} 分</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800" title="僅部分品牌提供，僅供徽章與參考、不計入資料片分數"><span class="text-[10px] text-slate-400 block">🌿 HRV</span><span class="font-rpg font-bold text-amber-300">${fmt(summary.avgHrv, 1)} ms</span></div>
      <div class="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800" title="僅部分品牌提供，僅供徽章與參考、不計入資料片分數"><span class="text-[10px] text-slate-400 block">🫁 血氧</span><span class="font-rpg font-bold text-sky-300">${fmt(summary.avgSpo2, 1)} %</span></div>
    </div>`;
}

let activeBadgeCategoryFilter = 'ALL';
let inspectedBadgeId = null;

function setBadgeCategoryFilter(cat) {
  activeBadgeCategoryFilter = cat || 'ALL';
  renderHeroBadgesWall(selectedViewerHero);
}

function buildBadgeInspectorHtml(heroName, slotOrBadgeId) {
  const slots = typeof window.getActiveBadgeSlots === 'function' ? window.getActiveBadgeSlots(gameState, heroName) : [];
  if (!slots.length) return '';
  const rarityMeta = window.BADGE_RARITY_META || {};
  const unlockedMap = gameState?.heroBadges?.[heroName] || {};

  let slot = (typeof window.findBadgeSlot === 'function' ? window.findBadgeSlot(slotOrBadgeId, gameState, heroName) : null)
    || slots.find(s => s.id === slotOrBadgeId)
    || slots.find(s => s.isUnlocked)
    || slots[0];
  if (!slot) return '';

  const rMeta = rarityMeta[slot.rarity] || rarityMeta.common || { label: '銅牌 • 初心者', shortLabel: '銅牌', color: 'text-slate-200', border: 'border-slate-600', bg: 'bg-slate-900/90', tagClass: 'bg-slate-900 text-slate-300 border-slate-700' };
  const numStr = `#${String(slot.slotNum).padStart(3, '0')}`;

  // 多階進度列 (銅牌 / 銀牌 / 金牌 / 紫金 / 彩級)
  let tierLadderHtml = '';
  if (slot.isMultiTier) {
    const pills = slot.tiers.map((tb, idx) => {
      const uRec = unlockedMap[tb.id];
      const trMeta = rarityMeta[tb.rarity] || rarityMeta.common || {};
      const isNext = slot.nextTier && slot.nextTier.id === tb.id;
      if (uRec) {
        return `<div class="px-2 py-1 rounded-lg border ${trMeta.border || 'border-amber-500/60'} text-[10px] flex items-center gap-1" title="已於 ${escapeHtml(uRec.unlockedAt)} 達成：${escapeHtml(tb.condition)}">
          <span>✅</span>
          <span class="font-black ${trMeta.color || 'text-white'}">[${trMeta.shortLabel || '已達成'} Lv.${idx + 1}] ${escapeHtml(tb.name)}</span>
          <span class="text-slate-300 hidden md:inline">(${escapeHtml(tb.condition)})</span>
        </div>`;
      } else if (isNext) {
        return `<div class="px-2 py-1 rounded-lg border border-dashed border-amber-400/80 bg-amber-950/30 text-[10px] flex items-center gap-1 text-amber-200">
          <span>🎯</span>
          <span class="font-bold">下一階 [${trMeta.shortLabel || ''} Lv.${idx + 1}] ${escapeHtml(tb.name)}：${escapeHtml(tb.condition)}</span>
        </div>`;
      } else {
        return `<div class="px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/70 text-[10px] flex items-center gap-1 text-slate-500">
          <span>🔒</span>
          <span>[${trMeta.shortLabel || ''} Lv.${idx + 1}] ${slot.isUnlocked || slot.anyGloballyRevealed ? escapeHtml(tb.name) : '？？？'}</span>
        </div>`;
      }
    }).join('');
    tierLadderHtml = `
      <div class="mt-2 pt-2 border-t border-slate-800/80 space-y-1.5">
        <div class="flex items-center justify-between text-[10px] text-slate-400">
          <span class="font-bold text-amber-300">🪜 同項目進階升框路線（目前已達成 ${slot.unlockedCount} / ${slot.totalTiers} 階）</span>
          <span>${slot.isMaxed ? '🌟 已達最高滿階外框！' : '繼續累積可升級更高級別外框'}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">${pills}</div>
      </div>`;
  }

  if (slot.isUnlocked) {
    const curBadge = slot.currentTier || slot.displayBadge;
    const u = slot.currentRecord || {};
    return `
      <div class="bg-slate-950/90 border ${rMeta.border} rounded-xl p-3 shadow-md">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div class="flex items-start sm:items-center space-x-3">
            <div class="w-12 h-12 rounded-xl ${rMeta.border} flex items-center justify-center text-2xl flex-shrink-0 relative">
              ${slot.icon}
              ${slot.isMultiTier ? `<span class="absolute -bottom-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-black ${rMeta.tagClass} border">${slot.levelTag}</span>` : ''}
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs sm:text-sm font-black text-white">${escapeHtml(slot.displayName)}</span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded border ${rMeta.tagClass} font-bold">${rMeta.label}外框 ${numStr}</span>
                <span class="text-[10px] font-bold text-slate-400">• ${escapeHtml(slot.cat)}</span>
              </div>
              <p class="text-[11px] text-slate-200 mt-1"><strong class="text-amber-400">📜 當前階級條件：</strong>${escapeHtml(curBadge.desc || curBadge.condition)}</p>
              ${slot.nextTier ? `<p class="text-[11px] text-cyan-300 mt-0.5"><strong class="text-cyan-400">🎯 下一階升框目標 (${(rarityMeta[slot.nextTier.rarity]?.shortLabel) || '進階'}框)：</strong>${escapeHtml(slot.nextTier.condition)}</p>` : (slot.isMultiTier ? `<p class="text-[11px] text-rose-300 font-bold mt-0.5">👑 恭喜！此系列所有階級已全數封頂完蒐！</p>` : '')}
            </div>
          </div>
          <div class="flex flex-wrap sm:flex-col sm:items-end justify-between gap-1 text-[11px] border-t sm:border-t-0 border-slate-800/80 pt-1.5 sm:pt-0 flex-shrink-0">
            <span class="text-slate-300"><strong class="text-cyan-400">📅 何時取得：</strong><span class="font-mono font-bold text-white">${escapeHtml(u.unlockedAt || '')}</span></span>
            <span class="text-slate-400 truncate max-w-[260px]"><strong class="text-emerald-400">🏃 達成紀錄：</strong>${escapeHtml(u.actTitle || u.actName || '榮譽解鎖')}</span>
          </div>
        </div>
        ${tierLadderHtml}
      </div>
    `;
  } else {
    const firstTier = slot.tiers[0];
    const revealHint = slot.anyGloballyRevealed
      ? `全服已有英雄解鎖！第一階【${escapeHtml(firstTier.name)}】條件：${escapeHtml(firstTier.condition)}`
      : `？？？ (尚未達成，保持運動探索或點選上方其他英雄偷看已解鎖線索！)`;
    return `
      <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-center space-x-3">
            <div class="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl text-slate-500 flex-shrink-0 relative">
              ${slot.anyGloballyRevealed ? slot.icon : '🔒'}
              ${slot.isMultiTier ? `<span class="absolute -bottom-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-slate-900 text-slate-500 border border-slate-700">0/${slot.totalTiers}階</span>` : ''}
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs font-bold text-slate-300">${slot.anyGloballyRevealed ? escapeHtml(slot.name) : '神秘未解鎖徽章'}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">${numStr} • ${escapeHtml(slot.cat)} ${slot.isMultiTier ? `(共 ${slot.totalTiers} 階可升框)` : ''}</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5"><strong class="text-amber-400/80">📜 取得條件：</strong>${revealHint}</p>
            </div>
          </div>
          <span class="text-[10px] font-mono text-slate-500 flex-shrink-0">📅 尚未解鎖</span>
        </div>
        ${slot.anyGloballyRevealed ? tierLadderHtml : ''}
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
 * 渲染冒險者戰情室「進階升框榮譽徽章展櫃」 (132 格濃縮展示 / 331 階完整計算)
 * - 同項目不同難度的徽章合併為 1 格，共用代表圖示，並依最高達成階級換上【銅牌 / 銀牌 / 金牌 / 紫金 / 彩級】外框
 * - 特殊與奇蹟彩蛋徽章維持獨立 1 格
 */
function renderHeroBadgesWall(heroName) {
  const wallCard = document.getElementById('hero-badges-wall-card');
  if (!wallCard) return;

  if (!gameState?.heroBadges && typeof window.evaluateAllHeroesBadges === 'function') {
    window.evaluateAllHeroesBadges(gameState);
  }

  const allSlots = typeof window.getActiveBadgeSlots === 'function' ? window.getActiveBadgeSlots(gameState, heroName) : [];
  if (allSlots.length === 0) {
    wallCard.innerHTML = '';
    return;
  }

  const prog = typeof window.getHeroBadgeSlotProgress === 'function'
    ? window.getHeroBadgeSlotProgress(heroName, gameState)
    : { unlockedSlots: 0, totalSlots: allSlots.length, slotPct: 0, unlockedTiers: 0, totalTiers: allSlots.length, tierPct: 0 };

  const rawCats = Array.from(new Set(allSlots.map(s => s.cat))).sort((a, b) => (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999));
  const categories = ['ALL', ...rawCats];
  const filteredSlots = activeBadgeCategoryFilter === 'ALL'
    ? allSlots
    : allSlots.filter(s => s.cat === activeBadgeCategoryFilter);

  const rarityMeta = window.BADGE_RARITY_META || {};
  const badgeStartYMD = (typeof window.normalizeDateYMD === 'function' && gameState?.gmOps?.badgeStartDate)
    ? window.normalizeDateYMD(gameState.gmOps.badgeStartDate)
    : (gameState?.gmOps?.badgeStartDate || '');

  const defaultInspected = (inspectedBadgeId && filteredSlots.some(s => s.id === inspectedBadgeId || s.tiers.some(t => t.id === inspectedBadgeId)))
    ? (window.findBadgeSlot(inspectedBadgeId, gameState, heroName)?.id || inspectedBadgeId)
    : ((filteredSlots.find(s => s.gmExclusive && s.isUnlocked) || filteredSlots.find(s => s.isUnlocked) || filteredSlots[0])?.id || null);

  const gmUnlockedSlots = allSlots.filter(s => s.gmExclusive && s.isUnlocked);
  const gmHighlightBannerHtml = gmUnlockedSlots.length > 0 ? `
    <div class="bg-gradient-to-r from-amber-950/60 via-slate-950/90 to-cyan-950/50 border border-amber-400/50 rounded-2xl p-3 space-y-2 shadow-[0_0_24px_rgba(251,191,36,0.18)]">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-black text-amber-300 flex items-center gap-1.5">👑 GM 皇家御賜榮譽勳章 (${gmUnlockedSlots.length} 枚尊榮授勳)</span>
        <span class="text-[10px] text-slate-400">點擊勳章可檢視進階詳情</span>
      </div>
      <div class="flex flex-wrap gap-2">
        ${gmUnlockedSlots.map(s => {
          const rMeta = rarityMeta[s.rarity] || rarityMeta.imperial || {};
          return `
            <button type="button" onclick="inspectBadgeOnWall(${jsArg(heroName)}, ${jsArg(s.id)})" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${rMeta.border || ''} ${rMeta.glow || ''} text-xs font-black transition transform hover:scale-105">
              <span class="text-lg">${s.icon}</span>
              <span>${escapeHtml(s.displayName)}</span>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-mono border ${rMeta.tagClass || ''}">#${String(s.slotNum).padStart(3, '0')} · ${s.isMaxed ? '★MAX' : `Lv.${s.unlockedCount}/${s.totalTiers}`}</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const prevCatScroll = document.getElementById('web-badge-cat-scroll')?.scrollLeft ?? null;

  wallCard.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
      <div class="flex items-center space-x-2.5">
        <div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg shadow flex-shrink-0">
          🎖️
        </div>
        <div>
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <h4 class="text-sm font-black text-white tracking-wide">${escapeHtml(heroName)} 的永久榮譽徽章展櫃</h4>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              已點亮 ${prog.unlockedSlots} / ${prog.totalSlots} 格 (${prog.slotPct}%)
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40" title="與英雄卡上的徽章總階數一致，每升一階外框就會 +1">
              累計達成 ${prog.unlockedTiers} / ${prog.totalTiers} 階 (${prog.tierPct}%)
            </span>
            ${badgeStartYMD ? `
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700" title="GM 已設定徽章累計起始時間，僅採計該日(含)以後之運動紀錄">
                ⏰ 起算日：${badgeStartYMD} 起
              </span>
            ` : ''}
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">
            💡 同系列徽章合一進階：隨達成難度提升，外框依序升級為 <span class="text-orange-300 font-bold">銅牌</span> ➔ <span class="text-slate-200 font-bold">銀牌</span> ➔ <span class="text-amber-300 font-bold">金牌</span> ➔ <span class="text-purple-300 font-bold">紫金</span> ➔ <span class="text-rose-300 font-bold">彩級</span>！點擊任一徽章可檢視各階目標。
          </p>
        </div>
      </div>

      <!-- 進度條 -->
      <div class="w-full sm:w-52">
        <div class="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
          <span>展櫃點亮 ${prog.unlockedSlots}/${prog.totalSlots} 格</span>
          <span class="text-amber-400 font-bold">總階數 ${prog.unlockedTiers}/${prog.totalTiers}</span>
        </div>
        <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-cyan-400 transition-all duration-500" style="width: ${Math.min(100, prog.slotPct)}%"></div>
        </div>
      </div>
    </div>

    ${gmHighlightBannerHtml}

    <!-- 分類篩選器 -->
    <div id="web-badge-cat-scroll" class="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px]">
      ${categories.map(cat => {
        const isAct = activeBadgeCategoryFilter === cat;
        const catSlots = cat === 'ALL' ? allSlots : allSlots.filter(s => s.cat === cat);
        const catTotal = catSlots.length;
        const catUnlocked = catSlots.filter(s => s.isUnlocked).length;
        return `
          <button data-cat-active="${isAct ? '1' : '0'}" onclick="setBadgeCategoryFilter(${jsArg(cat)})" class="px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition border ${
            isAct
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
              : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
          }">
            ${cat === 'ALL' ? '🌟 全部徽章' : cat} <span class="font-mono text-[10px] ${isAct ? 'text-slate-900' : 'text-slate-500'}">(${catUnlocked}/${catTotal})</span>
          </button>
        `;
      }).join('')}
    </div>

    <!-- 手機與電腦通用：點擊徽章即時詳情與升框進度檢視列 -->
    <div id="badge-mobile-inspector">
      ${buildBadgeInspectorHtml(heroName, defaultInspected)}
    </div>

    <!-- 濃縮進階徽章網格 (手機 4 欄、平板 6~8 欄、桌機 9 欄) -->
    <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 gap-2.5 pt-1 max-h-[420px] overflow-y-auto lg:max-h-none lg:overflow-visible pr-1">
      ${filteredSlots.map(s => {
        const rMeta = rarityMeta[s.rarity] || rarityMeta.common || { label: '銅牌', shortLabel: '銅牌', color: 'text-slate-200', border: 'border-slate-600', bg: 'bg-slate-900/90', glow: '', tagClass: 'bg-slate-900 text-slate-300 border-slate-700' };
        const numStr = `#${String(s.slotNum).padStart(3, '0')}`;
        const isSelected = s.id === defaultInspected;

        if (s.isUnlocked) {
          const curBadge = s.currentTier || s.displayBadge;
          const u = s.currentRecord || {};
          return `
            <div tabindex="0" data-badge-id="${s.id}" onclick="inspectBadgeOnWall(${jsArg(heroName)}, ${jsArg(s.id)})" class="badge-slot-item relative group flex flex-col items-center justify-center px-1.5 pt-4 pb-2 rounded-xl ${rMeta.border} ${rMeta.glow} ${isSelected ? 'ring-2 ring-amber-300' : ''} cursor-pointer select-none transition">
              <span class="absolute top-1 left-1.5 text-[8px] font-mono text-slate-300/80">${numStr}</span>
              <span class="absolute top-1 right-1 px-1 py-0.2 rounded text-[8px] font-mono font-black border ${rMeta.tagClass}">${rMeta.shortLabel}${s.isMultiTier ? ` ${s.isMaxed ? '★MAX' : `${s.unlockedCount}/${s.totalTiers}`}` : ''}</span>
              <span class="text-2xl sm:text-3xl my-1 transform group-hover:scale-110 transition drop-shadow">${s.icon}</span>
              <span class="text-[10px] sm:text-[11px] font-black ${rMeta.color} w-full text-center leading-tight break-words">${escapeHtml(s.name)}</span>
              ${s.isMultiTier && s.currentTierName ? `<span class="text-[9px] text-white/90 font-bold truncate max-w-full mt-0.5">「${escapeHtml(s.currentTierName)}」</span>` : ''}

              <!-- 懸浮提示框 (桌機 Hover 顯示目前階級 & 下一階目標) -->
              <div class="badge-tooltip-box hidden sm:block">
                <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5 gap-2">
                  <span class="font-black text-white">${s.icon} ${escapeHtml(s.displayName)}</span>
                  <span class="text-[9px] font-mono px-1.5 py-0.5 rounded border ${rMeta.tagClass}">${rMeta.label} ${s.levelTag}</span>
                </div>
                <div class="space-y-1 text-[10px]">
                  <p class="text-slate-200"><strong class="text-amber-400">📜 當前階級：</strong>${escapeHtml(curBadge.condition)}</p>
                  ${s.nextTier ? `<p class="text-cyan-300"><strong class="text-cyan-400">🎯 下一階 (${rarityMeta[s.nextTier.rarity]?.shortLabel || '進階'}框)：</strong>${escapeHtml(s.nextTier.name)} — ${escapeHtml(s.nextTier.condition)}</p>` : (s.isMultiTier ? `<p class="text-rose-300 font-bold">👑 已達此項目最高階級 (MAX)！</p>` : '')}
                  <p class="text-slate-300"><strong class="text-cyan-400">📅 何時取得：</strong><span class="font-mono">${escapeHtml(u.unlockedAt || '')}</span></p>
                  <p class="text-slate-400 truncate"><strong class="text-emerald-400">🏃 達成紀錄：</strong>${escapeHtml(u.actTitle || u.actName || '榮譽解鎖')}</p>
                </div>
              </div>
            </div>
          `;
        } else {
          return `
            <div tabindex="0" data-badge-id="${s.id}" onclick="inspectBadgeOnWall(${jsArg(heroName)}, ${jsArg(s.id)})" class="badge-slot-item badge-slot-locked relative group flex flex-col items-center justify-center px-1.5 pt-4 pb-2 rounded-xl border border-slate-800/80 bg-slate-950/70 ${isSelected ? 'ring-2 ring-amber-400' : ''} cursor-pointer select-none">
              <span class="absolute top-1 left-1.5 text-[8px] font-mono text-slate-600">${numStr}</span>
              ${s.isMultiTier ? `<span class="absolute top-1 right-1 px-1 rounded text-[8px] font-mono text-slate-600 bg-slate-900 border border-slate-800">0/${s.totalTiers}</span>` : ''}
              <span class="text-xl sm:text-2xl my-1 text-slate-600">${s.anyGloballyRevealed ? s.icon : '🔒'}</span>
              <span class="text-[10px] font-mono text-slate-500 w-full text-center leading-tight truncate">${s.anyGloballyRevealed ? escapeHtml(s.name) : '？？？'}</span>

              <!-- 未解鎖神秘提示框 -->
              <div class="badge-tooltip-box hidden sm:block">
                <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
                  <span class="font-bold text-slate-300">${s.anyGloballyRevealed ? `${s.icon} ${escapeHtml(s.name)}` : '🔒 神秘未解鎖徽章'}</span>
                  <span class="text-[9px] font-mono text-slate-500">${numStr} • ${escapeHtml(s.cat)}</span>
                </div>
                <div class="space-y-1 text-[10px]">
                  <p class="text-slate-400"><strong class="text-amber-400/80">📜 第一階目標：</strong>${s.anyGloballyRevealed ? escapeHtml(s.tiers[0].condition) : '？？？ (尚未達成，保持運動探索或點選其他冒險者偷看線索！)'}</p>
                  <p class="text-slate-500"><strong class="text-slate-400">📅 何時取得：</strong>尚未解鎖 ${s.isMultiTier ? `(共 ${s.totalTiers} 階可升框)` : ''}</p>
                </div>
              </div>
            </div>
          `;
        }
      }).join('')}
    </div>
  `;

  const catScroller = document.getElementById('web-badge-cat-scroll');
  if (catScroller) {
    if (prevCatScroll !== null) catScroller.scrollLeft = prevCatScroll;
    const activeBtn = catScroller.querySelector('[data-cat-active="1"]');
    if (activeBtn) {
      const left = activeBtn.offsetLeft - catScroller.offsetLeft;
      const right = left + activeBtn.offsetWidth;
      const viewLeft = catScroller.scrollLeft;
      const viewRight = viewLeft + catScroller.clientWidth;
      if (left < viewLeft) {
        catScroller.scrollLeft = Math.max(0, left - 12);
      } else if (right > viewRight) {
        catScroller.scrollLeft = right - catScroller.clientWidth + 12;
      }
    }
  }
}

/**
 * 單筆有效運動在目前資料片的得分 (戰情室運動紀錄「得分」欄與 App 運動紀錄 / 今日增加共用同一份公式)
 * @returns {{ num: number|null, text: string, cls: string }}
 */
function getActivityModeScore(a, activeMode) {
  if (activeMode === "classic") return { num: Math.round(a.calories || 0), text: `${Math.round(a.calories || 0)} kcal`, cls: 'text-amber-400' };
  if (activeMode === "rpg_talent" || activeMode === "rpg") { const v = Math.round(a.combatPower || a.damage || 0); return { num: v, text: `${v.toLocaleString()} CP`, cls: 'text-purple-400' }; }
  if (activeMode === "faction_war") {
    const v = Math.round((a.trimp || 0) * 10 + (a.calories || 0) + (a.isZone2 ? (a.scoreWeight ?? 1) * 5000 : 0) + (a.isPeakGap ? (a.gapScore ?? a.gapVal ?? 0) * 100 : 0));
    return { num: v, text: `🔥 ${v.toLocaleString()}`, cls: 'text-rose-400' };
  }
  if (activeMode === "survival") { const v = Math.round((a.calories || 0) + (a.trimp || 0) * 1.5); return { num: v, text: `❤️ +${v.toLocaleString()}`, cls: 'text-emerald-400' }; }
  if (activeMode === "base_builder") {
    const v = Math.round((a.calories || 0) + (a.trimp || 0) + (a.isZone2 ? (a.scoreWeight ?? 1) * 50 : 0) + (a.isPeakGap ? (a.gapScore ?? a.gapVal ?? 0) * 10 : 0));
    return { num: v, text: `🪵 ${v.toLocaleString()}`, cls: 'text-emerald-400' };
  }
  if (window.isMobileMode && window.isMobileMode(activeMode)) return { num: null, text: window.getMobileModeActivityLabel(activeMode, a), cls: 'text-amber-400' };
  if (activeMode === "bingo") { const v = Math.round(a.trimp || 0); return { num: v, text: `🧩 ${v.toLocaleString()}`, cls: 'text-blue-400' }; }
  return { num: a.damage || 0, text: `⚔️ ${(a.damage || 0).toLocaleString()}`, cls: 'text-amber-400' };
}
window.getActivityModeScore = getActivityModeScore;

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
      const sc = getActivityModeScore(a, activeMode);
      scoreColHtml = `<span class="${sc.cls} font-bold">${sc.text}</span>${bonusTag}`;
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
  if (typeof heroName === 'string' && window.safeDisplayText) heroName = window.safeDisplayText(heroName); // 🛡️ 與資料庫清洗後的名字一致，也避免直接把參數當 HTML 輸出
  const modal = document.getElementById('modal-hero-profile');
  const title = document.getElementById('modal-hero-profile-title');
  const content = document.getElementById('modal-hero-profile-content');
  if (!modal || !content || !heroName) return;

  const cleanName = String(heroName).trim();
  if (currentMainTab === 'chronicles') {
    const snap = getAllSnapshots().find(s => s.id === selectedChronicle);
    const cards = Array.from(document.querySelectorAll('#chronicles-dynamic-content .uhc')).filter(c => c.getAttribute('data-hero') === cleanName);
    title.innerHTML = `<div class="flex items-center flex-wrap gap-2"><span class="font-bold text-white text-lg">${escapeHtml(cleanName)}</span><span class="uhc-pill uhc-tone-muted">🏛️ ${escapeHtml(snap?.seasonTitle || '')}</span></div>`;
    content.innerHTML = cards.length
      ? `<p class="text-[11px] text-slate-400">🔒 時間凍結：以下為該賽季封存時的戰績</p><div class="uhc-grid">${cards.map(c => c.outerHTML.replace(/\son(click|keydown)="[^"]*"/g, '')).join('')}</div>`
      : '<p class="text-xs text-slate-400">此快照沒有該英雄的資料</p>';
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    return;
  }
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
        <span class="text-[10px] text-slate-400 block">魔法攻擊 (魔攻)</span>
        <span class="font-rpg font-bold text-blue-400 text-sm">${Math.round(heroStat.magDmg || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">物理狂化 (爆擊)</span>
        <span class="font-rpg font-bold text-purple-400 text-sm">${Math.round(heroStat.critDmg || 0).toLocaleString()}</span>
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
    const { currentHp, isDead, survivedDays, totalDays } = window.computeSurvivalHeroHp(heroStat, svState, gameState);
    
    modalCardsHtml = `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] ${isDead ? 'text-red-500' : 'text-emerald-400'} block">當前生存值</span>
        <span class="font-rpg font-bold ${isDead ? 'text-slate-600' : 'text-amber-400'} text-sm">${Math.max(0, currentHp).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">狩獵熱量 (HP)</span>
        <span class="font-rpg font-bold text-rose-400 text-sm">+${Math.floor(heroStat.totalCalories || 0).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">搜刮物資 (TRIMP)</span>
        <span class="font-rpg font-bold text-blue-400 text-sm">+${Math.floor((heroStat.totalTrimp || 0) * 1.5).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
        <span class="text-[10px] text-slate-400 block">荒野堅持天數</span>
        <span class="font-rpg font-bold text-cyan-400 text-sm">${survivedDays} / ${totalDays} 天</span>
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
        <span class="text-[10px] text-slate-400 block">出勤次數</span>
        <span class="font-rpg font-bold text-amber-400 text-sm">${Math.round((heroStat.scoreWorkouts ?? heroStat.validWorkouts ?? 0) * 10) / 10} 次</span>
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

  // Build unlocked badges mini-showcase inside Hero Detail Modal (使用濃縮進階徽章格)
  const allSlots = typeof window.getActiveBadgeSlots === 'function' ? window.getActiveBadgeSlots(gameState, hero.name) : [];
  const unlockedSlots = allSlots.filter(s => s.isUnlocked);
  const prog = typeof window.getHeroBadgeSlotProgress === 'function'
    ? window.getHeroBadgeSlotProgress(hero.name, gameState)
    : { unlockedSlots: unlockedSlots.length, totalSlots: allSlots.length, unlockedTiers: 0, totalTiers: 0 };
  const rarityMeta = window.BADGE_RARITY_META || {};

  const modalBadgesHtml = `
    <div class="bg-slate-950/90 p-3 rounded-2xl border border-amber-500/30 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
        <span class="font-bold text-amber-300 text-xs flex items-center space-x-1.5">
          <span>🎖️ 已點亮榮譽徽章 (${prog.unlockedSlots}/${prog.totalSlots} 格 • 累計 ${prog.unlockedTiers}/${prog.totalTiers} 階)</span>
        </span>
        <button onclick="jumpToHeroBadgesWall(${jsArg(hero.name)})" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/50 border border-cyan-800/60 px-2 py-0.5 rounded-lg transition">
          前往戰情室徽章牆 ➔
        </button>
      </div>
      ${unlockedSlots.length === 0 ? `
        <p class="text-[11px] text-slate-500 py-2 text-center">尚未解鎖任何榮譽徽章</p>
      ` : `
        <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto py-1">
          ${unlockedSlots.map(s => {
            const u = s.currentRecord || {};
            const curBadge = s.currentTier || s.displayBadge;
            const rMeta = rarityMeta[s.rarity] || rarityMeta.common || { shortLabel: '銅牌', color: 'text-slate-200', border: 'border-slate-700', bg: 'bg-slate-900' };
            const nextTxt = s.nextTier ? `\n🎯 下一階 (${rarityMeta[s.nextTier.rarity]?.shortLabel || '進階'}框)：${s.nextTier.condition}` : (s.isMultiTier ? '\n👑 已達最高階 (MAX)！' : '');
            return `
              <div class="inline-flex items-center space-x-1 px-2 py-1 rounded-lg ${rMeta.border} text-[10px] cursor-help" title="【${escapeHtml(s.displayName)}】(${rMeta.shortLabel}框 ${s.levelTag})&#10;📜 當前階級：${escapeHtml(curBadge.condition)}${escapeHtml(nextTxt)}&#10;📅 何時取得：${escapeHtml(u.unlockedAt || '')}&#10;🏃 達成紀錄：${escapeHtml(u.actTitle || u.actName || '')}">
                <span>${s.icon}</span>
                <span class="font-bold ${rMeta.color}">${escapeHtml(s.displayName)}</span>
                ${s.isMultiTier ? `<span class="text-[9px] font-mono opacity-85">(${s.isMaxed ? '★MAX' : `${s.unlockedCount}/${s.totalTiers}`})</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <p class="text-[10px] text-slate-500">💡 滑鼠移至徽章上方可偷看目前階級條件、下一階升框目標與達成時間</p>
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
            : (a.source === 'apple_health' || a.source === 'health_connect')
              ? (() => { const m = window.getActivitySourceMeta ? window.getActivitySourceMeta(a) : { icon: '📱', label: '手機同步' }; return `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold" title="${escapeHtml(m.label || '')}">${m.icon || '📱'} ${escapeHtml(m.brand || m.label || '手機同步')}</span>`; })()
              : `<span class="text-[10px] text-amber-400">手動</span>`;
          const bonusPill = (a.eventBonusPct > 0 && a.isValidAttack && !a.isExcluded)
            ? `<span class="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold" title="${a.eventBonusLabel || '活動加成'}">⚡+${a.eventBonusPct}%</span>`
            : '';
          
          let actScoreTag = "";
          if (a.isExcluded) {
            actScoreTag = `<span class="text-rose-400 text-[10px] font-bold">GM作廢</span>`;
          } else if (a.isSuspectedDuplicate && !a.duplicateIncluded) {
            actScoreTag = `<span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300 text-[10px] font-bold">⚠️ 疑似重複(不計分)</span>`;
          } else if (!a.isValidAttack) {
            actScoreTag = `<span class="text-slate-500 text-[10px]">${a.inSeason ? `未滿${gameState?.summary?.minDurationMinutes || 30}分` : '非本賽季'}</span>`;
          } else {
            const sc = getActivityModeScore(a, activeMode);
            actScoreTag = `<span class="font-rpg font-bold ${sc.cls} text-xs">${sc.text}</span>`;
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
window.closeHeroDetailModal = closeHeroProfileModal;

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
    const typeIcon = ({ classic: '🏆', rpg: '⚔️', rpg_talent: '⚔️', survival: '☠️', faction_war: '🏰', base_builder: '🏗️', bingo: '🧩' })[arc.type] || ((window.MOBILE_MODE_META || {})[arc.type]?.icon || '🐉');
    opt.textContent = `${typeIcon} ${arc.seasonTitle || arc.id} (${arc.seasonPeriod || ''})`;
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

// 快照標頭 (🔒 時間凍結) — 各資料片共用
const SNAPSHOT_TYPE_META = {
  classic: { label: '🏛️ 經典競技歷史快照', cls: 'from-amber-950/40 border-amber-500/40', pill: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  rpg: { label: '🏛️ RPG 職業天賦歷史快照', cls: 'from-purple-950/40 border-purple-500/50', pill: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  world_boss: { label: '🏛️ 世界 Boss 歷史快照', cls: 'from-rose-950/40 border-rose-500/40', pill: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  faction_war: { label: '⚔️ 雙城激戰歷史快照', cls: 'from-emerald-950/40 border-emerald-500/40', pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  survival: { label: '☠️ 飢餓法則歷史快照', cls: 'from-amber-950/40 border-amber-500/40', pill: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  base_builder: { label: '🏰 鋼鐵要塞歷史快照', cls: 'from-blue-950/40 border-blue-500/40', pill: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  bingo: { label: '🧩 戰神拼圖歷史快照', cls: 'from-fuchsia-950/40 border-fuchsia-500/40', pill: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40' }
};
function renderSnapshotHeaderHtml(snap, type) {
  const mm = (window.MOBILE_MODE_META || {})[type];
  const meta = SNAPSHOT_TYPE_META[type] || (mm
    ? { label: `${mm.icon} 資料片${mm.num}・${mm.name} 歷史快照`, cls: 'from-amber-950/40 border-amber-500/40', pill: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
    : SNAPSHOT_TYPE_META.world_boss);
  return `
    <div class="bg-gradient-to-r ${meta.cls} via-slate-900 to-slate-950 p-5 sm:p-6 rounded-3xl border shadow-xl space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-black border ${meta.pill}">${escapeHtml(meta.label)}</span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🔒 時間凍結</span>
          <span class="text-xs text-slate-400 font-mono">${escapeHtml(snap.seasonPeriod || '')}</span>
        </div>
        <span class="text-[11px] text-slate-400 font-mono">封存時間：${escapeHtml(snap.archivedAt || '歷史預載')}</span>
      </div>
      <h2 class="text-2xl font-black text-white font-title">${escapeHtml(snap.seasonTitle || snap.id || '')}</h2>
      <p class="text-xs text-slate-300 flex items-center space-x-1.5">
        <span>🔒</span>
        <span class="font-bold text-amber-300">${escapeHtml(snap.statusLabel || '本賽季已圓滿結算 (歷史數據已凍結)')}</span>
      </p>
      ${snap.summaryText ? `<p class="text-xs text-slate-300">${escapeHtml(snap.summaryText)}</p>` : ''}
      ${snap.schema === 2 ? '' : '<p class="text-[11px] text-slate-500">ℹ️ 此為舊版快照：未凍結的大頭貼 / 徽章數改以目前資料顯示。</p>'}
    </div>`;
}

/**
 * 複製現場資料片的整個版型 (index.html 靜態區塊)，把 id 改成 data-snap-id 避免與現場重複，
 * 再交給現場同一支 renderXInto() 填入凍結數字 → 版面與現場 100% 相同。
 */
function cloneLiveTemplate(tabId) {
  const src = document.getElementById(tabId);
  const wrap = document.createElement('div');
  wrap.className = 'space-y-6';
  if (!src) return { wrap, $: () => null };
  const clone = src.cloneNode(true);
  // 現場的「📅 賽季期間 … 進行中」資訊列屬於目前賽季，歷史快照不可出現 (快照只顯示自己的凍結期間)
  clone.querySelectorAll('.season-info-bar').forEach(el => el.remove());
  clone.querySelectorAll('[id]').forEach(el => { el.setAttribute('data-snap-id', el.id); el.removeAttribute('id'); });
  while (clone.firstChild) wrap.appendChild(clone.firstChild);
  const $ = (id) => wrap.querySelector(`[data-snap-id="${id}"]`);
  return { wrap, $ };
}

/** 舊版快照 → 新版 view model 轉接 (缺欄位一律給安全預設值，不會讓畫面壞掉) */
function legacySnapshotView(snap, type) {
  const [pStart, pEnd] = String(snap.seasonPeriod || '').split('~').map(x => x.trim());
  if (type === 'survival') {
    const sv = snap.survival || {};
    return {
      sv: { maxHp: Number(sv.maxHp) || 0, decayPerDay: Number(sv.decayPerDay) || 0, penalty: Number(sv.penalty) || 0, days: Number(sv.days) || 0, seasonOver: true, schedule: sv.decaySchedule || sv.schedule || [] },
      heroes: (Array.isArray(snap.heroSurvival) ? snap.heroSurvival : []).map(h => ({ name: h.name, guild: h.guild, currentHp: Number(h.currentHp) || 0, isDead: Boolean(h.isDead), food: Number(h.food) || 0, scavenge: Number(h.scavenge) || 0 })),
      minDur: 30
    };
  }
  // 世界 Boss (含早期誤存為 world_boss 的其他資料片快照)
  const summary = { ...(snap.summary || {}) };
  const heroes = (snap.heroStats || snap.allHeroes || snap.topHeroes || []).map(h => ({
    name: h.name, guild: h.guild, validWorkouts: Number(h.validWorkouts) || 0,
    physDmg: Number(h.physDmg) || 0, magDmg: Number(h.magDmg) || 0, critDmg: Number(h.critDmg) || 0, totalDamage: Number(h.totalDamage ?? h.score) || 0
  }));
  const sumBy = (k) => heroes.reduce((acc, h) => acc + (h[k] || 0), 0);
  const guilds = (snap.guildContributions || snap.guilds || []).map(g => ({ name: g.name, badge: g.badge, color: g.color, members: g.members || [], totalDamage: Number(g.totalDamage) || 0 }));
  if (guilds.length && guilds.every(g => !g.totalDamage)) guilds.forEach(g => { g.totalDamage = heroes.filter(h => h.guild === g.name).reduce((acc, h) => acc + h.totalDamage, 0); });
  return {
    boss: { ...(snap.boss || {}), maxHp: (snap.boss || {}).maxHp || snap.bossMaxHp || 350000 },
    seasonStart: snap.boss?.seasonStart || pStart || '',
    seasonEnd: snap.boss?.seasonEnd || pEnd || '',
    totals: {
      phys: Number(summary.totalPhys ?? snap.physDmg) || sumBy('physDmg'),
      mag: Number(summary.totalMag ?? snap.magDmg) || sumBy('magDmg'),
      crit: Number(summary.totalCrit ?? snap.critDmg) || sumBy('critDmg'),
      dmg: Number(summary.totalDamage ?? snap.totalDamage) || sumBy('totalDamage')
    },
    heroes,
    guilds,
    hasGuilds: true,
    feed: (snap.activities || []).slice(0, 15)
  };
}

/** 舊版手機資料片快照 (只有名次文字) → 用統一英雄卡呈現 */
function renderLegacyMobileSnapshotHtml(snap, type) {
  const rows = Array.isArray(snap.leaderboard) ? snap.leaderboard : [];
  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-amber-400">🛡️ 公會排名</h3>
        ${(snap.guilds || []).map((g, i) => `<div class="flex justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"><span class="font-bold text-white">${i === 0 ? '🥇 ' : ''}${escapeHtml(g.name)}</span><span class="font-rpg font-bold text-amber-400">${escapeHtml(String(g.value ?? ''))}</span></div>`).join('') || '<div class="text-slate-500 text-xs">無資料</div>'}
      </div>
      <div class="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 class="text-sm font-bold text-amber-400">🏅 英雄排名</h3>
        ${renderUnifiedHeroGrid(rows.map((h, i) => renderUnifiedHeroCard(h.name, {
          rank: i + 1,
          primary: { label: '結算成績', value: String(h.value ?? ''), accent: 'text-amber-400' },
          footHtml: h.detail ? escapeHtml(h.detail) : ''
        })), '此快照沒有英雄資料')}
      </div>
    </div>`;
}

/** 依資料片類型產生快照本體 (標頭除外) */
function renderSnapshotBodyHtml(snap, type) {
  const v2 = snap.schema === 2 && snap.view;
  const view = v2 ? snap.view : null;
  const [pStart, pEnd] = String(snap.seasonPeriod || '').split('~').map(x => x.trim());

  if (window.isMobileMode && window.isMobileMode(type)) {
    return view ? window.renderMobileModeHtml(type, view) : renderLegacyMobileSnapshotHtml(snap, type);
  }
  if (type === 'survival') return renderSurvivalHtml(view || legacySnapshotView(snap, 'survival'));
  if (type === 'faction_war' && view) return renderFactionWarHtml(view);
  if (type === 'base_builder' && view) return renderBaseBuilderHtml(view);
  if (type === 'bingo' && view) return renderBingoHtml(view);

  if (type === 'classic' || (!view && (snap.classicData || (snap.champions && !snap.classMasters && !snap.boss)))) {
    const data = view || ((snap.classicData && Object.keys(snap.classicData).length) ? snap.classicData : snap);
    const { wrap, $ } = cloneLiveTemplate('tab-content-classic');
    renderClassicInto($, data, { minDur: data.minDur || 30, periodText: `競賽區間：${snap.seasonPeriod || ''}` });
    return wrap.innerHTML;
  }
  if (type === 'rpg' || (!view && snap.classMasters)) {
    const { wrap, $ } = cloneLiveTemplate('tab-content-rpg');
    const roster = $('rpg-hero-roster-container');
    if (roster) roster.classList.remove('overflow-x-auto');
    renderRpgInto($, view || snap, { periodText: `修煉區間：${snap.seasonPeriod || ''}` });
    return wrap.innerHTML;
  }
  // 世界 Boss (預設)
  const bossView = (type === 'world_boss' && view) ? view : legacySnapshotView(snap, 'world_boss');
  if (!bossView.seasonStart) { bossView.seasonStart = pStart || ''; bossView.seasonEnd = pEnd || ''; }
  const { wrap, $ } = cloneLiveTemplate('tab-content-boss');
  renderBossInto($, bossView, { frozen: true });
  return wrap.innerHTML;
}

function renderChroniclesView() {
  const container = document.getElementById("chronicles-dynamic-content");
  if (!container) return;
  // GM 設為「隱藏」的快照不在前台顯示
  const snapshots = getAllSnapshots().filter(s => s && s.isVisible !== false);
  const snap = snapshots.find(s => s.id === selectedChronicle) || snapshots[0];

  if (!snap) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500">尚無可顯示的歷史快照</div>`;
    return;
  }

  const type = window.normalizeSnapshotType ? window.normalizeSnapshotType(snap.type) : (snap.type || 'classic');
  // 時間凍結：英雄卡改讀快照當下的大頭貼 / 公會 / 徽章數 / 稱號 / 狀態 (舊快照沒有時退回目前資料)
  const frozenCtx = { heroes: snap.heroInfo || {}, guilds: snap.guildInfo || {}, legacy: !snap.heroInfo };
  try {
    const body = withFrozenHeroInfo(frozenCtx, () => renderSnapshotBodyHtml(snap, type));
    container.innerHTML = `<div class="space-y-6">${renderSnapshotHeaderHtml(snap, type)}${body}</div>`;
  } catch (e) {
    console.error('[Chronicles] 快照渲染失敗', snap.id, e);
    container.innerHTML = `${renderSnapshotHeaderHtml(snap, type)}<div class="mt-4 p-6 text-center text-rose-300 bg-rose-950/30 border border-rose-800 rounded-2xl text-sm">此快照資料格式無法解析，請 GM 重新建立快照。</div>`;
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

  // 與 GM 後台共用同一個快照建構器 (seasonSnapshot.js)：view model + 英雄顯示資訊全部凍結
  const snapPayload = window.buildSeasonSnapshot(gameState, { mode: activeMode, title: title.trim() });

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
  container.innerHTML = renderFactionWarHtml(window.buildFactionView(gameState));
}

/** 由 view model 產生整個資料片畫面 HTML (現場與「過往英雄史」快照共用同一份版面) */
function renderFactionWarHtml(view) {
  // 只讀 view model 的凍結資料 (以區域變數遮蔽全域 gameState，確保快照不會混入現在的數字)
  const gameState = { guilds: view?.guilds || [], faction: view?.faction || {}, heroStats: view?.heroStats || [], heroes: view?.heroes || [], summary: { minDurationMinutes: view?.minDur || 30 } };
  const container = { html: '', set innerHTML(v) { this.html = v; }, insertAdjacentHTML(_pos, v) { this.html += v; } };

  const summary = gameState?.summary || {};
  const guildList = gameState?.guilds || [];
  
  // 陣營分配與主城血量：共用 seasonSnapshot.js 的 computeFactionState (App 排行也用同一份)
  const { faction1, faction2, f1CurrentHp, f2CurrentHp, f1Pct, f2Pct } = window.computeFactionState(view);
  // 英雄卡狀態：所屬陣營 (純呈現)
  const factionStatusOf = (guildName) => faction1.guilds.includes(guildName)
    ? { text: `🛡️ ${faction1.name}`, tone: 'ok' }
    : (faction2.guilds.includes(guildName) ? { text: `⚔️ ${faction2.name}`, tone: 'bad' } : { text: '未編入陣營', tone: 'muted' });

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
        <p class="text-xs text-slate-400 mb-2">所屬公會：${faction1.guilds.join(', ') || '無'}</p>
        <div class="mb-4 flex justify-center">${renderGuildAvatarStack((gameState?.heroes || []).filter(h => faction1.guilds.includes(h.guild)).map(h => h.name), 16)}</div>
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
        <p class="text-xs text-slate-400 mb-2">所屬公會：${faction2.guilds.join(', ') || '無'}</p>
        <div class="mb-4 flex justify-center">${renderGuildAvatarStack((gameState?.heroes || []).filter(h => faction2.guilds.includes(h.guild)).map(h => h.name), 16)}</div>
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
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, dmg: window.factionHeroScore(h).dmg
             })).sort((a,b)=>b.dmg-a.dmg).slice(0, 10).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: [factionStatusOf(h.guild)],
                primary: { label: '攻城傷害', value: h.dmg.toLocaleString(), accent: 'text-rose-400' },
                metrics: [
                  { label: '🚀 TRIMP', value: Math.round(h.totalTrimp || 0).toLocaleString(), accent: 'text-cyan-300' },
                  { label: '🦍 MaxGap', value: `${Math.round(h.scoreMaxGap ?? h.maxGap ?? 0)}`, accent: 'text-purple-300' }
                ]
             })))}
           </div>
        </div>
        <div>
           <h4 class="text-xs font-bold text-cyan-400 mb-2">🛠️ 城牆守護者 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">Cal. + Zone2×5000</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, rep: window.factionHeroScore(h).rep
             })).sort((a,b)=>b.rep-a.rep).slice(0, 10).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: [factionStatusOf(h.guild)],
                primary: { label: '城牆修復', value: `+${h.rep.toLocaleString()}`, accent: 'text-cyan-400' },
                metrics: [
                  { label: '🔋 熱量', value: Math.round(h.totalCalories || 0).toLocaleString(), accent: 'text-rose-300' },
                  { label: '🟢 Zone2', value: `${Math.round((h.scoreZone2 ?? h.zone2Count ?? 0) * 10) / 10} 次`, accent: 'text-emerald-300' }
                ]
             })))}
           </div>
        </div>
      </div>
    </div>
  `;
  const factionRosterHtml = renderUnifiedHeroGrid((gameState?.heroStats || []).map(h => {
    const s = window.factionHeroScore(h);
    return renderUnifiedHeroCard(h.name, {
      guild: h.guild,
      status: [factionStatusOf(h.guild)],
      primary: { label: '攻城 / 修復', value: `${Math.round(s.dmg).toLocaleString()} / +${Math.round(s.rep).toLocaleString()}`, accent: 'text-amber-400' },
      metrics: [
        { label: '🔥 攻城', value: Math.round(s.dmg).toLocaleString(), accent: 'text-rose-300' },
        { label: '🛠️ 修復', value: `+${Math.round(s.rep).toLocaleString()}`, accent: 'text-cyan-300' }
      ]
    });
  }));
  container.insertAdjacentHTML('beforeend', `
    <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 mt-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2"><i data-lucide="users" class="w-4 h-4 text-emerald-400"></i><span>⚔️ 全員陣營名冊</span></h3>
        <span class="text-xs text-slate-400">全服英雄陣營歸屬與攻防貢獻 • 點擊查看個人戰力卡</span>
      </div>
      ${factionRosterHtml}
    </div>
  `);
  return container.html;
}

// -------------------------------------------------------------
// EXPANSION 5: 飢餓法則 (Survival Battle Royale)
// -------------------------------------------------------------
function renderSurvivalView() {
  const container = document.getElementById("tab-content-survival");
  if (!container) return;
  container.innerHTML = renderSurvivalHtml(window.buildSurvivalView(gameState));
}

/** 由 view model 產生整個資料片畫面 HTML (現場與「過往英雄史」快照共用同一份版面) */
function renderSurvivalHtml(view) {
  // 只讀 view model 的凍結資料 (以區域變數遮蔽全域 gameState，確保快照不會混入現在的數字)
  const gameState = { summary: { minDurationMinutes: view?.minDur || 30 } };
  const container = { html: '', set innerHTML(v) { this.html = v; }, insertAdjacentHTML(_pos, v) { this.html += v; } };

  const sv = view?.sv || { maxHp: 0, decayPerDay: 0, penalty: 0, days: 0, schedule: [] };
  const decayPerDay = sv.decayPerDay;
  const currentPenalty = sv.penalty;
  const maxHp = sv.maxHp;

  const survivingHeroes = view?.heroes || []; // 已於 buildSurvivalView 依生存值排序 (狩獵補血 = Calories / 搜刮物資 = TRIMP × 1.5)

  const scheduleNote = (sv.schedule || []).length > 1
    ? `<br><span class="text-[11px] text-amber-300">☣️ 毒圈擴張紀錄：${sv.schedule.map(s => `${s.from.slice(5)} 起每日 -${s.perDay}`).join(' ➜ ')}</span>`
    : '';

  container.innerHTML = `
    <!-- Lore / Story -->
    <div class="mb-6 bg-slate-900 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-lg">
      <h2 class="text-xl font-black text-amber-500 mb-1">【資料片五】飢餓法則 (Survival Rules)</h2>
      <p class="text-slate-300 text-sm leading-relaxed">
        身處嚴酷的荒野沙漠，每個人開局擁有 ${maxHp.toLocaleString()} 點生存值。${sv.seasonOver ? '本賽季已結束，毒圈停止擴張' : `每天毒圈都會自動剝奪大家 ${decayPerDay.toLocaleString()} 點生命線`}（毒圈已結算 ${sv.days} 天，目前每人已流失 ${currentPenalty.toLocaleString()} HP）！${scheduleNote}<br>
        🍖 <strong>外出狩獵與搜刮：</strong> <span class="text-emerald-400 font-mono font-bold tracking-wider">[ 狩獵補血 = Calories × 1 ]</span> / <span class="text-amber-300 font-mono font-bold tracking-wider">[ 搜刮物資 = TRIMP × 1.5 ]</span><br>
        ☠️ <strong>淘汰與結算：</strong> <span class="text-rose-400 font-mono font-bold tracking-wider">[ 最終生存HP = 最大血量 - (天數 × 每日衰減) + 狩獵補血 + 搜刮物資 ]</span>
      <br>🔁 <strong>浴火重生：</strong>生存值歸零的英雄不會永久淘汰，只要再去完成有效運動、補回 HP，就能立刻重返荒野！</p>
      <div class="mt-2 text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
          <p><span class="text-amber-500 font-bold">⏱️ 系統判斷規則：</span> 所有鍛鍊僅採計單次持續 <strong>${gameState?.summary?.minDurationMinutes || gameState?.boss?.rules?.minDurationMinutes || 30}分鐘</strong> 以上的運動。</p>
          <p>• <strong>TRIMP (衝力)：</strong>計算方式為 時間 × (均心率÷MaxHR) × <i>e</i>^(1.92×(均心率÷MaxHR))</p>
      </div>
    </div>

    ${renderUnifiedHeroGrid(survivingHeroes.map((h, i) => {
      const hpPct = h.isDead ? 0 : Math.min(100, Math.max(0, (h.currentHp / maxHp) * 100));
      return renderUnifiedHeroCard(h.name, {
        rank: i + 1,
        guild: h.guild,
        dead: h.isDead,
        highlight: i === 0 && !h.isDead,
        status: [h.isDead
          ? { text: '☠️ 已被荒野吞噬', tone: 'bad', title: '去運動補血即可復活' }
          : { text: i === 0 ? '👑 荒野之王' : '🟢 存活中', tone: i === 0 ? 'gold' : 'ok' }],
        primary: { label: '生存值 HP', value: Math.max(0, h.currentHp).toLocaleString(), accent: h.isDead ? 'text-rose-400' : 'text-amber-400' },
        metrics: [
          { label: '🍖 狩獵熱量', value: `+${Math.floor(h.food).toLocaleString()}`, accent: 'text-emerald-300' },
          { label: '🎒 搜刮物資', value: `+${Math.floor(h.scavenge).toLocaleString()}`, accent: 'text-amber-300' },
          { label: '☣️ 毒圈流失', value: `-${currentPenalty.toLocaleString()}`, accent: 'text-rose-300' },
          { label: '⏱️ 荒野堅持天數', value: `${h.survivedDays ?? (h.isDead ? 0 : (sv.totalDays || sv.days || 1))} / ${h.totalDays ?? (sv.totalDays || sv.days || 1)} 天`, accent: 'text-cyan-300' }
        ],
        footHtml: `<div class="w-full h-2 ${h.isDead ? 'bg-slate-800' : 'bg-slate-900'} rounded-full overflow-hidden" title="HP = 初始 - 毒圈 + 熱量 + 衝力"><div class="h-full bg-gradient-to-r from-amber-500 to-orange-500" style="width:${hpPct}%"></div></div>${h.isDead ? '<span class="block mt-1 text-rose-400">去運動補血即可復活</span>' : ''}`
      });
    }), '目前尚無冒險者資料，請稍候同步或由 GM 於後台新增英雄。')}
  `;
  return container.html;
}

// -------------------------------------------------------------
// EXPANSION 6: 鋼鐵要塞 (Base Builder)
// -------------------------------------------------------------
function renderBaseBuilderView() {
  const container = document.getElementById("tab-content-base");
  if (!container) return;
  container.innerHTML = renderBaseBuilderHtml(window.buildBaseView(gameState));
}

/** 由 view model 產生整個資料片畫面 HTML (現場與「過往英雄史」快照共用同一份版面) */
function renderBaseBuilderHtml(view) {
  // 只讀 view model 的凍結資料 (以區域變數遮蔽全域 gameState，確保快照不會混入現在的數字)
  const gameState = { heroStats: view?.heroStats || [], base: view?.base || {}, summary: { minDurationMinutes: view?.minDur || 30 } };
  const container = { html: '', set innerHTML(v) { this.html = v; }, insertAdjacentHTML(_pos, v) { this.html += v; } };

  const heroList = gameState?.heroStats || [];
  // 全服資源總量與要塞等級：共用 seasonSnapshot.js 的 computeBaseStatus (App 摘要卡也用同一份)
  const { totalWood, totalSteel, totalMana, status } = window.computeBaseStatus(view);

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
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalCalories || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 5).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 🌳 頂級伐木工', tone: 'gold' }] : [],
                primary: { label: '🌳 木材產量', value: `${h.res.toLocaleString()}`, accent: 'text-emerald-400' }
             })))}
           </div>
        </div>
        <div>
           <h4 class="text-xs font-bold text-blue-400 mb-2">⚙️ 鋼鐵礦工 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">總TRIMP</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalTrimp || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 5).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 ⚙️ 首席礦工', tone: 'gold' }] : [],
                primary: { label: '⚙️ 鋼鐵產量', value: `${Math.round(h.res).toLocaleString()}`, accent: 'text-blue-400' }
             })))}
           </div>
        </div>
        <div>
           <h4 class="text-xs font-bold text-purple-400 mb-2">🔮 魔法煉金術師 <span class="text-[9px] text-slate-500 font-normal outline outline-1 outline-slate-700 px-1 rounded">Gap×10+Z2×50</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: window.baseHeroResources(h).mana
             })).sort((a,b)=>b.res-a.res).slice(0, 5).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 🔮 大煉金術師', tone: 'gold' }] : [],
                primary: { label: '🔮 神石產量', value: `${h.res.toLocaleString()}`, accent: 'text-purple-400' }
             })))}
           </div>
        </div>
      </div>
    </div>
  `;

  // 全員工程隊名冊 (統一英雄卡；主力資源 = 個人佔全服比例最高的資源，純呈現)
  const baseRoster = heroList.map(h => ({
    ...h,
    ...window.baseHeroResources(h),
    workouts: (h.scoreWorkouts ?? h.validWorkouts ?? 0)
  })).sort((a, b) => b.workouts - a.workouts);
  const baseRosterHtml = renderUnifiedHeroGrid(baseRoster.map(h => {
    const shares = [
      { k: '🌳 主力伐木工', v: totalWood > 0 ? h.wood / totalWood : 0 },
      { k: '⚙️ 主力礦工', v: totalSteel > 0 ? h.steel / totalSteel : 0 },
      { k: '🔮 主力煉金師', v: totalMana > 0 ? h.mana / totalMana : 0 }
    ].sort((a, b) => b.v - a.v);
    return renderUnifiedHeroCard(h.name, {
      guild: h.guild,
      status: [shares[0].v > 0 ? { text: `${shares[0].k} (${Math.round(shares[0].v * 1000) / 10}%)`, tone: 'info' } : { text: '🧱 待命中', tone: 'muted' }],
      primary: { label: '出勤次數', value: `${Math.round(h.workouts * 10) / 10} 次`, accent: 'text-amber-400' },
      metrics: [
        { label: '🌳 木材', value: Math.round(h.wood).toLocaleString(), accent: 'text-emerald-300' },
        { label: '⚙️ 鋼鐵', value: Math.round(h.steel).toLocaleString(), accent: 'text-blue-300' },
        { label: '🔮 神石', value: Math.round(h.mana).toLocaleString(), accent: 'text-purple-300' }
      ]
    });
  }));

  container.insertAdjacentHTML('beforeend', `
    <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 mt-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2"><i data-lucide="users" class="w-4 h-4 text-blue-400"></i><span>🏗️ 全員工程隊名冊</span></h3>
        <span class="text-xs text-slate-400">每位英雄的資源貢獻 • 點擊查看個人戰力卡</span>
      </div>
      ${baseRosterHtml}
    </div>
  `);
  return container.html;
}

// -------------------------------------------------------------
// EXPANSION 7: 遺跡拼圖 (Relic Bingo)
// -------------------------------------------------------------
function renderBingoView() {
  const container = document.getElementById("tab-content-bingo");
  if (!container) return;
  container.innerHTML = renderBingoHtml(window.buildBingoView(gameState));
}

/** 由 view model 產生整個資料片畫面 HTML (現場與「過往英雄史」快照共用同一份版面) */
function renderBingoHtml(view) {
  // 只讀 view model 的凍結資料 (以區域變數遮蔽全域 gameState，確保快照不會混入現在的數字)
  const gameState = { heroStats: view?.heroStats || [], bingo: { multiplier: view?.multiplier || 1 } };
  const container = { html: '', set innerHTML(v) { this.html = v; }, insertAdjacentHTML(_pos, v) { this.html += v; } };

  const grid = view?.grid || []; // 九宮格條件已於 buildBingoView 依活動明細算好並凍結

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
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalCalories || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 🔥 脂肪燃燒者', tone: 'gold' }] : [],
                primary: { label: '總卡路里', value: `${Math.round(h.res).toLocaleString()} kcal`, accent: 'text-rose-400' }
             })))}
           </div>
        </div>

        <!-- 訓練時長貢獻 (這需要在 hero 活動算, 但簡單點用出勤次數替代或時長) -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-amber-400 mb-2">⌚ 紀律部隊 <span class="text-[9px] text-slate-500 ml-1">總出勤次數</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreWorkouts ?? h.validWorkouts ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 ⌚ 紀律部隊', tone: 'gold' }] : [],
                primary: { label: '總出勤次數', value: `${Math.round(h.res).toLocaleString()} 次`, accent: 'text-amber-400' }
             })))}
           </div>
        </div>

        <!-- Zone2 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-emerald-400 mb-2">🟢 燃脂大師 <span class="text-[9px] text-slate-500 ml-1">Zone 2 次數</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreZone2 ?? h.zone2Count ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 🟢 燃脂大師', tone: 'gold' }] : [],
                primary: { label: 'Zone 2 次數', value: `${Math.round(h.res).toLocaleString()} 次`, accent: 'text-emerald-400' }
             })))}
           </div>
        </div>

        <!-- TRIMP 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-blue-400 mb-2">⚙️ 心跳超載 <span class="text-[9px] text-slate-500 ml-1">累積衝力 TRIMP</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.totalTrimp || 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 ⚙️ 心跳超載', tone: 'gold' }] : [],
                primary: { label: '累積衝力 TRIMP', value: `${Math.round(h.res).toLocaleString()}`, accent: 'text-blue-400' }
             })))}
           </div>
        </div>

        
        <!-- 長征先鋒 (單次 ≥ 60 分鐘) 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-teal-400 mb-2">⏳ 長征先鋒 <span class="text-[9px] text-slate-500 ml-1">單次 ≥ 60 分鐘次數</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreLongCount ?? h.longCount ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 ⏳ 長征先鋒', tone: 'gold' }] : [],
                primary: { label: '單次 ≥ 60 分鐘', value: `${Math.round(h.res * 10) / 10} 次`, accent: 'text-teal-400' }
             })))}
           </div>
        </div>

        <!-- MaxGap 貢獻 -->
        <div class="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
           <h4 class="text-xs font-bold text-purple-400 mb-2">限界突破 <span class="text-[9px] text-slate-500 ml-1">最高落差 MaxGap</span></h4>
           <div class="space-y-2">
             ${renderUnifiedHeroList((gameState?.heroStats || []).map(h => ({
                ...h, res: (h.scoreMaxGap ?? h.maxGap ?? 0)
             })).sort((a,b)=>b.res-a.res).slice(0, 3).map((h, i) => renderUnifiedHeroCard(h.name, {
                rank: i + 1, compact: true, guild: h.guild, status: i === 0 ? [{ text: '👑 💥 限界突破', tone: 'gold' }] : [],
                primary: { label: '最高落差 MaxGap', value: `${Math.round(h.res).toLocaleString()}`, accent: 'text-purple-400' }
             })))}
           </div>
        </div>

      </div>
    </div>
  `;

  // 全員拼圖名冊 (統一英雄卡；狀態 = 領跑幾塊板塊，純呈現)
  const bStats = (gameState?.heroStats || []);
  const boardLeaders = window.bingoBoardLeaders(bStats); // 六大板塊領跑者 (共用 seasonSnapshot.js)
  const bingoRosterHtml = renderUnifiedHeroGrid([...bStats].sort((a, b) => (b.scoreWorkouts ?? b.validWorkouts ?? 0) - (a.scoreWorkouts ?? a.validWorkouts ?? 0)).map(h => {
    const leads = boardLeaders.filter(n => n === h.name).length;
    return renderUnifiedHeroCard(h.name, {
      guild: h.guild,
      status: [leads > 0 ? { text: `🧩 領跑 ${leads} 塊板塊`, tone: 'purple' } : { text: '🧩 拼圖探索中', tone: 'muted' }],
      primary: { label: '出勤次數', value: `${Math.round((h.scoreWorkouts ?? h.validWorkouts ?? 0) * 10) / 10} 次`, accent: 'text-amber-400' },
      metrics: [
        { label: '🔥 熱量', value: `${Math.round(h.totalCalories || 0).toLocaleString()}`, accent: 'text-rose-300' },
        { label: '🟢 Zone2', value: `${Math.round(h.scoreZone2 ?? h.zone2Count ?? 0)} 次`, accent: 'text-emerald-300' },
        { label: '⚙️ TRIMP', value: Math.round(h.totalTrimp || 0).toLocaleString(), accent: 'text-blue-300' },
        { label: '⏳ 長征≥60m', value: `${Math.round((h.scoreLongCount ?? h.longCount ?? 0) * 10) / 10} 次`, accent: 'text-teal-300' },
        { label: '💥 MaxGap', value: `${Math.round(h.scoreMaxGap ?? h.maxGap ?? 0)}`, accent: 'text-purple-300' }
      ]
    });
  }));

  container.insertAdjacentHTML('beforeend', `
    <div class="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 mt-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white flex items-center space-x-2"><i data-lucide="users" class="w-4 h-4 text-fuchsia-400"></i><span>🧩 全員拼圖名冊</span></h3>
        <span class="text-xs text-slate-400">每位英雄的板塊貢獻 • 點擊查看個人戰力卡</span>
      </div>
      ${bingoRosterHtml}
    </div>
  `);
  return container.html;
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
          const heroObj = gameState?.heroes?.find(h => h.name === heroName);
          const dbHeroName = heroObj?.rawName || (typeof window.rawDbText === 'function' ? window.rawDbText(heroName) : heroName);
          const hexName = Array.from(new TextEncoder().encode(dbHeroName)).map(b => b.toString(16).padStart(2, '0')).join('');
          const fileName = `hero_${hexName}.webp`;
          
          let publicUrl = await supabase.uploadFile('avatars', fileName, blob, 'image/webp');
          publicUrl += "?t=" + Date.now(); // Cache busting
          
          const updatedRows = await supabase.update('heroes', `name=eq.${encodeURIComponent(dbHeroName)}`, { avatar: publicUrl });
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

// =====================================================================
// 📱 給「鋼鐵英雄同步器」App 戰績分頁呼叫的介面 (App 原生分頁 → 切換網頁分頁)
// =====================================================================
window.IronApp = {
  show(tab) {
    try {
      if (!['expansion', 'viewer', 'chronicles'].includes(tab)) tab = 'expansion';
      window.__appReqTab = tab;
      document.querySelectorAll('[id^=modal-]').forEach(m => m.classList.add('hidden'));
      if (tab === 'expansion') goToActiveExpansion(); else switchMainTab(tab);
      window.scrollTo(0, 0);
      return true;
    } catch (e) { console.error('[IronApp]', e); return false; }
  },
  back() {
    try {
      const sh = document.getElementById('ia-sheet');
      if (sh && sh.classList.contains('open') && window.IronAppUI && typeof window.IronAppUI.closeSheet === 'function') {
        window.IronAppUI.closeSheet();
        return true;
      }
      if (currentMainTab === 'viewer' || currentMainTab === 'chronicles') {
        this.show('expansion');
        return true;
      }
      return false;
    } catch (e) { return false; }
  },
  async refresh() {
    try {
      if (typeof window.syncFromDatabase === 'function') await window.syncFromDatabase();
      if (typeof renderAllGameViews === 'function') renderAllGameViews();
      return true;
    } catch (e) { console.error('[IronApp]', e); return false; }
  }
};

// =====================================================================
// 📅 賽季資訊列：所有資料片頁面最上方統一顯示「賽季期間 / 第幾天 / 剩幾天」
// (各資料片重新渲染時會覆蓋內容，所以在 renderAllGameViews / switchMainTab 之後補上)
// =====================================================================
const SEASON_BAR_TABS = ['classic', 'rpg', 'boss', 'faction', 'survival', 'base', 'bingo', 'expedition', 'dream', 'flame', 'monastery'];
/** 賽季進度 (期間 / 第幾天 / 剩幾天)：網頁賽季資訊列與 App 資訊膠囊共用 */
function getSeasonInfo() {
  const st = window.gameState || gameState || {};
  const s = typeof normalizeDateYMD === 'function' ? normalizeDateYMD(st.seasonStart || '') : (st.seasonStart || '');
  const e = typeof normalizeDateYMD === 'function' ? normalizeDateYMD(st.seasonEnd || '') : (st.seasonEnd || '');
  if (!s || !e) return null;
  const today = typeof getTodayYMD === 'function' ? getTodayYMD() : '';
  const total = typeof diffDaysYMD === 'function' ? diffDaysYMD(s, e) + 1 : null;
  let status = '', detail = '', tone = 'emerald', day = null, left = null, phase = '';
  if (today && typeof diffDaysYMD === 'function') {
    if (today < s) { const n = diffDaysYMD(today, s); status = '⏳ 即將開始'; detail = `還有 ${n} 天開賽`; tone = 'sky'; phase = 'upcoming'; left = n; }
    else if (today > e) { status = '🏁 賽季已結束'; detail = `共 ${total} 天`; tone = 'slate'; phase = 'ended'; }
    else { day = diffDaysYMD(s, today) + 1; left = diffDaysYMD(today, e); status = '🔥 進行中'; detail = `第 ${day} 天 / 共 ${total} 天 • ${left === 0 ? '今天是最後一天！' : `剩 ${left} 天`}`; tone = left <= 3 ? 'rose' : 'emerald'; phase = 'live'; }
  }
  return { s, e, total, status, detail, tone, day, left, phase };
}
window.getSeasonInfo = getSeasonInfo;

function buildSeasonInfoBarHtml() {
  const info = getSeasonInfo();
  if (!info) return '';
  const { s, e, status, detail, tone } = info;
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v));
  const toneCls = { emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', sky: 'bg-sky-500/15 text-sky-300 border-sky-500/40', rose: 'bg-rose-500/15 text-rose-300 border-rose-500/40', slate: 'bg-slate-700/40 text-slate-300 border-slate-600' }[tone];
  return `<div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      <span class="font-black text-amber-300">📅 賽季期間</span>
      <span class="font-mono font-bold text-white">${esc(s)} ~ ${esc(e)}</span>
      ${status ? `<span class="px-2 py-0.5 rounded-full border font-black text-[11px] ${toneCls}">${status}</span>` : ''}
      ${detail ? `<span class="text-slate-300 font-bold">${esc(detail)}</span>` : ''}
    </div>`;
}
function ensureSeasonInfoBars() {
  try {
    const html = buildSeasonInfoBarHtml();
    SEASON_BAR_TABS.forEach(t => {
      const c = document.getElementById('tab-content-' + t);
      if (!c) return;
      let bar = Array.from(c.children).find(el => el.classList && el.classList.contains('season-info-bar'));
      if (!html) { if (bar) bar.remove(); return; }
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'season-info-bar mb-4 bg-slate-900/80 border border-amber-500/30 rounded-2xl px-4 py-3 shadow-lg';
        c.prepend(bar);
      }
      bar.innerHTML = html;
    });
  } catch (e) { console.warn('[SeasonBar]', e); }
}
window.ensureSeasonInfoBars = ensureSeasonInfoBars;
