/**
 * 鋼鐵英雄紀元 2.0 — GM 後台「🛰️ 資料來源」開關
 * -------------------------------------------------------------------------
 * game_config.data_source_config.mode：
 *   'mirror' (預設) 平行測試期：GitHub「Mirror」排程從舊資料庫複製新資料；新 repo 的 Strava 爬蟲只報到不抓
 *   'strava'        正式切換後：新 repo 的 Strava 爬蟲自己抓 Strava；Mirror 排程只報到不複製
 * 這個按鈕「不會」去改 GitHub 設定；兩個排程每次執行前都會讀這個開關 (scripts/data_source.py)。
 */
(function () {
  const CFG_KEY = 'data_source_config';
  const ST_MIRROR = 'data_source_status_mirror';
  const ST_CRAWLER = 'data_source_status_crawler';
  const STALE_MIN = 75; // 排程每 30 分鐘一次，超過 75 分鐘沒報到視為異常

  const state = { cfg: { mode: 'mirror', history: [] }, mirror: null, crawler: null, loaded: false };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODE_LABEL = { mirror: '🔁 鏡像舊資料庫 (平行測試期)', strava: '🏃 自己抓 Strava (正式營運)' };

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
    if (state.cfg.mode !== 'strava') state.cfg.mode = 'mirror';
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
    else if (st.result === 'skipped') what = '只報到、未動作 (非目前資料來源)';
    else if (st.result === 'error') what = `⚠️ 錯誤：${esc(st.message || '')}`;
    const cookie = me === 'crawler' ? (st.cookie ? '　🍪 STRAVA_COOKIE 已設定' : '　<span class="text-amber-300">🍪 STRAVA_COOKIE 未設定</span>') : '';
    const color = st.result === 'error' || stale ? 'text-amber-300' : 'text-emerald-300';
    const active = (activeMode === 'mirror' && me === 'mirror') || (activeMode === 'strava' && me === 'crawler');
    return `<div class="${color}">${stale || st.result === 'error' ? '⚠️' : '✅'} ${name}${active ? ' <span class="text-[10px] px-1.5 rounded bg-emerald-900/60 text-emerald-200">負責中</span>' : ''}：${esc(st.at)} (${agoText(st.at)})　${what}${cookie}${stale ? '　<span class="text-amber-300">超過 ' + STALE_MIN + ' 分鐘沒報到，請到 GitHub Actions 檢查</span>' : ''}</div>`;
  }

  function render() {
    const box = document.getElementById('data-source-body');
    if (!box) return;
    if (!state.loaded) { box.innerHTML = '<div class="text-slate-400">讀取中…</div>'; return; }
    const mode = state.cfg.mode;
    const pill = document.getElementById('data-source-pill');
    if (pill) {
      pill.textContent = MODE_LABEL[mode];
      pill.className = `px-3 py-1 rounded-full text-[11px] font-bold border ${mode === 'strava' ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-sky-950 text-sky-300 border-sky-700'}`;
    }
    const card = (m, title, desc) => `
      <label class="block cursor-pointer rounded-2xl border p-3 ${mode === m ? 'border-amber-500 bg-amber-950/20' : 'border-slate-800 bg-slate-950/60'}">
        <div class="flex items-center gap-2 font-bold text-white"><input type="radio" name="data-source-mode" value="${m}" ${mode === m ? 'checked' : ''} class="accent-amber-500"> ${title}</div>
        <div class="text-[11px] text-slate-400 mt-1 leading-relaxed">${desc}</div>
      </label>`;
    const last = (state.cfg.history || []).slice(-1)[0];
    box.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        ${card('mirror', MODE_LABEL.mirror, '舊遊戲的爬蟲照常抓 Strava → 寫進舊資料庫 → 本站每 30 分鐘把「新」英雄 / 「新」紀錄複製過來 (只新增、不覆蓋你在這裡的修改)。本站的 Strava 爬蟲只報到不抓。')}
        ${card('strava', MODE_LABEL.strava, '本站的 Strava 爬蟲每 30 分鐘自己抓 Strava → 直接寫進新資料庫；鏡像同步停止複製。<b class="text-amber-300">切換後請到「舊」GitHub 專案關掉舊爬蟲</b>。')}
      </div>
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1 text-[11px]">
        <div class="font-bold text-slate-200 mb-1">📡 GitHub 排程最後報到</div>
        ${statusLine('🔁 鏡像同步 (Mirror)', state.mirror, mode, 'mirror')}
        ${statusLine('🏃 Strava 爬蟲', state.crawler, mode, 'crawler')}
        ${last ? `<div class="text-slate-500 pt-1">上次切換：${esc(last.at)} → ${esc(MODE_LABEL[last.mode] || last.mode)}</div>` : ''}
      </div>
      <div class="flex flex-wrap gap-2">
        <button onclick="DataSourceGM.requestSave()" class="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl">💾 套用資料來源</button>
        <button onclick="DataSourceGM.refresh()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-4 py-2 rounded-xl">🔄 重新整理狀態</button>
      </div>`;
  }

  function closeModal() { const m = document.getElementById('data-source-modal'); if (m) m.remove(); }

  function showModal(target) {
    closeModal();
    const toStrava = target === 'strava';
    const crawlerOk = state.crawler && minutesAgo(state.crawler.at) != null && minutesAgo(state.crawler.at) <= STALE_MIN;
    const cookieOk = !!(state.crawler && state.crawler.cookie);
    const warn = toStrava && (!crawlerOk || !cookieOk)
      ? `<div class="bg-rose-950/60 border border-rose-700 text-rose-200 rounded-xl p-3 text-[12px]">⚠️ 本站的 Strava 爬蟲${!crawlerOk ? '最近沒有報到 (排程可能沒開或 Secrets 沒設)' : ''}${!crawlerOk && !cookieOk ? '，且' : ''}${!cookieOk ? ' STRAVA_COOKIE 未設定' : ''}。切換後可能抓不到資料，建議先到新 GitHub repo 確認。</div>` : '';
    const steps = toStrava ? `
        <ol class="list-decimal pl-5 space-y-1.5">
          <li>打開 <b>「舊」遊戲的 GitHub 專案</b> → 上方 <b>Actions</b></li>
          <li>左側點 <b>Strava to Supabase Cloud Crawler</b></li>
          <li>右上 <b>···</b> → <b>Disable workflow</b> (舊資料庫從此不再更新)</li>
          <li>回到這裡，30 分鐘內「🏃 Strava 爬蟲」應顯示「抓取完成」</li>
        </ol>
        <p class="text-slate-400">忘了關也不會壞資料 (兩邊各寫各的資料庫、ID 重複會跳過)，只是 Strava 會被抓兩次。</p>`
      : `
        <ol class="list-decimal pl-5 space-y-1.5">
          <li>如果之前關掉了舊爬蟲：到 <b>「舊」GitHub 專案</b> → Actions → Strava to Supabase Cloud Crawler → <b>Enable workflow</b></li>
          <li>否則舊資料庫不會有新資料，鏡像也就複製不到東西</li>
        </ol>`;
    const div = document.createElement('div');
    div.id = 'data-source-modal';
    div.className = 'fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4';
    div.innerHTML = `
      <div class="bg-slate-900 border border-amber-600 rounded-3xl max-w-lg w-full p-5 space-y-3 text-sm text-slate-200 shadow-2xl">
        <h3 class="text-base font-black text-white">${toStrava ? '🏃 切換為「自己抓 Strava」' : '🔁 切換回「鏡像舊資料庫」'}</h3>
        ${warn}
        <div class="bg-amber-950/30 border border-amber-700/60 rounded-xl p-3 text-[12px] space-y-2">
          <div class="font-bold text-amber-300">📌 ${toStrava ? '別忘了：去 GitHub 關掉「舊」爬蟲' : '提醒'}</div>
          ${steps}
        </div>
        <label class="flex items-center gap-2 text-[12px]"><input type="checkbox" id="data-source-ack" class="accent-amber-500"> 我知道了</label>
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
    if (!ack || !ack.checked) { alert('請先勾選「我知道了」'); return; }
    const history = (state.cfg.history || []).concat([{ at: nowStr(), mode: target, from: state.cfg.mode }]).slice(-20);
    const value = { mode: target, changedAt: nowStr(), history };
    try {
      await window.supabase.insert('game_config', { key: CFG_KEY, value, updated_at: new Date().toISOString() });
      state.cfg = value;
      closeModal();
      render();
      alert(`✅ 資料來源已切換為「${MODE_LABEL[target]}」\n下一次 GitHub 排程 (30 分鐘內) 開始生效。`);
    } catch (e) {
      alert('❌ 儲存失敗：' + e.message);
    }
  }

  async function refresh() {
    try { await load(); } catch (e) { console.warn('[DataSource] 讀取失敗', e); }
    render();
  }

  window.DataSourceGM = { refresh, requestSave, confirmSave, closeModal, _state: state };
  document.addEventListener('DOMContentLoaded', () => { setTimeout(refresh, 300); });
})();
