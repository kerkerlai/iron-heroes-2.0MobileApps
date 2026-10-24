/**
 * 鋼鐵英雄紀元 2.0 — 📱 App 內嵌版介面 (只在 ?app=1 → <html class="in-app"> 時啟用)
 *
 * 原則：
 *  - 電腦 / 一般手機瀏覽器版完全不變；本檔在非 App 模式下什麼都不做。
 *  - 所有數字都來自網頁同一套計算 / view model (buildModeView、computeMobileMode、
 *    computeFactionState、baseHeroResources、bingoBoardLeaders、getActivityModeScore、徽章引擎…)，不另寫計分。
 *  - 網頁原本的分頁仍照常渲染 (隱藏)，App 介面另外畫在 #app-root。
 *
 * 頁面：① 資料片 (我的名次 + 排行每人一行) ② 我的英雄 ③ 英雄史 ④ 英雄詳細底部面板
 */
(function () {
  'use strict';
  const IS_APP = document.documentElement.classList.contains('in-app');

  // ---------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? ''));
  const arg = (v) => (typeof jsArg === 'function' ? jsArg(v) : JSON.stringify(String(v ?? '')));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const r1 = (n) => Math.round((n || 0) * 10) / 10;
  const fmt = (n) => { const v = r1(n); return v.toLocaleString(undefined, { maximumFractionDigits: 1 }); };
  const signed = (n) => { const v = r1(n); return (v > 0 ? '+' : (v < 0 ? '−' : '±')) + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 1 }); };
  const st = () => window.gameState || (typeof gameState !== 'undefined' ? gameState : null) || {};
  const todayYMD = () => (typeof getTodayYMD === 'function' ? getTodayYMD() : '');
  const actYMD = (a) => (typeof normalizeDateYMD === 'function' ? normalizeDateYMD(a?.date || a?.time) : '');
  const selfHero = () => {
    try {
      const h = new URLSearchParams(location.search).get('hero') || '';
      return typeof safeDisplayText === 'function' ? safeDisplayText(h) : h;
    } catch (e) { return ''; }
  };
  const avatar = (name, size = 'ia-av-40', rounded = 'rounded-xl') => renderUnifiedAvatarHtml(name, size, rounded);
  const badgeOf = (name) => getHeroBadgeProgress(name);
  const guildOf = (name, fallback) => (uhcFindHero(name)?.guild ?? fallback ?? '');
  const guildBadge = (g) => esc(uhcFindGuild(g)?.badge || '🛡️');

  const TYPE_META = {
    classic: { icon: '🏆', name: '經典競技', tab: 'classic' },
    rpg: { icon: '⚔️', name: 'RPG 職業天賦', tab: 'rpg' },
    world_boss: { icon: '🐉', name: '世界 Boss', tab: 'boss' },
    faction_war: { icon: '🏰', name: '雙城激戰', tab: 'faction' },
    survival: { icon: '☠️', name: '飢餓法則', tab: 'survival' },
    base_builder: { icon: '🏗️', name: '鋼鐵要塞', tab: 'base' },
    bingo: { icon: '🧩', name: '戰神拼圖', tab: 'bingo' }
  };
  function typeMeta(type) {
    if (TYPE_META[type]) return TYPE_META[type];
    const mm = (window.MOBILE_MODE_META || {})[type];
    return mm ? { icon: mm.icon, name: mm.name, tab: type } : { icon: '🏅', name: '資料片', tab: type };
  }
  const normType = (t) => (window.normalizeSnapshotType ? window.normalizeSnapshotType(t) : (t || 'classic'));
  const isMobile = (t) => Boolean(window.isMobileMode && window.isMobileMode(t));

  // ---------------------------------------------------------------
  // 排行 model：每個資料片 → 每人一行 (主分數 / 小字 / 展開指標) + 公會小卡 + 摘要卡
  // 輸入一律是「網頁現場 / 快照」共用的 view model
  // ---------------------------------------------------------------
  function heroBadgeText(name) { const b = badgeOf(name); return `🎖️ ${b.unlocked}/${b.total}`; }

  function buildModel(type, view) {
    const m = { type, rows: [], guilds: [], summaryHtml: '', keyFact: '', outcome: '', primaryLabel: '分數' };
    if (!view) return m;
    const T = {
      classic() {
        m.primaryLabel = '出勤次數';
        const champs = view.champions || {};
        const aero = {}, anaero = {};
        (champs.heroAerobic || []).forEach((h, i) => { aero[h.name] = { ...h, rank: h.rank ?? i + 1 }; });
        (champs.heroAnaerobic || []).forEach((h, i) => { anaero[h.name] = { ...h, rank: h.rank ?? i + 1 }; });
        const raws = view.heroList && view.heroList.length ? view.heroList : null;
        if (raws) {
          m.rows = raws.map(raw => {
            const a = aero[raw.name], an = anaero[raw.name];
            return {
              name: raw.name, guild: raw.guild, num: r1(raw.workouts), text: `${r1(raw.workouts)} 次`,
              sub: `${guildBadge(raw.guild)} ${esc(raw.guild || '')}・${heroBadgeText(raw.name)}`,
              metrics: [
                { label: '🔋 熱量', value: `${Math.round(raw.calories || 0).toLocaleString()}` },
                { label: '🚀 TRIMP', value: `${Math.round(raw.trimp || 0).toLocaleString()}` },
                { label: '🟢 Zone2', value: `${r1(raw.zone2)} 次` },
                { label: '🦍 最大落差', value: `${r1(raw.maxGap)} bpm` },
                { label: '⏱️ 時長', value: `${Math.round(raw.duration || 0).toLocaleString()} 分` },
                { label: '🟢有氧 / 🔴無氧', value: `${a ? a.score : 0} / ${an ? an.score : 0}`, derived: true }
              ]
            };
          });
        } else {
          m.primaryLabel = '有氧總分';
          m.rows = Object.values(aero).map(a => ({ name: a.name, guild: a.guild, num: num(a.score), text: `${a.score} 分`, sub: `${esc(a.guild || '')}・${heroBadgeText(a.name)}`, metrics: [{ label: '🔴 無氧總分', value: `${anaero[a.name]?.score ?? 0} 分` }] }));
        }
        const ta = {}, tn = {};
        (champs.teamAerobic || []).forEach(t => { ta[t.name] = t; });
        (champs.teamAnaerobic || []).forEach(t => { tn[t.name] = t; });
        m.guilds = (view.guildList || []).map(g => ({ name: g.name, badge: g.badge, color: g.color, value: `有氧 ${ta[g.name]?.score ?? '—'}`, sub: `無氧 ${tn[g.name]?.score ?? '—'} • 人均出勤 ${g.perWorkouts ?? 0}`, members: g.members || [] }))
          .sort((x, y) => num(ta[y.name]?.score) - num(ta[x.name]?.score));
        const tA = (champs.teamAerobic || [])[0], tN = (champs.teamAnaerobic || [])[0];
        m.summaryHtml = `<div class="ia-sum-grid">
          <div class="ia-sum-tile"><span>🟢 團隊有氧冠軍</span><b>${esc(tA?.name || '—')}</b><small>${tA ? `${tA.score} 分` : ''}</small></div>
          <div class="ia-sum-tile"><span>🔴 團隊無氧冠軍</span><b>${esc(tN?.name || '—')}</b><small>${tN ? `${tN.score} 分` : ''}</small></div></div>`;
        const hA = (champs.heroAerobic || [])[0];
        m.keyFact = hA ? `🏆 個人有氧冠軍 ${hA.name}` : '';
        m.outcome = tA ? `🏆 團隊有氧冠軍：${tA.name}` : '';
      },
      rpg() {
        m.primaryLabel = '戰力 CP';
        const metaOf = (h) => RPG_CLASSES[h?.rpgClass] || RPG_CLASSES['狂戰士'];
        m.rows = (view.heroRpgList || view.heroStats || []).map(h => {
          const meta = metaOf(h);
          const cp = num(h.combatPower ?? h.totalDamage);
          return {
            name: h.name, guild: h.guild, num: cp, text: cp.toLocaleString(),
            sub: `${meta.badge} ${esc(h.rpgClass || meta.name)}・${esc(h.guild || '')}`,
            metrics: [
              { label: '✨ 天賦被動', value: meta.passiveName, derived: true },
              { label: '🏋️ 出勤', value: `${r1(h.workouts)} 次` },
              { label: '🟢 燃脂', value: `${r1(h.zone2)} 次` },
              { label: '🚀 TRIMP / 落差', value: `${r1(h.trimp)} / ${r1(h.maxGap)}` }
            ],
            foot: `🧬 職業加成：${meta.passiveDesc}`
          };
        });
        m.guilds = (view.guildSynergyList || []).map(g => ({ name: g.guild || g.name, badge: g.badge, color: g.color, value: `${num(g.totalPower).toLocaleString()} CP`, sub: g.synergyTag || '基礎小隊', members: g.members || [] }));
        const masters = view.classMasters || {};
        m.summaryHtml = `<div class="ia-hscroll ia-gap6">${Object.keys(RPG_CLASSES).map(c => {
          const ms = masters[c];
          return `<div class="ia-mini"><span>${RPG_CLASSES[c].badge} ${esc(c)}之王</span><b>${esc(ms?.name || '—')}</b><small>${ms ? num(ms.combatPower).toLocaleString() + ' CP' : ''}</small></div>`;
        }).join('')}</div>`;
        m.keyFact = m.guilds[0] ? `🛡️ 最強公會 ${m.guilds[0].name}` : '';
        m.outcome = m.guilds[0] ? `🛡️ 最強公會：${m.guilds[0].name}` : '';
      },
      world_boss() {
        m.primaryLabel = '總輸出';
        const heroes = [...(view.heroes || [])].sort((a, b) => num(b.totalDamage) - num(a.totalDamage));
        m.rows = heroes.map(h => ({
          name: h.name, guild: h.guild, num: num(h.totalDamage), text: num(h.totalDamage).toLocaleString(),
          sub: `${guildBadge(h.guild)} ${esc(h.guild || '')}・${heroBadgeText(h.name)}`,
          metrics: [
            { label: '🗡️ 普攻', value: num(h.physDmg).toLocaleString() },
            { label: '🔮 魔攻', value: num(h.magDmg).toLocaleString() },
            { label: '💥 爆擊', value: num(h.critDmg).toLocaleString() },
            { label: '⚔️ 出勤', value: `${h.validWorkouts || 0} 次`, derived: true }
          ]
        }));
        const total = (view.guilds || []).reduce((s, g) => s + num(g.totalDamage), 0) || 1;
        m.guilds = (view.guilds || []).map(g => ({ name: g.name, badge: g.badge, color: g.color, value: num(g.totalDamage).toLocaleString(), sub: `${((num(g.totalDamage) / total) * 100).toFixed(1)}%`, members: g.members || [] }));
        const boss = view.boss || {};
        const maxHp = boss.maxHp || 350000;
        const dmg = num(view.totals?.dmg);
        const cur = Math.max(0, maxHp - dmg);
        const pct = Math.max(0, Math.min(100, (cur / maxHp) * 100));
        m.summaryHtml = `<div class="ia-boss">
          <div class="ia-boss-img">${boss.avatar ? `<img src="${esc(boss.avatar)}" alt="">` : '🐉'}</div>
          <div class="ia-boss-info"><b>${esc(boss.name || '世界 Boss')}</b>
            <div class="ia-bar ia-bar-rose"><i style="width:${pct}%"></i></div>
            <small>剩餘 ${cur.toLocaleString()} / ${maxHp.toLocaleString()} (${pct.toFixed(1)}%) • 全服輸出 ${dmg.toLocaleString()}</small></div></div>`;
        m.keyFact = `👹 剩餘 ${pct.toFixed(1)}%`;
        m.outcome = cur <= 0 ? `🏁 已討伐 • 全服輸出 ${dmg.toLocaleString()}` : `👹 剩餘 ${pct.toFixed(1)}% • 全服輸出 ${dmg.toLocaleString()}`;
      },
      faction_war() {
        m.primaryLabel = '貢獻';
        const fs = window.computeFactionState(view);
        const fOf = (g) => fs.faction1.guilds.includes(g) ? fs.faction1.name : (fs.faction2.guilds.includes(g) ? fs.faction2.name : '未編入陣營');
        m.rows = (view.heroStats || []).map(h => {
          const s = window.factionHeroScore(h);
          return {
            name: h.name, guild: h.guild, num: s.dmg + s.rep, text: (s.dmg + s.rep).toLocaleString(), derivedPrimary: true,
            sub: `${esc(fOf(h.guild))}・${esc(h.guild || '')}`,
            metrics: [
              { label: '🔥 攻城傷害', value: s.dmg.toLocaleString() },
              { label: '🛠️ 城牆修復', value: `+${s.rep.toLocaleString()}` },
              { label: '🚀 TRIMP', value: Math.round(h.totalTrimp || 0).toLocaleString() },
              { label: '🦍 MaxGap', value: `${Math.round(h.scoreMaxGap ?? h.maxGap ?? 0)}` },
              { label: '🔋 熱量', value: Math.round(h.totalCalories || 0).toLocaleString() },
              { label: '🟢 Zone2', value: `${Math.round((h.scoreZone2 ?? h.zone2Count ?? 0) * 10) / 10} 次` }
            ]
          };
        });
        const fcard = (f, cur, pct, tone) => ({ name: f.name, badge: tone === 'ok' ? '🛡️' : '⚔️', color: tone === 'ok' ? '#10b981' : '#f43f5e', value: `${cur.toLocaleString()} HP`, sub: `${pct.toFixed(0)}% • ${f.guilds.join('、') || '無公會'}`, members: (view.heroes || []).filter(h => f.guilds.includes(h.guild)).map(h => h.name) });
        m.guilds = [fcard(fs.faction1, fs.f1CurrentHp, fs.f1Pct, 'ok'), fcard(fs.faction2, fs.f2CurrentHp, fs.f2Pct, 'bad')];
        m.summaryHtml = `<div class="ia-sum-grid">
          <div class="ia-sum-tile"><span>${esc(fs.faction1.name)}</span><b>${fs.f1CurrentHp.toLocaleString()}</b><div class="ia-bar ia-bar-emerald"><i style="width:${fs.f1Pct}%"></i></div></div>
          <div class="ia-sum-tile"><span>${esc(fs.faction2.name)}</span><b>${fs.f2CurrentHp.toLocaleString()}</b><div class="ia-bar ia-bar-rose"><i style="width:${fs.f2Pct}%"></i></div></div></div>`;
        const lead = fs.f1CurrentHp >= fs.f2CurrentHp ? fs.faction1.name : fs.faction2.name;
        m.keyFact = `🏰 領先 ${lead}`;
        m.outcome = `🏰 主城血量領先：${lead}`;
      },
      survival() {
        m.primaryLabel = '生存值 HP';
        const sv = view.sv || {};
        const maxHp = num(sv.maxHp) || 1;
        m.rows = (view.heroes || []).map(h => ({
          name: h.name, guild: h.guild, num: Math.max(0, num(h.currentHp)), text: Math.max(0, num(h.currentHp)).toLocaleString(), dead: Boolean(h.isDead),
          sub: `${guildBadge(h.guild)} ${esc(h.guild || '')}・${h.isDead ? '<span class="ia-bad">☠️ 淘汰</span>' : '<span class="ia-ok">🟢 存活</span>'}`,
          status: h.isDead ? { text: '☠️ 已被荒野吞噬', tone: 'bad' } : { text: '🟢 存活中', tone: 'ok' },
          metrics: [
            { label: '🍖 狩獵熱量', value: `+${Math.floor(num(h.food)).toLocaleString()}` },
            { label: '🎒 搜刮物資', value: `+${Math.floor(num(h.scavenge)).toLocaleString()}` },
            { label: '☣️ 毒圈流失', value: `-${num(sv.penalty).toLocaleString()}` }
          ],
          bar: h.isDead ? 0 : Math.min(100, Math.max(0, (num(h.currentHp) / maxHp) * 100))
        }));
        const alive = m.rows.filter(r => !r.dead).length;
        m.summaryHtml = `<div class="ia-sum-grid">
          <div class="ia-sum-tile"><span>🟢 存活人數</span><b>${alive} / ${m.rows.length}</b><small>初始 ${num(sv.maxHp).toLocaleString()} HP</small></div>
          <div class="ia-sum-tile"><span>☣️ 毒圈</span><b>-${num(sv.penalty).toLocaleString()}</b><small>第 ${sv.days || 0} 天 • 每日 -${num(sv.decayPerDay).toLocaleString()}</small></div></div>`;
        m.keyFact = `🟢 存活 ${alive}/${m.rows.length}`;
        m.outcome = `🟢 存活 ${alive}/${m.rows.length}${m.rows[0] ? ` • 荒野之王 ${m.rows[0].name}` : ''}`;
      },
      base_builder() {
        m.primaryLabel = '總資源';
        const bs = window.computeBaseStatus(view);
        m.rows = (view.heroStats || []).map(h => {
          const r = window.baseHeroResources(h);
          const total = r.wood + r.steel + r.mana;
          const shares = [
            { k: '🌳 主力伐木工', v: bs.totalWood > 0 ? r.wood / bs.totalWood : 0 },
            { k: '⚙️ 主力礦工', v: bs.totalSteel > 0 ? r.steel / bs.totalSteel : 0 },
            { k: '🔮 主力煉金師', v: bs.totalMana > 0 ? r.mana / bs.totalMana : 0 }
          ].sort((a, b) => b.v - a.v);
          return {
            name: h.name, guild: h.guild, num: Math.round(total), text: Math.round(total).toLocaleString(), derivedPrimary: true,
            sub: shares[0].v > 0 ? `${shares[0].k} (${Math.round(shares[0].v * 1000) / 10}%)` : '🧱 待命中',
            metrics: [
              { label: '🌳 木材', value: Math.round(r.wood).toLocaleString() },
              { label: '⚙️ 鋼鐵', value: Math.round(r.steel).toLocaleString() },
              { label: '🔮 神石', value: Math.round(r.mana).toLocaleString() }
            ]
          };
        });
        const s = bs.status;
        const bar = (v, n, c) => `<div class="ia-bar ${c}"><i style="width:${Math.min(100, (v / n) * 100)}%"></i></div>`;
        m.summaryHtml = `<div class="ia-base"><b>🏰 鐵峰堡壘 Lv.${s.lvl}</b>
          <div class="ia-base-row"><span>🌳 ${Math.round(bs.totalWood).toLocaleString()} / ${s.nW.toLocaleString()}</span>${bar(bs.totalWood, s.nW, 'ia-bar-emerald')}</div>
          <div class="ia-base-row"><span>⚙️ ${Math.round(bs.totalSteel).toLocaleString()} / ${s.nS.toLocaleString()}</span>${bar(bs.totalSteel, s.nS, 'ia-bar-blue')}</div>
          <div class="ia-base-row"><span>🔮 ${Math.round(bs.totalMana).toLocaleString()} / ${s.nM.toLocaleString()}</span>${bar(bs.totalMana, s.nM, 'ia-bar-purple')}</div></div>`;
        m.keyFact = `🏰 要塞 Lv.${s.lvl}`;
        m.outcome = `🏰 鐵峰堡壘 Lv.${s.lvl}`;
      },
      bingo() {
        m.primaryLabel = '領跑板塊';
        const stats = view.heroStats || [];
        const leaders = window.bingoBoardLeaders(stats);
        m.rows = stats.map(h => {
          const leads = leaders.filter(n => n === h.name).length;
          return {
            name: h.name, guild: h.guild, num: leads, text: `${leads} 塊`, derivedPrimary: true,
            sub: `${guildBadge(h.guild)} ${esc(h.guild || '')}`,
            metrics: window.BINGO_BOARDS.map((b, i) => ({ label: b.label + (leaders[i] === h.name ? ' 👑' : ''), value: `${Math.round(b.get(h)).toLocaleString()}${b.unit ? ' ' + b.unit : ''}`, derived: true }))
          };
        });
        const grid = view.grid || [];
        const ok = grid.filter(g => g.ok).length;
        m.summaryHtml = `<div class="ia-bingo">${grid.map(g => `<div class="ia-bingo-cell ${g.ok ? 'on' : ''}" title="${esc(g.desc)}"><span>${g.ok ? '✅' : '🔒'}</span><small>${esc(g.key)}</small></div>`).join('')}</div>`;
        m.keyFact = `🧩 已點亮 ${ok}/${grid.length || 9}`;
        m.outcome = `🧩 石板點亮 ${ok}/${grid.length || 9}`;
      },
      expedition() {
        m.primaryLabel = '總里程';
        m.rows = (view.heroes || []).map(h => ({
          name: h.name, guild: h.guild, num: num(h.km), text: `${h.km} km`,
          sub: `📅 貢獻 ${h.activeDays} 天`,
          metrics: [
            { label: '👣 步數里程', value: `${h.stepKm} km` },
            { label: '🏋️ 訓練里程', value: `${h.workoutKm} km` },
            { label: '🚴 騎/游', value: `${h.distKm} km` },
            { label: '👟 步數', value: num(h.steps).toLocaleString(), derived: true }
          ]
        }));
        m.guilds = (view.guilds || []).map(g => ({ name: g.name, value: `${num(g.km).toLocaleString()} km`, sub: `人均 ${g.perMember} km`, members: g.members || [] }));
        const pct = num(view.progressPct);
        m.summaryHtml = `<div class="ia-route"><b>🗺️ ${esc(view.cfg?.routeName || '萬步遠征')}</b>
          <div class="ia-bar ia-bar-amber"><i style="width:${pct}%"></i></div>
          <small>${num(view.totalKm).toLocaleString()} / ${num(view.routeKm).toLocaleString()} km${view.completed ? ' • 🏆 遠征成功' : (view.next ? ` • 下一站 ${esc(view.next.name)}` : '')}</small></div>`;
        m.keyFact = `🗺️ 進度 ${pct.toFixed(0)}%`;
        m.outcome = view.completed ? '🏆 遠征成功' : `🗺️ 抵達 ${pct.toFixed(0)}%`;
      },
      dream() {
        m.primaryLabel = '總傷害';
        const fmtSleep = (x) => x ? `${Math.floor(x / 60)}h${String(Math.round(x % 60)).padStart(2, '0')}m` : '—';
        m.rows = (view.heroes || []).map(h => ({
          name: h.name, guild: h.guild, num: num(h.damage), text: num(h.damage).toLocaleString(),
          sub: h.bestStreak >= 3 ? `💤 連睡飽 ${h.bestStreak} 晚` : (h.nights > 0 ? `🌙 已記錄 ${h.nights} 晚` : '📭 尚無睡眠資料'),
          metrics: [
            { label: '😴 平均睡眠', value: fmtSleep(h.avgSleepMin) },
            { label: '😴 睡眠分', value: String(h.sleepPts) },
            { label: '⏰ 規律分', value: String(h.regPts) },
            { label: '⚔️ 攻擊分', value: String(h.atkPts) }
          ]
        }));
        m.guilds = (view.guilds || []).map(g => ({ name: g.name, value: num(g.perMember).toLocaleString(), sub: `人均傷害 • ${g.members.length} 人`, members: g.members || [] }));
        const pct = view.maxHp > 0 ? Math.max(0, Math.min(100, view.remainingHp / view.maxHp * 100)) : 0;
        m.summaryHtml = `<div class="ia-route"><b>👹 夢魘剩餘血量</b><div class="ia-bar ia-bar-rose"><i style="width:${pct}%"></i></div>
          <small>${num(view.remainingHp).toLocaleString()} / ${num(view.maxHp).toLocaleString()}${view.defeated ? ' • 🏆 已擊倒' : ` • 全服傷害 ${num(view.totalDamage).toLocaleString()}`}</small></div>`;
        m.keyFact = view.defeated ? '🏆 夢魘已擊倒' : `👹 剩 ${pct.toFixed(0)}%`;
        m.outcome = view.defeated ? '🏆 夢魘已擊倒' : `👹 夢魘倖存 (剩 ${pct.toFixed(0)}%)`;
      },
      flame() {
        m.primaryLabel = '個人火種';
        m.rows = (view.heroes || []).map(h => ({
          name: h.name, guild: h.guild, num: num(h.embers), text: String(h.embers),
          sub: h.today?.hasData ? `今日 ${h.today.r1 ? '🔥' : '▫️'}${h.today.r2 ? '🔥' : '▫️'}${h.today.r3 ? '🔥' : '▫️'} ${h.today.count}/3 火` : '今日尚無資料',
          metrics: [
            { label: '🌟 三火全亮', value: `${h.perfectDays} 天` },
            { label: '⛓️ 連續 / 最佳', value: `${h.currentStreak} / ${h.bestStreak} 天` }
          ]
        }));
        const dot = (s) => s === 'full' ? '🔥' : (s === 'zero' ? '🥶' : (s === 'partial' ? '🕯️' : '·'));
        m.guilds = (view.guilds || []).map(g => ({ name: g.name, value: `Lv.${g.level}`, sub: (g.history || []).slice(-7).map(x => dot(x.status)).join(''), members: g.members || [] }));
        const top = (view.guilds || [])[0];
        m.summaryHtml = top ? `<div class="ia-route"><b>👑 ${esc(top.name)} 聖火 Lv.${top.level}</b><div class="ia-torch">${(top.history || []).map(x => `<span>${dot(x.status)}</span>`).join('')}</div><small>熱度 ${top.heat} • 全員點火 ${top.fullDays} 天 • 連續 ${top.currentStreak} 天</small></div>` : '';
        m.keyFact = top ? `👑 ${top.name} Lv.${top.level}` : '';
        m.outcome = top ? `👑 冠軍公會：${top.name} (聖火 Lv.${top.level})` : '';
      },
      monastery() {
        m.primaryLabel = '總修為';
        m.rows = (view.heroes || []).map(h => ({
          name: h.name, guild: h.guild, num: num(h.total), text: num(h.total).toLocaleString(),
          sub: `🏯 ${esc(h.rank)}${h.overtrainDays ? ` • <span class="ia-bad">⚠️ 走火入魔 ${h.overtrainDays} 天</span>` : ''}`,
          metrics: [
            { label: '📿 修煉', value: num(h.trainPts).toLocaleString(), derived: true },
            { label: '🛌 恢復', value: num(h.recPts).toLocaleString(), derived: true },
            { label: '🚶 活動', value: num(h.actPts).toLocaleString(), derived: true },
            { label: '🍃 靜心加成', value: h.calmBonus ? '+' + num(h.calmBonus).toLocaleString() : '—' },
            { label: '⚠️ 走火入魔', value: `${h.overtrainDays} 天`, derived: true },
            { label: '📿 每日修煉', value: num(h.daily).toLocaleString() }
          ]
        }));
        m.guilds = (view.guilds || []).map(g => ({ name: g.name, value: num(g.perMember).toLocaleString(), sub: '人均修為', members: g.members || [] }));
        m.summaryHtml = `<div class="ia-hscroll ia-gap6">${(view.ranks || []).map(rk => `<div class="ia-mini"><span>🏯 ${esc(rk.name)}</span><b>≥ ${num(rk.value).toLocaleString()}</b><small>${m.rows.filter(r => (view.heroes || []).find(h => h.name === r.name)?.rank === rk.name).length} 人</small></div>`).join('')}</div>`;
        const t = (view.heroes || [])[0];
        m.keyFact = t ? `🏯 最高境界 ${t.rank}` : '';
        m.outcome = t ? `🏯 最高境界：${t.name}（${t.rank}）` : '';
      }
    };
    (T[type] || T.classic)();
    // 依主分數排序 (同分維持原順序)
    m.rows = m.rows.map((r, i) => ({ ...r, _i: i })).sort((a, b) => (b.num - a.num) || (a._i - b._i)).map((r, i) => ({ ...r, rank: i + 1 }));
    return m;
  }

  /** 舊版手機資料片快照：只有文字名次 */
  function buildLegacyMobileModel(type, snap) {
    const m = { type, rows: [], guilds: [], summaryHtml: '', keyFact: '', outcome: snap.summaryText || '', primaryLabel: '成績' };
    m.rows = (Array.isArray(snap.leaderboard) ? snap.leaderboard : []).map((h, i) => ({ name: h.name, guild: guildOf(h.name), num: -i, text: String(h.value ?? ''), sub: esc(h.detail || ''), metrics: [], rank: i + 1 }));
    m.guilds = (snap.guilds || []).map(g => ({ name: g.name, value: String(g.value ?? ''), sub: '', members: [] }));
    return m;
  }

  // ---------------------------------------------------------------
  // 今日增加：用同一個 builder 跑「拿掉今天資料」的 state 再相減；
  // 依賴 heroStats (Boss / 雙城 / 飢餓 / 要塞 / 拼圖) 的資料片無法單獨重算 heroStats，
  // 改用「今天每筆有效運動在本資料片的得分」加總 (與戰情室運動紀錄得分欄同一個 getActivityModeScore)
  // ---------------------------------------------------------------
  const TODAY_LABEL = { world_boss: '今日輸出', faction_war: '今日攻城', survival: '今日補血', base_builder: '今日木材', bingo: '今日 TRIMP' };
  function computeTodayGains(type, curModel) {
    const s = st();
    const today = todayYMD();
    const out = {};
    if (['classic', 'rpg'].includes(type) || isMobile(type)) {
      const prevState = { ...s, activities: (s.activities || []).filter(a => actYMD(a) !== today), dailyHealth: (s.dailyHealth || []).filter(r => (typeof normalizeDateYMD === 'function' ? normalizeDateYMD(r.date) : r.date) !== today) };
      const prev = buildModel(type, window.buildModeView(type, prevState));
      const prevMap = {};
      prev.rows.forEach(r => { prevMap[r.name] = r.num; });
      curModel.rows.forEach(r => { out[r.name] = r.num - (prevMap[r.name] ?? 0); });
      return { label: '今日增加', map: out };
    }
    const mode = st().activeMode || type;
    (s.activities || []).forEach(a => {
      if (!a.isValidAttack || a.isExcluded || actYMD(a) !== today) return;
      const sc = getActivityModeScore(a, mode);
      out[a.hero] = (out[a.hero] || 0) + num(sc.num);
    });
    return { label: TODAY_LABEL[type] || '今日增加', map: out, rowSafe: type === 'world_boss' || type === 'survival' };
  }

  // ---------------------------------------------------------------
  // 共用 UI 元件
  // ---------------------------------------------------------------
  const ui = {
    expanded: { expansion: new Set(), chronicles: new Set() },
    viewerTab: 'overview',
    badgeCat: 'ALL',
    badgeInspect: null,
    actLimit: 30,
    openAct: null,
    lastModel: { expansion: null, chronicles: null },
    page: '',
    rulesOpen: {}
  };

  function rowHtml(r, page, me, todayMap) {
    const open = ui.expanded[page]?.has(r.name);
    const metrics = (r.metrics || []).map(x => `<div class="ia-metric${x.derived ? ' ia-derived' : ''}"><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('');
    const t = todayMap && todayMap[r.name];
    return `<div class="ia-row${r.name === me ? ' ia-me' : ''}${open ? ' open' : ''}${r.dead ? ' ia-dead' : ''}" data-hero="${esc(r.name)}" data-rank="${r.rank}" data-primary="${esc(r.text)}">
      <button type="button" class="ia-row-main" onclick="IronAppUI.toggleRow(this)">
        <span class="ia-rank ${r.rank <= 3 ? 'ia-rank-' + r.rank : ''}">${r.rank}</span>
        ${avatar(r.name, 'ia-av-40', 'rounded-xl')}
        <span class="ia-row-info"><span class="ia-row-name">${esc(r.name)}${r.name === me ? '<em class="ia-you">你</em>' : ''}</span><span class="ia-row-sub">${r.sub || ''}</span></span>
        <span class="ia-row-score"><b>${esc(r.text)}</b><small>${t ? `<span class="ia-ok">${signed(t)}</span>` : ''}</small></span>
        <span class="ia-chev">▾</span>
      </button>
      <div class="ia-row-detail">
        ${metrics ? `<div class="ia-metrics">${metrics}</div>` : ''}
        ${r.bar !== undefined ? `<div class="ia-bar ia-bar-amber"><i style="width:${r.bar}%"></i></div>` : ''}
        ${r.foot ? `<p class="ia-foot">${esc(r.foot)}</p>` : ''}
        <button type="button" class="ia-link" onclick="IronAppUI.openSheet(${arg(r.name)})">查看英雄詳細 ›</button>
      </div>
    </div>`;
  }

  function guildCardsHtml(guilds) {
    if (!guilds || !guilds.length) return '';
    return `<div class="ia-section-title">🛡️ 公會排名</div><div class="ia-hscroll">${guilds.map((g, i) => `
      <div class="ia-gcard" style="border-color:${uhcSafeColor(g.color, '#334155')}88">
        <div class="ia-gcard-top"><span>${i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '#' + (i + 1)))}</span><b>${esc(g.badge || uhcFindGuild(g.name)?.badge || '🛡️')} ${esc(g.name)}</b></div>
        <div class="ia-gcard-val">${esc(g.value)}</div><div class="ia-gcard-sub">${esc(g.sub || '')}</div>
        ${(g.members || []).length ? renderGuildAvatarStack(g.members, 6) : ''}
      </div>`).join('')}</div>`;
  }

  function nameCardHtml(name, extraRight = '', subLine = '') {
    const h = uhcFindHero(name) || { name };
    const b = badgeOf(name);
    return `<div class="ia-namecard">
      ${avatar(name, 'ia-av-56', 'rounded-2xl')}
      <div class="ia-namecard-info"><div class="ia-namecard-name">${esc(name)} ${renderUnifiedTitlePill(name)}</div>
        <div class="ia-namecard-sub">${guildBadge(h.guild)} ${esc(h.guild || '無公會')} · 🎖️ ${b.unlocked}/${b.total}${subLine ? ' · ' + subLine : ''}</div></div>
      ${extraRight}
    </div>`;
  }

  function rulesHtmlFor(type) {
    const tab = typeMeta(type).tab;
    const src = document.getElementById('tab-content-' + tab);
    if (!src) return '';
    const kids = Array.from(src.children).filter(el => !el.classList.contains('season-info-bar'));
    const pick = [];
    // 世界 Boss 的第一塊是 Boss 橫幅 (摘要卡已顯示)，規則改取「三大傷害系統」說明卡
    if (tab === 'boss') { if (kids[1]) pick.push(kids[1]); } else if (kids[0]) pick.push(kids[0]);
    src.querySelectorAll('details').forEach(d => { if (!pick.includes(d)) pick.push(d); });
    return pick.map(el => {
      const c = el.cloneNode(true);
      c.removeAttribute('id');
      c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      if (c.tagName === 'DETAILS') c.setAttribute('open', '');
      return c.outerHTML;
    }).join('');
  }

  // ---------------------------------------------------------------
  // ① 資料片
  // ---------------------------------------------------------------
  function renderExpansion(root) {
    const s = st();
    const type = normType(s.activeMode);
    const meta = typeMeta(type);
    if (isMobile(type) && window.isMobileSyncEnabled && !window.isMobileSyncEnabled()) {
      root.innerHTML = `<div class="ia-card ia-center">${meta.icon}<br><b>${esc(meta.name)} 需要「手機同步 App」</b><p class="ia-muted">GM 目前未開啟手機同步功能，本資料片暫停計算。</p></div>`;
      return;
    }
    const view = window.buildModeView(type, s);
    const model = buildModel(type, view);
    ui.lastModel.expansion = model;
    const today = computeTodayGains(type, model);
    const me = selfHero();
    const myRow = model.rows.find(r => r.name === me);
    const info = typeof getSeasonInfo === 'function' ? getSeasonInfo() : null;
    const ev = typeof getActivityEventBonus === 'function' ? getActivityEventBonus(todayYMD(), s.gmOps) : null;
    const evt = ev && ev.matchedEvents && ev.matchedEvents[0];
    const chips = [
      info ? `<span class="ia-chip">📅 ${esc(info.s.slice(5))}–${esc(info.e.slice(5))}${info.phase === 'live' ? ` · 第${info.day}天 · 剩${info.left}天` : (info.phase ? ' · ' + esc(info.status) : '')}</span>` : '',
      evt ? `<span class="ia-chip ia-chip-hot">${esc(evt.icon || '⚡')} ${esc(evt.title)} +${ev.bonusPct}%</span>` : '',
      model.keyFact ? `<span class="ia-chip ia-chip-ok">${esc(model.keyFact)}</span>` : ''
    ].join('');

    let myHtml;
    if (myRow) {
      const idx = model.rows.indexOf(myRow);
      const above = model.rows[idx - 1], below = model.rows[idx + 1];
      const gapLabel = above ? `距 #${above.rank}` : '領先第2名';
      const gapVal = above ? signed(myRow.num - above.num) : (below ? signed(myRow.num - below.num) : '—');
      const status = myRow.status || uhcActivityStatus(me);
      myHtml = `<div class="ia-mycard" onclick="IronAppUI.openSheet(${arg(me)})">
          ${avatar(me, 'ia-av-56', 'rounded-2xl')}
          <div class="ia-mycard-info"><div class="ia-mycard-name">${esc(me)} ${renderUnifiedTitlePill(me)}</div>
            <div class="ia-mycard-sub">${guildBadge(myRow.guild)} ${esc(myRow.guild || '')} · ${heroBadgeText(me)} · <span class="ia-tone-${esc(status.tone)}">${esc(status.text)}</span></div></div>
          <div class="ia-mycard-rank"><b>#${myRow.rank}</b><small>/ ${model.rows.length} 人</small></div>
        </div>
        <div class="ia-stats3">
          <div class="ia-stat"><span>${esc(model.primaryLabel)}</span><b data-k="primary">${esc(myRow.text)}</b></div>
          <div class="ia-stat"><span>${gapLabel}</span><b data-k="gap" class="${above ? 'ia-bad' : 'ia-ok'}">${gapVal}</b></div>
          <div class="ia-stat"><span>${esc(today.label)}</span><b data-k="today" class="ia-ok">${signed(today.map[me] || 0)}</b></div>
        </div>`;
    } else {
      myHtml = `<div class="ia-card ia-muted">👤 ${me ? `找不到英雄「${esc(me)}」` : '尚未綁定英雄'}，請在 App 設定中選擇你的英雄後即可看到自己的名次。</div>`;
    }

    // 規則說明：預設收合；每個資料片第一次進入時自動展開一次 (localStorage 記錄)，之後尊重玩家自己的開合
    const seenKey = 'ironApp.rulesSeen.' + type;
    if (!(type in ui.rulesOpen)) {
      let first = false;
      try { if (!localStorage.getItem(seenKey)) { first = true; localStorage.setItem(seenKey, '1'); } } catch (e) {}
      ui.rulesOpen[type] = first;
    }
    const rulesOpen = ui.rulesOpen[type];
    const rules = rulesHtmlFor(type);

    root.innerHTML = `
      <div class="ia-page" data-page="expansion" data-type="${esc(type)}">
        ${myHtml}
        <div class="ia-hscroll ia-chips">${chips}</div>
        ${model.summaryHtml ? `<div class="ia-card ia-summary">${model.summaryHtml}</div>` : ''}
        ${rules ? `<details class="ia-rules"${rulesOpen ? ' open' : ''} ontoggle="IronAppUI.rulesToggled(${arg(type)}, this.open)"><summary>📜 ${esc(meta.icon)} ${esc(meta.name)}・規則說明</summary><div class="ia-rules-body">${rules}</div></details>` : ''}
        <div class="ia-section-title"><span>🏆 ${esc(model.primaryLabel)}排行</span><small>每人一行・點開看詳細</small></div>
        <div class="ia-list">${model.rows.map(r => rowHtml(r, 'expansion', me, today.rowSafe === false ? null : today.map)).join('') || '<div class="ia-card ia-muted">目前尚無英雄資料</div>'}</div>
        ${guildCardsHtml(model.guilds)}
      </div>`;
  }

  // ---------------------------------------------------------------
  // ② 我的英雄
  // ---------------------------------------------------------------
  const ACT_ICON = [[/run/i, '🏃'], [/ride|bike|cycl/i, '🚴'], [/swim/i, '🏊'], [/walk/i, '🚶'], [/hike/i, '🥾'], [/weight|strength/i, '🏋️'], [/yoga|pilates/i, '🧘'], [/row/i, '🚣'], [/workout|hiit|crossfit/i, '💪']];
  const actIcon = (a) => (ACT_ICON.find(([re]) => re.test(String(a.type || a.sportType || ''))) || [null, '⚡'])[1];
  const actTime = (a) => (typeof parseActivityDate === 'function' ? parseActivityDate(a.date || a.time)?.getTime() : Date.parse(a.date)) || 0;

  function actStatusHtml(a) {
    const mode = st().activeMode || 'classic';
    if (a.isExcluded) return '<span class="ia-bad">GM作廢</span>';
    if (a.isSuspectedDuplicate && !a.duplicateIncluded) return '<span class="ia-muted">疑似重複</span>';
    if (!a.isValidAttack) return `<span class="ia-muted">${a.inSeason ? `未滿${st().summary?.minDurationMinutes || 30}分` : '非本賽季'}</span>`;
    const sc = getActivityModeScore(a, mode);
    return `<span class="${esc(sc.cls)}">${esc(sc.text)}</span>`;
  }
  function actRowHtml(a, key, expandable = true) {
    const open = expandable && ui.openAct === key;
    return `<div class="ia-act${open ? ' open' : ''}">
      <button type="button" class="ia-act-main" ${expandable ? `onclick="IronAppUI.toggleAct(${arg(key)})"` : ''}>
        <span class="ia-act-icon">${actIcon(a)}</span>
        <span class="ia-act-info"><b>${esc(a.title || a.type || '運動')} · ${esc(a.duration)} 分</b><small>${esc(a.date || a.time || '')}${a.avgHr ? ` · 心率 ${esc(a.avgHr)}/${esc(a.maxHr)}` : ''}</small></span>
        <span class="ia-act-score">${actStatusHtml(a)}</span>
      </button>
      ${open ? `<div class="ia-metrics ia-act-detail">
        <div class="ia-metric"><span>均心率</span><b>${esc(a.avgHr ?? '—')}</b></div>
        <div class="ia-metric"><span>峰心率</span><b>${esc(a.maxHr ?? '—')}</b></div>
        <div class="ia-metric"><span>原始熱量</span><b>${Math.round(num(a.rawCalories ?? a.calories))}</b></div>
        <div class="ia-metric"><span>衝力 / 落差</span><b>${esc(a.trimp ?? 0)} / ${esc(a.gap ?? 0)}</b></div>
        <div class="ia-metric"><span>心率區間</span><b>${esc(a.zoneLabel || '—')}</b></div>
        <div class="ia-metric"><span>來源</span><b>${/^\d+$/.test(String(a.id)) ? 'Strava' : esc(window.getActivitySourceMeta ? (window.getActivitySourceMeta(a).brand || window.getActivitySourceMeta(a).label) : '手動')}</b></div>
      </div>` : ''}
    </div>`;
  }
  function heroActs(name) {
    return (st().activities || []).filter(a => a.hero === name).sort((x, y) => actTime(y) - actTime(x));
  }
  function latestUnlocked(name, n) {
    const catalog = getActiveBadgeCatalogList();
    const map = st().heroBadges?.[name] || {};
    return catalog.filter(b => map[b.id]).map(b => ({ b, at: String(map[b.id].unlockedAt || '') })).sort((x, y) => y.at.localeCompare(x.at)).slice(0, n);
  }
  function badgeIcon(b, unlocked, onclick) {
    const rm = (window.BADGE_RARITY_META || {})[b.rarity] || {};
    return unlocked
      ? `<button type="button" class="ia-badge on ${esc(rm.border || '')}" title="${esc(b.name)}" ${onclick ? `onclick="${onclick}"` : ''}>${b.icon}</button>`
      : `<button type="button" class="ia-badge" title="🔒 神秘未解鎖徽章" ${onclick ? `onclick="${onclick}"` : ''}>🔒</button>`;
  }

  function renderViewer(root) {
    const s = st();
    const me = selfHero();
    const meExists = Boolean(me && uhcFindHero(me));
    let name = (typeof selectedViewerHero !== 'undefined' && selectedViewerHero) || me;
    if (name && !uhcFindHero(name)) {
      name = (s.heroes && s.heroes[0] && s.heroes[0].name) || name;
    }
    const hero = uhcFindHero(name) || { name, guild: '自由英雄', age: 35, maxHr: 185 };
    const maxHr = hero.maxHr || 185;
    const b = badgeOf(name);
    const kpis = Array.from(document.querySelectorAll('#hero-kpi-cards > div')).map(d => {
      const sp = d.querySelectorAll('span');
      return { label: (sp[0]?.textContent || '').trim(), value: (sp[1]?.textContent || '').trim() };
    }).filter(k => k.label);
    const zoneSegs = Array.from(document.querySelectorAll('#hero-hr-zone-card .h-3 > div')).map(d => parseFloat(d.style.width) || 0);
    const acts = heroActs(name);
    const tabs = [['overview', '總覽'], ['badges', '徽章'], ['acts', '運動紀錄']];
    let body = '';
    if (ui.viewerTab === 'overview') {
      const hs = typeof window.getHeroHealthSummary === 'function' ? window.getHeroHealthSummary(s, name, 7) : null;
      const sleepTxt = hs?.avgSleepMin ? `${Math.floor(hs.avgSleepMin / 60)}h ${Math.round(hs.avgSleepMin % 60)}m` : '—';
      const f0 = (v) => (v === null || v === undefined) ? '—' : Math.round(v).toLocaleString();
      const zoneColors = ['#475569', '#10b981', '#f59e0b', '#f97316', '#f43f5e'];
      body = `
        <div class="ia-kpi">${kpis.map(k => `<div class="ia-stat"><span>${esc(k.label)}</span><b>${esc(k.value)}</b></div>`).join('')}</div>
        <div class="ia-section-title"><span>💓 心率區間</span><small>${acts.length} 次運動</small></div>
        <div class="ia-card"><div class="ia-zonebar">${zoneSegs.map((w, i) => `<i style="width:${w}%;background:${zoneColors[i]}"></i>`).join('')}</div>
          <div class="ia-zonelbl"><span>Z1 ${zoneSegs[0] ?? 0}%</span><span class="ia-ok">Z2 ${zoneSegs[1] ?? 0}%</span><span>Z3 ${zoneSegs[2] ?? 0}%</span><span>Z4 ${zoneSegs[3] ?? 0}%</span><span class="ia-bad">Z5 ${zoneSegs[4] ?? 0}%</span></div></div>
        ${hs ? `<div class="ia-section-title"><span>📱 近 7 天身體狀態</span><small>手機同步</small></div>
          <div class="ia-kpi"><div class="ia-stat"><span>👣 平均步數</span><b>${f0(hs.avgSteps)}</b></div><div class="ia-stat"><span>😴 平均睡眠</span><b>${sleepTxt}</b></div>
          <div class="ia-stat"><span>💓 靜止心率</span><b>${f0(hs.avgRestingHr)} bpm</b></div><div class="ia-stat"><span>⚡ 活動分鐘</span><b>${f0(hs.avgActiveMin)} 分</b></div></div>` : ''}
        <div class="ia-section-title"><span>🎖️ 最近解鎖</span><button type="button" class="ia-textbtn" onclick="IronAppUI.setViewerTab('badges')">全部 ›</button></div>
        <div class="ia-badgegrid">${(() => { const l = latestUnlocked(name, 6); const cells = l.map(x => badgeIcon(x.b, true, `IronAppUI.inspectBadge(${esc(JSON.stringify(x.b.id))})`)); while (cells.length < 6) cells.push('<span class="ia-badge">🔒</span>'); return cells.join(''); })()}</div>
        <div class="ia-section-title"><span>🏃 最近運動</span><button type="button" class="ia-textbtn" onclick="IronAppUI.setViewerTab('acts')">全部 ›</button></div>
        <div class="ia-list">${acts.slice(0, 3).map((a, i) => actRowHtml(a, 'ov' + i)).join('') || '<div class="ia-card ia-muted">尚無運動紀錄</div>'}</div>`;
    } else if (ui.viewerTab === 'badges') {
      const catalog = getActiveBadgeCatalogList();
      const map = s.heroBadges?.[name] || {};
      const cats = ['ALL', ...Array.from(new Set(catalog.map(x => x.cat)))];
      if (!cats.includes(ui.badgeCat)) ui.badgeCat = 'ALL';
      const list = ui.badgeCat === 'ALL' ? catalog : catalog.filter(x => x.cat === ui.badgeCat);
      const pct = b.total ? (b.unlocked / b.total * 100) : 0;
      body = `
        <div class="ia-card"><div class="ia-row-between"><b>🎖️ 收集進度</b><b class="ia-amber">${b.unlocked} / ${b.total}</b></div><div class="ia-bar ia-bar-amber"><i style="width:${pct}%"></i></div></div>
        <div class="ia-hscroll ia-chips">${cats.map(c => { const tot = c === 'ALL' ? catalog.length : catalog.filter(x => x.cat === c).length; const un = (c === 'ALL' ? catalog : catalog.filter(x => x.cat === c)).filter(x => map[x.id]).length; return `<button type="button" class="ia-chip${ui.badgeCat === c ? ' ia-chip-on' : ''}" onclick="IronAppUI.setBadgeCat(${esc(JSON.stringify(c))})">${c === 'ALL' ? '🌟 全部' : esc(c)} ${un}/${tot}</button>`; }).join('')}</div>
        <div id="ia-badge-inspector">${ui.badgeInspect ? buildBadgeInspectorHtml(name, ui.badgeInspect) : '<div class="ia-card ia-muted ia-small">💡 點格子查看取得條件；未解鎖徽章維持迷霧狀態。</div>'}</div>
        <div class="ia-badgegrid">${list.map(x => badgeIcon(x, Boolean(map[x.id]), `IronAppUI.inspectBadge(${esc(JSON.stringify(x.id))})`)).join('')}</div>`;
    } else {
      body = `<div class="ia-section-title"><span>🏃 運動紀錄</span><small>共 ${acts.length} 筆</small></div>
        <div class="ia-list">${acts.slice(0, ui.actLimit).map(a => actRowHtml(a, 'a' + String(a.id))).join('') || '<div class="ia-card ia-muted">尚無運動紀錄</div>'}</div>
        ${acts.length > ui.actLimit ? `<button type="button" class="ia-more" onclick="IronAppUI.moreActs()">顯示更多 (${acts.length - ui.actLimit})</button>` : ''}`;
    }
    root.innerHTML = `
      <div class="ia-page" data-page="viewer">
        ${me && !meExists ? `<div class="ia-card ia-muted">👤 找不到英雄「${esc(me)}」，請在切換英雄選單中選擇要查看的英雄。</div>` : ''}
        <div class="ia-switchrow">
          <button type="button" class="ia-chip ia-chip-on" onclick="IronAppUI.openPicker()">👤 ${esc(name)} ▾</button>
          ${meExists && name !== me ? `<button type="button" class="ia-chip" onclick="IronAppUI.selectHero(${arg(me)})">↩ 回到我</button>` : '<span class="ia-muted ia-small">切換查看其他英雄</span>'}
        </div>
        <div class="ia-namecard ia-namecard-big">
          ${avatar(name, 'ia-av-56', 'rounded-2xl')}
          <div class="ia-namecard-info"><div class="ia-namecard-name">${esc(name)} ${renderUnifiedTitlePill(name)}</div>
            <div class="ia-namecard-sub">${guildBadge(hero.guild)} ${esc(hero.guild || '')} · ${esc(hero.age ?? '—')} 歲 · 最大心率 ${esc(maxHr)}</div>
            <div class="ia-namecard-sub">Zone2 ${Math.round(0.60 * maxHr)}–${Math.round(0.75 * maxHr)} · Zone5 &gt;${Math.round(0.85 * maxHr)} bpm</div></div>
          <div class="ia-mycard-rank"><b>${b.unlocked}</b><small>/ ${b.total} 徽章</small></div>
        </div>
        <div class="ia-tabs">${tabs.map(([k, l]) => `<button type="button" class="${ui.viewerTab === k ? 'on' : ''}" onclick="IronAppUI.setViewerTab('${k}')">${l}</button>`).join('')}</div>
        ${body}
      </div>`;
  }

  // ---------------------------------------------------------------
  // ③ 英雄史
  // ---------------------------------------------------------------
  /** 快照 → 排行 model (分派規則與網頁 renderSnapshotBodyHtml 相同；舊快照走轉接器) */
  function snapshotModel(snap, type) {
    if (snap.schema === 2 && snap.view) return buildModel(type, snap.view);
    if (isMobile(type)) return buildLegacyMobileModel(type, snap);
    if (type === 'survival') return buildModel('survival', legacySnapshotView(snap, 'survival'));
    if (type === 'classic' || snap.classicData || (snap.champions && !snap.classMasters && !snap.boss)) {
      return buildModel('classic', (snap.classicData && Object.keys(snap.classicData).length) ? snap.classicData : snap);
    }
    if (type === 'rpg' || snap.classMasters) return buildModel('rpg', snap);
    return buildModel('world_boss', legacySnapshotView(snap, 'world_boss'));
  }

  function renderChronicles(root) {
    const snaps = (typeof getAllSnapshots === 'function' ? getAllSnapshots() : []).filter(x => x && x.isVisible !== false);
    if (!snaps.length) { root.innerHTML = '<div class="ia-card ia-muted ia-center">尚無可顯示的歷史快照</div>'; return; }
    const snap = snaps.find(x => x.id === selectedChronicle) || snaps[0];
    const type = normType(snap.type);
    const meta = typeMeta(type);
    const me = selfHero();
    const frozenCtx = { heroes: snap.heroInfo || {}, guilds: snap.guildInfo || {}, legacy: !snap.heroInfo };
    let model, detailHtml = '';
    try {
      model = withFrozenHeroInfo(frozenCtx, () => snapshotModel(snap, type));
      detailHtml = withFrozenHeroInfo(frozenCtx, () => renderSnapshotBodyHtml(snap, type));
    } catch (e) {
      console.error('[IronAppUI] 快照解析失敗', e);
      model = { rows: [], guilds: [], outcome: '此快照資料格式無法解析', primaryLabel: '' };
    }
    ui.lastModel.chronicles = { model, frozenCtx };
    const myRow = model.rows.find(r => r.name === me);
    const bossImg = snap.view?.boss?.avatar || snap.boss?.avatar;
    const cards = snaps.map(x => {
      const t = normType(x.type), mt = typeMeta(t);
      return `<button type="button" class="ia-season${x.id === snap.id ? ' on' : ''}" onclick="IronAppUI.pickSnapshot(${arg(x.id)})"><span>${mt.icon} ${esc(mt.name)}</span><b>${esc(x.seasonTitle || x.id)}</b><small>${esc(x.seasonPeriod || '')}</small></button>`;
    }).join('');
    const top3 = model.rows.slice(0, 3);
    const podium = top3.length ? withFrozenHeroInfo(frozenCtx, () => `<div class="ia-podium">${[1, 0, 2].map(i => top3[i] ? `
        <div class="ia-pod ia-pod-${i + 1}" onclick="IronAppUI.openSheet(${arg(top3[i].name)})">${avatar(top3[i].name, i === 0 ? 'ia-av-64' : 'ia-av-48', 'rounded-2xl')}<b>${esc(top3[i].name)}</b><small>${esc(top3[i].text)}</small><div class="ia-pod-base">${i + 1}</div></div>` : '<div class="ia-pod"></div>').join('')}</div>`) : '';
    const rowsHtml = withFrozenHeroInfo(frozenCtx, () => model.rows.map(r => rowHtml(r, 'chronicles', me, null)).join(''));
    const guildHtml = withFrozenHeroInfo(frozenCtx, () => guildCardsHtml(model.guilds));
    root.innerHTML = `
      <div class="ia-page" data-page="chronicles" data-snap="${esc(snap.id)}">
        <div class="ia-hscroll ia-seasons">${cards}</div>
        <div class="ia-result">
          <div class="ia-result-img">${type === 'world_boss' && bossImg ? `<img src="${esc(bossImg)}" alt="">` : meta.icon}</div>
          <div class="ia-result-info"><b>${esc(snap.seasonTitle || snap.id)}</b>
            <small>🔒 時間凍結 · ${esc(snap.seasonPeriod || '')}</small>
            <small>${esc(model.outcome || snap.statusLabel || '')}</small></div>
        </div>
        ${podium ? `<div class="ia-section-title"><span>🥇 本季前三名</span></div>${podium}` : ''}
        <div class="ia-section-title"><span>📜 完整排行（凍結）</span><small>${myRow ? `你：#${myRow.rank}` : ''}</small></div>
        <div class="ia-list">${rowsHtml || '<div class="ia-card ia-muted">此快照沒有英雄資料</div>'}</div>
        ${guildHtml}
        <details class="ia-rules ia-more-detail"><summary>更多細節</summary><div class="ia-rules-body">${detailHtml}</div></details>
      </div>`;
  }

  // ---------------------------------------------------------------
  // ④ 英雄詳細底部面板
  // ---------------------------------------------------------------
  function ensureSheet() {
    let el = document.getElementById('ia-sheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ia-sheet';
    el.className = 'ia-sheet';
    el.innerHTML = `<div class="ia-sheet-backdrop" onclick="IronAppUI.closeSheet()"></div>
      <div class="ia-sheet-panel" role="dialog" aria-modal="true"><div class="ia-sheet-handle"><i></i></div><button type="button" class="ia-sheet-close" onclick="IronAppUI.closeSheet()" aria-label="關閉">✕</button><div class="ia-sheet-body"></div></div>`;
    document.body.appendChild(el);
    // 下滑關閉
    const panel = el.querySelector('.ia-sheet-panel');
    let y0 = null, dy = 0;
    panel.addEventListener('touchstart', (e) => { if (panel.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
    panel.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = e.touches[0].clientY - y0; if (dy > 0) panel.style.transform = `translateY(${dy}px)`; }, { passive: true });
    panel.addEventListener('touchend', () => { if (y0 === null) return; panel.style.transform = ''; if (dy > 90) api.closeSheet(); y0 = null; dy = 0; });
    return el;
  }
  let sheetState = { name: '', tab: 'mode' };
  function renderSheet() {
    const el = ensureSheet();
    const name = sheetState.name;
    const hist = ui.page === 'chronicles' ? ui.lastModel.chronicles : null;
    const model = hist ? hist.model : ui.lastModel.expansion;
    const ctx = hist ? hist.frozenCtx : null;
    const draw = () => {
      const row = model?.rows?.find(r => r.name === name);
      const right = row ? `<div class="ia-mycard-rank"><b>#${row.rank}</b><small>${esc(row.text)}</small></div>` : '';
      let body = '';
      if (sheetState.tab === 'mode') {
        body = row ? `<div class="ia-kpi"><div class="ia-stat"><span>${esc(model.primaryLabel)}</span><b>${esc(row.text)}</b></div><div class="ia-stat"><span>名次</span><b>#${row.rank} / ${model.rows.length}</b></div>
            ${(row.metrics || []).map(x => `<div class="ia-stat"><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>
            ${row.bar !== undefined ? `<div class="ia-bar ia-bar-amber"><i style="width:${row.bar}%"></i></div>` : ''}${row.foot ? `<p class="ia-foot">${esc(row.foot)}</p>` : ''}`
          : '<div class="ia-card ia-muted">本資料片尚無此英雄的成績</div>';
      } else if (sheetState.tab === 'badges') {
        const b = badgeOf(name);
        const l = latestUnlocked(name, 12);
        body = `<div class="ia-row-between"><b>🎖️ 已解鎖徽章</b><b class="ia-amber">${b.unlocked} / ${b.total}</b></div>
          <div class="ia-badgegrid">${l.map(x => badgeIcon(x.b, true, '')).join('') || '<span class="ia-muted ia-small">尚未解鎖任何徽章</span>'}</div>`;
      } else {
        body = `<div class="ia-list">${heroActs(name).slice(0, 3).map((a, i) => actRowHtml(a, 's' + i, false)).join('') || '<div class="ia-card ia-muted">尚無運動紀錄</div>'}</div>`;
      }
      return `${nameCardHtml(name, right, row && row.status ? esc(row.status.text) : esc(uhcActivityStatus(name).text))}
        <div class="ia-tabs">${[['mode', hist ? '該季成績' : '本資料片'], ['badges', '徽章'], ['acts', '最近運動']].map(([k, l]) => `<button type="button" class="${sheetState.tab === k ? 'on' : ''}" onclick="IronAppUI.sheetTab('${k}')">${l}</button>`).join('')}</div>
        ${body}
        <button type="button" class="ia-link ia-link-big" onclick="IronAppUI.viewHero(${arg(name)})">在「我的英雄」查看完整資料 ›</button>`;
    };
    el.querySelector('.ia-sheet-body').innerHTML = (ctx && sheetState.tab === 'mode') ? withFrozenHeroInfo(ctx, draw) : draw();
  }

  function openPicker() {
    const el = ensureSheet();
    const me = selfHero();
    const cur = (typeof selectedViewerHero !== 'undefined' && selectedViewerHero) || me;
    const heroes = [...(st().heroes || [])].sort((a, b) => (a.name === me ? -1 : b.name === me ? 1 : String(a.guild || '').localeCompare(String(b.guild || '')) || String(a.name).localeCompare(String(b.name))));
    el.querySelector('.ia-sheet-body').innerHTML = `<div class="ia-section-title"><span>👤 切換英雄</span></div><div class="ia-list">${heroes.map(h => `
      <button type="button" class="ia-pick${h.name === cur ? ' on' : ''}" onclick="IronAppUI.selectHero(${arg(h.name)})">${avatar(h.name, 'ia-av-40', 'rounded-xl')}<span class="ia-row-info"><span class="ia-row-name">${esc(h.name)}${h.name === me ? '<em class="ia-you">你</em>' : ''}</span><span class="ia-row-sub">${guildBadge(h.guild)} ${esc(h.guild || '')}</span></span></button>`).join('')}</div>`;
    el.classList.add('open');
  }

  // ---------------------------------------------------------------
  // 主渲染 / 公開 API
  // ---------------------------------------------------------------
  function ensureRoot() {
    let root = document.getElementById('app-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'app-root';
      const banner = document.getElementById('gm-live-broadcast-banner');
      if (banner && banner.parentNode) banner.parentNode.insertBefore(root, banner.nextSibling); else document.body.prepend(root);
    }
    return root;
  }
  function render() {
    if (!IS_APP) return;
    const s = st();
    if (!s || !s.heroes) return;
    const root = ensureRoot();
    const tab = (typeof currentMainTab !== 'undefined') ? currentMainTab : 'expansion';
    const page = tab === 'viewer' ? 'viewer' : (tab === 'chronicles' ? 'chronicles' : 'expansion');
    if (page !== ui.page) { ui.page = page; }
    try {
      if (page === 'viewer') renderViewer(root);
      else if (page === 'chronicles') renderChronicles(root);
      else renderExpansion(root);
    } catch (e) {
      console.error('[IronAppUI] render', e);
      root.innerHTML = '<div class="ia-card ia-muted">畫面載入失敗，請下拉重新整理。</div>';
    }
    document.documentElement.setAttribute('data-ia-page', page);
  }

  const api = {
    isApp: IS_APP,
    render,
    buildModel,
    snapshotModel,
    computeTodayGains,
    toggleRow(btn) {
      const row = btn.closest('.ia-row'); if (!row) return;
      const page = row.closest('[data-page]')?.getAttribute('data-page') || 'expansion';
      const name = row.getAttribute('data-hero');
      const set = ui.expanded[page] || (ui.expanded[page] = new Set());
      if (set.has(name)) { set.delete(name); row.classList.remove('open'); } else { set.add(name); row.classList.add('open'); }
    },
    openSheet(name) { sheetState = { name: String(name), tab: 'mode' }; renderSheet(); ensureSheet().classList.add('open'); return true; },
    closeSheet() { const el = document.getElementById('ia-sheet'); if (el) el.classList.remove('open'); },
    sheetTab(k) { sheetState.tab = k; renderSheet(); },
    viewHero(name) { api.closeSheet(); api.selectHero(name, true); },
    openPicker,
    selectHero(name, goViewer) {
      api.closeSheet();
      try { selectedViewerHero = String(name); } catch (e) {}
      const sel = document.getElementById('viewer-hero-select');
      if (sel) sel.value = String(name);
      ui.badgeInspect = null; ui.openAct = null; ui.actLimit = 30;
      if (goViewer && currentMainTab !== 'viewer') { window.IronApp.show('viewer'); return; }
      if (typeof loadHeroViewerData === 'function') loadHeroViewerData();
      render();
    },
    setViewerTab(k) { ui.viewerTab = k; render(); window.scrollTo(0, 0); },
    setBadgeCat(c) { ui.badgeCat = c; ui.badgeInspect = null; render(); },
    inspectBadge(id) { ui.badgeInspect = id; if (ui.viewerTab !== 'badges') ui.viewerTab = 'badges'; render(); const el = document.getElementById('ia-badge-inspector'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); },
    toggleAct(key) { ui.openAct = ui.openAct === key ? null : key; render(); },
    moreActs() { ui.actLimit += 30; render(); },
    rulesToggled(type, open) { ui.rulesOpen[type] = Boolean(open); },
    pickSnapshot(id) {
      try { selectedChronicle = String(id); } catch (e) {}
      const sel = document.getElementById('chronicles-season-select'); if (sel) sel.value = String(id);
      if (typeof renderChroniclesView === 'function') renderChroniclesView();
      ui.expanded.chronicles = new Set();
      render();
    }
  };
  window.IronAppUI = api;
  if (!IS_APP) return;

  // 掛勾：網頁分頁切換 / 全部重繪後同步更新 App 介面；App 模式下英雄彈窗改成底部面板
  const wrap = (fnName, after) => {
    const orig = window[fnName];
    if (typeof orig !== 'function') return;
    window[fnName] = function () { const r = orig.apply(this, arguments); try { after(); } catch (e) { console.error('[IronAppUI]', e); } return r; };
  };
  wrap('switchMainTab', render);
  wrap('renderAllGameViews', render);
  const origModal = window.openHeroDetailModal;
  window.openHeroDetailModal = function (name) { if (api.openSheet(name)) return; return origModal && origModal.apply(this, arguments); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeSheet(); });
  if (document.readyState !== 'loading') render(); else document.addEventListener('DOMContentLoaded', () => setTimeout(render, 0));
})();
