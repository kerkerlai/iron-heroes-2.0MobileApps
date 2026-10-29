/**
 * 鋼鐵英雄紀元 2.0 — GM 後台「🛰️ 資料來源與 Strava 爬蟲開關」
 * -------------------------------------------------------------------------
 * game_config.data_source_config.mode：
 *   'mirror'      (預設) 平行測試期：GitHub「Mirror」排程從舊資料庫複製新資料；新 repo 的 Strava 爬蟲只報到不抓
 *   'strava'      停止鏡像 + 開啟爬蟲：新 repo 的 Strava 爬蟲自己抓 Strava（與手機同步 App 並行）；Mirror 排程停止複製
 *   'mobile_only' 停止鏡像 + 關閉爬蟲：100% 純手機 App 同步模式（含手機端 Strava 寫入 Apple Health / Health Connect 的紀錄）；兩個排程都只報到不抓
 * 這個按鈕「不會」去改 GitHub 設定；兩個排程每次執行前都會讀這個開關 (scripts/data_source.py)。
 */
(function () {
  const CFG_KEY = 'data_source_config';
  const ST_MIRROR = 'data_source_status_mirror';
  const ST_CRAWLER = 'data_source_status_crawler';
  const STALE_MIN = 75; // 排程每 30 分鐘一次，超過 75 分鐘沒報到視為異常
  const VALID_MODES = ['mirror', 'strava', 'mobile_only'];

  const state = { cfg: { mode: 'mirror', history: [] }, mirror: null, crawler: null, loaded: false };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODE_LABEL = {
    mirror: '🔁 鏡像舊資料庫 (平行測試期)',
    strava: '🏃 開啟 Strava 爬蟲 (停止鏡像・雙軌並行)',
    mobile_only: '🛑 關閉 Strava 爬蟲 (停止鏡像・純手機 App)'
  };

  function nowStr() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '/');
  }
  function minutesAgo(at) {
    if (!at) return null;
    const t = Date.parse(String(at).replace(/\//g, '-').replace(' ', 'T') + '+08:00');
    return isNaN(t) ? null : Math.round((Date.now() - t) / 60000);
  }
  function agoText(at) {
    const m = minutesAgo(at);
    if (m == null) return '從未報到';
    if (m < 1) return '剛剛';
    if (m < 60) return `${m} 分鐘前`;
    if (m < 1440) return `${Math.round(m / 60)} 小時前`;
    return `${Math.round(m / 1440)} 天前`;
  }

  async function load() {
    const rows = await window.supabase.fetch('game_config', `select=key,value&key=in.(${CFG_KEY},${ST_MIRROR},${ST_CRAWLER})`);
    const map = {}; (rows || []).forEach(r => { map[r.key] = r.value; });
    state.cfg = Object.assign({ mode: 'mirror', history: [] }, map[CFG_KEY] || {});
    if (!VALID_MODES.includes(state.cfg.mode)) state.cfg.mode = 'mirror';
    state.mirror = map[ST_MIRROR] || null;
    state.crawler = map[ST_CRAWLER] || null;
    state.loaded = true;
  }

  function statusLine(name, st, activeMode, me) {
    if (!st) return `<div class="text-rose-300">❌ ${name}：從未報到 — GitHub 排程尚未啟用或 Secrets 未設定</div>`;
    const m = minutesAgo(st.at);
    const stale = m == null || m > STALE_MIN;
    let what = '';
    if (st.result === 'ok' && me === 'mirror') what = `複製完成 (新增英雄 ${st.heroesAdded || 0}、紀錄 ${st.activitiesAdded || 0})`;
    else if (st.result === 'ok' && me === 'crawler') what = `抓取完成 (新增 ${st.added || 0} 筆，總計 ${st.total || '?'})`;
    else if (st.result === 'skipped') what = me === 'crawler' && activeMode === 'mobile_only' ? '🛑 已由 GM 關閉爬蟲 (只報到、不抓 Strava)' : '⏸️ 已停用 / 只報到未動作 (非目前資料來源)';
    else if (st.result === 'error') what = `⚠️ 錯誤：${esc(st.message || '')}`;
    const cookie = me === 'crawler' ? (st.cookie ? '　🍪 STRAVA_COOKIE 已設定' : '　<span class="text-amber-300">🍪 STRAVA_COOKIE 未設定</span>') : '';
    const color = st.result === 'error' || stale ? 'text-amber-300' : 'text-emerald-300';
    const active = (activeMode === 'mirror' && me === 'mirror') || (activeMode === 'strava' && me === 'crawler');
    return `<div class="${color}">${stale || st.result === 'error' ? '⚠️' : '✅'} ${name}${active ? ' <span class="text-[10px] px-1.5 rounded bg-emerald-900/60 text-emerald-200">負責中</span>' : ' <span class="text-[10px] px-1.5 rounded bg-slate-800 text-slate-400">已暫停</span>'}：${esc(st.at)} (${agoText(st.at)})　${what}${cookie}${stale ? '　<span class="text-amber-300">超過 ' + STALE_MIN + ' 分鐘沒報到，請到 GitHub Actions 檢查</span>' : ''}</div>`;
  }

  function syncMobileTopPill() {
    const pill = document.getElementById('mobile-sync-status-pill');
    if (!pill) return;
    const enabled = Boolean(document.getElementById('mobile-sync-enabled')?.checked ?? window.gameState?.gmOps?.mobileSync?.enabled);
    const mode = state.cfg.mode || 'mirror';
    if (!enabled) {
      pill.className = 'px-3 py-1 rounded-full text-[11px] font-bold border bg-slate-800 text-slate-300 border-slate-700 cursor-pointer';
      pill.innerText = '⏸️ 手機同步未啟用';
      return;
    }
    if (mode === 'mobile_only') {
      pill.className = 'px-3 py-1 rounded-full text-[11px] font-bold border bg-amber-950 text-amber-300 border-amber-600 cursor-pointer hover:bg-amber-900/80 transition';
      pill.innerText = '🟢 已啟用 (🛑 已停鏡像 & 已關 Strava 爬蟲・純手機模式)';
    } else if (mode === 'strava') {
      pill.className = 'px-3 py-1 rounded-full text-[11px] font-bold border bg-emerald-950 text-emerald-300 border-emerald-700 cursor-pointer hover:bg-emerald-900/80 transition';
      pill.innerText = '🟢 已啟用 (🏃 已停鏡像・與 Strava 爬蟲並行中)';
    } else {
      pill.className = 'px-3 py-1 rounded-full text-[11px] font-bold border bg-sky-950 text-sky-300 border-sky-700 cursor-pointer hover:bg-sky-900/80 transition';
      pill.innerText = '🟢 已啟用 (🔁 舊庫鏡像並行中 · 點此切換爬蟲)';
    }
  }

  function render() {
    syncMobileTopPill();
    const box = document.getElementById('data-source-body');
    if (!box) return;
    if (!state.loaded) { box.innerHTML = '<div class="text-slate-400">讀取中…</div>'; return; }
    const mode = state.cfg.mode;
    const pill = document.getElementById('data-source-pill');
    if (pill) {
      pill.textContent = MODE_LABEL[mode] || MODE_LABEL.mirror;
      const pillCls = mode === 'mobile_only'
        ? 'bg-amber-950 text-amber-300 border-amber-600'
        : (mode === 'strava' ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-sky-950 text-sky-300 border-sky-700');
      pill.className = `px-3 py-1 rounded-full text-[11px] font-bold border ${pillCls}`;
    }
    const card = (m, title, badge, desc) => `
      <label class="block cursor-pointer rounded-2xl border p-3.5 transition ${mode === m ? 'border-amber-500 bg-amber-950/25 shadow-lg shadow-amber-950/30' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'}">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 font-bold text-white"><input type="radio" name="data-source-mode" value="${m}" ${mode === m ? 'checked' : ''} class="accent-amber-500"> ${title}</div>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${mode === m ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}">${mode === m ? '目前啟用' : badge}</span>
        </div>
        <div class="text-[11px] text-slate-400 mt-1.5 leading-relaxed">${desc}</div>
      </label>`;
    const last = (state.cfg.history || []).slice(-1)[0];

    // 快捷按鈕：讓 GM 可以一鍵「停止鏡像」或「開 / 關 Strava 爬蟲」
    let quickButtons = '';
    if (mode === 'mirror') {
      quickButtons = `
        <button type="button" onclick="DataSourceGM.showModal('strava')" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3.5 py-2 rounded-xl transition">⏹️ 停止鏡像（改由 2.0 爬蟲抓 Strava）</button>
        <button type="button" onclick="DataSourceGM.showModal('mobile_only')" class="bg-rose-700 hover:bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl transition">🛑 停止鏡像 ＆ 關閉 Strava 爬蟲（純手機 App）</button>`;
    } else if (mode === 'strava') {
      quickButtons = `
        <button type="button" onclick="DataSourceGM.showModal('mobile_only')" class="bg-rose-700 hover:bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl transition">🛑 關閉雲端 Strava 爬蟲（切換為 100% 純手機 App）</button>`;
    } else if (mode === 'mobile_only') {
      quickButtons = `
        <button type="button" onclick="DataSourceGM.showModal('strava')" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3.5 py-2 rounded-xl transition">🟢 重新開啟雲端 Strava 爬蟲（雙軌並行）</button>`;
    }

    box.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        ${card('mirror', MODE_LABEL.mirror, '階段 1', '從 1.0 舊資料庫每 30 分鐘複製新英雄與紀錄（只新增不覆蓋）；2.0 自己的 Strava 爬蟲只報到不抓。')}
        ${card('strava', MODE_LABEL.strava, '階段 2', '<b class="text-emerald-300">停止舊資料庫鏡像</b>，改由 2.0 自己的雲端 Strava 爬蟲每 30 分鐘抓取（與手機同步 App 雙軌並行、自動時間重疊去重）。')}
        ${card('mobile_only', MODE_LABEL.mobile_only, '階段 3・終極目標', '<b class="text-amber-300">停止舊庫鏡像 ＋ 關閉雲端 Strava 爬蟲</b>！全服 100% 由《鋼鐵英雄同步器》手機 App 同步（含小米手環透過手機端 Strava 寫入 Apple Health / Health Connect 的紀錄）。隨時可一鍵切回開啟爬蟲。')}
      </div>
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1 text-[11px]">
        <div class="font-bold text-slate-200 mb-1">📡 GitHub 雲端排程最後報到狀態</div>
        ${statusLine('🔁 舊庫鏡像同步 (Mirror)', state.mirror, mode, 'mirror')}
        ${statusLine('🏃 雲端 Strava 爬蟲', state.crawler, mode, 'crawler')}
        ${last ? `<div class="text-slate-500 pt-1">上次切換：${esc(last.at)} → ${esc(MODE_LABEL[last.mode] || last.mode)}</div>` : ''}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" onclick="DataSourceGM.requestSave()" class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl transition shadow-md">💾 套用上方勾選模式</button>
        ${quickButtons}
        <button type="button" onclick="DataSourceGM.refresh()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3.5 py-2 rounded-xl transition">🔄 重新整理狀態</button>
      </div>`;
  }

  function closeModal() { const m = document.getElementById('data-source-modal'); if (m) m.remove(); }

  function showModal(target) {
    closeModal();
    const toStrava = target === 'strava';
    const toMobileOnly = target === 'mobile_only';
    const crawlerOk = state.crawler && minutesAgo(state.crawler.at) != null && minutesAgo(state.crawler.at) <= STALE_MIN;
    const cookieOk = !!(state.crawler && state.crawler.cookie);
    const warn = toStrava && (!crawlerOk || !cookieOk)
      ? `<div class="bg-rose-950/60 border border-rose-700 text-rose-200 rounded-xl p-3 text-[12px]">⚠️ 本站的 Strava 爬蟲${!crawlerOk ? '最近沒有報到 (排程可能沒開或 Secrets 沒設)' : ''}${!crawlerOk && !cookieOk ? '，且' : ''}${!cookieOk ? ' STRAVA_COOKIE 未設定' : ''}。切換後可能抓不到資料，建議先到新 GitHub repo 確認。</div>` : '';

    let title = '🔁 切換回「鏡像舊資料庫」';
    let steps = '';
    if (toStrava) {
      title = '🏃 切換為「開啟 Strava 爬蟲 (停止鏡像・雙軌並行)」';
      steps = `
        <ol class="list-decimal pl-5 space-y-1.5">
          <li>切換後，本站會<b>立刻停止從 1.0 舊資料庫鏡像</b>，改由 2.0 自己的雲端 Strava 爬蟲抓取。</li>
          <li>可到 <b>「舊」遊戲的 GitHub 專案 → Actions → Strava to Supabase Cloud Crawler → Disable workflow</b> 關掉舊版爬蟲。</li>
          <li>手機同步 App 與雲端 Strava 爬蟲會雙軌並行（同一場運動自動時間重疊去重，不會重複算分）。</li>
        </ol>`;
    } else if (toMobileOnly) {
      title = '🛑 切換為「關閉 Strava 爬蟲 (停止鏡像・100% 純手機 App)」';
      steps = `
        <ol class="list-decimal pl-5 space-y-1.5">
          <li>切換後，<b>舊資料庫鏡像</b> 與 <b>雲端 Strava 網頁爬蟲</b> 都會立刻停止抓取！</li>
          <li>全服英雄的運動與健康數據將 100% 由《鋼鐵英雄同步器》手機 App 讀取手機內的 <b>Apple Health / Health Connect</b> 上傳。</li>
          <li>小米手環玩家只要在手機安裝 Strava App 並開啟寫入 Apple Health / Health Connect，手機同步器 App 就會直接從手機本地抓取 Strava 寫入的熱量與重訓，<b>完全不需要雲端爬蟲</b>！</li>
          <li>💡 若測試期間發現有玩家手機尚未設定好，你隨時可以回這裡一鍵切回「🏃 開啟 Strava 爬蟲」。</li>
        </ol>`;
    } else {
      steps = `
        <ol class="list-decimal pl-5 space-y-1.5">
          <li>恢復每 30 分鐘從 1.0 舊資料庫鏡像新英雄與運動紀錄；2.0 雲端 Strava 爬蟲暫停抓取。</li>
        </ol>`;
    }

    const div = document.createElement('div');
    div.id = 'data-source-modal';
    div.className = 'fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4';
    div.innerHTML = `
      <div class="bg-slate-900 border border-amber-600 rounded-3xl max-w-lg w-full p-5 space-y-3 text-sm text-slate-200 shadow-2xl">
        <h3 class="text-base font-black text-white">${title}</h3>
        ${warn}
        <div class="bg-amber-950/30 border border-amber-700/60 rounded-xl p-3 text-[12px] space-y-2">
          <div class="font-bold text-amber-300">📌 切換效果說明</div>
          ${steps}
        </div>
        <label class="flex items-center gap-2 text-[12px] cursor-pointer"><input type="checkbox" id="data-source-ack" class="accent-amber-500"> 我已確認要切換為此模式</label>
        <div class="flex justify-end gap-2">
          <button onclick="DataSourceGM.closeModal()" class="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold">取消</button>
          <button id="data-source-confirm" onclick="DataSourceGM.confirmSave('${target}')" class="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl font-bold">確認切換</button>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  async function requestSave() {
    const sel = document.querySelector('input[name="data-source-mode"]:checked');
    const target = sel ? sel.value : 'mirror';
    if (target === state.cfg.mode) { alert(`目前已經是「${MODE_LABEL[target]}」，不需要切換。`); return; }
    showModal(target);
  }

  async function confirmSave(target) {
    const ack = document.getElementById('data-source-ack');
    if (!ack || !ack.checked) { alert('請先勾選「我已確認要切換為此模式」'); return; }
    const history = (state.cfg.history || []).concat([{ at: nowStr(), mode: target, from: state.cfg.mode }]).slice(-20);
    const value = { mode: target, changedAt: nowStr(), history };
    try {
      await window.supabase.insert('game_config', { key: CFG_KEY, value, updated_at: new Date().toISOString() });
      state.cfg = value;
      closeModal();
      render();
      alert(`✅ 資料來源已切換為「${MODE_LABEL[target]}」！\nGitHub 雲端排程下次執行時立即生效（隨時可再切回）。`);
    } catch (e) {
      alert('❌ 儲存失敗：' + e.message);
    }
  }

  async function refresh() {
    try { await load(); } catch (e) { console.warn('[DataSource] 讀取失敗', e); }
    render();
  }

  window.DataSourceGM = { refresh, requestSave, confirmSave, showModal, closeModal, syncMobileTopPill, _state: state };
  document.addEventListener('DOMContentLoaded', () => { setTimeout(refresh, 300); });
})();
