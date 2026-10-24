/**
 * 鋼鐵英雄紀元 - Supabase 100% 雲端資料庫客戶端
 * 永久取代 Google Sheet，提供全站秒級跨裝置即時同步
 */

// 資料庫連線設定：優先使用 env.js (window.IRON_ENV.supabaseUrl / anonKey)。
// 鋼鐵英雄紀元 2.0 (獨立版) 一律由 env.js 指定，避免誤連到舊資料庫。
const SUPABASE_CONFIG = (() => {
  const env = window.IRON_ENV || {};
  if (!env.supabaseUrl || !env.anonKey) {
    const msg = '⚠️ env.js 未設定 supabaseUrl / anonKey，無法連線資料庫';
    console.error(msg);
    try { document.addEventListener('DOMContentLoaded', () => alert(msg)); } catch (e) {}
  }
  return { url: String(env.supabaseUrl || '').replace(/\/+$/, ''), anonKey: env.anonKey || '' };
})();

const supabase = {
  async fetch(table, params = "") {
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${table}${params ? `?${params}` : ""}`;
    const res = await fetch(url, {
      headers: {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase fetch [${table}] failed (${res.status}): ${err}`);
    }
    return await res.json();
  },

  /**
   * 分頁讀取整張資料表 (避開 PostgREST 預設單次最多 1000 筆的上限，資料量成長後也不會被靜默截斷)
   */
  async fetchAll(table, params = "select=*", pageSize = 1000) {
    const base = `${SUPABASE_CONFIG.url}/rest/v1/${table}?${params}${/order=/.test(params) ? "" : "&order=id.asc"}`;
    const out = [];
    for (let from = 0; ; from += pageSize) {
      const res = await fetch(base, {
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
          "Content-Type": "application/json",
          "Range-Unit": "items",
          "Range": `${from}-${from + pageSize - 1}`
        }
      });
      if (!res.ok && res.status !== 206) {
        const err = await res.text();
        throw new Error(`Supabase fetchAll [${table}] failed (${res.status}): ${err}`);
      }
      const rows = await res.json();
      out.push(...rows);
      if (!Array.isArray(rows) || rows.length < pageSize) return out;
    }
  },

  async insert(table, data) {
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${table}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase insert [${table}] failed (${res.status}): ${err}`);
    }
    return await res.json();
  },

  async update(table, matchQuery, data) {
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${table}?${matchQuery}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase update [${table}] failed (${res.status}): ${err}`);
    }
    return await res.json();
  },

  async delete(table, matchQuery) {
    const url = `${SUPABASE_CONFIG.url}/rest/v1/${table}?${matchQuery}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase delete [${table}] failed (${res.status}): ${err}`);
    }
    return true;
  },

  async uploadFile(bucket, filePath, fileData, contentType) {
    const url = `${SUPABASE_CONFIG.url}/storage/v1/object/${bucket}/${filePath}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
        "Content-Type": contentType,
        "x-upsert": "true" 
      },
      body: fileData
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase upload [${bucket}] failed (${res.status}): ${err}`);
    }
    return `${SUPABASE_CONFIG.url}/storage/v1/object/public/${bucket}/${filePath}`;
  }
};

window.supabase = supabase;

// =====================================================================
// 🧪 沙盒模式 (window.IRON_ENV.mode === 'sandbox')
// 讀取正式資料庫，所有寫入只存在本機瀏覽器 (localStorage)，正式遊戲完全不受影響。
// =====================================================================
(function setupSandbox() {
  const env = window.IRON_ENV || {};
  if (env.mode !== 'sandbox') return;

  const KEY = 'ih_sandbox_overlay_v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const state = load() || { game_config: {}, heroes: {}, heroes_del: [], activities: {}, activities_del: [], log: [] };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('[Sandbox] localStorage 已滿，部分沙盒修改無法保存', e); } };
  const logWrite = (op, table, detail) => {
    state.log.unshift({ at: new Date().toLocaleString('zh-TW', { hour12: false }), op, table, detail: String(detail || '').slice(0, 120) });
    state.log = state.log.slice(0, 200);
  };
  const eqVal = (q, col) => { const m = String(q || '').match(new RegExp(`(?:^|&)${col}=eq\\.([^&]+)`)); return m ? decodeURIComponent(m[1]) : null; };

  function applyOverlay(table, rows) {
    let data = Array.isArray(rows) ? rows.slice() : rows;
    if (!Array.isArray(data)) return data;
    if (table === 'game_config') {
      Object.entries(state.game_config).forEach(([k, v]) => {
        const row = data.find(r => r.key === k);
        if (row) row.value = v;
      });
    } else if (table === 'heroes') {
      data = data.filter(h => !state.heroes_del.includes(h.name));
      Object.values(state.heroes).forEach(u => {
        const row = data.find(h => h.name === u.name);
        if (row) Object.assign(row, u); else data.push({ ...u });
      });
    } else if (table === 'activities') {
      data = data.filter(a => !state.activities_del.includes(String(a.id)));
      Object.values(state.activities).forEach(u => {
        const row = data.find(a => String(a.id) === String(u.id));
        if (row) Object.assign(row, u); else if (u.hero && u.date) data.push({ ...u });
      });
    }
    return data;
  }

  const real = {
    fetch: supabase.fetch.bind(supabase),
    fetchAll: supabase.fetchAll.bind(supabase)
  };

  supabase.fetch = async (table, params = '') => {
    let rows = await real.fetch(table, params);
    rows = applyOverlay(table, rows);
    // game_config 有篩選單一 key 時，補上沙盒裡新增 (正式庫不存在) 的 key
    if (table === 'game_config') {
      const k = eqVal(params, 'key');
      Object.entries(state.game_config).forEach(([key, value]) => {
        if ((!k || k === key) && !rows.some(r => r.key === key)) rows.push({ key, value });
      });
    }
    return rows;
  };
  supabase.fetchAll = async (table, params) => applyOverlay(table, await real.fetchAll(table, params));

  supabase.insert = async (table, data) => {
    const rows = Array.isArray(data) ? data : [data];
    rows.forEach(r => {
      if (table === 'game_config' && r && r.key) state.game_config[r.key] = r.value;
      else if (table === 'heroes' && r && r.name) { state.heroes[r.name] = { ...(state.heroes[r.name] || {}), ...r }; state.heroes_del = state.heroes_del.filter(n => n !== r.name); }
      else if (table === 'activities' && r && r.id !== undefined) { state.activities[String(r.id)] = { ...(state.activities[String(r.id)] || {}), ...r }; state.activities_del = state.activities_del.filter(i => i !== String(r.id)); }
    });
    logWrite('新增/更新', table, rows.map(r => r.key || r.name || r.id).join(', '));
    save();
    return rows;
  };
  supabase.update = async (table, matchQuery, data) => {
    if (table === 'activities') {
      const id = eqVal(matchQuery, 'id');
      if (id) state.activities[id] = { ...(state.activities[id] || { id }), ...data };
    } else if (table === 'heroes') {
      const name = eqVal(matchQuery, 'name');
      if (name) state.heroes[name] = { ...(state.heroes[name] || { name }), ...data };
    }
    logWrite('修改', table, matchQuery);
    save();
    return [{ ...(data || {}) }];
  };
  supabase.delete = async (table, matchQuery) => {
    if (table === 'activities') { const id = eqVal(matchQuery, 'id'); if (id) { state.activities_del.push(id); delete state.activities[id]; } }
    if (table === 'heroes') { const name = eqVal(matchQuery, 'name'); if (name) { state.heroes_del.push(name); delete state.heroes[name]; } }
    logWrite('刪除', table, matchQuery);
    save();
    return true;
  };
  supabase.uploadFile = async (bucket, filePath, fileData) => {
    logWrite('上傳檔案', bucket, filePath);
    save();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // data URL，只存在本機
      reader.readAsDataURL(fileData);
    });
  };

  // 攔截網站自己的 /api POST (例如舊版設定更新)，避免沙盒誤寫入正式 Vercel KV
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET' && /^\/api\//.test(url)) {
      logWrite('攔截 API', url, method);
      save();
      return Promise.resolve(new Response(JSON.stringify({ ok: true, sandbox: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (method !== 'GET' && url.includes('/functions/v1/')) {
      logWrite('攔截雲端函式', url.split('/functions/v1/')[1], method);
      save();
      return Promise.resolve(new Response(JSON.stringify({ error: 'sandbox', message: '沙盒模式不會呼叫正式雲端函式' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
    }
    return origFetch(input, init);
  };

  window.IronSandbox = {
    state,
    reset() { localStorage.removeItem(KEY); location.reload(); },
    exportJSON() {
      const a = document.createElement('a');
      a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
      a.download = `iron_heroes_sandbox_changes_${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
    },
    showLog() {
      alert(state.log.length ? state.log.slice(0, 30).map(l => `${l.at}｜${l.op}｜${l.table}｜${l.detail}`).join('\n') : '目前沒有任何沙盒修改');
    }
  };

  // 頂部固定提示列
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.id = 'sandbox-banner';
    bar.style.cssText = 'position:sticky;top:0;z-index:9999;background:linear-gradient(90deg,#7c3aed,#db2777);color:#fff;font-size:12px;font-weight:700;padding:6px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;';
    const n = state.log.length;
    bar.innerHTML = `<span>🧪 ${env.label || '沙盒測試站'}：讀取正式遊戲資料，所有修改只存在你的瀏覽器，不會影響正式遊戲${n ? `（已有 ${n} 筆沙盒修改）` : ''}</span>
      <button onclick="IronSandbox.showLog()" style="background:rgba(255,255,255,.2);border-radius:8px;padding:2px 8px">📜 修改紀錄</button>
      <button onclick="IronSandbox.exportJSON()" style="background:rgba(255,255,255,.2);border-radius:8px;padding:2px 8px">⬇️ 匯出</button>
      <button onclick="if(confirm('清除所有沙盒修改並恢復成正式資料？')) IronSandbox.reset()" style="background:rgba(255,255,255,.2);border-radius:8px;padding:2px 8px">↺ 清除沙盒修改</button>`;
    document.body.prepend(bar);
  });
})();
