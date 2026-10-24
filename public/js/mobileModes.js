/**
 * 鋼鐵英雄紀元 — 📱 手機同步資料片引擎 (Mobile Sync Expansions)
 * -------------------------------------------------------------------------
 * 資料片八：🗺️ 萬步遠征 (expedition)
 * 資料片九：🌙 夢境守護者 (dream)
 * 資料片十：🕯️ 不滅之火 (flame)
 * 資料片十一：🧘 鐵人修行院 (monastery)
 *
 * 設計原則：
 * 1. 只在 GM 開啟「手機同步 App」(gmOps.mobileSync.enabled) 時才能被選用；關閉時前台顯示提示、不計算。
 * 2. 只使用五大品牌 (小米/Apple Watch/Pixel Watch/Garmin/Samsung) 都能取得的數據：
 *    步數、運動紀錄、心率 (推算靜止心率/活動分鐘)、睡眠時長、入睡/起床時間。
 * 3. 所有參數 (勝利條件、門檻、權重) 由 GM 後台調整，存於 game_config.mobile_modes_config。
 * 4. 每日得分 × 當日 GM 限時加成倍率 (與 7 大經典資料片共用同一套活動日曆)。
 * 5. 缺資料不倒扣：某天沒有睡眠/步數資料，只是拿不到該項分數。
 * 6. 純函式計算 (前台、GM 後台、賽季快照共用)，不修改原始資料。
 */

const MOBILE_MODE_KEYS = ['expedition', 'dream', 'flame', 'monastery'];

const MOBILE_MODE_META = {
  expedition: { num: '八', icon: '🗺️', name: '萬步遠征', en: 'Step Expedition', lucide: 'map', short: '資料片八•遠征' },
  dream: { num: '九', icon: '🌙', name: '夢境守護者', en: 'Dream Guardians', lucide: 'moon', short: '資料片九•夢境' },
  flame: { num: '十', icon: '🕯️', name: '不滅之火', en: 'Eternal Flame', lucide: 'flame', short: '資料片十•聖火' },
  monastery: { num: '十一', icon: '🧘', name: '鐵人修行院', en: 'Iron Monastery', lucide: 'mountain', short: '資料片十一•修行' }
};

const MOBILE_MODE_DEFAULTS = {
  expedition: {
    routeName: '環台遠征',
    routeKm: 1200,            // 勝利條件：全服累計里程抵達終點
    stepsPerKm: 1300,         // 每 1,300 步 = 1 km
    dailyStepCap: 25000,      // 每人每日步數上限 (防刷)
    workoutKmPerMin: 0.05,    // 有效運動每分鐘額外 +0.05 km (健身房訓練也能推進)
    rideFactor: 0.3,          // 騎車距離折算
    swimFactor: 4,            // 游泳距離折算
    checkpoints: '台北:0\n新竹:80\n台中:170\n嘉義:260\n台南:330\n高雄:380\n墾丁:480\n台東:640\n花蓮:810\n宜蘭:1000\n台北(終點):1200'
  },
  dream: {
    sleepTargetMin: 420,          // 睡滿 7 小時拿滿睡眠分
    sleepPts: 60,                 // 睡眠分上限
    regularityPts: 20,            // 作息規律分上限
    regularityToleranceMin: 60,   // 入睡時間偏離個人中位數 60 分鐘 → 規律分歸零
    regularityWindowDays: 14,     // 個人中位數取前 14 晚
    workoutPts: 20,               // 白天運動 (攻擊) 分上限
    workoutFullMin: 60,           // 當天有效運動 60 分鐘拿滿
    nightmareHpPerHeroDay: 60     // 夢魘總血量 = 英雄數 × 賽季天數 × 60 (勝利條件)
  },
  flame: {
    activeMinGoal: 30,        // 🔥 第一道火：中高強度活動 30 分鐘 (或完成一次有效運動)
    stepGoal: 8000,           // 🔥 第二道火：8,000 步
    sleepGoalMin: 420,        // 🔥 第三道火：睡滿 7 小時
    minRingsForGuildDay: 2,   // 公會每位 (有資料的) 成員至少點亮 2 道火 → 公會當日「全員點火」聖火 +1
    decayOnZeroDay: 1         // 有成員 (有資料) 0 道火 → 聖火 -1
  },
  monastery: {
    baselineDays: 7,          // 賽季前 7 天 (有資料的日子) 的靜止心率中位數 = 個人基準
    trimpCap: 150,            // 當日訓練負荷 (TRIMP) 150 拿滿修煉分
    trainPts: 40,
    sleepTargetMin: 420,
    recoveryPts: 30,
    activeMinGoal: 30,
    activePts: 10,
    rhrPointsPerBpm: 150,     // 靜止心率每比基準下降 1 bpm → +150 修為
    acwrLimit: 1.5,           // 急性/慢性負荷比 > 1.5 且睡眠不足 → 走火入魔
    acwrMinChronic: 100,      // 慢性負荷 (每週平均 TRIMP) 至少 100 才判定走火入魔，避免剛開始運動的新手被誤判
    poorSleepMin: 360,        // 近 3 晚平均睡眠 < 6 小時視為睡眠不足
    overtrainPenalty: 0.5,    // 走火入魔當日修為 × 0.5
    ranks: '初學者:0\n行者:1200\n武僧:2800\n羅漢:4800\n宗師:7200'
  }
};

function isMobileMode(mode) { return MOBILE_MODE_KEYS.includes(mode); }
function isMobileSyncEnabled(state) { return Boolean((state || window.gameState || {})?.gmOps?.mobileSync?.enabled); }

function getMobileModesConfig(state) {
  const saved = (state || window.gameState || {}).mobileModes || {};
  const out = {};
  MOBILE_MODE_KEYS.forEach(k => {
    const merged = { ...MOBILE_MODE_DEFAULTS[k], ...(saved[k] || {}) };
    // 數值欄位防呆：非數字或負數退回預設
    Object.keys(MOBILE_MODE_DEFAULTS[k]).forEach(f => {
      if (typeof MOBILE_MODE_DEFAULTS[k][f] === 'number') {
        const v = Number(merged[f]);
        merged[f] = Number.isFinite(v) && v >= 0 ? v : MOBILE_MODE_DEFAULTS[k][f];
      }
    });
    out[k] = merged;
  });
  return out;
}

function parseNamedList(text, fallback) {
  const rows = String(text || fallback || '').split(/\n|,|，/).map(s => s.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.+?)[:：]\s*(\d+(?:\.\d+)?)$/);
    return m ? { name: m[1].trim(), value: Number(m[2]) } : null;
  }).filter(Boolean).sort((a, b) => a.value - b.value);
  return rows.length ? rows : parseNamedList(fallback, '');
}

// ---------------------------------------------------------------------------
// 共用資料整理
// ---------------------------------------------------------------------------
function mmSeasonDays(state) {
  const startYMD = normalizeDateYMD(state.seasonStart || '');
  const endYMD = normalizeDateYMD(state.seasonEnd || '');
  if (!startYMD) return [];
  const todayYMD = getTodayYMD();
  const last = (endYMD && endYMD < todayYMD) ? endYMD : todayYMD;
  const days = [];
  for (let d = startYMD, guard = 0; d <= last && guard < 400; d = addDaysYMD(d, 1), guard++) days.push(d);
  return days;
}

function mmPrepare(state) {
  const st = state || window.gameState || {};
  const heroes = (st.heroes || []).map(h => h.name);
  const daily = {};      // hero -> ymd -> row
  (st.dailyHealth || []).forEach(r => {
    const ymd = normalizeDateYMD(r.date);
    if (!ymd || !r.hero) return;
    (daily[r.hero] = daily[r.hero] || {})[ymd] = r;
  });
  const validActs = {};  // hero -> ymd -> [acts]  (本賽季有效、未作廢、非疑似重複)
  const loadActs = {};   // hero -> ymd -> rawTrimp sum (含賽季前，計算慢性負荷用)
  const minDur = st.summary?.minDurationMinutes || 30;
  (st.activities || []).forEach(a => {
    const ymd = normalizeDateYMD(a.date || a.time);
    if (!ymd || !a.hero) return;
    if (a.isValidAttack) ((validActs[a.hero] = validActs[a.hero] || {})[ymd] = (validActs[a.hero][ymd] || [])).push(a);
    const dupNotCounted = a.isSuspectedDuplicate && !a.duplicateIncluded;
    if (!a.isExcluded && !dupNotCounted && (Number(a.duration) || 0) >= minDur) {
      const m = (loadActs[a.hero] = loadActs[a.hero] || {});
      m[ymd] = (m[ymd] || 0) + (Number(a.rawTrimp ?? a.trimp) || 0);
    }
  });
  const days = mmSeasonDays(st);
  const multCache = {};
  const mult = (ymd) => {
    if (!(ymd in multCache)) multCache[ymd] = (typeof getActivityEventBonus === 'function' ? getActivityEventBonus(ymd, st.gmOps) : { multiplier: 1 }).multiplier || 1;
    return multCache[ymd];
  };
  const guildOf = {};
  (st.heroes || []).forEach(h => { guildOf[h.name] = h.guild || '自由英雄'; });
  const guilds = {};
  (st.heroes || []).forEach(h => { (guilds[guildOf[h.name]] = guilds[guildOf[h.name]] || []).push(h.name); });
  return { st, heroes, daily, validActs, loadActs, days, mult, guildOf, guilds };
}

const mmNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const mmMedian = (arr) => {
  const a = arr.filter(v => Number.isFinite(v)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mmRound = (v, d = 1) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
function mmClockToMin(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let v = Number(m[1]) * 60 + Number(m[2]);
  if (v < 12 * 60) v += 24 * 60; // 凌晨入睡視為「同一晚」延續 (01:00 → 25:00)
  return v;
}
function mmMinToClock(v) {
  if (v === null || v === undefined) return '—';
  const x = ((Math.round(v) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 資料片八：🗺️ 萬步遠征
// 每日里程 = min(步數, 每日上限) ÷ 每公里步數 + 有效運動分鐘 × 每分鐘里程 + 騎車距離 × 折算 + 游泳距離 × 折算
// × 當日限時加成倍率。全服合作推進地圖；公會依里程排名。
// ---------------------------------------------------------------------------
function computeExpedition(state) {
  const P = mmPrepare(state);
  const cfg = getMobileModesConfig(P.st).expedition;
  const heroRows = P.heroes.map(name => {
    let stepKm = 0, workoutKm = 0, distKm = 0, total = 0, steps = 0, activeDays = 0;
    P.days.forEach(ymd => {
      const row = P.daily[name]?.[ymd];
      const acts = P.validActs[name]?.[ymd] || [];
      const s = Math.min(mmNum(row?.steps), cfg.dailyStepCap);
      const sk = cfg.stepsPerKm > 0 ? s / cfg.stepsPerKm : 0;
      let wk = 0, dk = 0;
      acts.forEach(a => {
        wk += mmNum(a.duration) * cfg.workoutKmPerMin;
        const t = String(a.type || '').toLowerCase();
        if (/ride|bike|cycl/.test(t)) dk += mmNum(a.distance) * cfg.rideFactor;
        else if (/swim/.test(t)) dk += mmNum(a.distance) * cfg.swimFactor;
      });
      const day = (sk + wk + dk) * P.mult(ymd);
      if (s > 0 || acts.length) activeDays++;
      steps += s; stepKm += sk; workoutKm += wk; distKm += dk; total += day;
    });
    return { name, guild: P.guildOf[name], steps, stepKm: mmRound(stepKm), workoutKm: mmRound(workoutKm), distKm: mmRound(distKm), km: mmRound(total), activeDays };
  }).sort((a, b) => b.km - a.km);
  const totalKm = mmRound(heroRows.reduce((s, h) => s + h.km, 0));
  const checkpoints = parseNamedList(cfg.checkpoints, MOBILE_MODE_DEFAULTS.expedition.checkpoints);
  const reached = checkpoints.filter(c => totalKm >= c.value);
  const next = checkpoints.find(c => totalKm < c.value) || null;
  const guildRows = Object.entries(P.guilds).map(([g, members]) => {
    const km = mmRound(heroRows.filter(h => members.includes(h.name)).reduce((s, h) => s + h.km, 0));
    return { name: g, members, km, perMember: mmRound(km / Math.max(1, members.length)) };
  }).sort((a, b) => b.km - a.km);
  return {
    cfg, heroes: heroRows, guilds: guildRows, totalKm,
    routeKm: cfg.routeKm, progressPct: cfg.routeKm > 0 ? Math.min(100, (totalKm / cfg.routeKm) * 100) : 0,
    completed: cfg.routeKm > 0 && totalKm >= cfg.routeKm, checkpoints, reached, next, days: P.days.length
  };
}

// ---------------------------------------------------------------------------
// 資料片九：🌙 夢境守護者
// 每日 (以起床日計)：睡眠分 = min(睡眠, 目標)/目標 × 睡眠分上限
//                    規律分 = max(0, 1 − |入睡時間 − 個人前 N 晚中位數| / 容許分鐘) × 規律分上限
//                    攻擊分 = min(當日有效運動分鐘, 滿分分鐘)/滿分分鐘 × 攻擊分上限
// 當日總分 × 限時加成倍率 = 對夢魘造成的傷害。全服合作擊倒夢魘；公會依人均傷害排名。
// ---------------------------------------------------------------------------
function computeDream(state) {
  const P = mmPrepare(state);
  const cfg = getMobileModesConfig(P.st).dream;
  const heroRows = P.heroes.map(name => {
    let total = 0, sleepSum = 0, sleepNights = 0, regSum = 0, atkSum = 0, slpSum = 0, perfectNights = 0, streak = 0, bestStreak = 0;
    const bedHistory = [];
    const devs = [];
    P.days.forEach(ymd => {
      const row = P.daily[name]?.[ymd];
      const sleep = mmNum(row?.sleep_minutes);
      const bed = mmClockToMin(row?.bed_time);
      let sleepScore = 0, regScore = 0;
      if (sleep > 0) {
        sleepScore = Math.min(sleep, cfg.sleepTargetMin) / Math.max(1, cfg.sleepTargetMin) * cfg.sleepPts;
        sleepSum += sleep; sleepNights++;
        if (sleep >= cfg.sleepTargetMin) { perfectNights++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
      } else streak = 0;
      if (bed !== null) {
        const hist = bedHistory.slice(-cfg.regularityWindowDays);
        const med = hist.length >= 3 ? mmMedian(hist) : null;
        const dev = med === null ? 0 : Math.abs(bed - med);
        if (med !== null) devs.push(dev);
        regScore = Math.max(0, 1 - dev / Math.max(1, cfg.regularityToleranceMin)) * cfg.regularityPts;
        bedHistory.push(bed);
      }
      const mins = (P.validActs[name]?.[ymd] || []).reduce((s, a) => s + mmNum(a.duration), 0);
      const atk = Math.min(mins, cfg.workoutFullMin) / Math.max(1, cfg.workoutFullMin) * cfg.workoutPts;
      const m = P.mult(ymd);
      total += (sleepScore + regScore + atk) * m;
      slpSum += sleepScore * m; regSum += regScore * m; atkSum += atk * m;
    });
    return {
      name, guild: P.guildOf[name], damage: Math.round(total), sleepPts: Math.round(slpSum), regPts: Math.round(regSum), atkPts: Math.round(atkSum),
      avgSleepMin: sleepNights ? sleepSum / sleepNights : null, nights: sleepNights, perfectNights, bestStreak,
      medianBed: mmMedian(bedHistory), avgDevMin: devs.length ? devs.reduce((s, v) => s + v, 0) / devs.length : null
    };
  }).sort((a, b) => b.damage - a.damage);
  const seasonDaysTotal = (() => {
    const s = normalizeDateYMD(P.st.seasonStart || ''), e = normalizeDateYMD(P.st.seasonEnd || '');
    return (s && e) ? Math.max(1, diffDaysYMD(s, e) + 1) : Math.max(1, P.days.length);
  })();
  const maxHp = Math.round(P.heroes.length * seasonDaysTotal * cfg.nightmareHpPerHeroDay);
  const totalDamage = heroRows.reduce((s, h) => s + h.damage, 0);
  const guildRows = Object.entries(P.guilds).map(([g, members]) => {
    const dmg = heroRows.filter(h => members.includes(h.name)).reduce((s, h) => s + h.damage, 0);
    return { name: g, members, damage: dmg, perMember: Math.round(dmg / Math.max(1, members.length)) };
  }).sort((a, b) => b.perMember - a.perMember);
  return { cfg, heroes: heroRows, guilds: guildRows, maxHp, totalDamage, remainingHp: Math.max(0, maxHp - totalDamage), defeated: maxHp > 0 && totalDamage >= maxHp, days: P.days.length };
}

// ---------------------------------------------------------------------------
// 資料片十：🕯️ 不滅之火
// 每人每日三道火：① 活動分鐘 ≥ 目標 或 完成一次有效運動　② 步數 ≥ 目標　③ 睡眠 ≥ 目標
// 公會每日：所有「有資料」的成員都點亮 ≥ N 道火 → 聖火熱度 + 1 × 限時加成倍率；
//          有成員 (有資料) 0 道火 → 熱度 − 衰減值 (最低 0)。沒有資料的成員當天不列入判定 (缺資料不倒扣)。
// 聖火等級 = floor(熱度)。勝利條件：賽季結束時聖火等級最高的公會 (同分比總火種)。
// ---------------------------------------------------------------------------
function computeFlame(state) {
  const P = mmPrepare(state);
  const cfg = getMobileModesConfig(P.st).flame;
  const ringsOf = (name, ymd) => {
    const row = P.daily[name]?.[ymd];
    const acts = P.validActs[name]?.[ymd] || [];
    const hasData = Boolean(row) || acts.length > 0;
    const r1 = mmNum(row?.active_minutes) >= cfg.activeMinGoal || acts.length > 0;
    const r2 = mmNum(row?.steps) >= cfg.stepGoal;
    const r3 = mmNum(row?.sleep_minutes) >= cfg.sleepGoalMin;
    return { hasData, r1, r2, r3, count: (r1 ? 1 : 0) + (r2 ? 1 : 0) + (r3 ? 1 : 0) };
  };
  const heroRows = P.heroes.map(name => {
    let embers = 0, perfectDays = 0, streak = 0, bestStreak = 0, dataDays = 0;
    P.days.forEach(ymd => {
      const r = ringsOf(name, ymd);
      if (r.hasData) dataDays++;
      embers += r.count * P.mult(ymd);
      if (r.count === 3) { perfectDays++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
    });
    const today = P.days.length ? ringsOf(name, P.days[P.days.length - 1]) : { r1: false, r2: false, r3: false, count: 0, hasData: false };
    return { name, guild: P.guildOf[name], embers: mmRound(embers), perfectDays, bestStreak, currentStreak: streak, dataDays, today };
  });
  const guildRows = Object.entries(P.guilds).map(([g, members]) => {
    let heat = 0, fullDays = 0, zeroDays = 0, streak = 0, bestStreak = 0;
    const history = [];
    P.days.forEach(ymd => {
      const rs = members.map(n => ringsOf(n, ymd)).filter(r => r.hasData);
      let status = 'nodata';
      if (rs.length > 0) {
        if (rs.every(r => r.count >= cfg.minRingsForGuildDay)) { heat += P.mult(ymd); fullDays++; streak++; bestStreak = Math.max(bestStreak, streak); status = 'full'; }
        else { streak = 0; status = 'partial'; }
        if (rs.some(r => r.count === 0)) { heat = Math.max(0, heat - cfg.decayOnZeroDay); zeroDays++; status = 'zero'; }
      }
      history.push({ ymd, status });
    });
    const embers = heroRows.filter(h => members.includes(h.name)).reduce((s, h) => s + h.embers, 0);
    return { name: g, members, heat: mmRound(heat, 2), level: Math.floor(heat), fullDays, zeroDays, currentStreak: streak, bestStreak, embers: mmRound(embers), history: history.slice(-14) };
  }).sort((a, b) => (b.level - a.level) || (b.embers - a.embers));
  return { cfg, heroes: heroRows.sort((a, b) => b.embers - a.embers), guilds: guildRows, days: P.days.length };
}

// ---------------------------------------------------------------------------
// 資料片十一：🧘 鐵人修行院 (跟自己比)
// 每日修為 = [ min(當日 TRIMP, 上限)/上限 × 修煉分 + min(睡眠, 目標)/目標 × 恢復分 + min(活動分鐘, 目標)/目標 × 活動分 ] × 限時加成倍率
// 走火入魔：急性負荷 (近 7 天 TRIMP 合計) ÷ 慢性負荷 (近 28 天 TRIMP 合計 ÷ 4) > 上限 且 近 3 晚平均睡眠 < 門檻 → 當日修為 × 懲罰倍率
// 靜心加成 = max(0, 基準靜止心率 − 近 7 天靜止心率中位數) × 每 bpm 修為 (需至少「基準天數 + 3」天資料)
// 總修為 = Σ 每日修為 + 靜心加成；依門檻晉級。
// ---------------------------------------------------------------------------
function computeMonastery(state) {
  const P = mmPrepare(state);
  const cfg = getMobileModesConfig(P.st).monastery;
  const ranks = parseNamedList(cfg.ranks, MOBILE_MODE_DEFAULTS.monastery.ranks);
  const rankOf = (pts) => {
    let cur = ranks[0], next = null;
    ranks.forEach((r, i) => { if (pts >= r.value) { cur = r; next = ranks[i + 1] || null; } });
    return { rank: cur?.name || '初學者', next };
  };
  const heroRows = P.heroes.map(name => {
    const load = P.loadActs[name] || {};
    const sumLoad = (endYMD, n) => { let s = 0; for (let i = 0; i < n; i++) s += mmNum(load[addDaysYMD(endYMD, -i)]); return s; };
    let dailyTotal = 0, overtrainDays = 0, trainSum = 0, recSum = 0, actSum = 0;
    const sleepHist = [];
    const rhrSeq = [];
    P.days.forEach(ymd => {
      const row = P.daily[name]?.[ymd];
      const trimp = mmNum(load[ymd]);
      const sleep = mmNum(row?.sleep_minutes);
      const actMin = mmNum(row?.active_minutes);
      if (sleep > 0) sleepHist.push(sleep);
      if (mmNum(row?.resting_hr) > 0) rhrSeq.push(mmNum(row.resting_hr));
      const train = Math.min(trimp, cfg.trimpCap) / Math.max(1, cfg.trimpCap) * cfg.trainPts;
      const rec = Math.min(sleep, cfg.sleepTargetMin) / Math.max(1, cfg.sleepTargetMin) * cfg.recoveryPts;
      const act = Math.min(actMin, cfg.activeMinGoal) / Math.max(1, cfg.activeMinGoal) * cfg.activePts;
      let day = (train + rec + act) * P.mult(ymd);
      const acute = sumLoad(ymd, 7);
      const chronic = sumLoad(ymd, 28) / 4;
      const recentSleep = sleepHist.slice(-3);
      const avgRecentSleep = recentSleep.length ? recentSleep.reduce((s, v) => s + v, 0) / recentSleep.length : null;
      if (chronic >= Math.max(1, cfg.acwrMinChronic) && acute / chronic > cfg.acwrLimit && avgRecentSleep !== null && avgRecentSleep < cfg.poorSleepMin) {
        day *= cfg.overtrainPenalty; overtrainDays++;
      }
      dailyTotal += day; trainSum += train; recSum += rec; actSum += act;
    });
    const baseline = rhrSeq.length >= cfg.baselineDays ? mmMedian(rhrSeq.slice(0, cfg.baselineDays)) : null;
    const current = rhrSeq.length >= cfg.baselineDays + 3 ? mmMedian(rhrSeq.slice(-7)) : null;
    const rhrDrop = (baseline !== null && current !== null) ? baseline - current : null;
    const calmBonus = rhrDrop !== null ? Math.max(0, rhrDrop) * cfg.rhrPointsPerBpm : 0;
    const lastDay = P.days[P.days.length - 1];
    const acuteNow = lastDay ? sumLoad(lastDay, 7) : 0;
    const chronicNow = lastDay ? sumLoad(lastDay, 28) / 4 : 0;
    const total = Math.round(dailyTotal + calmBonus);
    const { rank, next } = rankOf(total);
    return {
      name, guild: P.guildOf[name], total, daily: Math.round(dailyTotal), calmBonus: Math.round(calmBonus), overtrainDays,
      baselineRhr: baseline, currentRhr: current, rhrDrop: rhrDrop === null ? null : mmRound(rhrDrop),
      acwr: chronicNow > 0 ? mmRound(acuteNow / chronicNow, 2) : null, rank, nextRank: next,
      trainPts: Math.round(trainSum), recPts: Math.round(recSum), actPts: Math.round(actSum)
    };
  }).sort((a, b) => b.total - a.total);
  const guildRows = Object.entries(P.guilds).map(([g, members]) => {
    const t = heroRows.filter(h => members.includes(h.name)).reduce((s, h) => s + h.total, 0);
    return { name: g, members, total: t, perMember: Math.round(t / Math.max(1, members.length)) };
  }).sort((a, b) => b.perMember - a.perMember);
  return { cfg, ranks, heroes: heroRows, guilds: guildRows, days: P.days.length };
}

function computeMobileMode(mode, state) {
  if (mode === 'expedition') return computeExpedition(state);
  if (mode === 'dream') return computeDream(state);
  if (mode === 'flame') return computeFlame(state);
  if (mode === 'monastery') return computeMonastery(state);
  return null;
}

/** 每位英雄在當前手機資料片的「主分數」(戰情室 KPI / 英雄卡 / 快照用) */
function getMobileHeroScore(mode, heroName, state) {
  const r = computeMobileMode(mode, state);
  return r ? (r.heroes || []).find(h => h.name === heroName) || null : null;
}

// ---------------------------------------------------------------------------
// 前台渲染
// ---------------------------------------------------------------------------
function mmEsc(s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? ''); }
function mmHeroLink(name) {
  const arg = typeof jsArg === 'function' ? jsArg(name) : JSON.stringify(String(name));
  return `<span class="cursor-pointer hover:text-amber-300 font-bold text-white" onclick="openHeroDetailModal(${arg})">${mmEsc(name)}</span>`;
}
// 統一英雄卡 (game.js 的 renderUnifiedHeroCard；大頭貼 / 名字 / 公會 / 狀態 / 徽章數 + 資料片指標)
function mmHeroCards(cards, emptyText) {
  return typeof window.renderUnifiedHeroGrid === 'function' ? window.renderUnifiedHeroGrid(cards, emptyText || '目前尚無英雄資料') : cards.join('');
}
function mmCard(name, opts) {
  return typeof window.renderUnifiedHeroCard === 'function' ? window.renderUnifiedHeroCard(name, opts) : `<div class="p-2">${mmHeroLink(name)}</div>`;
}
function mmStack(members) {
  return typeof window.renderGuildAvatarStack === 'function' && (members || []).length ? `<div class="pt-1.5">${window.renderGuildAvatarStack(members)}</div>` : '';
}
function mmLore(meta, desc) {
  return `
    <div class="bg-slate-900 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-lg">
      <div class="flex flex-wrap items-center gap-2 mb-1">
        <h2 class="text-xl font-black text-amber-500">【資料片${meta.num}】${meta.icon} ${meta.name} (${meta.en})</h2>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">📱 手機同步資料片</span>
      </div>
      <p class="text-slate-300 text-sm leading-relaxed">${desc}</p>
    </div>`;
}
function mmRulesBox(lines) {
  return `
    <details class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300" open>
      <summary class="cursor-pointer font-bold text-amber-400">📐 計分規則與設計原因 (GM 可在後台調整參數)</summary>
      <ul class="mt-2 space-y-1.5 list-disc pl-5 leading-relaxed">${lines.map(l => `<li>${l}</li>`).join('')}</ul>
      <p class="mt-2 text-[11px] text-slate-500">⚡ GM 限時加成活動期間，當日得分自動乘上加成倍率。缺資料 (例如手錶沒電) 只會拿不到當天該項分數，不會倒扣。</p>
    </details>`;
}
function mmNoData(r) {
  const hasAny = (r.heroes || []).some(h => Object.values(h).some(v => typeof v === 'number' && v > 0));
  return hasAny ? '' : `<div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-center text-slate-400 text-sm">📭 目前還沒有收到手機同步數據。請玩家安裝「鋼鐵英雄同步器」並完成授權，數據上傳後這裡會自動更新。</div>`;
}

function renderMobileModeDisabledNotice(container, mode) {
  const meta = MOBILE_MODE_META[mode] || { num: '', icon: '📱', name: '手機同步資料片' };
  container.innerHTML = `
    <div class="p-6 rounded-2xl bg-slate-900/80 border border-amber-500/40 text-center space-y-2">
      <div class="text-3xl">${meta.icon}</div>
      <h2 class="text-lg font-black text-white">【資料片${meta.num}】${meta.name} 需要「手機同步 App」</h2>
      <p class="text-sm text-slate-400">GM 目前未開啟手機同步功能，因此本資料片暫停計算。請 GM 到後台「📱 手機同步 App 管理中心」開啟，或切換回 7 大經典資料片。</p>
    </div>`;
}

function renderExpeditionView() {
  const container = document.getElementById('tab-content-expedition');
  if (!container) return;
  if (!isMobileSyncEnabled()) return renderMobileModeDisabledNotice(container, 'expedition');
  container.innerHTML = renderExpeditionHtml(computeExpedition());
}

/** 由 computeExpedition() 結果產生畫面 HTML (現場與「過往英雄史」快照共用) */
function renderExpeditionHtml(r) {
  const c = r.cfg;
  const meta = MOBILE_MODE_META.expedition;
  return mmLore(meta, `全服英雄踏上「${mmEsc(c.routeName)}」！每天的步數、健身房訓練與騎乘游泳都會轉換成里程，一起在賽季結束前抵達終點 ${c.routeKm.toLocaleString()} km。抵達的每座城市都是全服共同的里程碑。`) + `
    <div class="bg-slate-900/80 border border-amber-500/40 rounded-2xl p-5 space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div><div class="text-xs text-slate-400">全服累計里程</div><div class="text-3xl font-black font-rpg text-amber-400">${r.totalKm.toLocaleString()} <span class="text-base text-slate-400">/ ${r.routeKm.toLocaleString()} km</span></div></div>
        <div class="text-right text-xs text-slate-300">${r.completed ? '🏆 <b class="text-emerald-400">遠征成功！全服抵達終點</b>' : (r.next ? `下一站：<b class="text-white">${mmEsc(r.next.name)}</b>（還差 ${mmRound(r.next.value - r.totalKm).toLocaleString()} km）` : '')}</div>
      </div>
      <div class="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800"><div class="h-full bg-gradient-to-r from-amber-500 to-orange-500" style="width:${r.progressPct}%"></div></div>
      <div class="flex flex-wrap gap-1.5 text-[11px]">${r.checkpoints.map(cp => `<span class="px-2 py-0.5 rounded-full border ${r.totalKm >= cp.value ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' : 'bg-slate-950 border-slate-800 text-slate-500'}">${r.totalKm >= cp.value ? '🚩' : '⬜'} ${mmEsc(cp.name)} ${cp.value}km</span>`).join('')}</div>
    </div>
    ${mmNoData(r)}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-amber-400">🛡️ 公會遠征貢獻</h3>
        ${r.guilds.map((g, i) => `<div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"><div class="flex justify-between gap-2"><span class="font-bold text-white min-w-0">${i === 0 ? '🥇 ' : ''}${mmEsc(g.name)} <span class="text-slate-500 font-normal">(${g.members.length} 人，人均 ${g.perMember} km)</span></span><span class="font-rpg font-bold text-amber-400 shrink-0">${g.km.toLocaleString()} km</span></div>${mmStack(g.members)}</div>`).join('')}
      </div>
      <div class="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 class="text-sm font-bold text-amber-400">🥾 英雄里程榜</h3>
        ${mmHeroCards(r.heroes.map((h, i) => mmCard(h.name, {
          rank: i + 1, guild: h.guild,
          status: [i === 0 && h.km > 0 ? { text: '👑 遠征先鋒', tone: 'gold' } : null, { text: `📅 貢獻 ${h.activeDays} 天`, tone: h.activeDays > 0 ? 'ok' : 'muted' }].filter(Boolean),
          primary: { label: '總里程', value: `${h.km} km`, accent: 'text-amber-400' },
          metrics: [
            { label: '👣 步數里程', value: `${h.stepKm} km`, accent: 'text-cyan-300' },
            { label: '🏋️ 訓練里程', value: `${h.workoutKm} km`, accent: 'text-rose-300' },
            { label: '🚴 騎/游', value: `${h.distKm} km`, accent: 'text-emerald-300' }
          ]
        })))}
      </div>
    </div>
    ${mmRulesBox([
      `<b>每日里程</b> = min(步數, ${c.dailyStepCap.toLocaleString()}) ÷ ${c.stepsPerKm.toLocaleString()} 步/km ＋ 有效運動分鐘 × ${c.workoutKmPerMin} km ＋ 騎車距離 × ${c.rideFactor} ＋ 游泳距離 × ${c.swimFactor}。<br><span class="text-slate-500">原因：步數讓每天的移動都有貢獻；健身房訓練沒有距離，所以用「有效運動分鐘」換算里程，讓重訓族也能推進；騎車比走路省力、游泳距離短，所以分別折算。跑步/走路的距離已包含在步數中，不重複計算。</span>`,
      `<b>每日步數上限 ${c.dailyStepCap.toLocaleString()} 步</b>：防止搖手機刷步數。`,
      `<b>勝利條件</b>：賽季結束前全服累計里程 ≥ ${c.routeKm.toLocaleString()} km 即遠征成功；公會依累計里程排名。`
    ])}`;
}

function renderDreamView() {
  const container = document.getElementById('tab-content-dream');
  if (!container) return;
  if (!isMobileSyncEnabled()) return renderMobileModeDisabledNotice(container, 'dream');
  container.innerHTML = renderDreamHtml(computeDream());
}

/** 由 computeDream() 結果產生畫面 HTML (現場與「過往英雄史」快照共用) */
function renderDreamHtml(r) {
  const c = r.cfg;
  const minDur = r.minDur || (window.gameState?.summary?.minDurationMinutes) || 30;
  const hpPct = r.maxHp > 0 ? Math.max(0, Math.min(100, r.remainingHp / r.maxHp * 100)) : 0;
  const fmtSleep = (m) => m ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}m` : '—';
  return mmLore(MOBILE_MODE_META.dream, `夢魘每晚都在侵蝕英雄們的意志。<b>睡得飽、作息規律</b>的英雄能築起夢境結界，<b>白天運動</b>則化為攻擊力。只睡不動、或只動不睡都無法發揮全力——全服一起在賽季結束前擊倒夢魘！`) + `
    <div class="bg-slate-900/80 border border-amber-500/40 rounded-2xl p-5 space-y-2">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div><div class="text-xs text-slate-400">👹 夢魘剩餘血量</div><div class="text-3xl font-black font-rpg ${r.defeated ? 'text-emerald-400' : 'text-rose-400'}">${r.remainingHp.toLocaleString()} <span class="text-base text-slate-400">/ ${r.maxHp.toLocaleString()}</span></div></div>
        <div class="text-xs text-slate-300">${r.defeated ? '🏆 <b class="text-emerald-400">夢魘已被擊倒！</b>' : `全服累計傷害 ${r.totalDamage.toLocaleString()}`}</div>
      </div>
      <div class="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800"><div class="h-full bg-gradient-to-r from-rose-600 to-amber-500" style="width:${hpPct}%"></div></div>
    </div>
    ${mmNoData(r)}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-amber-400">🛡️ 公會守護力 (人均傷害)</h3>
        ${r.guilds.map((g, i) => `<div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs"><div class="flex justify-between gap-2"><span class="font-bold text-white min-w-0">${i === 0 ? '🥇 ' : ''}${mmEsc(g.name)} <span class="text-slate-500 font-normal">(${g.members.length} 人)</span></span><span class="font-rpg font-bold text-amber-400 shrink-0">${g.perMember.toLocaleString()}</span></div>${mmStack(g.members)}</div>`).join('')}
      </div>
      <div class="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-amber-400">🌙 守護者榜</h3>
        ${mmHeroCards(r.heroes.map((h, i) => mmCard(h.name, {
          rank: i + 1, guild: h.guild,
          status: [
            i === 0 && h.damage > 0 ? { text: '👑 首席守護者', tone: 'gold' } : null,
            h.bestStreak >= 3 ? { text: `💤 連睡飽 ${h.bestStreak} 晚`, tone: 'info' } : (h.nights > 0 ? { text: `🌙 已記錄 ${h.nights} 晚`, tone: 'muted' } : { text: '📭 尚無睡眠資料', tone: 'muted' })
          ].filter(Boolean),
          primary: { label: '總傷害', value: h.damage.toLocaleString(), accent: 'text-amber-400' },
          metrics: [
            { label: '😴 平均睡眠', value: fmtSleep(h.avgSleepMin), accent: 'text-cyan-300' },
            { label: '🛏️ 慣常入睡', value: mmMinToClock(h.medianBed), accent: 'text-purple-300' },
            { label: '😴 睡眠分', value: h.sleepPts },
            { label: '⏰ 規律分', value: h.regPts },
            { label: '⚔️ 攻擊分', value: h.atkPts, accent: 'text-rose-300' }
          ]
        })))}
      </div>
    </div>
    ${mmRulesBox([
      `<b>一句話：每天最多拿 100 分 ＝ 😴 睡得夠 ${c.sleepPts} 分 ＋ ⏰ 準時睡 ${c.regularityPts} 分 ＋ ⚔️ 白天有運動 ${c.workoutPts} 分。</b>每天的分數就是你對夢魘造成的傷害（遇到 GM 限時加成會再乘上倍率）。`,
      `<b>😴 睡得夠（最多 ${c.sleepPts} 分）</b>：睡滿 <b>${Math.round(c.sleepTargetMin / 60 * 10) / 10} 小時</b>拿滿分，睡不到就照比例給。<br><span class="text-slate-400">例：睡 ${Math.round(c.sleepTargetMin / 2 / 60 * 10) / 10} 小時 → ${Math.round(c.sleepPts / 2)} 分。睡超過 ${Math.round(c.sleepTargetMin / 60 * 10) / 10} 小時不會再加分（不鼓勵賴床）。昨晚的睡眠算在「今天早上起床」那一天。</span>`,
      `<b>⏰ 準時睡（最多 ${c.regularityPts} 分）</b>：跟<b>你自己平常的上床時間</b>比，不是跟別人比。平常幾點睡，今晚也差不多那時候睡就拿滿分；早睡或晚睡超過 ${c.regularityToleranceMin} 分鐘就拿 0 分，中間照比例。<br><span class="text-slate-400">例：你平常 00:30 睡 → 今晚 00:30 睡拿 ${c.regularityPts} 分、01:00 睡拿 ${Math.round(c.regularityPts * Math.max(0, 1 - 30 / Math.max(1, c.regularityToleranceMin)))} 分、${c.regularityToleranceMin >= 60 ? '01:30' : '更晚'} 以後睡拿 0 分。所以夜貓子只要每天固定時間睡，也能拿滿。「平常」= 你最近 ${c.regularityWindowDays} 晚上床時間的中間值；剛開始不到 3 晚的資料時，這項直接給滿分。</span>`,
      `<b>⚔️ 白天有運動（最多 ${c.workoutPts} 分）</b>：當天<b>有效運動</b>（單次滿 ${minDur} 分鐘才算）累計滿 <b>${c.workoutFullMin} 分鐘</b>拿滿分，不到就照比例給。<br><span class="text-slate-400">例：運動 ${Math.round(c.workoutFullMin / 2)} 分鐘 → ${Math.round(c.workoutPts / 2)} 分。只睡不動最多拿 ${c.sleepPts + c.regularityPts} 分，要運動才能拿到 100 分。</span>`,
      `<b>🧮 完整例子</b>：睡 6 小時（${Math.round(Math.min(360, c.sleepTargetMin) / Math.max(1, c.sleepTargetMin) * c.sleepPts)} 分）＋ 比平常晚 30 分鐘睡（${Math.round(c.regularityPts * Math.max(0, 1 - 30 / Math.max(1, c.regularityToleranceMin)))} 分）＋ 運動 45 分鐘（${Math.round(Math.min(45, c.workoutFullMin) / Math.max(1, c.workoutFullMin) * c.workoutPts)} 分）＝ 當天傷害 <b class="text-amber-400">${Math.round(Math.min(360, c.sleepTargetMin) / Math.max(1, c.sleepTargetMin) * c.sleepPts) + Math.round(c.regularityPts * Math.max(0, 1 - 30 / Math.max(1, c.regularityToleranceMin))) + Math.round(Math.min(45, c.workoutFullMin) / Math.max(1, c.workoutFullMin) * c.workoutPts)}</b>。`,
      `<b>🏆 怎麼贏</b>：夢魘總血量 = 英雄人數 × 賽季天數 × ${c.nightmareHpPerHeroDay}（也就是大家平均每天拿 ${c.nightmareHpPerHeroDay} 分，剛好在賽季最後一天打倒）。全服傷害加總在賽季結束前打完血量就勝利。公會排名看「平均每人傷害」，人少的公會也公平。<br><span class="text-slate-500">不看深眠 / REM 等睡眠階段，因為每個品牌的手錶判斷標準差很多，比了不公平。</span>`
    ])}`;
}

function renderFlameView() {
  const container = document.getElementById('tab-content-flame');
  if (!container) return;
  if (!isMobileSyncEnabled()) return renderMobileModeDisabledNotice(container, 'flame');
  container.innerHTML = renderFlameHtml(computeFlame());
}

/** 由 computeFlame() 結果產生畫面 HTML (現場與「過往英雄史」快照共用) */
function renderFlameHtml(r) {
  const c = r.cfg;
  const dot = (s) => s === 'full' ? '🔥' : (s === 'zero' ? '🥶' : (s === 'partial' ? '🕯️' : '·'));
  return mmLore(MOBILE_MODE_META.flame, `每個公會守護一盞聖火。每位英雄每天點亮三道火焰：<b>動起來、走起來、睡飽飽</b>。全員都點火，聖火就升級；有人完全熄火，聖火會減弱。團隊一起把聖火守到賽季最後！`) + `
    ${mmNoData(r)}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${r.guilds.map((g, i) => `
        <div class="bg-slate-900/80 border ${i === 0 ? 'border-amber-500/60' : 'border-slate-800'} rounded-2xl p-4 space-y-2">
          <div class="flex items-center justify-between"><span class="font-black text-white">${i === 0 ? '👑 ' : ''}${mmEsc(g.name)}</span><span class="font-rpg text-2xl font-black text-amber-400">Lv.${g.level}</span></div>
          <div class="text-[11px] text-slate-400">熱度 ${g.heat} • 全員點火 ${g.fullDays} 天 • 連續 ${g.currentStreak} 天 (最佳 ${g.bestStreak}) • 火種 ${g.embers}</div>
          <div class="font-mono text-base tracking-widest">${g.history.map(h => `<span title="${h.ymd} ${h.status}">${dot(h.status)}</span>`).join('')}</div>
          <div class="uhc-list">${r.heroes.filter(h => g.members.includes(h.name)).map(h => mmCard(h.name, {
            compact: true, guild: h.guild, highlight: false,
            status: [h.today.hasData
              ? { text: `今日 ${h.today.r1 ? '🔥' : '▫️'}${h.today.r2 ? '🔥' : '▫️'}${h.today.r3 ? '🔥' : '▫️'} ${h.today.count}/3`, tone: h.today.count === 3 ? 'gold' : (h.today.count > 0 ? 'warn' : 'bad'), title: '今日三道火：活動 / 步數 / 睡眠' }
              : { text: '今日尚無資料', tone: 'muted' }],
            primary: { label: '個人火種', value: h.embers, accent: 'text-amber-400' },
            metrics: [
              { label: '🌟 三火全亮', value: `${h.perfectDays} 天`, accent: 'text-cyan-300' },
              { label: '⛓️ 連續 / 最佳', value: `${h.currentStreak} / ${h.bestStreak} 天`, accent: 'text-rose-300' }
            ]
          })).join('')}</div>
        </div>`).join('')}
    </div>
    ${mmRulesBox([
      `<b>三道火</b>：① 中高強度活動 ≥ ${c.activeMinGoal} 分鐘，或完成一次有效運動　② 步數 ≥ ${c.stepGoal.toLocaleString()}　③ 睡眠 ≥ ${Math.round(c.sleepGoalMin / 60 * 10) / 10} 小時。<span class="text-slate-500">原因：對應「運動、日常活動、恢復」三個健康支柱；健身房訓練直接點亮第一道火。</span>`,
      `<b>公會聖火</b>：當天所有「有資料」的成員都點亮 ≥ ${c.minRingsForGuildDay} 道火 → 熱度 +1 (× 限時加成倍率)；若有成員 0 道火 → 熱度 −${c.decayOnZeroDay}。聖火等級 = 熱度取整數。<span class="text-slate-500">原因：鼓勵隊友互相提醒；當天沒有任何資料的成員 (例如手錶沒電) 不列入判定，不會拖累全隊。</span>`,
      `<b>個人火種</b> = 每天點亮的火焰數 × 限時加成倍率的累計，用來顯示個人貢獻與公會同等級時的排名。`,
      `<b>勝利條件</b>：賽季結束時聖火等級最高的公會獲勝（同等級比較總火種）。`
    ])}`;
}

function renderMonasteryView() {
  const container = document.getElementById('tab-content-monastery');
  if (!container) return;
  if (!isMobileSyncEnabled()) return renderMobileModeDisabledNotice(container, 'monastery');
  container.innerHTML = renderMonasteryHtml(computeMonastery());
}

/** 由 computeMonastery() 結果產生畫面 HTML (現場與「過往英雄史」快照共用) */
function renderMonasteryHtml(r) {
  const c = r.cfg;
  return mmLore(MOBILE_MODE_META.monastery, `在鐵人修行院裡，<b>你的對手是昨天的自己</b>。規律訓練、好好睡覺、保持活動就能累積修為；靜止心率比入門時下降，代表心肺真正變強，額外獲得「靜心加成」。但連續爆練又不睡覺會<b>走火入魔</b>！`) + `
    ${mmNoData(r)}
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
      <div class="flex flex-wrap gap-1.5 text-[11px]">${r.ranks.map(rk => `<span class="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300">${mmEsc(rk.name)} ≥ ${rk.value.toLocaleString()}</span>`).join('')}</div>
      ${mmHeroCards(r.heroes.map((h, i) => mmCard(h.name, {
        rank: i + 1, guild: h.guild,
        status: [
          { text: `🏯 ${h.rank}`, tone: 'gold' },
          h.overtrainDays ? { text: `⚠️ 走火入魔 ${h.overtrainDays} 天`, tone: 'bad' } : { text: '🧘 心境平穩', tone: 'ok' }
        ],
        primary: { label: '總修為', value: h.total.toLocaleString(), accent: 'text-amber-400' },
        metrics: [
          { label: '📿 每日修煉', value: h.daily.toLocaleString() },
          { label: '🍃 靜心加成', value: h.calmBonus ? '+' + h.calmBonus.toLocaleString() : '—', accent: 'text-emerald-300' },
          { label: '🫀 靜止心率', value: `${h.baselineRhr !== null ? Math.round(h.baselineRhr) : '—'}→${h.currentRhr !== null ? Math.round(h.currentRhr) : '—'}${h.rhrDrop !== null ? ` (${h.rhrDrop > 0 ? '−' : '+'}${Math.abs(h.rhrDrop)})` : ''}`, accent: h.rhrDrop !== null && h.rhrDrop > 0 ? 'text-emerald-300' : '' },
          { label: '📈 負荷比 ACWR', value: h.acwr !== null ? h.acwr : '—', accent: h.acwr !== null && h.acwr > c.acwrLimit ? 'text-rose-400' : '' },
          { label: '⏭️ 下一境界', value: h.nextRank ? `${h.nextRank.name} 差 ${Math.max(0, h.nextRank.value - h.total).toLocaleString()}` : '已達巔峰', accent: 'text-purple-300' }
        ]
      })))}
    </div>
    ${mmRulesBox([
      `<b>每日修為</b> = min(當日 TRIMP, ${c.trimpCap}) ÷ ${c.trimpCap} × ${c.trainPts} ＋ min(睡眠, ${c.sleepTargetMin}) ÷ ${c.sleepTargetMin} × ${c.recoveryPts} ＋ min(活動分鐘, ${c.activeMinGoal}) ÷ ${c.activeMinGoal} × ${c.activePts}。<span class="text-slate-500">原因：訓練、恢復、日常活動三者平衡；每項都有上限，練越多不代表分越高。</span>`,
      `<b>走火入魔</b>：近 7 天 TRIMP ÷ (近 28 天 TRIMP ÷ 4) > ${c.acwrLimit}，且近 3 晚平均睡眠 < ${Math.round(c.poorSleepMin / 60 * 10) / 10} 小時 → 當日修為 × ${c.overtrainPenalty}。(慢性負荷需 ≥ 每週 ${c.acwrMinChronic} TRIMP 才判定，新手剛起步不會被誤判)<span class="text-slate-500">原因：運動科學常用「急慢性負荷比 (ACWR)」判斷受傷風險，突然爆練又睡不好最容易受傷。</span>`,
      `<b>靜心加成</b> = max(0, 基準靜止心率 − 近 7 天中位數) × ${c.rhrPointsPerBpm}。基準 = 賽季開始後前 ${c.baselineDays} 天有資料日子的中位數；至少要有 ${c.baselineDays + 3} 天資料才開始計算。<span class="text-slate-500">原因：靜止心率下降是心肺進步最可靠的長期指標；跟自己比，新手與老手都有機會。靜止心率由 App 從睡眠期間最低 30 分鐘平均心率推算，各品牌一致。</span>`,
      `<b>勝利條件</b>：依總修為晉級境界（門檻可調）；公會依人均修為排名。`
    ])}`;
}

/** 手機資料片畫面 HTML (快照用：直接吃凍結的 compute 結果) */
function renderMobileModeHtml(mode, r) {
  if (!r) return '';
  if (mode === 'expedition') return renderExpeditionHtml(r);
  if (mode === 'dream') return renderDreamHtml(r);
  if (mode === 'flame') return renderFlameHtml(r);
  if (mode === 'monastery') return renderMonasteryHtml(r);
  return '';
}

function renderMobileModeView(mode) {
  if (mode === 'expedition') return renderExpeditionView();
  if (mode === 'dream') return renderDreamView();
  if (mode === 'flame') return renderFlameView();
  if (mode === 'monastery') return renderMonasteryView();
}

/** 戰情室 KPI 卡片 (4 格) */
function renderMobileModeKpiHtml(mode, heroName) {
  if (!isMobileSyncEnabled()) return `<div class="col-span-full text-xs text-slate-400 p-3">📱 此資料片需要 GM 開啟手機同步 App。</div>`;
  const h = getMobileHeroScore(mode, heroName);
  if (!h) return '';
  const card = (label, value, color) => `<div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800"><span class="text-[11px] text-slate-400 block">${label}</span><span class="text-lg font-black font-rpg ${color}">${value}</span></div>`;
  if (mode === 'expedition') return card('🗺️ 個人總里程', `${h.km} km`, 'text-amber-400') + card('👣 步數里程', `${h.stepKm} km`, 'text-cyan-400') + card('🏋️ 訓練里程', `${h.workoutKm} km`, 'text-rose-400') + card('📅 有貢獻天數', `${h.activeDays} 天`, 'text-emerald-400');
  if (mode === 'dream') return card('👹 對夢魘總傷害', h.damage.toLocaleString(), 'text-amber-400') + card('😴 平均睡眠', h.avgSleepMin ? `${Math.floor(h.avgSleepMin / 60)}h${String(Math.round(h.avgSleepMin % 60)).padStart(2, '0')}m` : '—', 'text-cyan-400') + card('🛏️ 慣常入睡', mmMinToClock(h.medianBed), 'text-purple-300') + card('💤 最長連睡飽', `${h.bestStreak} 晚`, 'text-emerald-400');
  if (mode === 'flame') return card('🔥 個人火種', h.embers, 'text-amber-400') + card('🌟 三火全亮', `${h.perfectDays} 天`, 'text-cyan-400') + card('⛓️ 目前連續', `${h.currentStreak} 天`, 'text-rose-400') + card('📅 今日火焰', h.today.hasData ? `${h.today.count} / 3` : '尚無資料', 'text-emerald-400');
  if (mode === 'monastery') return card('🧘 總修為', h.total.toLocaleString(), 'text-amber-400') + card('🏯 境界', mmEsc(h.rank), 'text-cyan-400') + card('🫀 靜止心率變化', h.rhrDrop !== null ? `${h.rhrDrop > 0 ? '−' : '+'}${Math.abs(h.rhrDrop)} bpm` : '累積中', 'text-emerald-400') + card('⚠️ 走火入魔', `${h.overtrainDays} 天`, 'text-rose-400');
  return '';
}

/** 單筆運動在手機資料片中的貢獻說明 (戰情室運動紀錄欄位) */
function getMobileModeActivityLabel(mode, act) {
  if (!act || !act.isValidAttack) return '';
  const cfg = getMobileModesConfig()[mode] || {};
  const m = act.eventMultiplier || 1;
  if (mode === 'expedition') {
    let km = mmNum(act.duration) * (cfg.workoutKmPerMin || 0);
    const t = String(act.type || '').toLowerCase();
    if (/ride|bike|cycl/.test(t)) km += mmNum(act.distance) * (cfg.rideFactor || 0);
    else if (/swim/.test(t)) km += mmNum(act.distance) * (cfg.swimFactor || 0);
    return `🗺️ +${mmRound(km * m)} km`;
  }
  if (mode === 'dream') return `⚔️ 攻擊 +${Math.round(Math.min(mmNum(act.duration), cfg.workoutFullMin || 60) / Math.max(1, cfg.workoutFullMin || 60) * (cfg.workoutPts || 20) * m)}`;
  if (mode === 'flame') return '🔥 點亮活動之火';
  if (mode === 'monastery') return `🧘 修煉 +${Math.round(Math.min(mmNum(act.rawTrimp ?? act.trimp), cfg.trimpCap || 150) / Math.max(1, cfg.trimpCap || 150) * (cfg.trainPts || 40) * m)}`;
  return '';
}

window.MOBILE_MODE_KEYS = MOBILE_MODE_KEYS;
window.MOBILE_MODE_META = MOBILE_MODE_META;
window.MOBILE_MODE_DEFAULTS = MOBILE_MODE_DEFAULTS;
window.isMobileMode = isMobileMode;
window.isMobileSyncEnabled = isMobileSyncEnabled;
window.getMobileModesConfig = getMobileModesConfig;
window.computeMobileMode = computeMobileMode;
window.computeExpedition = computeExpedition;
window.computeDream = computeDream;
window.computeFlame = computeFlame;
window.computeMonastery = computeMonastery;
window.getMobileHeroScore = getMobileHeroScore;
window.renderMobileModeView = renderMobileModeView;
window.renderMobileModeHtml = renderMobileModeHtml;
window.renderMobileModeKpiHtml = renderMobileModeKpiHtml;
window.getMobileModeActivityLabel = getMobileModeActivityLabel;
window.renderMobileModeDisabledNotice = renderMobileModeDisabledNotice;
