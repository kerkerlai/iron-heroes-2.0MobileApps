
function showAdminToast(msg, isError = false) {
  let toast = document.getElementById("admin-toast-container");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "admin-toast-container";
    toast.className = "fixed bottom-5 right-5 z-[999] flex flex-col space-y-2 pointer-events-none";
    document.body.appendChild(toast);
  }
  const item = document.createElement("div");
  item.className = `p-4 rounded-2xl shadow-2xl text-xs font-bold text-white border flex items-center space-x-2 transition-all transform duration-300 pointer-events-auto ${isError ? "bg-rose-900/90 border-rose-600" : "bg-slate-900/95 border-amber-500/60"}`;
  const sp = document.createElement("span");
  sp.textContent = String(msg ?? "");
  item.appendChild(sp);
  toast.appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    setTimeout(() => item.remove(), 300);
  }, 4000);
}

window.addEventListener("gameStateSynced", (e) => {
  if (e.detail) {
    gameState = e.detail;
    allActivitiesCache = gameState?.activities || [];
    withDirtyPreserved(() => {
      populateGlobalSettings();
      populateFormDropdowns();
      populateBossConfig();
    });
    renderHeroTable();
    renderSnapshotTable();
    renderActivityTable();
    renderCrawlerUI();
    if (typeof renderGMOpsCenter === "function") renderGMOpsCenter();
  }
});


// -------------------------------------------------------------
// GM AUTHENTICATION GATEKEEPER
// -------------------------------------------------------------
const GM_AUTH_HASH = 639381986; // 避免明文金鑰直接出現在前端原始碼；驗證後將輸入金鑰存入 sessionStorage 供後端 Edge Function 驗證
function _gmCodeCheck(s) {
  let h = 5381;
  const v = String(s || "");
  for (let i = 0; i < v.length; i++) h = (h * 33 + v.charCodeAt(i)) % 1000000007;
  return h === GM_AUTH_HASH;
}
function getGMSecret() {
  return sessionStorage.getItem("gm_edge_secret") || sessionStorage.getItem("gm_authenticated") || "";
}

function checkGMAuth() {
  const urlPw = new URLSearchParams(window.location.search).get("pw");
  if (urlPw && _gmCodeCheck(urlPw)) {
    sessionStorage.setItem("gm_authenticated", urlPw);
    sessionStorage.setItem("gm_edge_secret", urlPw);
  }
  stripPasswordFromUrl();
  const saved = sessionStorage.getItem("gm_authenticated") || "";
  const isAuth = Boolean(saved && _gmCodeCheck(saved));
  const overlay = document.getElementById("admin-login-overlay");
  if (overlay) {
    if (isAuth) {
      overlay.classList.add("hidden");
    } else {
      overlay.classList.remove("hidden");
      setTimeout(() => {
        const input = document.getElementById("gm-password-input");
        if (input) input.focus();
      }, 100);
    }
  }
  return isAuth;
}

function verifyGMPassword() {
  const input = document.getElementById("gm-password-input");
  const errEl = document.getElementById("gm-password-error");
  const overlay = document.getElementById("admin-login-overlay");
  const val = (input?.value || "").trim();

  if (_gmCodeCheck(val)) {
    sessionStorage.setItem("gm_authenticated", val);
    sessionStorage.setItem("gm_edge_secret", val);
    if (errEl) errEl.classList.add("hidden");
    if (overlay) overlay.classList.add("hidden");
    showAdminToast("✅ GM 權限認證成功，歡迎進入控制台！");
    if (window.lucide) lucide.createIcons();
  } else {
    if (errEl) errEl.classList.remove("hidden");
    if (input) {
      input.classList.add("border-rose-500");
      input.value = "";
      input.focus();
    }
  }
}

// 把 ?pw= 從網址列移除 (避免密碼留在瀏覽紀錄/截圖，且登出後重新整理不會自動登入)
function stripPasswordFromUrl() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has("pw")) {
      u.searchParams.delete("pw");
      history.replaceState(null, "", u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash);
    }
  } catch (e) {}
}

function logoutGM() {
  sessionStorage.removeItem("gm_authenticated");
  sessionStorage.removeItem("gm_edge_secret");
  stripPasswordFromUrl();
  const overlay = document.getElementById("admin-login-overlay");
  const input = document.getElementById("gm-password-input");
  if (overlay) overlay.classList.remove("hidden");
  if (input) {
    input.value = "";
    input.focus();
  }
  showAdminToast("已安全登出 GM 控制台");
}


function dateToInputVal(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim().replace(/-/g, "/");
  const parts = s.split(" ")[0].split("/");
  if (parts.length === 3) {
    const y = parts[0];
    const m = String(parts[1]).padStart(2, "0");
    const d = String(parts[2]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return dateStr;
}

function inputValToDate(inputVal) {
  if (!inputVal) return "";
  return inputVal.replace(/-/g, "/");
}

/**
 * 寫入保護：只有在「雲端設定已成功完整載入」後才允許 GM 儲存，
 * 避免網路異常時表單停留在預設值 (例如 10000/500、World Boss) 而把正式設定與活動資料覆蓋掉。
 */
function assertCloudReady() {
  if (window.__dbSyncOk === true) return true;
  alert("⚠️ 雲端資料尚未成功載入（或剛才同步失敗），為避免用預設值覆蓋正式設定，本次儲存已取消。\n\n請重新整理頁面，確認資料正確顯示後再操作一次。");
  return false;
}

// 表單「髒值」保護：GM 正在編輯 (尚未儲存) 的欄位，不會被背景同步或切換分頁時的重新渲染蓋回舊值
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el && el.id && (el.id.startsWith("cfg-") || el.id === "gm-badge-start-date")) el.dataset.dirty = "1";
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el && el.id && (el.id.startsWith("cfg-") || el.id === "gm-badge-start-date")) el.dataset.dirty = "1";
});
function clearDirtyInputs() {
  document.querySelectorAll("[data-dirty]").forEach(el => { delete el.dataset.dirty; });
}
function withDirtyPreserved(fn) {
  const saved = Array.from(document.querySelectorAll("[data-dirty]"))
    .filter(el => el && el.id)
    .map(el => [el.id, el.type === "checkbox" ? el.checked : el.value]);
  const restore = () => {
    saved.forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = v;
      else el.value = v;
      el.dataset.dirty = "1";
    });
  };
  try {
    return fn();
  } finally {
    restore();
    if (saved.some(([id]) => id === "cfg-active-mode")) {
      onExpansionModeChanged();
      restore();
    }
  }
}
/**
 * 鋼鐵英雄紀元 - GM Control Panel Engine (v2.3 動態情境響應版)
 */

let gameState = null;
let allActivitiesCache = [];

const RPG_CLASSES = {
  '狂戰士': { badge: '⚔️', name: '狂戰士', color: '#ef4444', desc: '無氧落差 +30%' },
  '聖騎士': { badge: '🛡️', name: '聖騎士', color: '#eab308', desc: '出勤×150 + Suffer×1.5' },
  '遊俠':   { badge: '🏹', name: '遊俠',   color: '#10b981', desc: 'Zone2次數×120 + 熱量+35%' },
  '大法師': { badge: '🧙', name: '大法師', color: '#06b6d4', desc: 'TRIMP×1.5倍奧術增幅' },
  '刺客':   { badge: '🗡️', name: '刺客',   color: '#a855f7', desc: '密度×2.0倍暗影加成' }
};

document.addEventListener('DOMContentLoaded', async () => {
  checkGMAuth();
  if (typeof window.syncFromDatabase === 'function') {
    await window.syncFromDatabase();
  }
  if (!window.gameState || !window.gameState.heroes || window.gameState.heroes.length === 0) {
    await fetchAdminData();
  } else {
    gameState = window.gameState;
    allActivitiesCache = gameState?.activities || [];
  }
  await fetchCrawlerConfig();
  populateGlobalSettings();
  populateFormDropdowns();
  onExpansionModeChanged();
  renderSnapshotTable();
  renderHeroTable();
  renderActivityTable();
  renderCrawlerUI();
  if (typeof renderGMOpsCenter === 'function') renderGMOpsCenter();
  if (typeof renderMobileSyncSection === 'function') renderMobileSyncSection();
  if (typeof refreshMobileModeOptions === 'function') refreshMobileModeOptions();
  initAdminSSE();
  if (window.lucide) lucide.createIcons();
});

function initAdminSSE() {
  const urlParams = new URLSearchParams(window.location.search);
  const subtab = urlParams.get('subtab');
  if (subtab && typeof switchGMOpsSubTab === 'function') {
    switchGMOpsSubTab(subtab);
  }
  if (urlParams.get('nosse')) return;
  try {
    const sse = new EventSource('/api/stream');
    sse.addEventListener('game_updated', () => {
      // 以 Supabase 為唯一資料來源：收到本地伺服器廣播時重新同步雲端，而不是採用本地 JSON 檔 (避免舊資料被後續儲存寫回正式資料庫)
      if (typeof window.syncFromDatabase === 'function') window.syncFromDatabase();
    });
    sse.addEventListener('new_attack', () => {
      if (typeof window.syncFromDatabase === 'function') window.syncFromDatabase();
    });
  } catch (e) {}
}

const EMBEDDED_DEFAULT_STATE = {
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

async function fetchAdminData() {
  if (window.gameState && window.gameState.heroes && window.gameState.heroes.length > 0) {
    gameState = window.gameState;
    allActivitiesCache = gameState?.activities || [];
    return;
  }
  try {
    const res = await fetch("/api/state");
    if (res.ok && !window.gameState) {
      gameState = await res.json();
    } else {
      throw new Error("Local API offline");
    }
  } catch (e) {
    try {
      const fbRes = await fetch("/data/game_data.json");
      if (fbRes.ok && !window.gameState) {
        gameState = await fbRes.json();
      }
    } catch (err) {}
  }

  if (window.gameState) {
    gameState = window.gameState;
  }

  if (!gameState) {
    const local = localStorage.getItem("game_state");
    if (local) {
      try { gameState = JSON.parse(local); } catch(err) {}
    }
  }

  if (!gameState || !gameState.heroes || gameState.heroes.length === 0) {
    gameState = JSON.parse(JSON.stringify(EMBEDDED_DEFAULT_STATE));
  }

  allActivitiesCache = gameState?.activities || [];
  if (!gameState.snapshots && gameState.archivedSeasons) {
    gameState.snapshots = gameState.archivedSeasons;
  }
}

function getModeLabel(mode) {
  if (mode === 'classic') return '資料片一：經典競技模式';
  if (mode === 'rpg_talent' || mode === 'rpg') return '資料片二：RPG 職業天賦模式';
  if (mode === 'world_boss' || mode === 'boss') return '資料片三：世界 Boss 討伐戰 (PvE Raid)';
  if (mode === 'faction_war') return '資料片四：雙城激戰 (2v2 陣營對抗)';
  if (mode === 'survival') return '資料片五：飢餓法則 (大逃殺生存戰)';
  if (mode === 'base_builder') return '資料片六：鋼鐵要塞 (全服資源養成)';
  if (mode === 'bingo') return '資料片七：戰神拼圖 (九宮格解謎)';
  if (window.isMobileMode && window.isMobileMode(mode)) { const mm = window.MOBILE_MODE_META[mode]; return `資料片${mm.num}：${mm.name} (📱 手機同步)`; }
  return '資料片一：經典競技模式';
}

function populateGlobalSettings() {
  if (!gameState) return;
  const modeSelect = document.getElementById('cfg-active-mode');
  if (modeSelect) modeSelect.value = gameState.activeMode || 'world_boss';

  const sStart = document.getElementById('cfg-season-start');
  const sEnd = document.getElementById('cfg-season-end');

  const startVal = gameState.seasonStart || gameState.boss?.seasonStart || '2026/08/12';
  const endVal = gameState.seasonEnd || gameState.boss?.seasonEnd || '2026/08/31';

  if (sStart) sStart.value = dateToInputVal(startVal);
  if (sEnd) sEnd.value = dateToInputVal(endVal);

  const gmOps = ensureGMOpsState();
  const badgeStartIso = gmOps.badgeStartDate ? dateToInputVal(gmOps.badgeStartDate) : '';
  const cfgBadgeStartEl = document.getElementById('cfg-badge-start-date');
  const gmBadgeStartEl = document.getElementById('gm-badge-start-date');
  if (cfgBadgeStartEl) cfgBadgeStartEl.value = badgeStartIso;
  if (gmBadgeStartEl) gmBadgeStartEl.value = badgeStartIso;

  const minDurVal = gameState.summary?.minDurationMinutes || gameState.boss?.rules?.minDurationMinutes || gameState.classic?.minDuration || 30;
  const globalMinDur = document.getElementById('cfg-global-min-dur');
  const classicMinDur = document.getElementById('cfg-classic-min-dur');
  if (globalMinDur) globalMinDur.value = minDurVal;
  if (classicMinDur) classicMinDur.value = minDurVal;

  if (gameState.faction) {
    const f1El = document.getElementById('cfg-faction1-name');
    const f2El = document.getElementById('cfg-faction2-name');
    const fHpEl = document.getElementById('cfg-faction-basehp');
    if (f1El && gameState.faction.f1Name) f1El.value = gameState.faction.f1Name;
    if (f2El && gameState.faction.f2Name) f2El.value = gameState.faction.f2Name;
    if (fHpEl && gameState.faction.baseHp) fHpEl.value = gameState.faction.baseHp;
  }
  renderFactionAssignEditor();
  renderBossGallery();

  if (gameState.survival) {
    const sMaxEl = document.getElementById('cfg-survival-maxhp');
    const sDecEl = document.getElementById('cfg-survival-decay');
    if (sMaxEl && gameState.survival.maxHp) sMaxEl.value = gameState.survival.maxHp;
    if (sDecEl && gameState.survival.decayPerDay !== undefined && gameState.survival.decayPerDay !== null) {
      // 顯示「目前 / 下一次」生效的每日扣血 (分段扣血時以最新一段為準)
      const svNow = typeof window.computeSurvivalState === 'function' ? window.computeSurvivalState(gameState) : null;
      sDecEl.value = svNow ? svNow.decayPerDay : gameState.survival.decayPerDay;
    }
  }
  const schedNote = document.getElementById('cfg-survival-schedule-note');
  if (schedNote && typeof window.computeSurvivalState === 'function') {
    const sv = window.computeSurvivalState(gameState);
    const sched = sv.schedule.length ? sv.schedule : [{ from: sv.startYMD || '-', perDay: sv.decayPerDay }];
    schedNote.innerHTML = `☣️ 毒圈扣血紀錄：${sched.map(s => `${s.from} 起每日 -${s.perDay}`).join(' ➜ ')}<br>📅 目前第 ${sv.days} 天，全服累計已扣 ${sv.penalty.toLocaleString()} HP${sv.seasonOver ? '（賽季已結束，停止扣血）' : ''}`;
  }

  if (gameState.base) {
    const bWoodEl = document.getElementById('cfg-base-wood');
    const bSteelEl = document.getElementById('cfg-base-steel');
    const bManaEl = document.getElementById('cfg-base-mana');
    if (bWoodEl && gameState.base.woodTarget) bWoodEl.value = gameState.base.woodTarget;
    if (bSteelEl && gameState.base.steelTarget) bSteelEl.value = gameState.base.steelTarget;
    if (bManaEl && gameState.base.manaTarget) bManaEl.value = gameState.base.manaTarget;
  }

  if (gameState.bingo) {
    const bgMultEl = document.getElementById('cfg-bingo-multiplier');
    if (bgMultEl && gameState.bingo.multiplier !== undefined) bgMultEl.value = gameState.bingo.multiplier;
  }

  const kwEl = document.getElementById('cfg-exclude-keywords');
  if (kwEl) {
    const rawKws = window.__rawConfigMap?.exclude_keywords;
    const kws = Array.isArray(rawKws) && rawKws.length > 0
      ? rawKws
      : (Array.isArray(gameState.excludeKeywords) && gameState.excludeKeywords.length > 0
        ? gameState.excludeKeywords.map(k => (typeof window.rawDbText === 'function' ? window.rawDbText(k) : k))
        : ['羽球', 'Badminton']);
    kwEl.value = kws.join(', ');
  }

  populateBossConfig();
  onExpansionModeChanged();
}

/**
 * 當 GM 在控制台切換資料片時，動態調整所有設定面板、補登表單與名冊欄位！
 */
function onExpansionModeChanged() {
  const mode = document.getElementById('cfg-active-mode')?.value || 'classic';
  
  // 1. Update Helper Tag
  const helperTag = document.getElementById('active-mode-helper-tag');
  if (helperTag) {
    if (mode === 'classic') helperTag.innerHTML = '當前設定：🏆 資料片一 • 經典競技模式 (公會積分爭霸)';
    else if (mode === 'rpg_talent') helperTag.innerHTML = '當前設定：⚔️ 資料片二 • RPG 職業天賦模式 (五大職業與羈絆)';
    else if (mode === 'world_boss') helperTag.innerHTML = '當前設定：🐉 資料片三 • 世界 Boss 討伐戰 (PvE 全服合作打王)';
    else if (mode === 'faction_war') helperTag.innerHTML = '當前設定：🏰 資料片四 • 雙城激戰 (2v2 陣營攻城戰)';
    else if (mode === 'survival') helperTag.innerHTML = '當前設定：☠️ 資料片五 • 飢餓法則 (荒野大逃殺生存戰)';
    else if (mode === 'base_builder') helperTag.innerHTML = '當前設定：🔨 資料片六 • 鋼鐵要塞 (全服基地養成)';
    else if (mode === 'bingo') helperTag.innerHTML = '當前設定：🧩 資料片七 • 戰神拼圖 (九宮格團隊解謎)';
    else if (window.isMobileMode && window.isMobileMode(mode)) {
      const mm = window.MOBILE_MODE_META[mode];
      helperTag.innerHTML = `當前設定：${mm.icon} 資料片${mm.num} • ${mm.name} (📱 手機同步資料片)`;
    }
  }
  renderMobileModePanel(mode);

  // 2. Toggle Mode-Specific Config Panels
  const pClassic = document.getElementById('panel-settings-classic');
  const pRpg = document.getElementById('panel-settings-rpg');
  const pBoss = document.getElementById('panel-settings-boss');

  if (pClassic) pClassic.classList.toggle('hidden', mode !== 'classic');
  if (pRpg) pRpg.classList.toggle('hidden', mode !== 'rpg_talent');
  if (pBoss) pBoss.classList.toggle('hidden', mode !== 'world_boss');
  const pFaction = document.getElementById('panel-settings-faction');
  const pSurvival = document.getElementById('panel-settings-survival');
  const pBase = document.getElementById('panel-settings-base');
  const pBingo = document.getElementById('panel-settings-bingo');
  if (pFaction) pFaction.classList.toggle('hidden', mode !== 'faction_war');
  if (pSurvival) pSurvival.classList.toggle('hidden', mode !== 'survival');
  if (pBase) pBase.classList.toggle('hidden', mode !== 'base_builder');
  if (pBingo) pBingo.classList.toggle('hidden', mode !== 'bingo');

  // 3. Dynamic Adjustments to Manual Check-in Form
  const formTitle = document.getElementById('manual-form-title');
  const formSub = document.getElementById('manual-form-subtitle');
  const btnSubmitText = document.getElementById('btn-manual-submit-text');
  const lbl1 = document.getElementById('prev-lbl-1');
  const lbl2 = document.getElementById('prev-lbl-2');
  const lbl3 = document.getElementById('prev-lbl-3');
  const lbl4 = document.getElementById('prev-lbl-4');

  if (mode === 'classic') {
    if (formTitle) formTitle.innerText = '🏋️ 登錄經典競技訓練';
    if (formSub) formSub.innerText = '登錄有效運動 (滿30分)，自動試算有氧/無氧指標並計入公會積分';
    if (btnSubmitText) btnSubmitText.innerText = '登錄訓練並計入經典競技積分';
    if (lbl1) lbl1.innerText = '🔋 燃脂熱量 (kcal)';
    if (lbl2) lbl2.innerText = '🚀 訓練衝力 (TRIMP)';
    if (lbl3) lbl3.innerText = '🦍 無氧落差 (Gap)';
    if (lbl4) lbl4.innerText = '📊 100分制加權試算';
  } else if (mode === 'rpg_talent') {
    if (formTitle) formTitle.innerText = '⚔️ 登錄英雄修煉打卡';
    if (formSub) formSub.innerText = '鍛鍊數據套用英雄職業被動天賦，轉化為 RPG 戰鬥評分 (CP)';
    if (btnSubmitText) btnSubmitText.innerText = '登錄打卡並轉化為職業專精戰力 (CP)';
    if (lbl1) lbl1.innerText = '🔥 基礎能量';
    if (lbl2) lbl2.innerText = '⚡ 奧術衝力';
    if (lbl3) lbl3.innerText = '✨ 專精天賦加成';
    if (lbl4) lbl4.innerText = '⚡ RPG 戰鬥評分 (CP)';
  } else if (window.isMobileMode && window.isMobileMode(mode)) {
    const mm = window.MOBILE_MODE_META[mode];
    if (formTitle) formTitle.innerText = `${mm.icon} 手動補登運動 (${mm.name})`;
    if (formSub) formSub.innerText = '手機同步資料片主要使用 App 上傳的步數/睡眠等數據；此處補登的運動會計入「有效運動」相關的分數 (訓練里程、攻擊分、活動之火、修煉分)';
    if (btnSubmitText) btnSubmitText.innerText = '登錄運動紀錄';
    if (lbl1) lbl1.innerText = '🔋 熱量 (kcal)';
    if (lbl2) lbl2.innerText = '🚀 TRIMP × 15';
    if (lbl3) lbl3.innerText = '🦍 落差 × 100';
    if (lbl4) lbl4.innerText = '📊 參考值';
  } else if (mode === 'survival') {
    if (formTitle) formTitle.innerText = '☠️ 手動補登荒野求生打卡';
    if (formSub) formSub.innerText = '鍛鍊數據轉化為狩獵補血 (熱量) 與搜刮物資 (TRIMP × 1.5)，抵抗每日毒圈扣血';
    if (btnSubmitText) btnSubmitText.innerText = '登錄打卡並補充生存值 (HP)';
    if (lbl1) lbl1.innerText = '🍖 狩獵補血 (熱量)';
    if (lbl2) lbl2.innerText = '🎒 搜刮物資 (TRIMP×1.5)';
    if (lbl3) lbl3.innerText = '—';
    if (lbl4) lbl4.innerText = '❤️ 本次補充生存值';
  } else {
    if (formTitle) formTitle.innerText = '⚔️ 手動打卡發動討伐攻擊';
    if (formSub) formSub.innerText = '鍛鍊數據轉化為 3 大傷害體系，即時扣除 Boss 血量';
    if (btnSubmitText) btnSubmitText.innerText = '發動攻擊並登記打卡 (扣除 Boss 血量)';
    if (lbl1) lbl1.innerText = '🗡️ 普攻 (熱量)';
    if (lbl2) lbl2.innerText = '🔮 魔攻 (TRIMP)';
    if (lbl3) lbl3.innerText = '💥 爆擊 (Gap)';
    if (lbl4) lbl4.innerText = '⚔️ 總討伐傷害';
  }

  // 4. Dynamic Adjustments to Hero Roster
  const rosterTitle = document.getElementById('hero-roster-title');
  const btnRandom = document.getElementById('btn-random-classes');
  const thClass = document.getElementById('th-hero-class-col');

  if (mode === 'classic') {
    if (rosterTitle) rosterTitle.innerText = '👥 參賽者名冊與小隊管理 (經典競技)';
    if (btnRandom) btnRandom.classList.add('hidden');
    if (thClass) thClass.innerText = '🛡️ 小隊角色';
  } else if (mode === 'rpg_talent') {
    if (rosterTitle) rosterTitle.innerText = '👥 冒險者名冊與天賦職業配置 (RPG 專精)';
    if (btnRandom) btnRandom.classList.remove('hidden');
    if (thClass) thClass.innerText = '⚔️ RPG 天賦職業';
  } else if (mode === 'survival') {
    if (rosterTitle) rosterTitle.innerText = '👥 荒野求生者名冊 (飢餓法則)';
    if (btnRandom) btnRandom.classList.add('hidden');
    if (thClass) thClass.innerText = '⚔️ 職業 (本資料片不影響分數)';
  } else {
    if (rosterTitle) rosterTitle.innerText = '👥 討伐軍名冊與先鋒部隊 (世界 Boss)';
    if (btnRandom) btnRandom.classList.add('hidden');
    if (thClass) thClass.innerText = '⚔️ 攻擊部隊';
  }

  populateFormDropdowns();
  previewDamageCalculation();
  renderHeroTable();
  if (window.lucide) lucide.createIcons();
}

async function syncAllSettingsToSupabase(customMsg) {
  if (!assertCloudReady()) return;
  const activeMode = document.getElementById('cfg-active-mode')?.value || gameState?.activeMode || 'world_boss';
  if (window.isMobileMode && window.isMobileMode(activeMode) && !gameState?.gmOps?.mobileSync?.enabled) {
    alert('⛔ 此資料片需要「手機同步 App」。\n\n請先到下方「📱 手機同步 App 管理中心」勾選啟用並儲存，再切換到手機同步資料片。');
    return;
  }
  const mobileModesConfig = collectMobileModesConfig();
  const startRaw = document.getElementById('cfg-season-start')?.value || '';
  const endRaw = document.getElementById('cfg-season-end')?.value || '';
  if (startRaw && endRaw && endRaw < startRaw) {
    alert('⚠️ 賽季結束日期不能早於開始日期！');
    return;
  }

  const seasonStart = inputValToDate(startRaw) || gameState?.seasonStart || '2026/08/12';
  const seasonEnd = inputValToDate(endRaw) || gameState?.seasonEnd || '2026/08/31';

  const globalMinDurEl = document.getElementById('cfg-global-min-dur');
  const classicMinDurEl = document.getElementById('cfg-classic-min-dur');
  const rawMinDur = parseFloat(globalMinDurEl?.value || classicMinDurEl?.value);
  const minDur = (Number.isFinite(rawMinDur) && rawMinDur >= 1) ? rawMinDur : 30.0;
  if (globalMinDurEl) globalMinDurEl.value = minDur;
  if (classicMinDurEl) classicMinDurEl.value = minDur;

  const posInt = (id, fb) => {
    const v = parseInt(document.getElementById(id)?.value, 10);
    return Number.isFinite(v) && v > 0 ? v : fb;
  };
  const toRaw = (v) => (typeof window.deepRaw === 'function' ? window.deepRaw(v) : v);

  // Boss Config (從未混入顯示預設值的原始設定複製，並清除歷史誤存的預設文字)
  const rawBossBase = window.__rawConfigMap?.boss_config || gameState?.boss || {};
  const bossConfig = JSON.parse(JSON.stringify(rawBossBase));
  delete bossConfig.subtitle;
  if (/^索爾受到雷霆魔劍/.test(bossConfig.description || '') && !/索爾/.test(bossConfig.name || '')) {
    delete bossConfig.description;
  }
  const bossName = document.getElementById('cfg-boss-name')?.value?.trim();
  const bossMaxHp = parseInt(document.getElementById('cfg-boss-maxhp')?.value, 10);
  const magMultRaw = parseFloat(document.getElementById('cfg-mag-mult')?.value);
  const magMult = (Number.isFinite(magMultRaw) && magMultRaw > 0) ? magMultRaw : 15.0;
  if (bossName) bossConfig.name = bossName;
  const bossAvatarSel = document.getElementById('cfg-boss-avatar')?.value;
  if (bossAvatarSel) bossConfig.avatar = bossAvatarSel;
  if (Number.isFinite(bossMaxHp) && bossMaxHp > 0) bossConfig.maxHp = bossMaxHp;
  delete bossConfig.currentHp;
  bossConfig.seasonStart = seasonStart;
  bossConfig.seasonEnd = seasonEnd;
  if (!bossConfig.rules) bossConfig.rules = {};
  bossConfig.rules.minDurationMinutes = minDur;
  bossConfig.rules.magicMultiplier = magMult;

  // Classic & RPG Config (只儲存真正的設定欄位，不把即時運算出來的排行榜塞進設定檔)
  const classicConfig = {
    seasonStart: seasonStart,
    seasonEnd: seasonEnd,
    minDuration: minDur
  };

  const rpgConfig = {
    seasonStart: seasonStart,
    seasonEnd: seasonEnd
  };

  // Expansion 4: Faction Config
  const factionConfig = {
    f1Name: document.getElementById('cfg-faction1-name')?.value || gameState?.faction?.f1Name || '🟢 均衡聯盟',
    f2Name: document.getElementById('cfg-faction2-name')?.value || gameState?.faction?.f2Name || '🔴 狂怒部落',
    baseHp: posInt('cfg-faction-basehp', gameState?.faction?.baseHp > 0 ? gameState.faction.baseHp : 500000),
    // 陣營分配：只保存 GM 明確指定的公會 (1 / 2)；「自動」不寫入
    guildAssign: collectFactionAssign()
  };

  // Expansion 5: Survival Config (支援 0；中途調整每日扣血時以「分段排程」從明天起生效，不回溯)
  const prevSurvival = gameState?.survival || {};
  const maxHpInput = parseInt(document.getElementById('cfg-survival-maxhp')?.value, 10);
  const decayInput = parseInt(document.getElementById('cfg-survival-decay')?.value, 10);
  const prevSv = typeof window.computeSurvivalState === 'function' ? window.computeSurvivalState(gameState) : { decayPerDay: prevSurvival.decayPerDay ?? 200 };
  const newDecay = Number.isFinite(decayInput) && decayInput >= 0 ? decayInput : (prevSv.decayPerDay ?? 200);
  const prevStartYMD = window.normalizeDateYMD ? window.normalizeDateYMD(gameState?.seasonStart || '') : '';
  const newStartYMD = window.normalizeDateYMD ? window.normalizeDateYMD(seasonStart) : seasonStart;
  let decaySchedule = Array.isArray(prevSurvival.decaySchedule) ? prevSurvival.decaySchedule.map(s => ({ ...s })) : [];
  if (prevStartYMD && newStartYMD && prevStartYMD !== newStartYMD) {
    // 新賽季 (開始日變更)：重設毒圈排程
    decaySchedule = [{ from: newStartYMD, perDay: newDecay }];
  } else if (newDecay !== prevSv.decayPerDay) {
    if (decaySchedule.length === 0) decaySchedule.push({ from: newStartYMD, perDay: Number(prevSv.decayPerDay ?? 200) });
    const tomorrowYMD = window.addDaysYMD ? window.addDaysYMD(window.getTodayYMD(), 1) : '';
    const effectiveFrom = (tomorrowYMD && newStartYMD && tomorrowYMD > newStartYMD) ? tomorrowYMD : newStartYMD;
    decaySchedule = decaySchedule.filter(s => window.normalizeDateYMD(s.from) < effectiveFrom);
    decaySchedule.push({ from: effectiveFrom, perDay: newDecay });
    if (decaySchedule.length === 1) decaySchedule[0].from = newStartYMD;
  }
  // 合併連續相同扣血值的區段 (例如當天打錯又改回原值)，保持排程乾淨
  decaySchedule = decaySchedule.filter((s, i, arr) => i === 0 || Number(s.perDay) !== Number(arr[i - 1].perDay));
  const survivalConfig = {
    maxHp: Number.isFinite(maxHpInput) && maxHpInput > 0 ? maxHpInput : (prevSurvival.maxHp > 0 ? prevSurvival.maxHp : 3000),
    decayPerDay: newDecay,
    decaySchedule: decaySchedule
  };

  // Expansion 6: Base Builder Config
  const baseConfig = {
    woodTarget: posInt('cfg-base-wood', gameState?.base?.woodTarget > 0 ? gameState.base.woodTarget : 10000),
    steelTarget: posInt('cfg-base-steel', gameState?.base?.steelTarget > 0 ? gameState.base.steelTarget : 500),
    manaTarget: posInt('cfg-base-mana', gameState?.base?.manaTarget > 0 ? gameState.base.manaTarget : 500)
  };

  // Expansion 7: Bingo Config
  const bmRaw = parseFloat(document.getElementById('cfg-bingo-multiplier')?.value);
  const bingoConfig = {
    multiplier: (Number.isFinite(bmRaw) && bmRaw > 0) ? bmRaw : (gameState?.bingo?.multiplier > 0 ? gameState.bingo.multiplier : 1.0)
  };

  // GM Ops Badge Start Date Sync
  const gmOps = ensureGMOpsState();
  const cfgBadgeStartEl = document.getElementById('cfg-badge-start-date');
  if (cfgBadgeStartEl) {
    gmOps.badgeStartDate = cfgBadgeStartEl.value ? inputValToDate(cfgBadgeStartEl.value) : '';
    const gmBadgeStartEl = document.getElementById('gm-badge-start-date');
    if (gmBadgeStartEl) gmBadgeStartEl.value = cfgBadgeStartEl.value;
    try { localStorage.setItem('gm_ops_config', JSON.stringify(gmOps)); } catch (e) {}
  }

  await Promise.all([
    window.supabase.insert("game_config", { key: "active_mode", value: activeMode }),
    window.supabase.insert("game_config", { key: "boss_config", value: toRaw(bossConfig) }),
    window.supabase.insert("game_config", { key: "classic_config", value: toRaw(classicConfig) }),
    window.supabase.insert("game_config", { key: "rpg_config", value: toRaw(rpgConfig) }),
    window.supabase.insert("game_config", { key: "faction_config", value: toRaw(factionConfig) }),
    window.supabase.insert("game_config", { key: "survival_config", value: toRaw(survivalConfig) }),
    window.supabase.insert("game_config", { key: "base_config", value: toRaw(baseConfig) }),
    window.supabase.insert("game_config", { key: "bingo_config", value: toRaw(bingoConfig) }),
    window.supabase.insert("game_config", { key: "gm_ops_config", value: toRaw(gmOps) }),
    window.supabase.insert("game_config", { key: "mobile_modes_config", value: toRaw(mobileModesConfig) })
  ]);

  if (gameState) {
    gameState.activeMode = activeMode;
    gameState.seasonStart = seasonStart;
    gameState.seasonEnd = seasonEnd;
    gameState.boss = bossConfig;
    gameState.classic = classicConfig;
    gameState.rpg = rpgConfig;
    gameState.faction = factionConfig;
    gameState.survival = survivalConfig;
    gameState.base = baseConfig;
    gameState.bingo = bingoConfig;
    gameState.mobileModes = mobileModesConfig;
  }

  clearDirtyInputs();
  if (window.syncFromDatabase) await window.syncFromDatabase();
  alert(customMsg || `🎉 資料片模式【${getModeLabel(activeMode)}】與所有遊戲條件參數已成功同步寫入 Supabase！前台看板立即生效！`);
  showAdminToast("✅ 賽事核心參數與資料片條件已成功儲存至雲端！");
  onExpansionModeChanged();
}

async function saveGlobalGameSettings() {
  try {
    await syncAllSettingsToSupabase();
  } catch (e) {
    console.error("Save Global Settings Error:", e);
    alert("❌ 儲存至雲端資料庫異常：" + e.message);
  }
}

// -------------------------------------------------------------
// SNAPSHOTS CRUD MANAGEMENT (100% 完整賽季快照封存)
// -------------------------------------------------------------

// 快照標題 / ID 顯示跳脫
function adminSnapEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getSnapshotsList() {
  if (gameState?.snapshots && Array.isArray(gameState.snapshots)) {
    return gameState.snapshots;
  }
  return [];
}

function renderSnapshotTable() {
  const tbody = document.getElementById('admin-snapshots-table-body');
  if (!tbody) return;

  const snapshots = getSnapshotsList();
  tbody.innerHTML = '';

  if (snapshots.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">目前尚無歷史快照紀錄</td></tr>`;
    return;
  }

  snapshots.forEach(snap => {
    const tr = document.createElement('tr');
    const isVisible = snap.isVisible !== false;
    tr.className = `hover:bg-slate-900/60 transition ${!isVisible ? 'opacity-50 bg-slate-950/40' : ''}`;

    let typeLabel = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">🏆 經典競技</span>';
    if (snap.type === 'rpg' || snap.type === 'rpg_talent') {
      typeLabel = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">⚔️ 職業天賦</span>';
    } else if (snap.type === 'survival') {
      typeLabel = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">☠️ 飢餓法則</span>';
    } else if (snap.type === 'faction_war') {
      typeLabel = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🏰 雙城激戰</span>';
    } else if (snap.type === 'base_builder') {
      typeLabel = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">🏗️ 鋼鐵要塞</span>';
    } else if (snap.type === 'bingo') {
      typeLabel = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">🧩 戰神拼圖</span>';
    } else if (window.isMobileMode && window.isMobileMode(snap.type)) {
      const mm = window.MOBILE_MODE_META[snap.type];
      typeLabel = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${mm.icon} ${mm.name}</span>`;
    } else if (snap.type === 'world_boss' || snap.type === 'boss') {
      typeLabel = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">🐉 世界 Boss</span>';
    }

    const statusBadge = isVisible
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🟢 前台顯示中</span>'
      : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">👁️‍🗨️ 已隱藏 (不顯示)</span>';

    tr.innerHTML = `
      <td class="p-3">
        <div class="font-bold text-white">${adminSnapEsc(snap.seasonTitle || snap.id)}</div>
        <div class="text-[10px] text-slate-400 font-mono">ID: ${adminSnapEsc(snap.id)}</div>
      </td>
      <td class="p-3">${typeLabel}</td>
      <td class="p-3 font-mono text-slate-300">${snap.seasonPeriod || '—'}</td>
      <td class="p-3 font-mono text-slate-400">${snap.archivedAt || '歷史預載'}</td>
      <td class="p-3">${statusBadge}</td>
      <td class="p-3 text-right space-x-2 whitespace-nowrap">
        <button onclick="toggleSnapshotVisibility('${snap.id}')" class="text-xs font-bold ${isVisible ? 'text-slate-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}">
          ${isVisible ? '👁️‍🗨️ 設為不顯示' : '👁️ 設為顯示'}
        </button>
        <button onclick="exportSingleSnapshot('${snap.id}')" class="text-cyan-400 hover:text-cyan-300 font-bold text-xs" title="下載快照 JSON">
          💾 匯出
        </button>
        <button onclick="deleteSnapshot('${snap.id}')" class="text-rose-400 hover:text-rose-300 font-bold text-xs">
          🗑️ 刪除
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function toggleSnapshotVisibility(snapId) {
  if (!assertCloudReady()) return;
  const snapshots = getSnapshotsList();
  const snap = snapshots.find(s => s.id === snapId);
  if (!snap) return;

  snap.isVisible = snap.isVisible === false ? true : false;
  if (gameState) gameState.snapshots = snapshots;

  try {
    await window.supabase.insert("game_config", { key: "snapshots", value: snapshots });
    if (window.syncFromDatabase) await window.syncFromDatabase();
    renderSnapshotTable();
    showAdminToast(`✅ 快照【${snap.seasonTitle}】已成功設為【${snap.isVisible ? '前台正常顯示' : '隱藏不顯示'}】！`);
  } catch (e) {
    console.error("Toggle Snapshot Visibility Error:", e);
    renderSnapshotTable();
    showAdminToast("❌ 更新失敗：" + e.message, true);
  }
}

async function deleteSnapshot(snapId) {
  if (!assertCloudReady()) return;
  const snapshots = getSnapshotsList();
  const snap = snapshots.find(s => s.id === snapId);
  const snapTitle = snap?.seasonTitle || snapId;

  if (!confirm(`確定要從 Supabase 雲端資料庫永久刪除快照【${snapTitle}】嗎？\n刪除後此歷史紀錄將從過往英雄史中移除！`)) return;

  const updatedSnapshots = snapshots.filter(s => s.id !== snapId);
  if (gameState) gameState.snapshots = updatedSnapshots;
  renderSnapshotTable();

  try {
    await window.supabase.insert("game_config", { key: "snapshots", value: updatedSnapshots });
    if (window.syncFromDatabase) await window.syncFromDatabase();
    renderSnapshotTable();
    alert(`🗑️ 快照【${snapTitle}】已成功自 Supabase 雲端資料庫刪除！前後台已同步更新！`);
    showAdminToast(`🗑️ 快照【${snapTitle}】已成功刪除！`);
  } catch (e) {
    console.error("Delete Snapshot Error:", e);
    alert("❌ 刪除失敗：" + e.message);
  }
}

function exportSingleSnapshot(snapId) {
  const snapshots = getSnapshotsList();
  const snap = snapshots.find(s => s.id === snapId);
  if (!snap) return;

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snap, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  const fname = String(snap.id || '').startsWith('snapshot_') ? `${snap.id}.json` : `snapshot_${snap.id}.json`;
  downloadAnchor.setAttribute("download", fname);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * 建立當前賽季 100% 完整快照 (Snapshot)
 */
async function archiveCurrentSeason() {
  if (!assertCloudReady()) return;
  const activeMode = gameState?.activeMode || 'classic';
  const boss = gameState?.boss || {};
  let defaultTitle = '2026 S2 • 經典競技模式 (封存快照)';
  if (activeMode === 'rpg_talent' || activeMode === 'rpg') defaultTitle = '2026 S2 • RPG 職業天賦爭霸 (封存快照)';
  if (activeMode === 'survival') defaultTitle = '資料片五 • 飢餓法則 (結算快照)';
  if (activeMode === 'faction_war') defaultTitle = '資料片四 • 雙城激戰 (結算快照)';
  if (activeMode === 'base_builder') defaultTitle = '資料片六 • 鋼鐵要塞 (結算快照)';
  if (activeMode === 'bingo') defaultTitle = '資料片七 • 戰神拼圖 (結算快照)';
  if (window.isMobileMode && window.isMobileMode(activeMode)) { const mm = window.MOBILE_MODE_META[activeMode]; defaultTitle = `資料片${mm.num} • ${mm.name} (結算快照)`; }
  else if (activeMode === 'world_boss' || activeMode === 'boss') defaultTitle = `${boss.name || '世界 Boss 討伐戰'} (結算快照)`;

  const customTitle = prompt('請輸入要建立的快照名稱 (Snapshot Title)：', defaultTitle);
  if (customTitle === null) return;
  const snapshotTitle = customTitle.trim() || defaultTitle;

  try {
    const curStartRaw = document.getElementById("cfg-season-start")?.value;
    const curEndRaw = document.getElementById("cfg-season-end")?.value;
    const activeStartStr = (curStartRaw ? inputValToDate(curStartRaw) : null) || gameState?.seasonStart || "2026/07/27";
    const activeEndStr = (curEndRaw ? inputValToDate(curEndRaw) : null) || gameState?.seasonEnd || "2026/09/30";

    const now = new Date();
    const timeStampStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // 所有 11 個資料片共用 seasonSnapshot.js 的快照建構器：
    //  - view：與前台現場畫面同一份 view model (前台用同一支 render 函式重現，版面 1:1)
    //  - heroInfo / guildInfo：凍結當下的大頭貼網址、公會、徽章數 (已解鎖 / 總數)、GM 稱號特效、出征狀態
    //  修正：過去 faction_war / base_builder / bingo 會落入 world_boss 分支被存成 Boss 資料
    if (typeof window.buildSeasonSnapshot !== 'function') throw new Error('快照模組 seasonSnapshot.js 未載入');
    const newArchive = window.buildSeasonSnapshot(
      { ...gameState, seasonStart: activeStartStr, seasonEnd: activeEndStr },
      { mode: activeMode, title: snapshotTitle, seasonStart: activeStartStr, seasonEnd: activeEndStr, archivedAt: timeStampStr }
    );
    if (!newArchive.view) throw new Error(`資料片 ${activeMode} 無法產生快照資料`);

    const snapshots = getSnapshotsList();
    snapshots.unshift(newArchive);

    try {
      await window.supabase.insert("game_config", { key: "snapshots", value: snapshots });
      if (window.syncFromDatabase) await window.syncFromDatabase();
      renderSnapshotTable();
      alert(`🎉 成功生成賽季完整歷史快照【${snapshotTitle}】並同步寫入 Supabase 雲端資料庫！前台【過往英雄史】已永久保存！`);
    } catch (err) {
      console.error("Archive Save Error:", err);
      alert("❌ 封存快照寫入雲端失敗：" + err.message);
    }
  } catch (e) {
    console.error("Archive error:", e);
    alert("封存失敗：" + e.message);
  }
}

// -------------------------------------------------------------
// HERO ROSTER & RANDOM ROLL (動態適應當前資料片)
// -------------------------------------------------------------

function renderHeroTable() {
  const tbody = document.getElementById('admin-heroes-table-body');
  if (!tbody || !gameState?.heroes) return;

  const mode = document.getElementById('cfg-active-mode')?.value || 'classic';
  tbody.innerHTML = '';

    const heroesArr = Array.isArray(gameState.heroes) ? gameState.heroes : Object.values(gameState.heroes || {});
  const sortedHeroes = heroesArr.sort((a,b) => {
      let ag = a.guild || '', bg = b.guild || '';
      if(ag !== bg) return ag.localeCompare(bg);
      let ac = a.rpgClass || '', bc = b.rpgClass || '';
      if(ac !== bc) return ac.localeCompare(bc);
      return (a.name||'').localeCompare(b.name||'');
  });
  sortedHeroes.forEach(h => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-900/60 transition';
    const heroClass = h.rpgClass || '狂戰士';
    const meta = RPG_CLASSES[heroClass] || RPG_CLASSES['狂戰士'];

    let classCellHtml = `<span class="px-2 py-0.5 rounded text-[11px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800">主力成員</span>`;
    if (mode === 'rpg_talent') {
      classCellHtml = `<span class="px-2 py-0.5 rounded text-[11px] font-bold" style="color: ${meta.color}; background: rgba(0,0,0,0.4); border: 1px solid ${meta.color}50;">${meta.badge} ${heroClass}</span>`;
    } else if (mode === 'world_boss') {
      classCellHtml = `<span class="px-2 py-0.5 rounded text-[11px] font-bold text-rose-400 bg-rose-950/40 border border-rose-800">⚔️ 討伐先鋒</span>`;
    }

    const stravaIdDisplay = h.stravaId ? 
      `<a href="https://www.strava.com/athletes/${h.stravaId}" target="_blank" class="font-mono text-cyan-400 font-bold hover:underline">#${h.stravaId} ↗</a>` : 
      `<span class="text-slate-500 italic">未綁定</span>`;

    const heroAvatarHtml = typeof window.renderHeroAvatarHtml === 'function'
      ? window.renderHeroAvatarHtml(h, 'w-7 h-7', 'rounded-lg')
      : `<div class="w-7 h-7 rounded-lg bg-slate-800 overflow-hidden border border-slate-700"><img src="${h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`}" class="w-full h-full object-cover"></div>`;
    const heroCustomTitle = typeof window.renderHeroCustomTitleHtml === 'function'
      ? window.renderHeroCustomTitleHtml(h.name)
      : '';
    const unlockedCount = Object.keys(gameState?.heroBadges?.[h.name] || {}).length;
    const boundDevice = (gameState?.devices || []).find(d => d.hero === h.name && !d.revoked);
    const boundHtml = boundDevice ? `<span class="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700 text-[10px] whitespace-nowrap" title="${escapeHtmlLite((boundDevice.platform || '') + ' ' + (boundDevice.device_model || ''))}">📱 已綁定</span>` : '';

    tr.innerHTML = `
      <td class="p-3 font-bold text-white flex items-center space-x-2">
        ${heroAvatarHtml}
        <span>${escapeHtmlLite(h.name)}</span>
        ${heroCustomTitle}
        ${boundHtml}
        <span class="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-700/40 text-[9px] font-mono">🎖️${unlockedCount}</span>
      </td>
      <td class="p-3 font-mono">${h.age} 歲</td>
      <td class="p-3 font-mono text-cyan-400 font-bold">${h.maxHr} bpm</td>
      <td class="p-3">${(() => {
        const gm = typeof window.resolveGuildMeta === 'function' ? window.resolveGuildMeta(h.guild, gameState?.gmOps) : { badge: '🛡️', color: '#64748b' };
        return `<span class="inline-flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded text-[11px] font-bold border" style="color:${gm.color};border-color:${gm.color}66;"><span>${escapeHtmlLite(gm.badge)}</span><span>${escapeHtmlLite(h.guild)}</span></span>`;
      })()}</td>
      <td class="p-3">${classCellHtml}</td>
      <td class="p-3">${stravaIdDisplay}</td>
      <td class="p-3 text-right space-x-1.5">
        <button onclick="openEditHeroModal('${h.name}')" class="px-2.5 py-1 bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900 rounded-lg text-xs font-bold transition">✏️ 編輯</button>
        <button onclick="deleteHero('${h.name}')" class="px-2.5 py-1 bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900 rounded-lg text-xs font-bold transition">🗑️ 刪除</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  if (typeof renderGMGuildEmblemEditor === 'function') {
    renderGMGuildEmblemEditor();
  }
}

// -------------------------------------------------------------
// 🛡️ 公會徽章圖形庫與代表色編輯器 (GM 後台管理，前/後端/手機 App 同步)
// -------------------------------------------------------------
function getAllGuildNamesForAdmin() {
  const set = new Set();
  (gameState?.heroes || []).forEach(h => { if (h?.guild) set.add(h.guild); });
  (gameState?.guilds || []).forEach(g => { if (g?.name) set.add(g.name); });
  const gmOps = ensureGMOpsState();
  Object.keys(gmOps.guildMeta || {}).forEach(k => { if (k) set.add(k); });
  if (set.size === 0) {
    ['Cake', '咪咪胡胡', '嘿喲嘿喲拔蘿蔔', '天琳琳地琳琳', '試試看', '自由英雄'].forEach(g => set.add(g));
  }
  return Array.from(set);
}

function renderGMGuildEmblemEditor(preferredGuild) {
  const sel = document.getElementById('gm-guild-select');
  const overviewEl = document.getElementById('gm-guild-overview-cards');
  const libEl = document.getElementById('gm-guild-emblem-library');
  const swatchesEl = document.getElementById('gm-guild-color-swatches');
  if (!sel || !overviewEl || !libEl) return;

  const gmOps = ensureGMOpsState();
  const guildNames = getAllGuildNamesForAdmin();
  const curGuild = preferredGuild || sel.value || guildNames[0] || '';

  sel.innerHTML = guildNames.map(gName => {
    const meta = typeof window.resolveGuildMeta === 'function' ? window.resolveGuildMeta(gName, gmOps) : { badge: '🛡️', color: '#64748b' };
    const cnt = (gameState?.heroes || []).filter(h => h.guild === gName).length;
    return `<option value="${escapeHtmlLite(gName)}" ${gName === curGuild ? 'selected' : ''}>${escapeHtmlLite(meta.badge)} ${escapeHtmlLite(gName)} (${cnt}人)</option>`;
  }).join('');

  const activeGuild = sel.value || curGuild;

  // 渲染上方所有公會總覽卡片
  overviewEl.innerHTML = guildNames.map(gName => {
    const meta = typeof window.resolveGuildMeta === 'function' ? window.resolveGuildMeta(gName, gmOps) : { badge: '🛡️', color: '#64748b' };
    const cnt = (gameState?.heroes || []).filter(h => h.guild === gName).length;
    const isSel = gName === activeGuild;
    return `
      <button type="button" data-guild="${escapeHtmlLite(gName)}" onclick="selectGMGuildCard(this.dataset.guild)"
        class="flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition ${isSel ? 'bg-slate-900 ring-2 ring-amber-400 border-amber-500' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0 border" style="background:${meta.color}22;border-color:${meta.color}66">${escapeHtmlLite(meta.badge)}</span>
          <div class="min-w-0">
            <div class="font-bold text-white truncate text-xs">${escapeHtmlLite(gName)}</div>
            <div class="text-[10px] text-slate-400 font-mono">${cnt} 位英雄</div>
          </div>
        </div>
        <span class="w-3 h-3 rounded-full shrink-0" style="background:${meta.color}" title="${meta.color}"></span>
      </button>`;
  }).join('');

  // 渲染色票
  if (swatchesEl && !swatchesEl.dataset.ready) {
    swatchesEl.dataset.ready = '1';
    const palette = window.GUILD_COLOR_PALETTE || [];
    swatchesEl.innerHTML = palette.map(p => `
      <button type="button" onclick="pickGMGuildColorSwatch('${p.hex}')" title="${p.label} (${p.hex})"
        class="w-6 h-6 rounded-lg border border-white/20 hover:scale-110 transition shadow-sm" style="background:${p.hex}"></button>
    `).join('');
  }

  // 渲染 60+ 分類圖形庫
  const curBadgeVal = (document.getElementById('gm-guild-badge-input')?.value || '').trim();
  const lib = window.GUILD_EMBLEM_LIBRARY || [];
  libEl.innerHTML = lib.map(group => `
    <div class="space-y-1">
      <div class="text-[11px] font-bold text-slate-400">${escapeHtmlLite(group.cat)}</div>
      <div class="flex flex-wrap gap-1.5">
        ${(group.icons || []).map(ic => `
          <button type="button" data-icon="${escapeHtmlLite(ic)}" onclick="pickGMGuildEmblem(this.dataset.icon)"
            class="w-9 h-9 rounded-xl border text-lg flex items-center justify-center transition hover:scale-110 ${curBadgeVal === ic ? 'bg-amber-500/25 border-amber-400 ring-1 ring-amber-400' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}">
            ${ic}
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');

  if (preferredGuild || !document.getElementById('gm-guild-badge-input')?.dataset.loadedFor || document.getElementById('gm-guild-badge-input')?.dataset.loadedFor !== activeGuild) {
    loadGMGuildInputs(activeGuild);
  } else {
    updateGMGuildPreview();
  }
}

function selectGMGuildCard(guildName) {
  const sel = document.getElementById('gm-guild-select');
  if (sel) sel.value = guildName;
  loadGMGuildInputs(guildName);
  renderGMGuildEmblemEditor(guildName);
}

function onGMGuildSelectChange() {
  const sel = document.getElementById('gm-guild-select');
  if (!sel) return;
  loadGMGuildInputs(sel.value);
  renderGMGuildEmblemEditor(sel.value);
}

function loadGMGuildInputs(guildName) {
  const gmOps = ensureGMOpsState();
  const meta = typeof window.resolveGuildMeta === 'function' ? window.resolveGuildMeta(guildName, gmOps) : { badge: '🛡️', color: '#64748b' };
  const badgeInp = document.getElementById('gm-guild-badge-input');
  const colPicker = document.getElementById('gm-guild-color-picker');
  const colInp = document.getElementById('gm-guild-color-input');
  if (badgeInp) {
    badgeInp.value = meta.badge || '🛡️';
    badgeInp.dataset.loadedFor = guildName;
  }
  if (colPicker && /^#[0-9a-fA-F]{6}$/.test(meta.color)) colPicker.value = meta.color;
  if (colInp) colInp.value = meta.color || '#64748b';
  updateGMGuildPreview();
}

function pickGMGuildEmblem(icon) {
  const badgeInp = document.getElementById('gm-guild-badge-input');
  if (badgeInp) badgeInp.value = icon;
  updateGMGuildPreview();
  // 更新圖形庫高亮狀態
  document.querySelectorAll('#gm-guild-emblem-library button[data-icon]').forEach(btn => {
    const on = btn.dataset.icon === icon;
    btn.className = `w-9 h-9 rounded-xl border text-lg flex items-center justify-center transition hover:scale-110 ${on ? 'bg-amber-500/25 border-amber-400 ring-1 ring-amber-400' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`;
  });
}

function onGMGuildColorPickerChange(hex) {
  const colInp = document.getElementById('gm-guild-color-input');
  if (colInp) colInp.value = hex;
  updateGMGuildPreview();
}

function onGMGuildColorTextChange(val) {
  const v = String(val || '').trim();
  const colPicker = document.getElementById('gm-guild-color-picker');
  if (colPicker && /^#[0-9a-fA-F]{6}$/.test(v)) colPicker.value = v;
  updateGMGuildPreview();
}

function pickGMGuildColorSwatch(hex) {
  onGMGuildColorPickerChange(hex);
  const colPicker = document.getElementById('gm-guild-color-picker');
  if (colPicker) colPicker.value = hex;
}

function updateGMGuildPreview() {
  const guildName = document.getElementById('gm-guild-select')?.value || '公會名稱';
  const badge = (document.getElementById('gm-guild-badge-input')?.value || '🛡️').trim() || '🛡️';
  const rawCol = (document.getElementById('gm-guild-color-input')?.value || '#64748b').trim();
  const color = /^#[0-9a-fA-F]{3,8}$/.test(rawCol) ? rawCol : '#64748b';
  const prev = document.getElementById('gm-guild-live-preview');
  if (prev) {
    prev.style.borderColor = `${color}99`;
    prev.style.backgroundColor = `${color}22`;
    prev.style.color = '#fff';
    prev.innerHTML = `<span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${color}"></span><span class="text-base">${escapeHtmlLite(badge)}</span><span>${escapeHtmlLite(guildName)}</span>`;
  }
}

async function saveGMGuildMeta() {
  if (!assertCloudReady()) return;
  const guildName = document.getElementById('gm-guild-select')?.value;
  if (!guildName) return;
  const badge = (document.getElementById('gm-guild-badge-input')?.value || '🛡️').trim() || '🛡️';
  const rawCol = (document.getElementById('gm-guild-color-input')?.value || '#64748b').trim();
  if (!/^#[0-9a-fA-F]{3,8}$/.test(rawCol)) {
    alert('⚠️ 色碼格式請填寫標準 HEX 色碼（例如 #ec4899）');
    return;
  }

  const gmOps = ensureGMOpsState();
  const rawGuild = typeof window.rawDbText === 'function' ? window.rawDbText(guildName) : guildName;
  gmOps.guildMeta[guildName] = { badge, color: rawCol };
  if (rawGuild !== guildName) gmOps.guildMeta[rawGuild] = { badge, color: rawCol };

  // 立即更新記憶體中的 gameState.guilds
  if (Array.isArray(gameState?.guilds)) {
    gameState.guilds.forEach(g => {
      if (g.name === guildName || g.name === rawGuild) {
        g.badge = badge;
        g.color = rawCol;
      }
    });
  }

  await persistGMOpsToSupabase(`🛡️ 已更新公會【${badge} ${guildName}】徽章與代表色！網頁前台、後台與手機 App 已全面同步！`);
  renderGMGuildEmblemEditor(guildName);
}

async function resetGMGuildMeta() {
  if (!assertCloudReady()) return;
  const guildName = document.getElementById('gm-guild-select')?.value;
  if (!guildName) return;
  const gmOps = ensureGMOpsState();
  const rawGuild = typeof window.rawDbText === 'function' ? window.rawDbText(guildName) : guildName;
  delete gmOps.guildMeta[guildName];
  delete gmOps.guildMeta[rawGuild];
  await persistGMOpsToSupabase(`↺ 已將公會【${guildName}】恢復為預設徽章與代表色`);
  loadGMGuildInputs(guildName);
  renderGMGuildEmblemEditor(guildName);
}

async function randomizeAllHeroClasses() {
  if (!assertCloudReady()) return;
  if (!confirm('確定要為所有冒險者隨機重新抽籤分配職業嗎？\n（分配後您依然可以點擊個別英雄進行手動調整）')) return;

  const classes = ['狂戰士', '聖騎士', '遊俠', '大法師', '刺客'];
  let heroes = [...(gameState?.heroes || [])];
  if (heroes.length === 0) return;

  let pool = [];
  while (pool.length < heroes.length) {
    pool = pool.concat([...classes].sort(() => Math.random() - 0.5));
  }

  try {
    for (let i = 0; i < heroes.length; i++) {
      const assignedClass = pool[i];
      const dbName = heroes[i].rawName || (typeof window.rawDbText === 'function' ? window.rawDbText(heroes[i].name) : heroes[i].name);
      await window.supabase.update("heroes", `name=eq.${encodeURIComponent(dbName)}`, {
        rpg_class: assignedClass
      });
    }
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert("🎉 隨機抽籤分配完成！所有冒險者天賦已更新並寫入 Supabase 資料庫！全服即刻生效！");
  } catch (e) {
    console.error("Randomize Classes Error:", e);
    alert("❌ 職業分配失敗：" + e.message);
  }
}

function openAddHeroModal() {
  document.getElementById('modal-hero-title').innerText = '新增冒險者';
  document.getElementById('hero-edit-original-name').value = '';
  document.getElementById('hero-modal-name').value = '';
  document.getElementById('hero-modal-name').disabled = false;
  const renameHint = document.getElementById('hero-modal-name-hint'); if (renameHint) renameHint.classList.add('hidden');
  document.getElementById('hero-modal-age').value = '35';
  document.getElementById('hero-modal-guild').value = '';
  document.getElementById('hero-modal-class').value = '狂戰士';
  const stravaInput = document.getElementById('hero-modal-strava-id');
  if (stravaInput) stravaInput.value = '';
  updateModalMaxHr();
  document.getElementById('modal-hero').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function openEditHeroModal(heroName) {
  const hero = gameState?.heroes?.find(h => h.name === heroName);
  if (!hero) return;

  document.getElementById('modal-hero-title').innerText = `編輯冒險者 - ${hero.name}`;
  document.getElementById('hero-edit-original-name').value = hero.name;
  document.getElementById('hero-modal-name').value = hero.name;
  // 允許改名：儲存時會把運動紀錄、手機健康數據、手機綁定、GM 稱號/徽章一起搬到新名字 (renameHeroEverywhere)
  document.getElementById('hero-modal-name').disabled = false;
  const renameHint = document.getElementById('hero-modal-name-hint'); if (renameHint) renameHint.classList.remove('hidden');
  document.getElementById('hero-modal-age').value = hero.age;
  document.getElementById('hero-modal-guild').value = hero.guild;
  document.getElementById('hero-modal-class').value = hero.rpgClass || '狂戰士';
  const stravaInput = document.getElementById('hero-modal-strava-id');
  if (stravaInput) stravaInput.value = hero.stravaId || '';
  updateModalMaxHr();
  document.getElementById('modal-hero').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeHeroModal() {
  document.getElementById('modal-hero').classList.add('hidden');
}

function updateModalMaxHr() {
  const age = parseInt(document.getElementById('hero-modal-age').value) || 35;
  const maxHr = 220 - age;
  document.getElementById('hero-modal-maxhr-text').innerText = maxHr;
}

async function saveHeroFromModal() {
  if (!assertCloudReady()) return;
  const origName = document.getElementById('hero-edit-original-name').value;
  const nameRaw = document.getElementById('hero-modal-name').value.trim();
  const name = typeof window.rawDbText === 'function' ? window.rawDbText(nameRaw) : nameRaw;
  const ageRaw = parseInt(document.getElementById('hero-modal-age').value, 10);
  const age = Number.isFinite(ageRaw) ? ageRaw : 35;
  const guildRaw = document.getElementById('hero-modal-guild').value.trim() || '自由英雄';
  const guild = typeof window.rawDbText === 'function' ? window.rawDbText(guildRaw) : guildRaw;
  const rpgClass = document.getElementById('hero-modal-class').value;
  const stravaId = (document.getElementById('hero-modal-strava-id')?.value || "").trim();

  if (!name) {
    alert('請填寫英雄姓名');
    return;
  }
  if (name.length > 30) {
    alert('⚠️ 英雄名稱最多 30 個字元');
    return;
  }
  if (guild.length > 30) {
    alert('⚠️ 公會名稱最多 30 個字元');
    return;
  }
  if (age < 5 || age > 100) {
    alert('⚠️ 年齡需介於 5 ~ 100 歲之間');
    return;
  }
  if (stravaId && !/^\d+$/.test(stravaId)) {
    alert('⚠️ Strava ID 只能填寫純數字');
    return;
  }
  const existingHero = gameState?.heroes?.find(h => h.name === (origName || name) || h.rawName === (origName || name));
  const origDbName = existingHero?.rawName || (typeof window.rawDbText === 'function' ? window.rawDbText(origName) : origName);
  const isRenamingOrAdding = !origName || name !== origDbName;
  if (isRenamingOrAdding && (/[<>"'`\\]/.test(name) || /[<>"'`\\]/.test(guild))) {
    alert('⚠️ 英雄名稱與公會名稱不能包含 < > " \' ` \\ 等符號（避免網頁安全問題）');
    return;
  }
  if (!isRenamingOrAdding && /[<>"'`\\]/.test(guild)) {
    alert('⚠️ 公會名稱不能包含 < > " \' ` \\ 等符號（避免網頁安全問題）');
    return;
  }

  if (!origName && gameState?.heroes?.some(h => h.name === name || h.rawName === name)) {
    alert(`⚠️ 已經有名為【${name}】的冒險者，請改用「編輯」或換一個名字（避免覆蓋既有英雄資料）。`);
    return;
  }

  // 年齡未變更時保留原本的最大心率 (避免覆蓋 GM 自訂的 MaxHR)，年齡變更才以 220 - 年齡 重新估算
  const maxHr = (existingHero && Number(existingHero.age) === age && existingHero.maxHr) ? existingHero.maxHr : 220 - age;
  const preservedAvatar = existingHero?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}&backgroundColor=0f172a`;

  const heroObj = {
    name: name,
    age: age,
    max_hr: maxHr,
    guild: guild,
    rpg_class: rpgClass,
    strava_id: stravaId,
    avatar: preservedAvatar
  };

  try {
    // ✏️ 改名：先把舊名字底下的所有資料搬到新名字，再存其他欄位 (避免變成兩位英雄、資料留在舊名字)
    if (origName && name !== origDbName) {
      if (gameState?.heroes?.some(h => (h.name === name || h.rawName === name) && h !== existingHero)) {
        alert(`⚠️ 已經有名為【${name}】的冒險者，無法改成這個名字。`);
        return;
      }
      if (!confirm(`確定要把【${origName}】改名為【${name}】嗎？\n\n會一併搬移：運動紀錄、手機健康數據、手機綁定、GM 稱號與手動徽章。\n已封存的歷史快照維持當時的名字。`)) return;
      await renameHeroEverywhere(origDbName, name);
    }
    await window.supabase.insert("heroes", heroObj);
    closeHeroModal();
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert(`🎉 冒險者【${name}】已成功儲存至 Supabase 雲端資料庫！全站即刻同步！`);
    showAdminToast(`已儲存冒險者：${name}`);
  } catch (e) {
    console.error("Save Hero Error:", e);
    alert("❌ 儲存失敗：" + e.message);
  }
}

async function recordTombstoneList(key, item) {
  try {
    const rows = await window.supabase.fetch('game_config', `key=eq.${key}&select=key,value`);
    const row = (rows || []).find(r => r && r.key === key);
    const list = Array.isArray(row?.value) ? [...row.value] : [];
    if (!list.includes(item)) {
      list.push(item);
      await window.supabase.insert('game_config', { key, value: list });
    }
  } catch (e) {}
}

async function deleteHero(name) {
  if (!assertCloudReady()) return;
  if (!confirm(`確定要從 Supabase 雲端資料庫徹底刪除冒險者【${name}】嗎？`)) return;

  const heroObj = gameState?.heroes?.find(h => h.name === name || h.rawName === name);
  const dbName = heroObj?.rawName || (typeof window.rawDbText === 'function' ? window.rawDbText(name) : name);

  try {
    await window.supabase.delete("heroes", `name=eq.${encodeURIComponent(dbName)}`);
    // 記錄已刪除英雄，避免鏡像模式每 30 分鐘從舊資料庫重新塞回
    await recordTombstoneList('deleted_heroes', dbName);
    // 若該英雄有綁定手機裝置，一併停用 (避免已刪除英雄的手機繼續背景同步健康資料)
    const devs = (gameState?.devices || []).filter(d => (d.hero === name || d.hero === dbName) && !d.revoked);
    for (const dev of devs) {
      try { await callAdminMobile('revoke_device', { device_id: dev.id }); } catch (_) {}
    }
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert(`🗑️ 冒險者【${name}】已成功自雲端資料庫刪除！`);
    showAdminToast(`已刪除冒險者：${name}`);
  } catch (e) {
    console.error("Delete Hero Error:", e);
    alert("❌ 刪除失敗：" + e.message);
  }
}

function populateFormDropdowns() {
  const select = document.getElementById('inp-hero');
  if (!select || !gameState?.heroes) return;

  const mode = document.getElementById('cfg-active-mode')?.value || 'classic';
  select.innerHTML = '';
  gameState.heroes.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.name;
    if (mode === 'rpg_talent') {
      opt.innerText = `${h.name} (${h.guild} • ${h.rpgClass || '狂戰士'})`;
    } else {
      opt.innerText = `${h.name} (${h.guild})`;
    }
    select.appendChild(opt);
  });
}

function populateBossConfig() {
  const boss = gameState?.boss || {};
  const nameEl = document.getElementById('cfg-boss-name');
  const maxHpEl = document.getElementById('cfg-boss-maxhp');
  const currHpEl = document.getElementById('cfg-boss-currhp');
  const minDurEl = document.getElementById('cfg-min-dur');
  const magMultEl = document.getElementById('cfg-mag-mult');

  if (nameEl) nameEl.value = boss.name || '';
  if (maxHpEl) maxHpEl.value = boss.maxHp || 350000;
  if (currHpEl) currHpEl.value = boss.currentHp !== undefined ? boss.currentHp : 232849;
  if (minDurEl) minDurEl.value = boss.rules?.minDurationMinutes || 30;
  if (magMultEl) magMultEl.value = boss.rules?.magicMultiplier || 15;
}

function previewDamageCalculation() {
  const mode = document.getElementById('cfg-active-mode')?.value || 'classic';
  const heroName = document.getElementById('inp-hero')?.value || '';
  const hero = gameState?.heroes?.find(h => h.name === heroName);
  const maxHrEst = hero?.maxHr || 185;

  const duration = parseFloat(document.getElementById('inp-duration')?.value) || 0;
  const avgHr = parseFloat(document.getElementById('inp-avg-hr')?.value) || 0;
  const maxHr = parseFloat(document.getElementById('inp-max-hr')?.value) || 0;
  const calories = parseFloat(document.getElementById('inp-calories')?.value) || 0;

  const minDur = parseFloat(document.getElementById('cfg-global-min-dur')?.value || document.getElementById('cfg-classic-min-dur')?.value) || 30.0;
  const magMult = parseFloat(document.getElementById('cfg-mag-mult')?.value) || 15.0;

  let val1 = 0, val2 = 0, val3 = 0, totalVal = 0;

  if (duration >= minDur) {
    val1 = Math.round(calories);
    if (maxHrEst > 0 && avgHr > 0) {
      const ratio = avgHr / maxHrEst;
      const trimp = duration * ratio * Math.exp(1.92 * ratio);
      val2 = Math.round(trimp * magMult);
    }
    const gap = Math.max(0, maxHr - avgHr);
    val3 = Math.round(gap * 100);
    if (mode === 'survival') {
      // 飢餓法則：狩獵補血 = 熱量、搜刮物資 = TRIMP × 1.5 (不計爆擊)
      const ratio = (maxHrEst > 0 && avgHr > 0) ? avgHr / maxHrEst : 0;
      const trimp = ratio > 0 ? duration * ratio * Math.exp(1.92 * ratio) : 0;
      val2 = Math.round(trimp * 1.5);
      val3 = 0;
    }
  }

  totalVal = val1 + val2 + val3;

  const p1 = document.getElementById('prev-phys');
  const p2 = document.getElementById('prev-mag');
  const p3 = document.getElementById('prev-crit');
  const pt = document.getElementById('prev-total');
  if (p1) p1.innerText = val1.toLocaleString();
  if (p2) p2.innerText = val2.toLocaleString();
  if (p3) p3.innerText = val3.toLocaleString();
  if (pt) pt.innerText = totalVal.toLocaleString();
}

async function handleManualAttack(e) {
  e.preventDefault();
  if (!assertCloudReady()) return;

  const heroName = document.getElementById('inp-hero').value;
  const heroObj = gameState?.heroes?.find(h => h.name === heroName);
  const dbHero = heroObj?.rawName || (typeof window.rawDbText === 'function' ? window.rawDbText(heroName) : heroName);
  const type = document.getElementById('inp-type').value;
  const duration = parseFloat(document.getElementById('inp-duration').value) || 0;
  const avgHr = parseFloat(document.getElementById('inp-avg-hr').value) || 0;
  const maxHr = parseFloat(document.getElementById('inp-max-hr').value) || 0;
  const calories = parseFloat(document.getElementById('inp-calories').value) || 0;
  const titleRaw = document.getElementById('inp-title').value.trim() || '手動打卡鍛鍊';
  const title = typeof window.rawDbText === 'function' ? window.rawDbText(titleRaw) : titleRaw;

  if (!heroName) { alert('請選擇英雄'); return; }
  if (duration <= 0) { alert('運動時長必須大於 0 分鐘'); return; }

  const newActId = `manual_${Date.now()}`;
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const actObj = {
    id: newActId,
    hero: dbHero,
    date: dateStr,
    type: type,
    name: title,
    duration: duration,
    distance: 0,
    elevation: 0,
    avg_hr: avgHr,
    max_hr: maxHr,
    calories: calories,
    is_manual: true,
    is_excluded: false
  };

  try {
    await window.supabase.insert("activities", actObj);
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert(`🎉 登錄成功！${heroName} 完成鍛鍊打卡，數據已即時同步至 Supabase 雲端資料庫並計入前台看板！`);
    document.getElementById('form-manual-entry').reset();
    previewDamageCalculation();
  } catch (err) {
    console.error("Manual Entry Error:", err);
    alert("❌ 補登失敗：" + err.message);
  }
}

async function saveClassicSettings() {
  const minDur = parseFloat(document.getElementById('cfg-classic-min-dur')?.value) || 30;
  const globalMinDurEl = document.getElementById('cfg-global-min-dur');
  if (globalMinDurEl) globalMinDurEl.value = minDur;

  try {
    await syncAllSettingsToSupabase('✅ 經典競技參數與資料片模式已成功儲存至 Supabase 雲端資料庫！');
  } catch (e) {
    console.error("Save Classic Settings Error:", e);
    alert("❌ 儲存失敗：" + e.message);
  }
}

async function saveBossSettings() {
  try {
    await syncAllSettingsToSupabase('✅ 世界 Boss 血量與討伐參數已成功更新至 Supabase 雲端資料庫！前台看板立即生效！');
  } catch (e) {
    console.error('Save boss settings error:', e);
    alert("❌ 儲存失敗：" + e.message);
  }
}

// -------------------------------------------------------------
// ACTIVITY CRUD & ANOMALY DETECTION (含日期/時長/心率/熱量/傷害欄位排序)
// -------------------------------------------------------------
let adminSortCol = 'date';
let adminSortAsc = false; // 預設最新日期在最上方 (降冪)

function parseAdminActivityTimestamp(dateStr) {
  if (!dateStr) return 0;
  if (typeof window.parseActivityDate === 'function') {
    const d = window.parseActivityDate(dateStr);
    if (d && !isNaN(d.getTime())) return d.getTime();
  }
  const s = String(dateStr).trim().replace(/-/g, '/');
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function formatAdminActivityDate(dateStr) {
  if (!dateStr) return '—';
  const ts = parseAdminActivityTimestamp(dateStr);
  if (!ts) return dateStr;
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  if (hh === '00' && min === '00' && !String(dateStr).includes(':')) {
    return `${yyyy}/${mm}/${dd}`;
  }
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function sortAdminActivities(col) {
  if (adminSortCol === col) {
    adminSortAsc = !adminSortAsc;
  } else {
    adminSortCol = col;
    adminSortAsc = false;
  }

  const cols = ['date', 'duration', 'avgHr', 'calories', 'damage'];
  cols.forEach(c => {
    const el = document.getElementById(`admin-sort-${c}`);
    if (el) {
      if (c === adminSortCol) {
        el.innerText = adminSortAsc ? '▲' : '▼';
        el.className = 'text-amber-400 font-bold';
      } else {
        el.innerText = '↕';
        el.className = 'text-slate-600';
      }
    }
  });

  filterAdminActivities();
}

function renderActivityTable() {
  const tbody = document.getElementById('admin-activities-table-body');
  const heroFilter = document.getElementById('admin-act-hero-filter');
  if (!tbody) return;

  // 手動補登資料已全部存放於 Supabase；清除舊版殘留在瀏覽器的本地快取 (避免出現幽靈紀錄 / 永久作廢)
  try {
    localStorage.removeItem('manual_activities');
    localStorage.removeItem('excluded_activity_ids');
  } catch(e) {}
  if (!allActivitiesCache) allActivitiesCache = [];

  if (heroFilter && gameState?.heroes) {
    const currHero = heroFilter.value;
    heroFilter.innerHTML = '<option value="">全部英雄</option>';
    gameState.heroes.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.name;
      opt.innerText = h.name;
      if (h.name === currHero) opt.selected = true;
      heroFilter.appendChild(opt);
    });
  }

  filterAdminActivities();
}

function filterAdminActivities() {
  const tbody = document.getElementById('admin-activities-table-body');
  if (!tbody) return;

  const query = (document.getElementById('admin-act-search')?.value || '').toLowerCase().trim();
  const selectedHero = document.getElementById('admin-act-hero-filter')?.value || '';

  tbody.innerHTML = '';

  const filtered = (allActivitiesCache || []).filter(a => {
    if (selectedHero && a.hero !== selectedHero) return false;
    if (query) {
      const matchHero = (a.hero || '').toLowerCase().includes(query);
      const matchTitle = (a.title || a.name || '').toLowerCase().includes(query);
      const matchType = (a.type || '').toLowerCase().includes(query);
      const matchId = String(a.id || '').toLowerCase().includes(query);
      const matchDup = (query.includes('重複') || query === 'dup') && a.isSuspectedDuplicate;
      if (!matchHero && !matchTitle && !matchType && !matchId && !matchDup) return false;
    }
    return true;
  });

  // Sort BEFORE slicing so all records across all months are ordered properly
  filtered.sort((a, b) => {
    let va = 0, vb = 0;
    if (adminSortCol === 'date') {
      va = parseAdminActivityTimestamp(a.date || a.time);
      vb = parseAdminActivityTimestamp(b.date || b.time);
    } else if (adminSortCol === 'duration') {
      va = Number(a.duration) || 0;
      vb = Number(b.duration) || 0;
    } else if (adminSortCol === 'avgHr') {
      va = Number(a.avgHr) || 0;
      vb = Number(b.avgHr) || 0;
    } else if (adminSortCol === 'calories') {
      va = Number(a.calories) || 0;
      vb = Number(b.calories) || 0;
    } else if (adminSortCol === 'damage') {
      va = Number(a.damage) || 0;
      vb = Number(b.damage) || 0;
    }
    if (va === vb) {
      return String(b.id || '').localeCompare(String(a.id || ''));
    }
    return adminSortAsc ? (va - vb) : (vb - va);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-500">查無符合條件的運動打卡紀錄</td></tr>`;
    return;
  }

  filtered.slice(0, 500).forEach(a => {
    const tr = document.createElement('tr');
    const actId = String(a.id);
    const isExcluded = Boolean(a.isExcluded);
    // 只有手動補登的紀錄可以永久刪除；Strava 紀錄若被刪除，爬蟲下次會重新抓回並恢復計分，因此一律以「作廢」處理
    const isManual = String(actId).startsWith('ACT-') || String(actId).startsWith('manual_') || Boolean(a.isManual);
    const isNumericStrava = /^\d+$/.test(actId);

    const anomalies = [];
    const heroInfo = gameState?.heroes?.find(h => h.name === a.hero);
    const maxHrLimit = heroInfo?.maxHr || 185;

    if (a.avgHr > maxHrLimit || a.maxHr > 220) {
      anomalies.push('<span class="bg-rose-900/60 text-rose-300 border border-rose-600 px-1 py-0.2 rounded text-[9px]">⚠️心率異常</span>');
    }
    if (a.duration > 300) {
      anomalies.push('<span class="bg-amber-900/60 text-amber-300 border border-amber-600 px-1 py-0.2 rounded text-[9px]">⚠️時長過長</span>');
    }
    if ((a.rawCalories ?? a.calories) > 3000) {
      anomalies.push('<span class="bg-purple-900/60 text-purple-300 border border-purple-600 px-1 py-0.2 rounded text-[9px]">⚠️熱量過高</span>');
    }

    tr.className = `hover:bg-slate-900/60 transition ${isExcluded ? 'opacity-40 line-through bg-rose-950/20' : ''}`;

    const srcLbl = isManual
      ? '手動'
      : (a.source === 'health_connect' ? '📱 Health Connect' : (a.source === 'apple_health' ? '📱 Apple Health' : '來源'));
    const sourceHtml = isNumericStrava 
      ? `<a href="https://www.strava.com/activities/${actId}" target="_blank" class="text-orange-400 font-mono font-bold hover:underline">#${actId} ↗</a>`
      : `<span class="text-amber-400 font-mono font-bold">${srcLbl} #${escapeHtmlLite(actId.slice(-6))}</span>`;

    const dupBadge = (!isExcluded && a.isSuspectedDuplicate)
      ? `<label class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-bold border cursor-pointer whitespace-nowrap ${a.duplicateIncluded ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-slate-800 text-slate-300 border-slate-600'}" title="與紀錄 #${a.duplicateOf} 運動時間重疊，系統保留分數最高的一筆。勾選後此筆也會納入計分。">
          <input type="checkbox" class="accent-emerald-500" ${a.duplicateIncluded ? 'checked' : ''} onchange="toggleDuplicateInclude('${actId}', this.checked)">
          ${a.duplicateIncluded ? '重複但已納入計算' : '⚠️ 疑似重複(不計分) • 勾選納入'}
        </label>`
      : '';
    const statusBadge = isExcluded
      ? '<span class="text-[10px] bg-rose-950 text-rose-400 border border-rose-800 px-1.5 py-0.5 rounded font-bold">GM作廢</span>'
      : dupBadge ? dupBadge : (a.isValidAttack ? '<span class="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-bold">有效打卡</span>' : '<span class="text-[10px] text-slate-500">不計分</span>');

    const actTitle = a.title || a.name || a.type || '運動';
    const actTypeBadge = a.type && a.type !== actTitle
      ? `<span class="text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded ml-1">${a.type}</span>`
      : '';

    const eventBonusPill = (a.eventBonusPct > 0 && a.isValidAttack && !isExcluded)
      ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold" title="${a.eventBonusLabel || '活動加成'}">⚡+${a.eventBonusPct}%</span>`
      : '';

    tr.innerHTML = `
      <td class="p-3">${sourceHtml}</td>
      <td class="p-3 font-mono text-slate-300 whitespace-nowrap">${formatAdminActivityDate(a.date || a.time)}</td>
      <td class="p-3 font-bold text-white whitespace-nowrap">${a.hero} <span class="text-[10px] text-slate-400 font-normal">(${a.guild})</span></td>
      <td class="p-3 text-slate-300 max-w-[180px] truncate" title="${actTitle} (${a.type || ''})">${actTitle}${actTypeBadge}</td>
      <td class="p-3 font-mono">${a.duration}分</td>
      <td class="p-3 font-mono text-cyan-300">${a.avgHr} / ${a.maxHr}</td>
      <td class="p-3 font-mono" title="原始熱量: ${Math.round(a.rawCalories ?? a.calories)} kcal">${Math.round(a.rawCalories ?? a.calories)}</td>
      <td class="p-3 font-mono font-bold text-amber-400">${(a.damage || 0).toLocaleString()} ${eventBonusPill}</td>
      <td class="p-3">
        <div class="flex items-center space-x-1">
          ${statusBadge}
          ${anomalies.join(' ')}
        </div>
      </td>
      <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
        <button onclick="openEditActivityModal('${actId}')" class="text-cyan-400 hover:text-cyan-300 font-bold text-xs">編輯</button>
        ${isExcluded 
          ? `<button onclick="toggleExcludeActivity('${actId}', false)" class="text-emerald-400 hover:text-emerald-300 font-bold text-xs">恢復計算</button>`
          : `<button onclick="toggleExcludeActivity('${actId}', true)" class="text-rose-400 hover:text-rose-300 font-bold text-xs">作廢扣分</button>`
        }
        ${isManual ? `<button onclick="deleteManualActivity('${actId}')" class="text-slate-400 hover:text-rose-400 font-bold text-xs">刪除</button>` : ''}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * GM 勾選 / 取消「疑似重複」紀錄是否納入計分 (存在 gm_ops_config.duplicateOverrides，不改動原始運動資料)
 */
async function toggleDuplicateInclude(actId, include) {
  const gmOps = ensureGMOpsState();
  if (!gmOps.duplicateOverrides || typeof gmOps.duplicateOverrides !== 'object') gmOps.duplicateOverrides = {};
  if (include) gmOps.duplicateOverrides[String(actId)] = true;
  else delete gmOps.duplicateOverrides[String(actId)];
  const ok = await persistGMOpsToSupabase(include
    ? `✅ 紀錄 #${actId} 已由 GM 確認納入計分（不再視為重複）`
    : `⚠️ 紀錄 #${actId} 恢復為「疑似重複(不計分)」`);
  if (ok === false) renderActivityTable();
}

async function toggleExcludeActivity(actId, shouldExclude) {
  if (!assertCloudReady()) return;
  try {
    const dbId = typeof window.rawDbText === 'function' ? window.rawDbText(actId) : actId;
    await window.supabase.update("activities", `id=eq.${encodeURIComponent(dbId)}`, { is_excluded: shouldExclude });
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert(shouldExclude ? `🚫 紀錄 #${actId} 已在 Supabase 資料庫設為作廢，不再計入分數！` : `✅ 紀錄 #${actId} 已在 Supabase 資料庫恢復計入分數！`);
  } catch (e) {
    console.error("Toggle Exclude Error:", e);
    alert("❌ 操作失敗：" + e.message);
  }
}

async function deleteManualActivity(actId) {
  if (!assertCloudReady()) return;
  if (!confirm(`確定要從 Supabase 雲端資料庫永久刪除紀錄 #${actId} 嗎？`)) return;

  const dbId = typeof window.rawDbText === 'function' ? window.rawDbText(actId) : actId;
  try {
    await window.supabase.delete("activities", `id=eq.${encodeURIComponent(dbId)}`);
    await recordTombstoneList('deleted_activity_ids', String(dbId));
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert(`🗑️ 紀錄 #${actId} 已從 Supabase 雲端資料庫永久刪除！`);
  } catch (e) {
    console.error("Delete Activity Error:", e);
    alert("❌ 刪除失敗：" + e.message);
  }
}

function openEditActivityModal(actId) {
  const act = allActivitiesCache.find(a => String(a.id) === String(actId));
  if (!act) return;

  document.getElementById('act-edit-id').value = act.id;
  document.getElementById('act-edit-title').value = act.rawName ?? act.title ?? act.name ?? '';
  document.getElementById('act-edit-duration').value = act.duration || 0;
  document.getElementById('act-edit-calories').value = Math.round(act.rawCalories ?? act.calories ?? 0);
  document.getElementById('act-edit-avghr').value = act.avgHr || 0;
  document.getElementById('act-edit-maxhr').value = act.maxHr || 0;

  document.getElementById('modal-activity').classList.remove('hidden');
}

function closeActivityModal() {
  document.getElementById('modal-activity').classList.add('hidden');
}

async function saveActivityFromModal() {
  if (!assertCloudReady()) return;
  const actId = document.getElementById('act-edit-id').value;
  const act = allActivitiesCache.find(a => String(a.id) === String(actId));
  if (!act) return;

  const newTitleRaw = document.getElementById('act-edit-title').value.trim();
  const newTitle = typeof window.rawDbText === 'function' ? window.rawDbText(newTitleRaw) : newTitleRaw;
  const newDuration = parseFloat(document.getElementById('act-edit-duration').value) || 0;
  const newCalories = parseFloat(document.getElementById('act-edit-calories').value) || 0;
  const newAvgHr = parseFloat(document.getElementById('act-edit-avghr').value) || 0;
  const newMaxHr = parseFloat(document.getElementById('act-edit-maxhr').value) || 0;

  const dbId = typeof window.rawDbText === 'function' ? window.rawDbText(actId) : actId;
  try {
    await window.supabase.update("activities", `id=eq.${encodeURIComponent(dbId)}`, {
      name: newTitle,
      duration: newDuration,
      calories: newCalories,
      avg_hr: newAvgHr,
      max_hr: newMaxHr
    });
    closeActivityModal();
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert('✅ 運動紀錄已成功更新並同步至 Supabase 雲端資料庫！');
    showAdminToast(`✅ 已更新運動紀錄 #${actId}`);
  } catch (e) {
    console.error("Save Activity Error:", e);
    alert('❌ 更新失敗：' + e.message);
  }
}

function exportFullBackupJSON() {
  const backupObj = {
    ...gameState,
    rawHeroes: window.__rawHeroesRows || null,
    rawActivities: window.__rawActivitiesRows || null,
    rawConfig: window.__rawConfigMap || null
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
  const downloadAnchor = document.createElement('a');
  const d = new Date();
  const dateTag = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `iron_heroes_backup_${dateTag}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importFullBackupJSON(event) {
  const input = event.target;
  const file = input.files[0];
  input.value = ''; // 允許重複選取同一個檔案
  if (!file) return;
  if (!assertCloudReady()) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    let b;
    try {
      b = JSON.parse(e.target.result);
    } catch (err) {
      alert('❌ 匯入失敗：JSON 格式無效！');
      return;
    }
    if (!b || !Array.isArray(b.heroes) || !Array.isArray(b.activities)) {
      alert('❌ 這不是由「匯出備份」產生的完整備份檔 (缺少 heroes / activities)。');
      return;
    }
    if (!confirm(`確定要以此備份還原 Supabase 雲端資料嗎？\n\n英雄 ${b.heroes.length} 位 / 運動紀錄 ${b.activities.length} 筆 / 遊戲設定與 GM 活動、徽章設定\n\n※ 備份內的資料會覆蓋雲端同 ID 的資料；雲端多出來（備份裡沒有）的紀錄會保留不刪除。`)) return;

    const toRaw = (v) => (typeof window.deepRaw === 'function' ? window.deepRaw(v) : v);
    const rawStr = (v) => (typeof window.rawDbText === 'function' ? window.rawDbText(v) : v);

    try {
      const srcHeroes = Array.isArray(b.rawHeroes) && b.rawHeroes.length ? b.rawHeroes : b.heroes;
      const heroRows = srcHeroes.filter(h => h && (h.name || h.rawName)).map(h => {
        const row = {
          name: rawStr(h.rawName || h.name),
          age: h.age ?? 35,
          max_hr: h.maxHr ?? h.max_hr ?? 185,
          guild: rawStr(h.guild || '自由英雄'),
          rpg_class: rawStr(h.rpgClass || h.rpg_class || '狂戰士'),
          strava_id: rawStr(h.stravaId || h.strava_id || ''),
          avatar: h.avatar || ''
        };
        if (h.created_at || h.createdAt) row.created_at = h.created_at || h.createdAt;
        return row;
      });
      if (heroRows.length) await window.supabase.insert('heroes', heroRows);

      // 運動紀錄還原時使用「原始熱量」(rawCalories)，並完整保留手機來源欄位
      const srcActs = Array.isArray(b.rawActivities) && b.rawActivities.length ? b.rawActivities : b.activities;
      const actRows = srcActs.filter(a => a && a.id !== undefined && (a.hero || a.rawHero)).map(a => {
        const isManual = Boolean(a.isManual ?? a.is_manual);
        const row = {
          id: rawStr(String(a.id)),
          hero: rawStr(a.rawHero || a.hero),
          date: a.date || a.time,
          type: rawStr(a.type || 'Workout'),
          name: rawStr(a.rawName || a.name || a.title || '運動'),
          duration: Number(a.duration) || 0,
          distance: Number(a.distance) || 0,
          elevation: Number(a.elevation) || 0,
          avg_hr: Number(a.avgHr ?? a.avg_hr) || 0,
          max_hr: Number(a.maxHr ?? a.max_hr) || 0,
          calories: Number(a.rawCalories ?? a.calories) || 0,
          is_manual: isManual,
          is_excluded: Boolean(a.isExcluded ?? a.is_excluded),
          source: rawStr(a.source || (isManual ? 'manual' : 'strava')),
          origin_app: (a.originApp || a.origin_app) ? rawStr(a.originApp || a.origin_app) : null,
          device_name: (a.deviceName || a.device_name) ? rawStr(a.deviceName || a.device_name) : null
        };
        if (a.source_id || a.sourceId) row.source_id = a.source_id || a.sourceId;
        if (a.start_time || a.startTime) row.start_time = a.start_time || a.startTime;
        if (a.end_time || a.endTime) row.end_time = a.end_time || a.endTime;
        if (a.steps !== undefined && a.steps !== null) row.steps = Number(a.steps);
        return row;
      });
      for (let i = 0; i < actRows.length; i += 500) {
        await window.supabase.insert('activities', actRows.slice(i, i + 500));
      }

      const seasonOnly = (c) => c ? { seasonStart: c.seasonStart, seasonEnd: c.seasonEnd, minDuration: c.minDuration } : undefined;
      const bossCfg = b.rawConfig?.boss_config ? { ...b.rawConfig.boss_config } : (b.boss ? { ...b.boss } : undefined);
      if (bossCfg) {
        delete bossCfg.currentHp;
        delete bossCfg.subtitle;
        if (/^索爾受到雷霆魔劍/.test(bossCfg.description || '') && !/索爾/.test(bossCfg.name || '')) {
          delete bossCfg.description;
        }
      }
      const cfgRows = {
        active_mode: b.activeMode,
        boss_config: bossCfg ? toRaw(bossCfg) : undefined,
        classic_config: seasonOnly(b.classic),
        rpg_config: b.rpg ? { seasonStart: b.rpg.seasonStart, seasonEnd: b.rpg.seasonEnd } : undefined,
        faction_config: b.faction ? toRaw(b.faction) : undefined,
        survival_config: b.survival ? toRaw(b.survival) : undefined,
        base_config: b.base ? toRaw(b.base) : undefined,
        bingo_config: b.bingo ? toRaw(b.bingo) : undefined,
        gm_ops_config: b.gmOps ? toRaw(b.gmOps) : undefined,
        mobile_modes_config: (b.mobileModes || b.rawConfig?.mobile_modes_config) ? toRaw(b.mobileModes || b.rawConfig?.mobile_modes_config) : undefined,
        snapshots: b.snapshots ? toRaw(b.snapshots) : undefined,
        exclude_keywords: b.excludeKeywords ? toRaw(b.excludeKeywords) : undefined
      };
      await Promise.all(Object.entries(cfgRows)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([key, value]) => window.supabase.insert('game_config', { key, value })));

      alert('🎉 備份已成功還原至 Supabase 雲端資料庫！頁面將重新整理。');
      window.location.reload();
    } catch (err) {
      console.error('Import Backup Error:', err);
      alert('❌ 還原失敗：' + err.message + '\n(部分資料可能已寫入，請重新整理確認)');
    }
  };
  reader.readAsText(file);
}


// -------------------------------------------------------------
// 6. STRAVA CRAWLER & GITHUB ACTIONS SETTINGS
// -------------------------------------------------------------
let crawlerConfig = {
  athleteProfiles: {
    "468395126": "Kerker",
    "972959242": "Calla",
    "449473529": "Naomi",
    "2029007949": "Weber",
    "822925839": "Mooooo",
    "387396829": "Moupower"
  },
  excludeKeywords: ["羽球", "不想抓的關鍵字"],
  sheetUrl: "https://docs.google.com/spreadsheets/d/1gNr8ptE_zjIeZsliaEqddqp5xz3Ir0LT7AkLmnSh3pY/edit",
  worksheetName: "Rawdata"
};

async function fetchCrawlerConfig() {
  try {
    const res = await fetch("/api/crawler/config");
    if (res.ok) {
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        crawlerConfig = Object.assign(crawlerConfig, data);
      }
    } else {
      throw new Error("Local API offline");
    }
  } catch (e) {
    try {
      const fbRes = await fetch("/data/crawler_config.json");
      if (fbRes.ok) {
        const data = await fbRes.json();
        if (data) crawlerConfig = Object.assign(crawlerConfig, data);
      }
    } catch (err) {}
  }
  renderCrawlerUI();
}

function renderCrawlerUI() {
  if (window.lucide) lucide.createIcons();
}

function addCrawlerAthlete() {
  const idInput = document.getElementById("crawler-new-ath-id");
  const heroSelect = document.getElementById("crawler-new-ath-hero");
  const customNameInput = document.getElementById("crawler-new-ath-custom-name");
  const customGuildInput = document.getElementById("crawler-new-ath-custom-guild");
  const ageInput = document.getElementById("crawler-new-ath-age");

  const athId = (idInput?.value || "").trim();
  const customName = (customNameInput?.value || "").trim();
  const customGuild = (customGuildInput?.value || "").trim() || "自由英雄";
  const age = parseInt(ageInput?.value || "35", 10) || 35;
  const maxHr = 220 - age;
  const selectedName = (heroSelect?.value || "").trim();

  const heroName = customName || selectedName;

  if (!athId) {
    alert("❌ 請輸入選手的 Strava 數字 ID！");
    return;
  }
  if (!heroName) {
    alert("❌ 請選擇或手動輸入冒險者姓名！");
    return;
  }

  // Ensure hero exists in gameState.heroes
  if (!gameState.heroes) gameState.heroes = [];
  let existingHero = gameState.heroes.find(h => h.name === heroName);
  if (!existingHero) {
    existingHero = {
      name: heroName,
      age: age,
      maxHr: maxHr,
      guild: customGuild,
      rpgClass: "狂戰士",
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${heroName}&backgroundColor=0f172a`
    };
    gameState.heroes.push(existingHero);
  } else if (customName) {
    existingHero.age = age;
    existingHero.maxHr = maxHr;
    existingHero.guild = customGuild;
  }

  localStorage.setItem("game_state", JSON.stringify(gameState));

  if (!crawlerConfig.athleteProfiles) crawlerConfig.athleteProfiles = {};
  crawlerConfig.athleteProfiles[athId] = heroName;

  if (idInput) idInput.value = "";
  if (customNameInput) customNameInput.value = "";
  if (customGuildInput) customGuildInput.value = "";

  populateFormDropdowns();
  renderHeroTable();
  renderCrawlerUI();

  alert(`🎉 成功綁定選手：${heroName} (公會: ${existingHero.guild} • 年齡: ${existingHero.age}歲/極限心率: ${existingHero.maxHr}bpm) ➔ Strava ID: #${athId}！\n請記得點擊右上角【💾 儲存爬蟲設定】以同步生效！`);
  showAdminToast(`已加入選手：${heroName} (#${athId})`);
}

function deleteCrawlerAthlete(athId) {
  if (crawlerConfig.athleteProfiles && crawlerConfig.athleteProfiles[athId]) {
    const name = crawlerConfig.athleteProfiles[athId];
    delete crawlerConfig.athleteProfiles[athId];
    renderCrawlerUI();
    showAdminToast(`已移除選手：${name} (#${athId})`);
  }
}

function addCrawlerKeyword() {
  const kwInput = document.getElementById("crawler-new-keyword");
  const kw = (kwInput?.value || "").trim();
  if (!kw) return;

  if (!crawlerConfig.excludeKeywords) crawlerConfig.excludeKeywords = [];
  if (!crawlerConfig.excludeKeywords.includes(kw)) {
    crawlerConfig.excludeKeywords.push(kw);
  }
  if (kwInput) kwInput.value = "";
  renderCrawlerUI();
  showAdminToast(`已加入排除關鍵字：${kw}`);
}

function deleteCrawlerKeyword(kw) {
  if (crawlerConfig.excludeKeywords) {
    crawlerConfig.excludeKeywords = crawlerConfig.excludeKeywords.filter(k => k !== kw);
    renderCrawlerUI();
    showAdminToast(`已移除排除字：${kw}`);
  }
}

async function saveCrawlerConfig() {
  const sheetInput = document.getElementById("crawler-sheet-url");
  const wsInput = document.getElementById("crawler-worksheet-name");

  if (sheetInput) crawlerConfig.sheetUrl = sheetInput.value.trim();
  if (wsInput) crawlerConfig.worksheetName = wsInput.value.trim() || "Rawdata";

  localStorage.setItem("iron_heroes_crawler_config", JSON.stringify(crawlerConfig));

  const athleteCount = Object.keys(crawlerConfig.athleteProfiles || {}).length;
  const athleteSummary = Object.entries(crawlerConfig.athleteProfiles || {})
    .map(([id, name]) => `• #${id} ➔ ${name}`)
    .join("\n");

  try {
    const res = await fetch("/api/crawler/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(crawlerConfig)
    });
    if (res.ok) {
      alert(`✅【Strava 爬蟲設定已成功儲存並同步！】\n\n👥 目前監控的選手名單 (${athleteCount} 位)：\n${athleteSummary}\n\n🚫 排除關鍵字：${(crawlerConfig.excludeKeywords || []).join(", ") || "無"}\n📊 目標試算表：${crawlerConfig.worksheetName}\n\n⚡ 下次 GitHub Actions 雲端定時排程（每 30 分鐘）或手動 Run workflow 時，將自動爬取以上所有選手！`);
      showAdminToast("✅ Strava 爬蟲設定已成功儲存至伺服器！");
    } else {
      alert(`✅ 爬蟲設定已保存至本地快取！\n共有 ${athleteCount} 位選手納入監控名冊。`);
    }
  } catch (e) {
    alert(`✅ 爬蟲設定已於本地保存！\n共有 ${athleteCount} 位選手納入監控名冊。`);
  }
}

async function runCrawlerNow() {
  const modal = document.getElementById("modal-crawler-log");
  const outEl = document.getElementById("crawler-terminal-output");
  if (modal) modal.classList.remove("hidden");
  if (outEl) outEl.innerText = "[系統] 🚀 正在檢查 Strava 爬蟲狀態與雲端工作流...\n\n";

  try {
    const res = await fetch("/api/crawler/run", { method: "POST" });
    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (outEl) {
          outEl.innerText = (data.output || "無輸出紀錄") + (data.success ? "\n\n✅ 狀態檢查完成！" : "\n\n❌ 執行結束");
        }
        return;
      } catch (err) {}
    }
  } catch (e) {}

  if (outEl) {
    outEl.innerText = `[GitHub Actions 雲端爬蟲架構]
⚡ Strava 爬蟲已由 GitHub Actions 雲端排程託管 (每 30 分鐘自動定時執行)！

💡 隨時「立即手動抓取」最新運動步驟：
1. 請開啟您的 GitHub Repository Actions 頁面：
   👉 https://github.com/kerkerlai/strava-web_2.0/actions
2. 點選左側工作流【Strava to Supabase Cloud Crawler】
3. 點選右側藍色【Run workflow】按鈕 ➔ 雲端將在 30 秒內自動爬取並寫入 Supabase 資料庫！

寫入完成後，全體玩家打開網頁即可秒速看到最新戰況！`;
  }
}

function closeCrawlerLogModal() {
  const modal = document.getElementById("modal-crawler-log");
  if (modal) modal.classList.add("hidden");
}


function downloadCrawlerConfigJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(crawlerConfig, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "crawler_config.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showAdminToast("✅ 已下載最新的 crawler_config.json！");
}

async function saveFactionSettings() {
  try {
    await syncAllSettingsToSupabase("🎉 雙城激戰陣營參數與資料片設定已儲存並同步至雲端！前台看板立即生效！");
  } catch (e) {
    alert("儲存失敗: " + e.message);
  }
}

async function saveSurvivalSettings() {
  try {
    await syncAllSettingsToSupabase("🎉 飢餓法則生存參數與資料片設定已儲存並同步至雲端！前台看板立即生效！");
  } catch (e) {
    alert("儲存失敗: " + e.message);
  }
}

async function saveBaseSettings() {
  try {
    await syncAllSettingsToSupabase("🎉 鋼鐵要塞資源門檻與資料片設定已儲存並同步至雲端！前台看板立即生效！");
  } catch (e) {
    alert("儲存失敗: " + e.message);
  }
}

async function saveBingoSettings() {
  try {
    await syncAllSettingsToSupabase("🎉 戰神拼圖難度倍率與資料片設定已儲存並同步至雲端！前台看板立即生效！");
  } catch (e) {
    alert("儲存失敗: " + e.message);
  }
}

async function saveExcludeKeywordsToSupabase() {
  if (!assertCloudReady()) return;
  const raw = document.getElementById('cfg-exclude-keywords')?.value || '';
  const kws = raw
    .split(/[,，、\n]/)
    .map(s => s.trim())
    .filter(Boolean);
  const rawKws = typeof window.deepRaw === 'function' ? window.deepRaw(kws) : kws;

  if (!gameState) gameState = {};
  gameState.excludeKeywords = kws;

  try {
    await window.supabase.insert("game_config", { key: "exclude_keywords", value: rawKws });
    if (window.syncFromDatabase) await window.syncFromDatabase();
    alert(`✅ 爬蟲剃除關鍵字已成功儲存至 Supabase 雲端資料庫！\n目前排除清單：${kws.join(', ') || '無'}`);
    showAdminToast("✅ 已更新爬蟲剃除關鍵字設定！");
  } catch (e) {
    console.error("Save Exclude Keywords Error:", e);
    alert("❌ 儲存失敗：" + e.message);
  }
}

// =====================================================================
// 7. GM LIVE EVENTS, HERO AVATAR FX & 100->500 BADGE ENCYCLOPEDIA
// =====================================================================

function ensureGMOpsState() {
  if (!gameState) gameState = {};
  if (!gameState.gmOps) {
    try {
      const localOps = JSON.parse(localStorage.getItem('gm_ops_config') || 'null');
      gameState.gmOps = localOps || { events: [], heroFx: {}, manualBadges: {} };
    } catch (e) {
      gameState.gmOps = { events: [], heroFx: {}, manualBadges: {} };
    }
  }
  if (!Array.isArray(gameState.gmOps.events)) gameState.gmOps.events = [];
  if (!gameState.gmOps.heroFx) gameState.gmOps.heroFx = {};
  if (!gameState.gmOps.manualBadges) gameState.gmOps.manualBadges = {};
  if (!gameState.gmOps.guildMeta) gameState.gmOps.guildMeta = {};
  return gameState.gmOps;
}

async function persistGMOpsToSupabase(toastMsg) {
  if (!assertCloudReady()) return false;
  const gmOps = ensureGMOpsState();
  const rawOps = typeof window.deepRaw === 'function' ? window.deepRaw(gmOps) : gmOps;
  try {
    localStorage.setItem('gm_ops_config', JSON.stringify(rawOps));
  } catch (e) {}

  try {
    await window.supabase.insert("game_config", { key: "gm_ops_config", value: rawOps });
    ['gm-badge-start-date', 'cfg-badge-start-date'].forEach(id => { const el = document.getElementById(id); if (el) delete el.dataset.dirty; });
    if (typeof window.syncFromDatabase === 'function') {
      await window.syncFromDatabase();
    } else if (typeof window.evaluateAllHeroesBadges === 'function') {
      window.evaluateAllHeroesBadges(gameState);
    }
    renderGMOpsCenter();
    renderHeroTable();
    renderActivityTable();
    if (toastMsg) showAdminToast(toastMsg);
    return true;
  } catch (e) {
    console.error("Persist GM Ops Error:", e);
    alert("❌ 儲存至雲端失敗：" + e.message);
    return false;
  }
}

function switchGMOpsSubTab(tabName) {
  const tabs = ['events', 'fx', 'badges'];
  tabs.forEach(t => {
    const btn = document.getElementById(`gm-ops-tab-${t}`);
    const panel = document.getElementById(`gm-ops-panel-${t}`);
    const isAct = t === tabName;
    if (panel) panel.classList.toggle('hidden', !isAct);
    if (btn) {
      btn.className = isAct
        ? 'justify-center px-2 sm:px-3 py-2 sm:py-1.5 rounded-xl font-bold bg-amber-500 text-slate-950 transition shadow whitespace-nowrap flex items-center'
        : 'justify-center px-2 sm:px-3 py-2 sm:py-1.5 rounded-xl font-bold bg-slate-800 text-slate-300 hover:text-white transition whitespace-nowrap flex items-center';
    }
  });
  renderGMOpsCenter();
}

function renderGMOpsCenter() {
  ensureGMOpsState();

  // Set default date on event inputs if empty
  const startInp = document.getElementById('gm-event-start');
  const endInp = document.getElementById('gm-event-end');
  if (startInp && !startInp.value) {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    startInp.value = todayIso;
    if (endInp && !endInp.value) endInp.value = todayIso;
  }

  renderGMEventsTable();
  populateGMFxHeroDropdown();
  renderGMHeroFxActiveList();
  renderGMBadgeEncyclopedia();
}

// -------------------------------------------------------------
// SUB-PANEL 1: ⚡ 限時積分加倍活動日曆 CRUD (支援預告與回溯修改 %)
// -------------------------------------------------------------
function onGMEventThemeSelect() {
  const editId = document.getElementById('gm-event-edit-id')?.value;
  if (editId) return; // 編輯既有活動時不自動覆蓋標題与%
  const themeKey = document.getElementById('gm-event-theme')?.value || 'typhoon';
  const preset = window.EVENT_THEME_PRESETS?.[themeKey];
  if (preset) {
    const titleEl = document.getElementById('gm-event-title');
    const pctEl = document.getElementById('gm-event-pct');
    if (titleEl) titleEl.value = preset.label.replace(/^[^\s]+\s*/, '');
    if (pctEl && preset.defaultBonus != null) pctEl.value = preset.defaultBonus;
  }
}

function resetGMEventForm() {
  const editIdEl = document.getElementById('gm-event-edit-id');
  const modeLbl = document.getElementById('gm-event-form-mode-label');
  const cancelBtn = document.getElementById('btn-cancel-gm-event-edit');
  const titleEl = document.getElementById('gm-event-title');
  const pctEl = document.getElementById('gm-event-pct');
  const noteEl = document.getElementById('gm-event-note');

  if (editIdEl) editIdEl.value = '';
  if (modeLbl) modeLbl.innerHTML = '<span>⚡ 新增 / 排程限時積分加倍活動 (全資料片通用)</span>';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (titleEl) titleEl.value = '颱風假防颱特訓';
  if (pctEl) pctEl.value = '20';
  if (noteEl) noteEl.value = '';
}

function editGMEvent(eventId) {
  const gmOps = ensureGMOpsState();
  const ev = gmOps.events.find(e => e.id === eventId);
  if (!ev) return;

  document.getElementById('gm-event-edit-id').value = ev.id;
  document.getElementById('gm-event-theme').value = ev.theme || 'custom';
  document.getElementById('gm-event-title').value = ev.title || '';
  document.getElementById('gm-event-start').value = dateToInputVal(ev.startDate);
  document.getElementById('gm-event-end').value = dateToInputVal(ev.endDate || ev.startDate);
  document.getElementById('gm-event-pct').value = ev.bonusPct || 20;
  document.getElementById('gm-event-note').value = ev.note || '';

  const modeLbl = document.getElementById('gm-event-form-mode-label');
  const cancelBtn = document.getElementById('btn-cancel-gm-event-edit');
  if (modeLbl) {
    modeLbl.innerHTML = `<span class="text-cyan-400">✏️ 正在回溯修改活動：【${escapeHtmlLite(ev.title)}】 (修改後全服歷史與當前分數將自動重新計算)</span>`;
  }
  if (cancelBtn) cancelBtn.classList.remove('hidden');
}

async function saveGMEvent() {
  if (!assertCloudReady()) return;
  const gmOps = ensureGMOpsState();
  const editId = document.getElementById('gm-event-edit-id')?.value || '';
  const theme = document.getElementById('gm-event-theme')?.value || 'typhoon';
  const title = (document.getElementById('gm-event-title')?.value || '').trim();
  const startRaw = document.getElementById('gm-event-start')?.value || '';
  const endRaw = document.getElementById('gm-event-end')?.value || startRaw;
  const bonusPct = parseFloat(document.getElementById('gm-event-pct')?.value) || 0;
  const note = (document.getElementById('gm-event-note')?.value || '').trim();

  if (!title) { alert('請填寫活動公告名稱！'); return; }
  if (!startRaw) { alert('請選擇活動開始日期！'); return; }
  if (bonusPct <= 0) { alert('加成百分比必須大於 0%！'); return; }
  if (bonusPct > 500) { alert('加成百分比上限為 500%，請確認是否輸入錯誤！'); return; }

  const startDate = inputValToDate(startRaw);
  const endDate = inputValToDate(endRaw || startRaw);
  if (endDate < startDate) {
    alert('結束日期不能早於開始日期！');
    return;
  }

  // 與其他活動日期重疊時提醒 GM：重疊期間的加成會相加
  const overlaps = (gmOps.events || []).filter(ev => ev.id !== editId && ev.enabled !== false && (() => {
    const s2 = window.normalizeDateYMD(ev.startDate), e2 = window.normalizeDateYMD(ev.endDate || ev.startDate);
    return s2 && startDate <= e2 && endDate >= s2;
  })());
  if (overlaps.length > 0) {
    const desc = overlaps.map(ev => `【${ev.title} ${ev.startDate}~${ev.endDate || ev.startDate} +${ev.bonusPct}%】`).join('\n');
    if (!confirm(`⚠️ 此活動日期與以下活動重疊，重疊日期的加成會「相加」：\n${desc}\n\n確定要儲存嗎？`)) return;
  }

  const preset = window.EVENT_THEME_PRESETS?.[theme] || window.EVENT_THEME_PRESETS?.custom || { icon: '⚡' };
  const eventPayload = {
    id: editId || `evt_${Date.now()}`,
    theme: theme,
    icon: preset.icon || '⚡',
    title: title,
    startDate: startDate,
    endDate: endDate,
    bonusPct: bonusPct,
    note: note,
    updatedAt: new Date().toISOString()
  };

  if (editId) {
    const idx = gmOps.events.findIndex(e => e.id === editId);
    if (idx >= 0) gmOps.events[idx] = eventPayload;
    else gmOps.events.unshift(eventPayload);
  } else {
    gmOps.events.unshift(eventPayload);
  }

  resetGMEventForm();
  await persistGMOpsToSupabase(`🎉 限時活動【${eventPayload.icon} ${title} (+${bonusPct}%)】已同步雲端並重算全服積分！`);
}

async function deleteGMEvent(eventId) {
  if (!assertCloudReady()) return;
  const gmOps = ensureGMOpsState();
  const ev = gmOps.events.find(e => e.id === eventId);
  if (!ev) return;

  if (!confirm(`確定要刪除活動【${ev.title} (${ev.startDate} ~ ${ev.endDate} +${ev.bonusPct}%)】嗎？\n刪除後，該時段運動打卡將立即恢復為原始 1.0x 倍率！`)) return;

  gmOps.events = gmOps.events.filter(e => e.id !== eventId);
  if (document.getElementById('gm-event-edit-id')?.value === eventId) {
    resetGMEventForm();
  }
  await persistGMOpsToSupabase(`🗑️ 已刪除活動【${ev.title}】，前台分數已自動還原重算！`);
}

function renderGMEventsTable() {
  const tbody = document.getElementById('admin-gm-events-tbody');
  if (!tbody) return;

  const gmOps = ensureGMOpsState();
  const events = [...(gmOps.events || [])].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));

  if (events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-5 text-center text-slate-500">目前尚無排程或歷史加倍活動。上方可隨時新增「未來預告活動」或「事後回溯補登颱風假/豪雨加成」！</td></tr>`;
    return;
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const acts = gameState?.activities || [];

  tbody.innerHTML = events.map(ev => {
    const s = String(ev.startDate || '').replace(/-/g, '/');
    const e = String(ev.endDate || ev.startDate || '').replace(/-/g, '/');
    let statusBadge = '';
    if (todayStr >= s && todayStr <= e) {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50">🔥 生效中 (前台廣播中)</span>`;
    } else if (todayStr < s) {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/50">⏳ 即將開始 (前台預告中)</span>`;
    } else {
      statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">✅ 歷史生效中 (可回溯修改)</span>`;
    }

    // Count affected activities
    const affectedCount = acts.filter(a => {
      if (a.isExcluded || !a.isValidAttack) return false;
      const ad = String(a.date || a.time || '').trim().replace(/-/g, '/').split(' ')[0];
      if (!ad) return false;
      const parts = ad.split('/');
      if (parts.length !== 3) return false;
      const normAd = `${parts[0]}/${String(parts[1]).padStart(2, '0')}/${String(parts[2]).padStart(2, '0')}`;
      return normAd >= s && normAd <= e;
    }).length;

    return `
      <tr class="hover:bg-slate-900/60 transition">
        <td class="p-3 whitespace-nowrap">${statusBadge}</td>
        <td class="p-3">
          <div class="font-bold text-white flex items-center space-x-1.5">
            <span class="text-base">${ev.icon || '⚡'}</span>
            <span>${ev.title}</span>
          </div>
          ${ev.note ? `<div class="text-[11px] text-slate-400 mt-0.5">${ev.note}</div>` : ''}
        </td>
        <td class="p-3 font-mono text-slate-300 whitespace-nowrap">${s === e ? s : `${s} ~ ${e}`}</td>
        <td class="p-3 font-mono font-black text-amber-400 text-sm whitespace-nowrap">+${ev.bonusPct}%</td>
        <td class="p-3 font-mono text-cyan-300 whitespace-nowrap">${affectedCount} 筆運動</td>
        <td class="p-3 text-right space-x-2 whitespace-nowrap">
          <button type="button" onclick="editGMEvent('${ev.id}')" class="px-2.5 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 font-bold text-xs transition">
            ✏️ 修改 % / 日期
          </button>
          <button type="button" onclick="deleteGMEvent('${ev.id}')" class="px-2.5 py-1 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-bold text-xs transition">
            🗑️ 刪除
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// SUB-PANEL 2: 🎨 英雄頭像特效與自訂稱號 CRUD
// -------------------------------------------------------------
function populateGMFxHeroDropdown() {
  const select = document.getElementById('gm-fx-hero');
  if (!select || !gameState?.heroes) return;

  const currVal = select.value;
  select.innerHTML = '';
  gameState.heroes.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.name;
    opt.innerText = `${h.name} (${h.guild})`;
    if (h.name === currVal) opt.selected = true;
    select.appendChild(opt);
  });

  if (!currVal && gameState.heroes.length > 0) {
    onGMFxHeroSelect();
  }
}

function onGMFxHeroSelect() {
  const heroName = document.getElementById('gm-fx-hero')?.value;
  if (!heroName) return;
  const gmOps = ensureGMOpsState();
  const fx = gmOps.heroFx?.[heroName] || { type: 'none', fx: 'none', customTitle: '', expiresAt: '' };

  const typeEl = document.getElementById('gm-fx-type');
  const titleEl = document.getElementById('gm-fx-title');
  const expEl = document.getElementById('gm-fx-expires');

  if (typeEl) typeEl.value = fx.fx || fx.type || 'none';
  if (titleEl) titleEl.value = fx.customTitle || '';
  if (expEl) expEl.value = fx.expiresAt ? dateToInputVal(fx.expiresAt) : '';
}

function onGMFxTypeSelect() {
  const type = document.getElementById('gm-fx-type')?.value || 'none';
  const titleEl = document.getElementById('gm-fx-title');
  if (!titleEl) return;
  if (type === 'none') {
    titleEl.value = '';
    return;
  }
  const preset = window.AVATAR_FX_PRESETS?.[type];
  if (preset) {
    titleEl.value = preset.defaultTitle || '';
  }
}

async function saveGMHeroFx() {
  if (!assertCloudReady()) return;
  const heroName = document.getElementById('gm-fx-hero')?.value;
  if (!heroName) return;

  const type = document.getElementById('gm-fx-type')?.value || 'none';
  const customTitle = (document.getElementById('gm-fx-title')?.value || '').trim();
  const expRaw = document.getElementById('gm-fx-expires')?.value || '';
  const expiresAt = expRaw ? inputValToDate(expRaw) : '';

  const gmOps = ensureGMOpsState();
  const prevHistory = Array.isArray(gmOps.heroFx?.[heroName]?.history) ? [...gmOps.heroFx[heroName].history] : [];
  if (type && type !== 'none' && !prevHistory.includes(type)) {
    prevHistory.push(type);
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;

  if (type === 'none' && !customTitle) {
    if (prevHistory.length > 0) {
      gmOps.heroFx[heroName] = { type: 'none', fx: 'none', customTitle: '', expiresAt: '', history: prevHistory, updatedAt: gmOps.heroFx?.[heroName]?.updatedAt || todayStr };
    } else {
      delete gmOps.heroFx[heroName];
    }
    await persistGMOpsToSupabase(`🧹 已清除【${heroName}】的頭像特效與稱號`);
  } else {
    gmOps.heroFx[heroName] = {
      type: type,
      fx: type,
      customTitle: customTitle,
      expiresAt: expiresAt,
      history: prevHistory,
      updatedAt: todayStr
    };
    await persistGMOpsToSupabase(`✨ 已為【${heroName}】掛載頭像特效與稱號！前台全服同步生效！`);
  }
}

async function clearGMHeroFx(targetHero) {
  if (!assertCloudReady()) return;
  const heroName = targetHero || document.getElementById('gm-fx-hero')?.value;
  if (!heroName) return;

  const gmOps = ensureGMOpsState();
  const prevHistory = Array.isArray(gmOps.heroFx?.[heroName]?.history) ? [...gmOps.heroFx[heroName].history] : [];
  if (prevHistory.length > 0) {
    // 保留原本的 updatedAt，讓「曾獲得特效」類徽章的取得日期固定不變
    gmOps.heroFx[heroName] = { type: 'none', fx: 'none', customTitle: '', expiresAt: '', history: prevHistory, updatedAt: gmOps.heroFx?.[heroName]?.updatedAt || '' };
  } else {
    delete gmOps.heroFx[heroName];
  }
  onGMFxHeroSelect();
  await persistGMOpsToSupabase(`🧹 已移除【${heroName}】的頭像特效與稱號 (永久成就徽章仍予以保留)`);
}

function renderGMHeroFxActiveList() {
  const container = document.getElementById('admin-gm-fx-active-list');
  if (!container) return;

  const gmOps = ensureGMOpsState();
  const entries = Object.entries(gmOps.heroFx || {}).filter(([, v]) => v && ((v.type && v.type !== 'none') || v.customTitle));

  if (entries.length === 0) {
    container.innerHTML = `<div class="col-span-full p-4 rounded-2xl bg-slate-950/50 border border-slate-800 text-center text-slate-500">目前尚無英雄掛載特殊頭像特效或壽星金框。可於上方選單為壽星或當日 MVP 點亮專屬特效！</div>`;
    return;
  }

  const todayYMD = typeof window.getTodayYMD === 'function' ? window.getTodayYMD() : '';
  container.innerHTML = entries.map(([hName, fx]) => {
    const heroObj = (gameState?.heroes || []).find(h => h.name === hName) || { name: hName, guild: '' };
    const avatarPreview = typeof window.renderHeroAvatarHtml === 'function'
      ? window.renderHeroAvatarHtml(heroObj, 'w-11 h-11', 'rounded-xl')
      : '';
    const preset = window.AVATAR_FX_PRESETS?.[fx.type] || { label: '自訂稱號' };
    const expYMD = fx.expiresAt && typeof window.normalizeDateYMD === 'function' ? window.normalizeDateYMD(fx.expiresAt) : fx.expiresAt;
    const isExpired = Boolean(expYMD && todayYMD && expYMD < todayYMD);
    const expLabel = fx.expiresAt
      ? (isExpired ? `<span class="text-rose-400">到期日: ${escapeHtmlLite(fx.expiresAt)} (已過期)</span>` : `到期日: ${escapeHtmlLite(fx.expiresAt)}`)
      : '永久有效 (手動關閉)';
    return `
      <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-2">
        <div class="flex items-center space-x-3 min-w-0">
          ${avatarPreview}
          <div class="min-w-0">
            <div class="font-bold text-white truncate">${escapeHtmlLite(hName)}</div>
            <div class="text-[10px] text-amber-300 truncate">${escapeHtmlLite(preset.label)} ${fx.customTitle ? `• 「${escapeHtmlLite(fx.customTitle)}」` : ''}</div>
            <div class="text-[9px] text-slate-500 font-mono">${expLabel}</div>
          </div>
        </div>
        <button type="button" data-hero="${escapeHtmlLite(hName)}" onclick="clearGMHeroFx(this.dataset.hero)" class="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/50 text-[10px] font-bold flex-shrink-0">
          ✖ 移除
        </button>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// SUB-PANEL 3: 🎖️ GM 專屬全服 100 徽章圖鑑、開始時間設定與手動授勳
// -------------------------------------------------------------
async function saveGMBadgeStartDate() {
  if (!assertCloudReady()) return;
  const gmOps = ensureGMOpsState();
  const rawVal = document.getElementById('gm-badge-start-date')?.value || '';
  gmOps.badgeStartDate = rawVal ? inputValToDate(rawVal) : '';

  const cfgEl = document.getElementById('cfg-badge-start-date');
  if (cfgEl) cfgEl.value = rawVal;

  if (typeof window.evaluateAllHeroesBadges === 'function') {
    window.evaluateAllHeroesBadges(gameState);
  }

  const msg = gmOps.badgeStartDate
    ? `⏰ 已設定徽章累計開始時間為【${gmOps.badgeStartDate}】！僅該日(含)後的運動計入徽章，全服已重算完成！`
    : `♾️ 已清空徽章開始時間限制，恢復採計全部歷史運動紀錄！`;
  await persistGMOpsToSupabase(msg);
}

async function setBadgeStartToSeasonStart() {
  const sStartRaw = document.getElementById('cfg-season-start')?.value || dateToInputVal(gameState?.seasonStart || '2026/08/12');
  const gmEl = document.getElementById('gm-badge-start-date');
  const cfgEl = document.getElementById('cfg-badge-start-date');
  if (gmEl) gmEl.value = sStartRaw;
  if (cfgEl) cfgEl.value = sStartRaw;
  await saveGMBadgeStartDate();
}

async function setBadgeStartToToday() {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const gmEl = document.getElementById('gm-badge-start-date');
  const cfgEl = document.getElementById('cfg-badge-start-date');
  if (gmEl) gmEl.value = todayIso;
  if (cfgEl) cfgEl.value = todayIso;
  await saveGMBadgeStartDate();
}

async function clearGMBadgeStartDate() {
  const gmEl = document.getElementById('gm-badge-start-date');
  const cfgEl = document.getElementById('cfg-badge-start-date');
  if (gmEl) gmEl.value = '';
  if (cfgEl) cfgEl.value = '';
  await saveGMBadgeStartDate();
}

function renderGMBadgeEncyclopedia() {
  const tbody = document.getElementById('admin-gm-badges-tbody');
  if (!tbody) return;

  const gmOps = ensureGMOpsState();
  const badgeStartIso = gmOps.badgeStartDate ? dateToInputVal(gmOps.badgeStartDate) : '';
  const gmBadgeStartEl = document.getElementById('gm-badge-start-date');
  const cfgBadgeStartEl = document.getElementById('cfg-badge-start-date');
  if (gmBadgeStartEl && document.activeElement !== gmBadgeStartEl && !gmBadgeStartEl.dataset.dirty) gmBadgeStartEl.value = badgeStartIso;
  if (cfgBadgeStartEl && document.activeElement !== cfgBadgeStartEl && !cfgBadgeStartEl.dataset.dirty) cfgBadgeStartEl.value = badgeStartIso;

  const statusTextEl = document.getElementById('gm-badge-start-status-text');
  if (statusTextEl) {
    const minDur = gameState?.summary?.minDurationMinutes || 30;
    const normStart = typeof window.normalizeDateYMD === 'function' ? window.normalizeDateYMD(gmOps.badgeStartDate || '') : (gmOps.badgeStartDate || '');
    const validActsCount = (gameState?.activities || []).filter(a => {
      if (a.isExcluded || (Number(a.duration) || 0) < minDur) return false;
      if (normStart) {
        const actYMD = typeof window.normalizeDateYMD === 'function' ? window.normalizeDateYMD(a.date || a.time) : '';
        if (!actYMD || actYMD < normStart) return false;
      }
      return true;
    }).length;

    if (normStart) {
      statusTextEl.innerHTML = `⏰ 目前採計：<span class="text-white">${normStart} (含) 之後</span>（共 ${validActsCount} 筆有效運動）`;
    } else {
      statusTextEl.innerHTML = `♾️ 目前採計：<span class="text-white">全部歷史紀錄</span>（共 ${validActsCount} 筆有效運動）`;
    }
  }

  const catalog = (window.getActiveBadgeCatalog ? window.getActiveBadgeCatalog(gameState) : window.BADGE_CATALOG) || [];
  const totalCountEl = document.getElementById('gm-badge-total-count');
  if (totalCountEl) totalCountEl.innerText = catalog.length;

  if (typeof window.evaluateAllHeroesBadges === 'function') {
    window.evaluateAllHeroesBadges(gameState);
  }

  // Populate category filter if needed
  const catSelect = document.getElementById('gm-badge-cat-filter');
  if (catSelect && catalog.length > 0 && catSelect.dataset.n !== String(catalog.length)) {
    catSelect.dataset.n = String(catalog.length);
    while (catSelect.options.length > 1) catSelect.remove(1);
    const cats = Array.from(new Set(catalog.map(b => b.cat)));
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = c;
      catSelect.appendChild(opt);
    });
  }

  // Populate Manual Grant hero & badge dropdowns
  const grantHeroSel = document.getElementById('gm-grant-hero');
  if (grantHeroSel && gameState?.heroes) {
    const curH = grantHeroSel.value;
    grantHeroSel.innerHTML = '';
    gameState.heroes.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.name;
      opt.innerText = `${h.name} (${h.guild})`;
      if (h.name === curH) opt.selected = true;
      grantHeroSel.appendChild(opt);
    });
  }

  const grantBadgeSel = document.getElementById('gm-grant-badge');
  if (grantBadgeSel && grantBadgeSel.options.length !== catalog.length) {
    const curB = grantBadgeSel.value;
    grantBadgeSel.innerHTML = '';
    catalog.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.innerText = `#${String(b.num).padStart(3, '0')} ${b.icon} ${b.name} — ${b.desc}`;
      if (b.id === curB) opt.selected = true;
      grantBadgeSel.appendChild(opt);
    });
  }

  const query = (document.getElementById('gm-badge-search')?.value || '').toLowerCase().trim();
  const catFilter = document.getElementById('gm-badge-cat-filter')?.value || 'ALL';
  const unlockFilter = document.getElementById('gm-badge-unlock-filter')?.value || 'ALL';
  const rarityMeta = window.BADGE_RARITY_META || {};
  const heroBadgesAll = gameState?.heroBadges || {};

  const filtered = catalog.filter(b => {
    if (catFilter !== 'ALL' && b.cat !== catFilter) return false;

    const holders = Object.keys(heroBadgesAll).filter(hName => heroBadgesAll[hName]?.[b.id]);
    if (unlockFilter === 'UNLOCKED' && holders.length === 0) return false;
    if (unlockFilter === 'LOCKED' && holders.length > 0) return false;

    if (query) {
      const numStr = `#${String(b.num).padStart(3, '0')}`;
      const matchNum = numStr.includes(query);
      const matchName = (b.name || '').toLowerCase().includes(query);
      const matchDesc = (b.desc || '').toLowerCase().includes(query);
      const matchHolder = holders.some(h => h.toLowerCase().includes(query));
      if (!matchNum && !matchName && !matchDesc && !matchHolder) return false;
    }
    return true;
  });

  tbody.innerHTML = filtered.map(b => {
    const numStr = `#${String(b.num).padStart(3, '0')}`;
    const rMeta = rarityMeta[b.rarity] || rarityMeta.common || { label: '普通', color: 'text-slate-300', border: 'border-slate-700', bg: 'bg-slate-900' };
    const holders = Object.keys(heroBadgesAll).filter(hName => heroBadgesAll[hName]?.[b.id]);

    const holdersHtml = holders.length === 0
      ? `<span class="text-slate-600 italic">🔒 尚無英雄解鎖</span>`
      : `<div class="flex flex-wrap gap-1.5">
          ${holders.map(hName => {
            const info = heroBadgesAll[hName][b.id];
            const isManualGrant = Boolean(gmOps.manualBadges?.[hName]?.[b.id]);
            return `
              <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 border border-amber-500/40 text-amber-300" title="取得時間: ${info.unlockedAt}&#10;紀錄: ${info.actTitle || ''}">
                <span>${hName}</span>
                <span class="text-[9px] text-slate-400 font-mono">(${info.unlockedAt})</span>
                ${isManualGrant ? `<button type="button" onclick="revokeManualBadgeFromHero('${hName}', '${b.id}')" class="ml-1 text-rose-400 hover:text-rose-300" title="撤銷手動頒發">✖</button>` : ''}
              </span>
            `;
          }).join('')}
        </div>`;

    return `
      <tr class="hover:bg-slate-900/60 transition">
        <td class="p-3 font-mono font-bold text-slate-400">${numStr}</td>
        <td class="p-3 whitespace-nowrap">
          <div class="flex items-center space-x-2">
            <span class="text-xl">${b.icon}</span>
            <span class="font-bold ${rMeta.color}">${b.name}</span>
          </div>
        </td>
        <td class="p-3 whitespace-nowrap">
          <span class="text-[10px] text-slate-400">${b.cat}</span>
          <span class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${rMeta.border} ${rMeta.bg} ${rMeta.color}">${rMeta.label}</span>
        </td>
        <td class="p-3 text-slate-200 font-medium">${b.desc}</td>
        <td class="p-3">${holdersHtml}</td>
      </tr>
    `;
  }).join('');
}

async function grantManualBadgeToHero() {
  if (!assertCloudReady()) return;
  const heroName = document.getElementById('gm-grant-hero')?.value;
  const badgeId = document.getElementById('gm-grant-badge')?.value;
  const reason = (document.getElementById('gm-grant-reason')?.value || 'GM 榮譽授勳').trim();
  if (!heroName || !badgeId) return;

  const gmOps = ensureGMOpsState();
  if (!gmOps.manualBadges[heroName]) gmOps.manualBadges[heroName] = {};

  const now = new Date();
  const todayStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  gmOps.manualBadges[heroName][badgeId] = {
    unlockedAt: todayStr,
    actTitle: `🏅 ${reason}`
  };

  const badgeObj = (window.findBadgeById ? window.findBadgeById(badgeId) : (window.BADGE_CATALOG || []).find(b => b.id === badgeId));
  await persistGMOpsToSupabase(`🏅 已手動頒發徽章【${badgeObj?.name || badgeId}】予 ${heroName}！`);
}

async function revokeManualBadgeFromHero(heroName, badgeId) {
  if (!assertCloudReady()) return;
  if (!confirm(`確定要撤銷手動頒發給【${heroName}】的徽章 (${badgeId}) 嗎？\n(若該英雄本身的運動紀錄已自然達成條件，系統仍會保留其自然達成資格)`)) return;
  const gmOps = ensureGMOpsState();
  if (gmOps.manualBadges?.[heroName]) {
    delete gmOps.manualBadges[heroName][badgeId];
  }
  await persistGMOpsToSupabase(`🧹 已撤銷【${heroName}】的手動授勳紀錄`);
}



// =====================================================================
// 8. 📱 手機同步 App 管理中心 (預備功能)
//    - 開關與下載連結存放於 gm_ops_config.mobileSync
//    - 邀請碼 / 裝置管理透過 Edge Function admin-mobile (需部署並設定 GM_PASSWORD)
//    - 來源對帳純前端計算，不需要任何後端
// =====================================================================
function getMobileSyncConfig() {
  const gmOps = ensureGMOpsState();
  if (!gmOps.mobileSync || typeof gmOps.mobileSync !== 'object') gmOps.mobileSync = { enabled: false };
  return gmOps.mobileSync;
}

function renderMobileSyncSection() {
  const section = document.getElementById('mobile-sync-section');
  if (!section) return;
  const cfg = getMobileSyncConfig();
  const setIfIdle = (id, val, prop = 'value') => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el && !el.dataset.dirty) el[prop] = val;
  };
  setIfIdle('mobile-sync-enabled', Boolean(cfg.enabled), 'checked');
  setIfIdle('mobile-sync-testflight', cfg.testflightUrl || '');
  setIfIdle('mobile-sync-play', cfg.playUrl || '');
  setIfIdle('mobile-sync-apk', cfg.apkUrl || '');

  const pill = document.getElementById('mobile-sync-status-pill');
  if (pill) {
    pill.className = `px-3 py-1 rounded-full text-[11px] font-bold border ${cfg.enabled ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-slate-800 text-slate-300 border-slate-700'}`;
    pill.innerText = cfg.enabled ? '🟢 已啟用 (與 Strava 並行中)' : '⏸️ 未啟用 (維持 Strava 爬蟲)';
  }
  const panels = document.getElementById('mobile-sync-panels');
  if (panels) panels.classList.toggle('hidden', !cfg.enabled);
  if (cfg.enabled) {
    renderMobileDevices(gameState?.devices || []);
    renderMobileReconciliation();
  }
}

async function saveMobileSyncSettings() {
  if (!assertCloudReady()) return;
  const cfg = getMobileSyncConfig();
  const wantEnabled = Boolean(document.getElementById('mobile-sync-enabled')?.checked);
  if (!wantEnabled && window.isMobileMode && window.isMobileMode(gameState?.activeMode)) {
    alert('⛔ 目前進行中的是「手機同步資料片」，關閉手機同步會讓遊戲無法計分。\n\n請先在上方「選擇啟用的資料片」切換回 7 大經典資料片並儲存，再關閉手機同步。');
    const el = document.getElementById('mobile-sync-enabled');
    if (el) { el.checked = true; delete el.dataset.dirty; }
    return;
  }
  cfg.enabled = wantEnabled;
  cfg.testflightUrl = (document.getElementById('mobile-sync-testflight')?.value || '').trim();
  cfg.playUrl = (document.getElementById('mobile-sync-play')?.value || '').trim();
  cfg.apkUrl = (document.getElementById('mobile-sync-apk')?.value || '').trim();
  ['mobile-sync-enabled', 'mobile-sync-testflight', 'mobile-sync-play', 'mobile-sync-apk'].forEach(id => {
    const el = document.getElementById(id); if (el) delete el.dataset.dirty;
  });
  await persistGMOpsToSupabase(cfg.enabled ? '📱 手機同步 App 已啟用！玩家可透過邀請連結加入 (Strava 爬蟲仍並行運作)' : '⏸️ 手機同步 App 已關閉，維持 Strava 爬蟲模式');
  if (cfg.enabled) refreshMobilePanels();
}

async function callAdminMobile(action, payload = {}) {
  const res = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/admin-mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_CONFIG.anonKey,
      'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
      'x-gm-password': getGMSecret()
    },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

async function refreshMobilePanels() {
  const list = document.getElementById('mobile-invite-list');
  try {
    const [inv, dev] = await Promise.all([callAdminMobile('list_invites'), callAdminMobile('list_devices')]);
    if (gameState && Array.isArray(dev.devices)) {
      gameState.devices = dev.devices;
    }
    renderMobileInvites(inv.invites || []);
    renderMobileDevices(dev.devices || []);
  } catch (e) {
    if (list) list.innerHTML = `<div class="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300">⚠️ 無法連線 admin-mobile Edge Function：${escapeHtmlLite(e.message)}<br>請確認已部署 supabase/functions/admin-mobile 並設定環境變數 GM_PASSWORD。</div>`;
  }
  renderMobileReconciliation();
}

function renderMobileInvites(invites) {
  const list = document.getElementById('mobile-invite-list');
  if (!list) return;
  if (!invites.length) { list.innerHTML = '<div class="text-slate-500">尚未產生任何邀請碼</div>'; return; }
  const base = `${window.location.origin}/join.html?code=`;
  list.innerHTML = invites.map(i => {
    const safeCode = escapeHtmlLite(i.code);
    const safeSeason = escapeHtmlLite(i.season || '');
    const safeUsed = Number(i.used_count) || 0;
    const safeMax = i.max_uses != null ? Number(i.max_uses) : '∞';
    return `
    <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2">
      <div class="flex items-center gap-2"><span class="font-mono font-black text-amber-300 text-sm">${safeCode}</span><span class="text-slate-400">${safeSeason} • 已使用 ${safeUsed}/${safeMax}</span></div>
      <div class="flex items-center gap-2">
        <button type="button" data-code="${safeCode}" onclick="navigator.clipboard.writeText('${escapeHtmlLite(base)}' + encodeURIComponent(this.dataset.code)); showAdminToast('已複製邀請連結')" class="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-cyan-300 font-bold">📋 複製邀請連結</button>
        <button type="button" data-code="${safeCode}" onclick="deleteMobileInvite(this.dataset.code)" class="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 font-bold">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

async function createMobileInvite() {
  try {
    const season = (document.getElementById('mobile-invite-season')?.value || 'S').trim();
    const maxUses = parseInt(document.getElementById('mobile-invite-max')?.value, 10) || 30;
    const { invite } = await callAdminMobile('create_invite', { season, max_uses: maxUses });
    showAdminToast(`🎟️ 已產生邀請碼 ${invite.code}`);
    refreshMobilePanels();
  } catch (e) { alert('❌ 產生邀請碼失敗：' + e.message); }
}

async function deleteMobileInvite(code) {
  if (!confirm(`確定刪除邀請碼 ${code}？(已加入的玩家不受影響)`)) return;
  try { await callAdminMobile('delete_invite', { code }); refreshMobilePanels(); } catch (e) { alert('❌ 刪除失敗：' + e.message); }
}

async function toggleMobileDevice(deviceId, revoke) {
  if (revoke && !confirm('確定停用這支手機？停用後它將無法再上傳資料 (玩家可用新邀請碼重新綁定)。')) return;
  try { await callAdminMobile(revoke ? 'revoke_device' : 'restore_device', { device_id: deviceId }); refreshMobilePanels(); } catch (e) { alert('❌ 操作失敗：' + e.message); }
}

function getHiddenMobileDeviceIds() {
  const arr = gameState?.gmOps?.hiddenDeviceIds;
  return new Set(Array.isArray(arr) ? arr.map(String) : []);
}

async function persistHiddenMobileDeviceIds(idSet) {
  if (!gameState) return;
  gameState.gmOps = gameState.gmOps || {};
  gameState.gmOps.hiddenDeviceIds = Array.from(idSet);
  if (typeof saveGmOpsConfig === 'function') {
    try { await saveGmOpsConfig(true); } catch (_) {}
  }
}

async function deleteMobileDevice(deviceId, heroName) {
  const id = String(deviceId || '').trim();
  if (!id) return;
  if (!confirm(`確定從後台移除「${heroName || '此玩家'}」的這筆手機綁定紀錄？\n\n• 移除後這支舊裝置將從列表消失且無法再上傳資料\n• 該英雄已上傳過的運動與健康數據都會完整保留\n• 玩家隨時可用邀請碼重新綁定新手機`)) return;
  try {
    await callAdminMobile('delete_device', { device_id: id });
    showAdminToast(`🗑️ 已移除 ${heroName || ''} 的手機裝置紀錄`);
  } catch (e) {
    // 若雲端 Edge Function 尚未重新部署 delete_device，自動降級為停用 + 後台隱藏
    try { await callAdminMobile('revoke_device', { device_id: id }); } catch (_) {}
    const hidden = getHiddenMobileDeviceIds();
    hidden.add(id);
    await persistHiddenMobileDeviceIds(hidden);
    showAdminToast(`🗑️ 已停用並從列表移除 ${heroName || ''} 的舊裝置紀錄`);
  }
  refreshMobilePanels();
}

async function pruneMobileDevices() {
  if (!confirm('確定一鍵清理「已停用」、「同一英雄舊的重複綁定」或「超過 30 天未同步」的殭屍裝置紀錄？\n(目前已上傳的所有運動與健康數據皆不受影響)')) return;
  try {
    const res = await callAdminMobile('prune_devices', { stale_days: 30 });
    showAdminToast(`🧹 已清理 ${res.deleted_count ?? 0} 筆舊裝置紀錄`);
  } catch (e) {
    // 降級處理：前端掃描已停用、重複英雄舊綁定或超過 30 天未同步的裝置，停用並隱藏
    const devices = Array.isArray(window._lastAdminMobileDevices) ? window._lastAdminMobileDevices : (gameState?.devices || []);
    const hidden = getHiddenMobileDeviceIds();
    const seenHero = new Set();
    const cutoff = Date.now() - 30 * 86400000;
    let count = 0;
    const sorted = [...devices].sort((a, b) => {
      const ta = new Date(a.last_sync_at || a.created_at || 0).getTime();
      const tb = new Date(b.last_sync_at || b.created_at || 0).getTime();
      return tb - ta;
    });
    for (const d of sorted) {
      if (hidden.has(String(d.id))) continue;
      const hk = String(d.hero || '').trim().toLowerCase();
      const lastMs = d.last_sync_at ? new Date(d.last_sync_at).getTime() : (d.created_at ? new Date(d.created_at).getTime() : 0);
      const isDup = hk && seenHero.has(hk);
      if (hk && !d.revoked) seenHero.add(hk);
      if (d.revoked || isDup || (lastMs > 0 && lastMs < cutoff)) {
        try { if (!d.revoked) await callAdminMobile('revoke_device', { device_id: d.id }); } catch (_) {}
        hidden.add(String(d.id));
        count++;
      }
    }
    await persistHiddenMobileDeviceIds(hidden);
    showAdminToast(`🧹 已清理 ${count} 筆舊裝置紀錄`);
  }
  refreshMobilePanels();
}

function formatDeviceSyncStatus(lastDate, revoked, nowMs) {
  if (revoked) return '<span class="text-rose-400 font-bold">⛔ 已停用</span>';
  if (!lastDate || isNaN(lastDate.getTime())) {
    return '<span class="text-amber-300 font-bold">🟡 剛綁定・尚未收到同步</span>';
  }
  const diffMin = Math.max(0, Math.floor((nowMs - lastDate.getTime()) / 60000));
  const hours = diffMin / 60;
  if (diffMin < 2) return '<span class="text-emerald-400 font-bold">🟢 剛剛同步</span>';
  if (diffMin < 60) return `<span class="text-emerald-400 font-bold">🟢 ${diffMin} 分鐘前同步</span>`;
  if (hours <= 24) return `<span class="text-emerald-400 font-bold">🟢 ${Math.floor(hours)} 小時前同步</span> <span class="text-[10px] text-slate-500">(24h內有紀錄)</span>`;
  if (hours <= 48) return `<span class="text-amber-300 font-bold">🟡 ${Math.floor(hours)} 小時未同步</span>`;
  const days = Math.floor(hours / 24);
  return `<span class="text-rose-400 font-bold">🔴 已失聯 ${days} 天 (${Math.floor(hours)}h)</span> <span class="text-[10px] text-slate-500">(未開App或已移除)</span>`;
}

function renderMobileDevices(devices) {
  const tbody = document.getElementById('mobile-devices-tbody');
  if (!tbody) return;
  window._lastAdminMobileDevices = Array.isArray(devices) ? devices : [];
  const hidden = getHiddenMobileDeviceIds();
  const visible = (devices || []).filter(d => !hidden.has(String(d.id)));
  if (!visible.length) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">尚無玩家綁定手機 (或舊裝置皆已清理)</td></tr>'; return; }
  const now = Date.now();
  tbody.innerHTML = visible.map(d => {
    const last = d.last_sync_at ? new Date(d.last_sync_at) : null;
    const light = formatDeviceSyncStatus(last, d.revoked, now);
    const safeHero = escapeHtmlLite(d.hero);
    const safeModel = escapeHtmlLite(d.device_model || '');
    const safeVer = escapeHtmlLite(d.app_version || '-');
    const safeId = escapeHtmlLite(d.id);
    return `<tr class="border-t border-slate-800/60 hover:bg-slate-900/40">
      <td class="p-3 font-bold text-white">${safeHero}</td>
      <td class="p-3">${d.platform === 'ios' ? '🍎 iPhone' : '🤖 Android'} <span class="text-slate-500">${safeModel}</span></td>
      <td class="p-3 font-mono">${last ? last.toLocaleString('zh-TW', { hour12: false }) : '尚未同步'}</td>
      <td class="p-3 font-mono text-slate-400">${safeVer}</td>
      <td class="p-3">${light}</td>
      <td class="p-3 text-right whitespace-nowrap space-x-2">${d.revoked
        ? `<button type="button" data-dev="${safeId}" onclick="toggleMobileDevice(this.dataset.dev, false)" class="px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 font-bold">恢復</button>`
        : `<button type="button" data-dev="${safeId}" onclick="toggleMobileDevice(this.dataset.dev, true)" class="px-2 py-1 rounded-lg bg-amber-950/50 border border-amber-500/30 text-amber-300 hover:bg-amber-900/50 font-bold">停用</button>`}
        <button type="button" data-dev="${safeId}" data-hero="${safeHero}" onclick="deleteMobileDevice(this.dataset.dev, this.dataset.hero)" class="px-2 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 hover:bg-rose-900/70 font-bold" title="從列表永久移除此裝置紀錄">🗑️ 移除</button>
      </td>
    </tr>`;
  }).join('');
}

function renderMobileReconciliation() {
  const tbody = document.getElementById('mobile-recon-tbody');
  if (!tbody) return;
  const acts = gameState?.activities || [];
  const dailyAll = gameState?.dailyHealth || [];
  const hiddenDevs = getHiddenMobileDeviceIds();
  const devices = (gameState?.devices || []).filter(d => !hiddenDevs.has(String(d.id)));
  const cutoff = Date.now() - 14 * 86400000;
  const cutoffYMD = new Date(cutoff).toISOString().slice(0, 10);
  const recent = acts.filter(a => {
    if (a.isExcluded) return false;
    const d = typeof window.parseActivityDate === 'function' ? window.parseActivityDate(a.date) : new Date(a.date);
    return d && d.getTime() >= cutoff;
  });
  const isMobile = a => a.source === 'apple_health' || a.source === 'health_connect';
  const byId = new Map(recent.map(a => [String(a.id), a]));
  const matched = new Set();
  recent.forEach(a => {
    if (!a.duplicateOf) return;
    const partner = byId.get(String(a.duplicateOf));
    if (partner && isMobile(partner) !== isMobile(a)) { matched.add(String(a.id)); matched.add(String(partner.id)); }
  });
  const heroes = (gameState?.heroes || []).map(h => h.name);
  tbody.innerHTML = heroes.map(name => {
    const safeName = escapeHtmlLite(name);
    const mine = recent.filter(a => a.hero === name);
    const strava = mine.filter(a => a.source === 'strava');
    const mobile = mine.filter(isMobile);
    const allMobileActs = acts.filter(a => a.hero === name && isMobile(a) && !a.isExcluded);
    const both = mobile.filter(a => matched.has(String(a.id))).length;
    const onlyStrava = strava.filter(a => !matched.has(String(a.id))).length;

    const myDev = devices.find(d => d.hero === name && !d.revoked);
    const myDailyAll = dailyAll.filter(r => r.hero === name);
    const myDaily14 = myDailyAll.filter(r => String(r.date || '') >= cutoffYMD);
    const stepDays14 = myDaily14.filter(r => Number(r.steps) > 0).length;
    const sleepDays14 = myDaily14.filter(r => Number(r.sleep_minutes) > 0).length;

    let status = '';
    if (!myDev && myDailyAll.length === 0 && allMobileActs.length === 0) {
      status = '<span class="text-slate-500">尚未綁定手機</span>';
    } else if (mobile.length > 0 && onlyStrava === 0) {
      status = '<span class="text-emerald-400 font-bold">✅ 運動與健康皆同步正常</span>';
    } else if (mobile.length === 0 && strava.length > 0) {
      status = `<span class="text-amber-300 font-bold">⚠️ 手機已通(${stepDays14 ? `有步數${stepDays14}天` : '無近14天步數'}${allMobileActs.length ? `、舊運動${allMobileActs.length}筆` : ''})，但近14天手錶運動未寫入 Health Connect / Apple 健康</span>`;
    } else if (onlyStrava > 0) {
      status = `<span class="text-amber-400 font-bold">⚠️ 有 ${onlyStrava} 筆 Strava 運動未在手機健康資料庫出現</span>`;
    } else {
      status = `<span class="text-cyan-300 font-bold">📱 手機已連線（近14天步數 ${stepDays14} 天 / 睡眠 ${sleepDays14} 天）</span>`;
    }

    const dailySummaryHtml = (myDailyAll.length || myDev)
      ? `<span class="${stepDays14 > 0 ? 'text-emerald-300' : 'text-slate-500'}">👣 ${stepDays14}天</span> / <span class="${sleepDays14 > 0 ? 'text-cyan-300' : 'text-rose-400'}">😴 ${sleepDays14}天</span>`
      : '<span class="text-slate-600">—</span>';

    return `<tr>
      <td class="p-3 font-bold text-white">${safeName}</td>
      <td class="p-3 font-mono">${strava.length}</td>
      <td class="p-3 font-mono">${mobile.length} <span class="text-slate-500 text-[10px]">(累計 ${allMobileActs.length})</span></td>
      <td class="p-3 font-mono text-emerald-300">${both}</td>
      <td class="p-3 font-mono">${dailySummaryHtml}</td>
      <td class="p-3">${status}</td>
      <td class="p-3 text-right"><button type="button" data-hero="${safeName}" onclick="inspectMobileHero(this.dataset.hero)" class="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-bold text-[11px] whitespace-nowrap">🔍 查看明細</button></td>
    </tr>`;
  }).join('');
  renderMobileDataInspector();
}

function inspectMobileHero(heroName) {
  const sel = document.getElementById('mobile-inspect-hero-select');
  if (sel && heroName) sel.value = heroName;
  renderMobileDataInspector(heroName);
  const box = document.getElementById('mobile-raw-inspector');
  if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderMobileDataInspector(preferredHero) {
  const sel = document.getElementById('mobile-inspect-hero-select');
  const diagBox = document.getElementById('mobile-inspect-diag-cards');
  const dailyTbody = document.getElementById('mobile-inspect-daily-tbody');
  const actTbody = document.getElementById('mobile-inspect-act-tbody');
  const dailyCountEl = document.getElementById('mobile-inspect-daily-count');
  const actCountEl = document.getElementById('mobile-inspect-act-count');
  if (!sel || !diagBox || !dailyTbody || !actTbody) return;

  const heroes = (gameState?.heroes || []).map(h => h.name);
  const devices = gameState?.devices || [];
  const dailyAll = gameState?.dailyHealth || [];
  const actsAll = gameState?.activities || [];
  const isMobile = a => a.source === 'apple_health' || a.source === 'health_connect';

  // 優先把「已綁定手機」或「有手機資料」的英雄排在選單最前面
  const hasDataSet = new Set([
    ...devices.filter(d => !d.revoked).map(d => d.hero),
    ...dailyAll.map(r => r.hero),
    ...actsAll.filter(isMobile).map(a => a.hero)
  ]);
  const sortedHeroes = [...heroes].sort((a, b) => (hasDataSet.has(b) ? 1 : 0) - (hasDataSet.has(a) ? 1 : 0) || a.localeCompare(b));

  const curVal = preferredHero || sel.value || sortedHeroes[0] || '';
  sel.innerHTML = sortedHeroes.map(n => {
    const tag = hasDataSet.has(n) ? ' 📱(有手機資料)' : '';
    return `<option value="${escapeHtmlLite(n)}" ${n === curVal ? 'selected' : ''}>${escapeHtmlLite(n)}${tag}</option>`;
  }).join('');
  const hero = sel.value || curVal;

  const myDev = devices.find(d => d.hero === hero && !d.revoked);
  const myDaily = dailyAll.filter(r => r.hero === hero).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const myMobileActs = actsAll.filter(a => a.hero === hero && isMobile(a)).sort((a, b) => parseAdminActivityTimestamp(b.date) - parseAdminActivityTimestamp(a.date));

  const lastStepRow = myDaily.find(r => Number(r.steps) > 0);
  const lastSleepRow = myDaily.find(r => Number(r.sleep_minutes) > 0);
  const lastRhrRow = myDaily.find(r => Number(r.resting_hr) > 0);
  const lastActRow = myMobileActs[0];

  const card = (title, ok, mainText, subText) => `
    <div class="bg-slate-900/90 border ${ok === 'ok' ? 'border-emerald-500/40' : (ok === 'warn' ? 'border-amber-500/40' : 'border-slate-800')} rounded-xl p-3 space-y-1">
      <div class="flex items-center justify-between"><span class="text-[11px] font-bold text-slate-300">${title}</span><span>${ok === 'ok' ? '🟢 有通' : (ok === 'warn' ? '🟡 部分/中斷' : '⚪ 尚無資料')}</span></div>
      <div class="font-mono font-bold text-xs ${ok === 'ok' ? 'text-emerald-300' : (ok === 'warn' ? 'text-amber-300' : 'text-slate-500')}">${mainText}</div>
      <div class="text-[10px] text-slate-400 leading-snug">${subText}</div>
    </div>`;

  const devSyncStr = myDev?.last_sync_at ? new Date(myDev.last_sync_at).toLocaleString('zh-TW', { hour12: false }) : '尚未同步';
  const sleepHours = r => r && r.sleep_minutes ? `${Math.floor(r.sleep_minutes / 60)}h ${Math.round(r.sleep_minutes % 60)}m` : '—';
  const sleepRecent = lastSleepRow && lastSleepRow.date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const actRecent = lastActRow && parseAdminActivityTimestamp(lastActRow.date) >= (Date.now() - 14 * 86400000);

  diagBox.innerHTML = [
    card(
      '📡 手機 App 連線',
      myDev ? 'ok' : (myDaily.length || myMobileActs.length ? 'warn' : 'none'),
      myDev ? `${escapeHtmlLite(myDev.device_model || myDev.platform)}` : '未綁定裝置',
      myDev ? `最後同步：${escapeHtmlLite(devSyncStr)}（v${escapeHtmlLite(myDev.app_version || '-')}）` : '請玩家用邀請碼綁定手機'
    ),
    card(
      '👣 步數 & 活動熱量',
      lastStepRow ? 'ok' : 'none',
      lastStepRow ? `最新 ${escapeHtmlLite(lastStepRow.date)}：${Number(lastStepRow.steps).toLocaleString()} 步` : '尚未收到步數',
      lastStepRow ? `共收到 ${myDaily.filter(r => Number(r.steps) > 0).length} 天步數（代表手機 Health Connect 權限已開通）` : '請檢查 Health Connect 步數讀取權限'
    ),
    card(
      '😴 睡眠 & 💓 靜止心率',
      sleepRecent ? 'ok' : (lastSleepRow || lastRhrRow ? 'warn' : 'none'),
      lastSleepRow ? `最新 ${escapeHtmlLite(lastSleepRow.date)}：${sleepHours(lastSleepRow)}` : '尚未收到睡眠',
      lastSleepRow
        ? (sleepRecent
          ? `靜止心率 ${lastRhrRow ? lastRhrRow.resting_hr + ' bpm' : '—'} • 手錶睡眠同步正常`
          : `⚠️ 睡眠只到 ${escapeHtmlLite(lastSleepRow.date)}，近期為空白！請檢查手錶 App 是否斷開 Health Connect 同步`)
        : '手錶 App 尚未將睡眠/心率寫入 Health Connect / Apple 健康'
    ),
    card(
      '🏃 手機運動紀錄',
      actRecent ? 'ok' : (myMobileActs.length ? 'warn' : 'none'),
      myMobileActs.length ? `共 ${myMobileActs.length} 筆（最新 ${escapeHtmlLite(String(lastActRow.date).slice(0, 10))}）` : '0 筆運動',
      myMobileActs.length
        ? (actRecent
          ? `最近一筆：${escapeHtmlLite(lastActRow.type)} ${lastActRow.duration} 分`
          : `⚠️ 最新運動停在 ${escapeHtmlLite(String(lastActRow.date).slice(0, 10))}！近 14 天無手錶運動寫入 Health Connect（或由 Strava App 紀錄被自動略過）`)
        : '注意：由 Strava App 寫入手機的運動會自動略過，只收手錶原生 App 寫入的運動'
    )
  ].join('');

  if (dailyCountEl) dailyCountEl.textContent = `共 ${myDaily.length} 天`;
  if (actCountEl) actCountEl.textContent = `共 ${myMobileActs.length} 筆`;

  dailyTbody.innerHTML = myDaily.length === 0
    ? '<tr><td colspan="8" class="p-4 text-center text-slate-500">此英雄尚無 daily_health 資料</td></tr>'
    : myDaily.slice(0, 30).map(r => {
      const slp = r.sleep_minutes != null
        ? `<span class="text-cyan-300">${sleepHours(r)}</span> <span class="text-slate-500 text-[10px]">(${escapeHtmlLite(r.bed_time || '?')}~${escapeHtmlLite(r.wake_time || '?')})</span>`
        : '<span class="text-slate-600">null</span>';
      return `<tr class="hover:bg-slate-900/60">
        <td class="p-2 font-bold text-white whitespace-nowrap">${escapeHtmlLite(r.date)}</td>
        <td class="p-2 ${Number(r.steps) > 0 ? 'text-emerald-300 font-bold' : 'text-slate-600'}">${r.steps != null ? Number(r.steps).toLocaleString() : 'null'}</td>
        <td class="p-2">${r.active_kcal != null ? Number(r.active_kcal).toLocaleString() : '<span class="text-slate-600">null</span>'}</td>
        <td class="p-2">${r.active_minutes != null ? r.active_minutes : '<span class="text-slate-600">null</span>'}</td>
        <td class="p-2 whitespace-nowrap">${slp}</td>
        <td class="p-2 ${r.resting_hr != null ? 'text-rose-300' : 'text-slate-600'}">${r.resting_hr != null ? r.resting_hr + ' bpm' : 'null'}</td>
        <td class="p-2 ${r.hrv_ms != null ? 'text-amber-300' : 'text-slate-600'}">${r.hrv_ms != null ? r.hrv_ms + ' ms' : 'null'}</td>
        <td class="p-2 ${r.spo2_pct != null ? 'text-sky-300' : 'text-slate-600'}">${r.spo2_pct != null ? r.spo2_pct + '%' : 'null'}</td>
      </tr>`;
    }).join('');

  actTbody.innerHTML = myMobileActs.length === 0
    ? '<tr><td colspan="6" class="p-4 text-center text-slate-500">此英雄尚無 health_connect / apple_health 運動紀錄</td></tr>'
    : myMobileActs.slice(0, 30).map(a => {
      const srcMeta = typeof window.getActivitySourceMeta === 'function' ? window.getActivitySourceMeta(a) : { icon: '📱', label: a.source };
      const dupTxt = a.duplicateOf
        ? `<span class="text-emerald-300 text-[10px]">🔗 與 #${escapeHtmlLite(String(a.duplicateOf))} 重疊去重</span>`
        : `<span class="text-slate-400 text-[10px]">${escapeHtmlLite(srcMeta.brand || srcMeta.label || a.source)}</span>`;
      return `<tr class="hover:bg-slate-900/60">
        <td class="p-2 text-white whitespace-nowrap">${escapeHtmlLite(a.date || a.time)}</td>
        <td class="p-2"><span class="font-bold text-amber-300">${escapeHtmlLite(a.type)}</span> <span class="text-slate-400">${escapeHtmlLite(a.title || '')}</span></td>
        <td class="p-2">${a.duration} 分</td>
        <td class="p-2">${a.avgHr || 0} / ${a.maxHr || 0}</td>
        <td class="p-2">${Math.round(a.rawCalories ?? a.calories ?? 0)}</td>
        <td class="p-2">${dupTxt}</td>
      </tr>`;
    }).join('');
}

window.addEventListener('gameStateSynced', () => { try { renderMobileSyncSection(); } catch (e) { console.error(e); } });
document.addEventListener('input', (e) => { if (e.target?.id?.startsWith('mobile-sync-')) e.target.dataset.dirty = '1'; });
document.addEventListener('change', (e) => { if (e.target?.id?.startsWith('mobile-sync-')) e.target.dataset.dirty = '1'; });

// =====================================================================
// 9. 📱 手機同步資料片 (八/九/十/十一) — GM 參數面板
//    參數存於 game_config.mobile_modes_config，由 syncAllSettingsToSupabase 一併儲存
// =====================================================================
const MM_FIELD_META = {
  expedition: {
    intro: '全服合作推進地圖：<b>每日里程 = min(步數, 每日上限) ÷ 每公里步數 ＋ 有效運動分鐘 × 每分鐘里程 ＋ 騎車距離 × 騎車折算 ＋ 游泳距離 × 游泳折算</b>，再乘上當日限時加成倍率。全服累計抵達終點即勝利，公會依里程排名。',
    fields: [
      ['routeName', '路線名稱', '顯示在前台的遠征名稱', 'text'],
      ['routeKm', '🏁 終點里程 (km)【勝利條件】', '全服累計里程達到此數字即遠征成功。建議：人數 × 賽季週數 × 15 km', 'number', 1],
      ['stepsPerKm', '每公里步數', '一般成人約 1,300 步 = 1 km', 'number', 1],
      ['dailyStepCap', '每人每日步數上限', '防止刷步數；超過的步數不計', 'number', 1],
      ['workoutKmPerMin', '有效運動每分鐘里程 (km)', '讓重訓/健身房訓練也能推進；0.05 = 60 分鐘換 3 km', 'number', 0.01],
      ['rideFactor', '騎車距離折算', '騎車比走路省力，1 km 騎車 = 0.3 km', 'number', 0.1],
      ['swimFactor', '游泳距離折算', '游泳距離短但很累，1 km 游泳 = 4 km', 'number', 0.1],
      ['checkpoints', '地圖城市 (每行「名稱:里程」)', '抵達的城市會在前台亮起 🚩，最後一站建議等於終點里程', 'textarea']
    ]
  },
  dream: {
    intro: '每天最多 100 分 ＝ <b>😴 睡得夠 (睡滿目標時數拿滿) ＋ ⏰ 準時睡 (跟自己平常的上床時間比，差越多分數越少) ＋ ⚔️ 白天有運動 (有效運動累計滿目標分鐘拿滿)</b>。每天的分數 × 限時加成倍率 = 對夢魘的傷害。全服把夢魘血量打完即勝利，公會看平均每人傷害排名。',
    fields: [
      ['sleepTargetMin', '睡眠目標 (分鐘)', '睡滿此時長拿滿睡眠分；睡更久不再加分 (420 = 7 小時)', 'number', 10],
      ['sleepPts', '睡眠分上限', '', 'number', 1],
      ['regularityPts', '規律分上限', '', 'number', 1],
      ['regularityToleranceMin', '「準時睡」容許差距 (分鐘)', '比平常的上床時間早/晚超過這麼多分鐘 → 準時睡拿 0 分；差一半拿一半', 'number', 5],
      ['regularityWindowDays', '「平常上床時間」參考天數', '用最近幾晚的上床時間 (取中間值) 當作你的「平常」', 'number', 1],
      ['workoutPts', '攻擊分上限 (白天運動)', '只睡不動最多拿 睡眠分+規律分', 'number', 1],
      ['workoutFullMin', '攻擊分滿分所需運動分鐘', '當天有效運動累計達此分鐘數拿滿攻擊分', 'number', 5],
      ['nightmareHpPerHeroDay', '👹 夢魘血量係數【勝利條件】', '夢魘總血量 = 英雄數 × 賽季天數 × 此係數。60 = 大家平均每天拿 60 分剛好打完', 'number', 1]
    ]
  },
  flame: {
    intro: '每人每天三道火：<b>① 活動分鐘 ≥ 目標或完成一次有效運動　② 步數 ≥ 目標　③ 睡眠 ≥ 目標</b>。公會所有「有資料」成員都點亮 ≥ N 道火 → 聖火熱度 +1 (× 限時加成倍率)；有成員 0 道火 → 熱度 − 衰減值。賽季結束時聖火等級最高的公會獲勝。',
    fields: [
      ['activeMinGoal', '🔥① 中高強度活動分鐘目標', '心率 ≥ 最大心率 64% 的分鐘數；完成一次有效運動也直接點亮', 'number', 5],
      ['stepGoal', '🔥② 每日步數目標', '', 'number', 500],
      ['sleepGoalMin', '🔥③ 睡眠目標 (分鐘)', '420 = 7 小時', 'number', 10],
      ['minRingsForGuildDay', '公會「全員點火」門檻 (每人至少幾道火)【勝利條件】', '設 3 = 超硬核，設 1 = 輕鬆模式', 'number', 1],
      ['decayOnZeroDay', '有成員 0 道火時聖火熱度扣除', '設 0 = 不懲罰', 'number', 0.5]
    ]
  },
  monastery: {
    intro: '跟自己比：<b>每日修為 = 訓練分 (TRIMP) + 恢復分 (睡眠) + 活動分 (活動分鐘)</b> × 限時加成倍率；靜止心率比個人基準下降可得「靜心加成」；急慢性負荷比過高且睡眠不足 → 走火入魔 (當日修為打折)。依總修為晉級境界。',
    fields: [
      ['trimpCap', '訓練分滿分 TRIMP', '當日 TRIMP 達此值拿滿訓練分 (約一次 60 分鐘中高強度訓練)', 'number', 5],
      ['trainPts', '訓練分上限', '', 'number', 1],
      ['sleepTargetMin', '恢復分睡眠目標 (分鐘)', '', 'number', 10],
      ['recoveryPts', '恢復分上限', '', 'number', 1],
      ['activeMinGoal', '活動分滿分活動分鐘', '', 'number', 5],
      ['activePts', '活動分上限', '', 'number', 1],
      ['baselineDays', '靜止心率基準天數', '賽季開始後前 N 天 (有資料) 的中位數 = 個人基準', 'number', 1],
      ['rhrPointsPerBpm', '靜止心率每下降 1 bpm 修為', '心肺進步的長期獎勵', 'number', 10],
      ['acwrLimit', '走火入魔：負荷比上限 (ACWR)', '近 7 天 ÷ (近 28 天 ÷ 4)；運動科學常用 1.5 為受傷風險警戒線', 'number', 0.1],
      ['poorSleepMin', '走火入魔：近 3 晚平均睡眠低於 (分鐘)', '360 = 6 小時', 'number', 10],
      ['acwrMinChronic', '走火入魔：最低慢性負荷 (每週 TRIMP)', '慢性負荷低於此值不判定，避免剛開始運動的新手被誤判', 'number', 10],
      ['overtrainPenalty', '走火入魔當日修為倍率', '0.5 = 打五折', 'number', 0.05],
      ['ranks', '🏯 境界門檻 (每行「名稱:修為」)【勝利條件】', '例如 宗師:7200', 'textarea']
    ]
  }
};

function renderMobileModePanel(mode) {
  const panel = document.getElementById('panel-settings-mobile-mode');
  if (!panel) return;
  const isMM = window.isMobileMode && window.isMobileMode(mode);
  panel.classList.toggle('hidden', !isMM);
  if (!isMM) { panel.dataset.mode = ''; return; }
  const meta = window.MOBILE_MODE_META[mode];
  const def = MM_FIELD_META[mode];
  const cfg = window.getMobileModesConfig(gameState)[mode];
  const enabled = Boolean(gameState?.gmOps?.mobileSync?.enabled);
  if (panel.dataset.mode !== mode) {
    panel.dataset.mode = mode;
    panel.innerHTML = `
      <div class="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-bold text-white">${meta.icon} 資料片${meta.num} • ${meta.name} 參數設定</h2>
        <span id="mm-panel-sync-warning" class="text-[11px] font-bold"></span>
      </div>
      <p class="text-[12px] text-slate-300 leading-relaxed bg-slate-950/60 border border-slate-800 rounded-xl p-3">📐 ${def.intro}<br><span class="text-slate-500">⚡ 限時加成活動自動套用；缺資料只是拿不到該項分數，不會倒扣。前台會用目前的參數顯示同樣的公式說明。</span></p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        ${def.fields.map(([key, label, help, type, step]) => `
          <div class="${type === 'textarea' ? 'sm:col-span-2' : ''}">
            <label class="font-bold text-slate-300 block mb-1">${label}</label>
            ${type === 'textarea'
              ? `<textarea id="cfg-mm-${mode}-${key}" rows="4" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono outline-none"></textarea>`
              : `<input id="cfg-mm-${mode}-${key}" type="${type === 'number' ? 'number' : 'text'}" ${type === 'number' ? `min="0" step="${step || 1}"` : ''} class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono outline-none">`}
            ${help ? `<p class="text-[11px] text-slate-500 mt-1">${help}</p>` : ''}
          </div>`).join('')}
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" onclick="resetMobileModePanelDefaults('${mode}')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold rounded-xl text-xs">↺ 填入建議預設值</button>
        <button type="button" onclick="saveMobileModeSettings()" class="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs">💾 儲存資料片參數</button>
      </div>`;
  }
  def.fields.forEach(([key]) => {
    const el = document.getElementById(`cfg-mm-${mode}-${key}`);
    if (el && !el.dataset.dirty && document.activeElement !== el) el.value = cfg[key];
  });
  const warn = document.getElementById('mm-panel-sync-warning');
  if (warn) {
    warn.className = `text-[11px] font-bold ${enabled ? 'text-emerald-400' : 'text-rose-400'}`;
    warn.innerText = enabled ? '🟢 手機同步已啟用' : '⛔ 請先開啟「手機同步 App」才能使用此資料片';
  }
}

function resetMobileModePanelDefaults(mode) {
  const def = MM_FIELD_META[mode];
  def.fields.forEach(([key]) => {
    const el = document.getElementById(`cfg-mm-${mode}-${key}`);
    if (el) { el.value = window.MOBILE_MODE_DEFAULTS[mode][key]; el.dataset.dirty = '1'; }
  });
  showAdminToast('已填入建議預設值，按「儲存資料片參數」後生效');
}

/** 從面板收集目前資料片的參數，其他資料片沿用已儲存的設定 */
function collectMobileModesConfig() {
  const saved = JSON.parse(JSON.stringify(gameState?.mobileModes || {}));
  const panel = document.getElementById('panel-settings-mobile-mode');
  const mode = panel?.dataset?.mode;
  if (mode && MM_FIELD_META[mode]) {
    const cur = { ...(window.MOBILE_MODE_DEFAULTS[mode] || {}), ...(saved[mode] || {}) };
    MM_FIELD_META[mode].fields.forEach(([key, , , type]) => {
      const el = document.getElementById(`cfg-mm-${mode}-${key}`);
      if (!el) return;
      if (type === 'number') {
        const v = parseFloat(el.value);
        if (Number.isFinite(v) && v >= 0) cur[key] = v;
      } else {
        const v = String(el.value || '').trim();
        if (v) cur[key] = v;
      }
    });
    saved[mode] = cur;
  }
  return saved;
}

async function saveMobileModeSettings() {
  await syncAllSettingsToSupabase('🎉 手機同步資料片參數已儲存！前台計分與規則說明已同步更新。');
}

function refreshMobileModeOptions() {
  const enabled = Boolean(gameState?.gmOps?.mobileSync?.enabled);
  document.querySelectorAll('#cfg-active-mode option[data-mobile]').forEach(opt => {
    opt.disabled = !enabled && opt.value !== (gameState?.activeMode || '');
    opt.textContent = opt.textContent.replace(/ ⛔需先開啟手機同步$/, '') + (enabled ? '' : ' ⛔需先開啟手機同步');
  });
}

window.addEventListener('gameStateSynced', () => {
  try {
    refreshMobileModeOptions();
    renderMobileModePanel(document.getElementById('cfg-active-mode')?.value || gameState?.activeMode);
  } catch (e) { console.error(e); }
});

// =====================================================================
// ⚔️ 資料片四「雙城激戰」陣營分配編輯器
// =====================================================================
function collectFactionAssign() {
  const box = document.getElementById('cfg-faction-assign');
  const prev = (gameState?.faction?.guildAssign) || {};
  if (!box || !box.querySelector('select')) return { ...prev };
  const out = {};
  // 保留目前名單中已不存在的公會設定 (例如暫時沒有成員的公會)，避免誤刪
  const shown = new Set();
  box.querySelectorAll('select[data-guild]').forEach(sel => {
    const g = sel.dataset.guild; shown.add(g);
    if (sel.value === '1' || sel.value === '2') out[g] = Number(sel.value);
  });
  Object.entries(prev).forEach(([g, v]) => { if (!shown.has(g) && (v === 1 || v === 2)) out[g] = v; });
  return out;
}

function updateFactionAssignPreview() {
  const box = document.getElementById('cfg-faction-assign');
  if (!box) return;
  const guilds = gameState?.guilds || [];
  const split = window.computeFactionSplit(guilds.map(g => g.name), collectFactionAssign());
  const count = side => split[side].reduce((s, n) => s + ((guilds.find(g => g.name === n)?.members || []).length), 0);
  const f1 = document.getElementById('cfg-faction1-name')?.value || '🟢 均衡聯盟';
  const f2 = document.getElementById('cfg-faction2-name')?.value || '🔴 狂怒部落';
  const c1 = count(1), c2 = count(2);
  const prev = document.getElementById('cfg-faction-assign-preview');
  if (prev) {
    prev.innerHTML = `<span class="text-emerald-300">${escapeHtmlLite(f1)}：${split[1].length} 公會 / ${c1} 人</span>　vs　<span class="text-rose-300">${escapeHtmlLite(f2)}：${split[2].length} 公會 / ${c2} 人</span>`
      + (Math.abs(c1 - c2) >= 2 ? '　<span class="text-amber-300">⚠️ 人數差 ' + Math.abs(c1 - c2) + ' 人</span>' : '　<span class="text-emerald-400">✅ 人數均衡</span>');
  }
  box.querySelectorAll('select[data-guild]').forEach(sel => {
    const side = split[1].includes(sel.dataset.guild) ? 1 : 2;
    const tag = sel.parentElement.querySelector('.faction-auto-tag');
    if (tag) tag.textContent = sel.value === 'auto' ? `→ 自動分到 ${side === 1 ? '🟢' : '🔴'}` : '';
  });
}

function escapeHtmlLite(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderFactionAssignEditor() {
  const box = document.getElementById('cfg-faction-assign');
  if (!box || !window.computeFactionSplit) return;
  const guilds = gameState?.guilds || [];
  if (!guilds.length) { box.innerHTML = '<div class="text-slate-500">尚無公會資料</div>'; return; }
  const assign = gameState?.faction?.guildAssign || {};
  box.innerHTML = guilds.map(g => {
    const v = assign[g.name] === 1 || assign[g.name] === 2 ? String(assign[g.name]) : 'auto';
    const members = (g.members || []).map(m => typeof m === 'string' ? m : (m && m.name) || '').filter(Boolean);
    return `<div class="flex flex-wrap items-center gap-2">
      <span class="font-bold text-white min-w-[7rem]">${escapeHtmlLite(g.badge || '🛡️')} ${escapeHtmlLite(g.name)}</span>
      <span class="text-[10px] text-slate-500 flex-1">${members.length} 人：${escapeHtmlLite(members.join('、'))}</span>
      <select data-guild="${escapeHtmlLite(g.name)}" onchange="updateFactionAssignPreview()" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white">
        <option value="auto" ${v === 'auto' ? 'selected' : ''}>自動</option>
        <option value="1" ${v === '1' ? 'selected' : ''}>🟢 守護陣營</option>
        <option value="2" ${v === '2' ? 'selected' : ''}>🔴 狂怒陣營</option>
      </select>
      <span class="faction-auto-tag text-[10px] text-slate-400 w-24"></span>
    </div>`;
  }).join('') + '<div id="cfg-faction-assign-preview" class="pt-2 border-t border-slate-800 text-[11px] font-bold"></div>';
  updateFactionAssignPreview();
}

// =====================================================================
// 🐉 資料片三「世界 Boss」形象圖庫 (10 種，由可愛 → 兇悍)
// 圖片放在 public/img/bosses/；選擇結果存在 boss_config.avatar
// =====================================================================
const BOSS_GALLERY = [
  { file: 'boss01.webp', name: '🍮 胖嘟嘟布丁史萊姆', level: 1 },
  { file: 'boss02.webp', name: '🐹 貪吃倉鼠大王', level: 2 },
  { file: 'boss03.webp', name: '🐼 懶惰沙發熊貓', level: 3 },
  { file: 'boss04.webp', name: '🍗 炸雞魔像', level: 4 },
  { file: 'boss05.webp', name: '🧋 手搖飲章魚怪', level: 5 },
  { file: 'boss06.webp', name: '🦉 熬夜貓頭鷹巫師', level: 6 },
  { file: 'boss07.webp', name: '🦍 鋼鐵機械巨猿', level: 7 },
  { file: 'boss08.webp', name: '🐕‍🔥 熔岩地獄犬', level: 8 },
  { file: 'boss09.webp', name: '🐉 深淵骨龍', level: 9 },
  { file: 'boss10.webp', name: '🌩️ 墮落雷神・索爾', level: 10 }
];
window.BOSS_GALLERY = BOSS_GALLERY;

function bossGallerySrc(item) { return '/img/bosses/' + item.file; }

function renderBossGallery() {
  const box = document.getElementById('cfg-boss-gallery');
  if (!box) return;
  const hidden = document.getElementById('cfg-boss-avatar');
  const current = (hidden && hidden.value) || gameState?.boss?.avatar || '';
  if (hidden && !hidden.value) hidden.value = '';
  const fierce = ['可愛', '可愛', '呆萌', '搞笑', '調皮', '詭異', '兇猛', '兇暴', '恐怖', '毀滅'];
  box.innerHTML = BOSS_GALLERY.map((b, i) => {
    const src = bossGallerySrc(b);
    const on = current && (current === src || current.endsWith(src));
    return `<button type="button" onclick="selectBossGallery(${i})" title="${escapeHtmlLite(b.name)}"
      class="relative rounded-xl overflow-hidden border-2 ${on ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-slate-700 hover:border-slate-500'} bg-slate-950 aspect-square">
      <img src="${src}" alt="" class="w-full h-full object-cover" loading="lazy">
      <span class="absolute top-1 left-1 text-[9px] font-black px-1.5 rounded bg-black/70 ${i < 3 ? 'text-pink-300' : i < 6 ? 'text-amber-300' : 'text-rose-400'}">Lv${b.level} ${fierce[i]}</span>
      ${on ? '<span class="absolute bottom-1 right-1 text-xs bg-amber-500 text-black font-black rounded px-1">✓</span>' : ''}
    </button>`;
  }).join('');
  const note = document.getElementById('cfg-boss-gallery-note');
  if (note) {
    const hit = BOSS_GALLERY.find(b => current && current.endsWith(bossGallerySrc(b)));
    note.textContent = hit ? `目前形象：${hit.name}（記得按「儲存 Boss 參數」才會生效）` : (current ? '目前使用自訂圖片網址；點選上方任一張即可替換。' : '尚未選擇，前台會顯示預設圖片。');
  }
}

function selectBossGallery(i) {
  const b = BOSS_GALLERY[i];
  if (!b) return;
  const hidden = document.getElementById('cfg-boss-avatar');
  if (hidden) hidden.value = bossGallerySrc(b);
  if (document.getElementById('cfg-boss-gallery-apply-name')?.checked) {
    const nameEl = document.getElementById('cfg-boss-name');
    if (nameEl) nameEl.value = b.name;
  }
  renderBossGallery();
}

// =====================================================================
// ✏️ 英雄改名：所有以英雄名字為 key 的資料一起搬家
//   1. 優先呼叫後端 admin-mobile 的 rename_hero (可以改手機綁定 / 每日健康等網站無權限修改的資料表)
//   2. 後端尚未部署時 (例如還沒導入手機 App)，改用網站可寫的部分：英雄、運動紀錄、GM 稱號/手動徽章
// =====================================================================
async function renameHeroEverywhere(oldName, newName) {
  const rawOld = typeof window.rawDbText === 'function' ? window.rawDbText(oldName) : oldName;
  const rawNew = typeof window.rawDbText === 'function' ? window.rawDbText(newName) : newName;
  try {
    const r = await callAdminMobile('rename_hero', { old_name: rawOld, new_name: rawNew });
    showAdminToast(`✏️ 改名完成：${oldName} → ${newName}（運動 ${r.counts?.activities ?? 0} 筆、健康 ${r.counts?.daily_health ?? 0} 天、手機 ${r.counts?.devices ?? 0} 支）`);
    return r;
  } catch (e) {
    const notDeployed = /404|not found|Failed to fetch|NOT_FOUND|unknown_action/i.test(String(e.message || e));
    if (!notDeployed) throw new Error('改名失敗：' + e.message);
    if ((gameState?.devices || []).some(d => d.hero === oldName || d.hero === rawOld) || (gameState?.dailyHealth || []).some(d => d.hero === oldName || d.hero === rawOld)) {
      throw new Error('這位英雄有手機 App 資料，需要先部署 App 後端 (GitHub Actions → Deploy mobile Edge Functions) 才能完整改名。');
    }
    // 網站端備援：英雄列改名 + 運動紀錄 + GM 設定 key
    await window.supabase.update('heroes', `name=eq.${encodeURIComponent(rawOld)}`, { name: rawNew });
    await window.supabase.update('activities', `hero=eq.${encodeURIComponent(rawOld)}`, { hero: rawNew });
    const ops = ensureGMOpsState();
    let changed = false;
    ['heroFx', 'manualBadges'].forEach(k => {
      if (ops[k] && Object.prototype.hasOwnProperty.call(ops[k], oldName)) { ops[k][newName] = ops[k][oldName]; delete ops[k][oldName]; changed = true; }
      if (ops[k] && rawOld !== oldName && Object.prototype.hasOwnProperty.call(ops[k], rawOld)) { ops[k][rawNew] = ops[k][rawOld]; delete ops[k][rawOld]; changed = true; }
    });
    if (changed) {
      const rawOps = typeof window.deepRaw === 'function' ? window.deepRaw(ops) : ops;
      await window.supabase.insert('game_config', { key: 'gm_ops_config', value: rawOps });
    }
    await recordHeroAlias(rawOld, rawNew);
    showAdminToast(`✏️ 改名完成：${oldName} → ${newName}`);
    return { ok: true, fallback: true };
  }
}

// 改名對照表 (game_config.hero_aliases)：鏡像同步會把舊遊戲資料庫的舊名換成新名，避免出現重複英雄
async function recordHeroAlias(oldName, newName) {
  let aliases = {};
  try {
    const rows = await window.supabase.fetch('game_config', 'key=eq.hero_aliases&select=key,value');
    const row = (rows || []).find(r => r && r.key === 'hero_aliases');
    if (row && row.value && typeof row.value === 'object' && !Array.isArray(row.value)) aliases = { ...row.value };
  } catch (e) { /* 沒有就建立新的 */ }
  Object.keys(aliases).forEach(k => { if (aliases[k] === oldName) aliases[k] = newName; });
  aliases[oldName] = newName;
  delete aliases[newName];
  await window.supabase.insert('game_config', { key: 'hero_aliases', value: aliases });
}
