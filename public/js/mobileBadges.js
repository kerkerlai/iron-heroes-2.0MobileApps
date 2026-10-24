/**
 * 鋼鐵英雄紀元 2.0 - 📱 手機健康徽章擴充包 (#101 ~ #300，共 200 枚)
 * -------------------------------------------------------------------------
 * 1. 僅在 GM 開啟「手機同步 App」(gameState.gmOps.mobileSync.enabled === true) 時生效：
 *    - 未開啟時：圖鑑維持經典 100 枚、計算結果與舊版完全相同 (本模組不寫入任何解鎖紀錄)。
 *    - 開啟時：讀取 gameState.dailyHealth (daily_health 每日健康數據) 與有效運動 (isValidAttack === true)，
 *      以「宣告式規則 (mh_* rule types)」判定，解鎖日期 = 第一次達成條件的那一天。
 * 2. 只使用 Apple Watch / Garmin / Pixel Watch / 小米手環 / Samsung 都能提供的指標：
 *    步數、睡眠分鐘、就寢/起床時間、活動分鐘、靜止心率、活動熱量；HRV / 血氧只用在少數趣味型低稀有度徽章。
 * 3. 搭配運動的徽章一律只採計「有效運動」(isValidAttack === true，已內含 GM 設定的最低時長門檻，預設 30 分鐘)。
 * 4. 效能：每位英雄只預先整理一次「連續日曆序列 + ISO 週分組」，200 枚徽章皆在同一份序列上線性掃描。
 * 5. 透過 badgesCatalog.js 的 registerBadgePlugin() 掛載，不會推入 BADGE_CATALOG，
 *    因此經典 #100「鋼鐵大滿貫」仍只計算經典 100 枚。
 *
 * 每日條件 (when) 語法：
 *   { steps: 10000 }                     → 步數 ≥ 10000 (數字 = 最小值)
 *   { rhr: { max: 55 } }                 → 靜止心率 ≤ 55 (無資料一律視為不符合)
 *   指標：steps / sleep (分鐘) / activeMin / kcal / rhr / hrv / spo2 / workouts (有效運動次數) / workoutMin
 *   bedBy / bedAfter / wakeBy / wakeAfter: 'HH:MM'   weekdays: [0..6] (0 = 週日)
 *   hasData / allCore / stepsHas: '7777' / stepsMultiple: 1000 / stepsPalindrome: true
 *   next: { ... }                        → 隔天需同時符合 (解鎖日 = 隔天)
 *   ※ daily_health 的睡眠 / 就寢 / 起床歸屬於「起床那天」(就寢可能在前一個日曆日)，
 *     因此「某天 sleep ≥ 420 且有運動」= 前一晚睡飽、當天運動；「運動日的 next.sleep」= 運動當晚的睡眠。
 */
(function () {
  'use strict';

  // ==========================================================================
  // 1. 圖鑑定義 (#101 ~ #300)
  // ==========================================================================
  const MOBILE_BADGES = [];
  let CUR_CAT = '';
  const cat = (c) => { CUR_CAT = c; };
  const M = (num, name, icon, rarity, condition, rule) => {
    MOBILE_BADGES.push({
      id: 'b' + String(num).padStart(3, '0'),
      num,
      category: CUR_CAT,
      cat: CUR_CAT,
      name,
      icon,
      rarity,
      condition,
      desc: condition,
      rule,
      source: 'mobile',
      requiresMobileSync: true
    });
  };
  const fmt = (n) => Number(n).toLocaleString('en-US');

  // 系列十一：【萬步行者】單日步數 (#101 ~ #112)
  cat('11. 萬步行者 (單日步數)');
  [
    [101, '散步暖身', '🚶', 'common', 6000],
    [102, '八千里路', '🛤️', 'common', 8000],
    [103, '萬步達人', '👣', 'common', 10000],
    [104, '街頭巡警', '🚓', 'common', 12000],
    [105, '城市漫遊者', '🏙️', 'rare', 15000],
    [106, '雙腳引擎', '🦿', 'rare', 18000],
    [107, '兩萬步狂熱', '🔥', 'rare', 20000],
    [108, '半馬步量', '🏃', 'epic', 25000],
    [109, '三萬步行軍', '🥾', 'epic', 30000],
    [110, '長征鐵腿', '🦵', 'legendary', 35000],
    [111, '四萬步傳說', '🗺️', 'legendary', 40000],
    [112, '日行五萬', '🌏', 'mythic', 50000]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `單日步數達 ${fmt(v)} 步以上`, { type: 'mh_day_count', when: { steps: v }, min: 1 }));

  // 系列十二：【步步累積】累計步數 (#113 ~ #126)
  cat('12. 步步累積 (累計步數)');
  [
    [113, '五萬步起點', '🌱', 'common', 50000],
    [114, '十萬步里程', '🧱', 'common', 100000],
    [115, '二十萬步', '🧭', 'common', 200000],
    [116, '三十萬步', '🚶‍♂️', 'rare', 300000],
    [117, '半百萬步', '🚂', 'rare', 500000],
    [118, '七十五萬步', '🛣️', 'epic', 750000],
    [119, '百萬步者', '💯', 'epic', 1000000],
    [120, '一百五十萬步', '🏔️', 'legendary', 1500000],
    [121, '兩百萬步', '🌍', 'legendary', 2000000],
    [122, '三百萬步傳說', '🏝️', 'mythic', 3000000]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `累計步數達 ${fmt(v)} 步`, { type: 'mh_total', metric: 'steps', min: v }));
  [
    [123, '萬步十日', '🔟', 'rare', 10],
    [124, '萬步三十日', '📆', 'epic', 30],
    [125, '萬步六十日', '🏅', 'legendary', 60],
    [126, '萬步百日', '👑', 'mythic', 100]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `累計 ${v} 天單日步數達 10,000 步`, { type: 'mh_day_count', when: { steps: 10000 }, min: v }));

  // 系列十三：【日行不輟】步數連續 (#127 ~ #139)
  cat('13. 日行不輟 (步數連續)');
  [
    [127, '三日健行', '🥉', 'common', 3],
    [128, '一週走透透', '🗓️', 'common', 7],
    [129, '雙週步道', '🌿', 'rare', 14],
    [130, '月行者', '🌙', 'epic', 30]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `連續 ${v} 天每天步數達 8,000 步`, { type: 'mh_streak', when: { steps: 8000 }, min: v }));
  [
    [131, '萬步三連', '3️⃣', 'common', 3],
    [132, '萬步五連', '🖐️', 'rare', 5],
    [133, '萬步七連', '🌈', 'rare', 7],
    [134, '萬步雙週', '⚔️', 'epic', 14],
    [135, '萬步三週', '🛡️', 'epic', 21],
    [136, '萬步月神', '🌕', 'legendary', 30],
    [137, '萬步六十連', '🐉', 'mythic', 60]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `連續 ${v} 天每天步數達 10,000 步`, { type: 'mh_streak', when: { steps: 10000 }, min: v }));
  M(138, '週步十萬', '📦', 'rare', '同一週 (週一~週日) 累計步數達 100,000 步', { type: 'mh_week', conds: [{ metric: 'steps', total: 100000 }] });
  M(139, '七日萬二', '🏆', 'epic', '同一週 7 天每天步數都達 12,000 步', { type: 'mh_week', conds: [{ when: { steps: 12000 }, min: 7 }] });

  // 系列十四：【好眠守護】睡眠時長 (#140 ~ #153)
  cat('14. 好眠守護 (睡眠)');
  M(140, '一夜好眠', '😴', 'common', '單晚睡眠達 7 小時以上', { type: 'mh_day_count', when: { sleep: 420 }, min: 1 });
  M(141, '冬眠熊', '🐻', 'common', '單晚睡眠達 9 小時 30 分以上 (睡好睡滿！)', { type: 'mh_day_count', when: { sleep: 570 }, min: 1 });
  [
    [142, '好眠五夜', '🛌', 'common', 5],
    [143, '好眠十五夜', '🌛', 'common', 15],
    [144, '好眠三十夜', '🌜', 'rare', 30],
    [145, '好眠六十夜', '💤', 'epic', 60],
    [146, '好眠百夜', '🌌', 'legendary', 100]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `累計 ${v} 晚睡眠達 7 小時以上`, { type: 'mh_day_count', when: { sleep: 420 }, min: v }));
  [
    [147, '三夜安眠', '⭐', 'common', 3],
    [148, '一週好眠', '🌠', 'rare', 7],
    [149, '雙週好眠', '🪐', 'epic', 14],
    [150, '好眠月相', '🌝', 'legendary', 30],
    [151, '睡神降臨', '😇', 'mythic', 60]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `連續 ${v} 晚每晚睡眠達 7 小時以上`, { type: 'mh_streak', when: { sleep: 420 }, min: v }));
  M(152, '七日均眠', '🧸', 'rare', '任意連續 7 天平均睡眠達 7 小時 30 分 (至少 6 晚有資料)', { type: 'mh_rolling', metric: 'sleep', window: 7, minData: 6, stat: 'avg', min: 450 });
  M(153, '完美睡眠週', '🛏️', 'epic', '同一週 7 晚每晚睡眠都達 7 小時以上', { type: 'mh_week', conds: [{ when: { sleep: 420 }, min: 7 }] });

  // 系列十五：【早睡早起】作息 (#154 ~ #167)
  cat('15. 早睡早起 (作息)');
  [
    [154, '準時熄燈', '💡', 'common', 1],
    [155, '熄燈十夜', '🕯️', 'common', 10],
    [156, '熄燈三十夜', '🌃', 'rare', 30],
    [157, '熄燈六十夜', '🏮', 'epic', 60]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, v === 1 ? '在 23:00 (含) 前就寢入睡' : `累計 ${v} 晚在 23:00 (含) 前就寢`, { type: 'mh_day_count', when: { bedBy: '23:00' }, min: v }));
  M(158, '夜貓戒斷', '🐈', 'legendary', '連續 14 晚都在 23:00 (含) 前就寢', { type: 'mh_streak', when: { bedBy: '23:00' }, min: 14 });
  M(159, '十點半就寢週', '🛌', 'epic', '連續 7 晚都在 22:30 (含) 前就寢', { type: 'mh_streak', when: { bedBy: '22:30' }, min: 7 });
  [
    [160, '晨起鳥', '🐦', 'common', 1],
    [161, '晨起十日', '🌄', 'rare', 10],
    [162, '晨起三十日', '🌅', 'epic', 30]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, v === 1 ? '在 06:30 (含) 前起床' : `累計 ${v} 天在 06:30 (含) 前起床`, { type: 'mh_day_count', when: { wakeBy: '06:30' }, min: v }));
  M(163, '五點鐘俱樂部', '🕔', 'epic', '累計 5 天在 05:30 (含) 前起床', { type: 'mh_day_count', when: { wakeBy: '05:30' }, min: 5 });
  [
    [164, '早睡早起三連', '🐓', 'rare', 3],
    [165, '早睡早起一週', '☀️', 'epic', 7],
    [166, '早睡早起雙週', '🌞', 'legendary', 14],
    [167, '晨型人之王', '👑', 'mythic', 30]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `連續 ${v} 天都在 23:00 前就寢且 06:30 前起床`, { type: 'mh_streak', when: { bedBy: '23:00', wakeBy: '06:30' }, min: v }));

  // 系列十六：【作息時鐘】規律性 (#168 ~ #179)
  cat('16. 作息時鐘 (規律)');
  [
    [168, '規律就寢 I', '⏰', 'rare', 30],
    [169, '規律就寢 II', '⏲️', 'epic', 20],
    [170, '規律就寢 III', '🕰️', 'legendary', 15]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `任意連續 7 天的就寢時間標準差 ≤ ${v} 分鐘 (至少 6 晚有資料)`, { type: 'mh_rolling', metric: 'bed', window: 7, minData: 6, stat: 'std', max: v }));
  M(171, '雙週就寢節律', '📐', 'epic', '任意連續 14 天的就寢時間標準差 ≤ 30 分鐘 (至少 12 晚有資料)', { type: 'mh_rolling', metric: 'bed', window: 14, minData: 12, stat: 'std', max: 30 });
  [
    [172, '規律起床 I', '🔔', 'rare', 30],
    [173, '規律起床 II', '🛎️', 'epic', 20],
    [174, '規律起床 III', '🎐', 'legendary', 15]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `任意連續 7 天的起床時間標準差 ≤ ${v} 分鐘 (至少 6 天有資料)`, { type: 'mh_rolling', metric: 'wake', window: 7, minData: 6, stat: 'std', max: v }));
  M(175, '雙週起床節律', '📏', 'legendary', '任意連續 14 天的起床時間標準差 ≤ 20 分鐘 (至少 12 天有資料)', { type: 'mh_rolling', metric: 'wake', window: 14, minData: 12, stat: 'std', max: 20 });
  M(176, '週末不賴床', '🛋️', 'rare', '累計 4 個週末日 (週六或週日) 在 07:30 (含) 前起床', { type: 'mh_day_count', when: { weekdays: [6, 0], wakeBy: '07:30' }, min: 4 });
  M(177, '週末自律者', '🧘', 'epic', '累計 8 個週末日 (週六或週日) 在 07:30 (含) 前起床', { type: 'mh_day_count', when: { weekdays: [6, 0], wakeBy: '07:30' }, min: 8 });
  M(178, '月度生理時鐘', '🌗', 'legendary', '任意連續 30 天的就寢時間標準差 ≤ 30 分鐘 (至少 26 晚有資料)', { type: 'mh_rolling', metric: 'bed', window: 30, minData: 26, stat: 'std', max: 30 });
  M(179, '生理時鐘大師', '🧬', 'mythic', '任意連續 28 天的起床時間標準差 ≤ 20 分鐘 (至少 24 天有資料)', { type: 'mh_rolling', metric: 'wake', window: 28, minData: 24, stat: 'std', max: 20 });

  // 系列十七：【活力分鐘】活動分鐘 (#180 ~ #193)
  cat('17. 活力分鐘 (活動)');
  [
    [180, '動起來', '🤸', 'common', 30],
    [181, '活力一小時', '⚡', 'common', 60],
    [182, '活力九十', '🔋', 'rare', 90],
    [183, '活力兩小時', '🚴', 'epic', 120],
    [184, '活力三小時', '🏋️', 'legendary', 180]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `單日活動分鐘數達 ${v} 分鐘以上`, { type: 'mh_day_count', when: { activeMin: v }, min: 1 }));
  [
    [185, 'WHO 達標週', '✅', 'common', 150, 'WHO 建議'],
    [186, '雙倍達標週', '✌️', 'rare', 300, 'WHO 建議的 2 倍'],
    [187, '三倍達標週', '🥇', 'epic', 450, 'WHO 建議的 3 倍'],
    [188, '活力爆表週', '💥', 'legendary', 600, 'WHO 建議的 4 倍']
  ].forEach(([n, nm, ic, r, v, note]) => M(n, nm, ic, r, `同一週累計活動分鐘達 ${v} 分鐘 (${note})`, { type: 'mh_week', conds: [{ metric: 'activeMin', total: v }] }));
  [
    [189, '活力三十日', '📈', 'rare', 30],
    [190, '活力六十日', '📊', 'epic', 60],
    [191, '活力百日', '🏛️', 'legendary', 100]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `累計 ${v} 天單日活動分鐘達 30 分鐘`, { type: 'mh_day_count', when: { activeMin: 30 }, min: v }));
  M(192, '活力一週連擊', '🔗', 'rare', '連續 7 天每天活動分鐘達 30 分鐘', { type: 'mh_streak', when: { activeMin: 30 }, min: 7 });
  M(193, '活力月連擊', '♾️', 'mythic', '連續 30 天每天活動分鐘達 30 分鐘', { type: 'mh_streak', when: { activeMin: 30 }, min: 30 });

  // 系列十八：【心肺進化】靜止心率 (#194 ~ #207)
  cat('18. 心肺進化 (靜止心率)');
  [
    [194, '平穩心跳', '💗', 'common', 65],
    [195, '運動員心臟', '❤️', 'common', 60],
    [196, '強心臟', '💪', 'rare', 55],
    [197, '耐力引擎', '🫀', 'epic', 50],
    [198, '鐵人心臟', '🏊', 'legendary', 45],
    [199, '傳說心跳', '🐋', 'mythic', 40]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `單日靜止心率 ≤ ${v} bpm`, { type: 'mh_day_count', when: { rhr: { max: v } }, min: 1 }));
  [
    [200, '心肺進化 I', '📉', 'rare', 2],
    [201, '心肺進化 II', '🧪', 'epic', 3],
    [202, '心肺進化 III', '🔬', 'legendary', 5],
    [203, '心肺重生', '🦋', 'mythic', 8]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `近 7 天平均靜止心率比「最初 7 天基準」下降 ${v} bpm 以上`, { type: 'mh_trend', metric: 'rhr', dir: 'down', delta: v }));
  M(204, '七日沉穩心', '🌊', 'rare', '任意連續 7 天平均靜止心率 ≤ 60 bpm (至少 5 天有資料)', { type: 'mh_rolling', metric: 'rhr', window: 7, minData: 5, stat: 'avg', max: 60 });
  M(205, '七日深海心', '🐬', 'epic', '任意連續 7 天平均靜止心率 ≤ 55 bpm (至少 5 天有資料)', { type: 'mh_rolling', metric: 'rhr', window: 7, minData: 5, stat: 'avg', max: 55 });
  M(206, '靜心三十日', '🧘‍♂️', 'epic', '累計 30 天靜止心率 ≤ 60 bpm', { type: 'mh_day_count', when: { rhr: { max: 60 } }, min: 30 });
  M(207, '冰心六十日', '❄️', 'legendary', '累計 60 天靜止心率 ≤ 55 bpm', { type: 'mh_day_count', when: { rhr: { max: 55 } }, min: 60 });

  // 系列十九：【燃燒小宇宙】活動熱量 (#208 ~ #220)
  cat('19. 燃燒小宇宙 (活動熱量)');
  [
    [208, '小火慢燉', '🍳', 'common', 300],
    [209, '熱力全開', '🌶️', 'common', 500],
    [210, '火力發電廠', '🏭', 'rare', 800],
    [211, '千卡烈焰', '🔥', 'epic', 1000],
    [212, '熔岩巨人', '🌋', 'legendary', 1500],
    [213, '太陽核心', '☀️', 'mythic', 2000]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `單日活動熱量 (Active kcal) 達 ${fmt(v)} kcal`, { type: 'mh_day_count', when: { kcal: v }, min: 1 }));
  [
    [214, '燃燒兩萬', '🕯️', 'common', 20000],
    [215, '燃燒五萬', '🧨', 'rare', 50000],
    [216, '燃燒十萬', '🎆', 'epic', 100000],
    [217, '燃燒二十萬', '☄️', 'legendary', 200000],
    [218, '燃燒三十萬', '🌠', 'mythic', 300000]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `累計活動熱量達 ${fmt(v)} kcal`, { type: 'mh_total', metric: 'kcal', min: v }));
  M(219, '七日火焰連擊', '🔥', 'epic', '連續 7 天每天活動熱量達 500 kcal', { type: 'mh_streak', when: { kcal: 500 }, min: 7 });
  M(220, '週燃五千', '🍕', 'rare', '同一週累計活動熱量達 5,000 kcal', { type: 'mh_week', conds: [{ metric: 'kcal', total: 5000 }] });

  // 系列二十：【文武雙全】有效運動 × 健康數據 (#221 ~ #234)
  cat('20. 文武雙全 (運動×健康)');
  const WK = '有效運動 (達最低時長)';
  [
    [221, '練走雙修', '🥋', 'common', 1],
    [222, '練走十日', '🎯', 'rare', 10],
    [223, '練走三十日', '🏯', 'epic', 30]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `${v === 1 ? '' : `累計 ${v} 天`}同一天完成${WK}且步數達 10,000 步`, { type: 'mh_day_count', when: { workouts: 1, steps: 10000 }, min: v }));
  [
    [224, '養精蓄銳', '🔋', 'common', 1],
    [225, '睡飽再戰十回', '🛡️', 'rare', 10],
    [226, '睡飽再戰三十回', '⚔️', 'epic', 30]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `${v === 1 ? '' : `累計 ${v} 天`}前一晚睡滿 7 小時，當天完成${WK}`, { type: 'mh_day_count', when: { workouts: 1, sleep: 420 }, min: v }));
  M(227, '練後好眠', '🌙', 'common', `完成${WK}的當晚睡滿 7 小時 30 分`, { type: 'mh_day_count', when: { workouts: 1, next: { sleep: 450 } }, min: 1 });
  M(228, '練後好眠十回', '🌛', 'rare', `累計 10 次完成${WK}後當晚睡滿 7 小時 30 分`, { type: 'mh_day_count', when: { workouts: 1, next: { sleep: 450 } }, min: 10 });
  M(229, '早起練功', '🐲', 'rare', `累計 5 天在 06:30 前起床且當天完成${WK}`, { type: 'mh_day_count', when: { workouts: 1, wakeBy: '06:30' }, min: 5 });
  M(230, '鐵人週', '🗓️', 'epic', `同一週內有 3 天完成${WK}，且有 5 天步數達 8,000 步`, { type: 'mh_week', conds: [{ when: { workouts: 1 }, min: 3 }, { when: { steps: 8000 }, min: 5 }] });
  M(231, '鐵人全能日', '🌟', 'legendary', `同一天完成${WK}、步數 10,000、睡眠 7 小時、活動 60 分鐘`, { type: 'mh_day_count', when: { workouts: 1, steps: 10000, sleep: 420, activeMin: 60 }, min: 1 });
  M(232, '全能十日', '💎', 'mythic', `累計 10 天同時達成${WK}、步數 10,000、睡眠 7 小時、活動 60 分鐘`, { type: 'mh_day_count', when: { workouts: 1, steps: 10000, sleep: 420, activeMin: 60 }, min: 10 });
  M(233, '黃金三角', '🔺', 'legendary', `連續 3 天每天都有${WK}、步數 8,000 與睡眠 7 小時`, { type: 'mh_streak', when: { workouts: 1, steps: 8000, sleep: 420 }, min: 3 });
  M(234, '修行者之週', '🏆', 'mythic', `同一週內有 5 天完成${WK}，且 7 晚都睡滿 7 小時`, { type: 'mh_week', conds: [{ when: { workouts: 1 }, min: 5 }, { when: { sleep: 420 }, min: 7 }] });

  // 系列二十一：【全年無休】同步忠誠 (#235 ~ #246)
  cat('21. 全年無休 (同步)');
  [
    [235, '初次同步', '📲', 'common', 1],
    [236, '同步一週', '📶', 'common', 7],
    [237, '同步雙週', '🔄', 'common', 14],
    [238, '同步一月', '📡', 'rare', 30],
    [239, '同步六十天', '🛰️', 'epic', 60],
    [240, '同步百日', '🏛️', 'legendary', 100],
    [241, '同步半年', '🌐', 'mythic', 180]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, v === 1 ? '第一次透過手機 App 同步每日健康數據' : `累計 ${v} 天有同步每日健康數據`, { type: 'mh_day_count', when: { hasData: true }, min: v }));
  [
    [242, '手錶不離身', '⌚', 'common', 7],
    [243, '全天候配戴', '🔗', 'rare', 30],
    [244, '腕上信仰', '🙏', 'epic', 60],
    [245, '不離不棄', '💞', 'legendary', 90]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `連續 ${v} 天每天都有每日健康數據`, { type: 'mh_streak', when: { hasData: true }, min: v }));
  M(246, '數據全滿', '📋', 'rare', '累計 30 天「步數、睡眠、靜止心率、活動分鐘」四項數據齊全', { type: 'mh_day_count', when: { allCore: true }, min: 30 });

  // 系列二十二：【週間節奏】週目標 (#247 ~ #259)
  cat('22. 週間節奏 (週目標)');
  [
    [247, '週末出走', '🏕️', 'common', 1],
    [248, '週末行者', '🎒', 'rare', 8],
    [249, '週末探險家', '🧗', 'epic', 20]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `${v === 1 ? '' : `累計 ${v} 個`}週末日 (週六或週日) 步數達 12,000 步`, { type: 'mh_day_count', when: { weekdays: [6, 0], steps: 12000 }, min: v }));
  M(250, '週末雙萬步', '🎡', 'rare', '同一個週末的週六與週日步數都達 10,000 步', { type: 'mh_week', conds: [{ when: { weekdays: [6], steps: 10000 }, min: 1 }, { when: { weekdays: [0], steps: 10000 }, min: 1 }] });
  M(251, '週一不憂鬱', '💼', 'rare', '累計 4 個星期一步數達 10,000 步', { type: 'mh_day_count', when: { weekdays: [1], steps: 10000 }, min: 4 });
  // 註：daily_health 的睡眠歸屬於「起床那天」，所以星期五晚上的就寢時間記錄在星期六那一列
  M(252, '週五不熬夜', '🍻', 'rare', '累計 4 個星期五晚上在 23:30 (含) 前就寢', { type: 'mh_day_count', when: { weekdays: [6], bedBy: '23:30' }, min: 4 });
  M(253, '週末補眠王', '🛌', 'common', '同一個週末的週六與週日都睡滿 8 小時', { type: 'mh_week', conds: [{ when: { weekdays: [6], sleep: 480 }, min: 1 }, { when: { weekdays: [0], sleep: 480 }, min: 1 }] });
  M(254, '完美一週', '🌈', 'legendary', '同一週 7 天每天步數 8,000 且睡眠 7 小時', { type: 'mh_week', conds: [{ when: { steps: 8000, sleep: 420 }, min: 7 }] });
  M(255, '上班日全勤', '🏢', 'rare', '同一週週一至週五每天活動分鐘都達 30 分鐘', { type: 'mh_week', conds: [{ when: { weekdays: [1, 2, 3, 4, 5], activeMin: 30 }, min: 5 }] });
  M(256, 'WHO 四週連達', '🩺', 'epic', '連續 4 週每週活動分鐘都達 150 分鐘', { type: 'mh_week', conds: [{ metric: 'activeMin', total: 150 }], weeks: 4, consecutive: true });
  M(257, 'WHO 季度達人', '🎖️', 'mythic', '連續 12 週每週活動分鐘都達 150 分鐘', { type: 'mh_week', conds: [{ metric: 'activeMin', total: 150 }], weeks: 12, consecutive: true });
  M(258, '七萬步之週', '🧾', 'rare', '累計 4 週的單週步數達 70,000 步', { type: 'mh_week', conds: [{ metric: 'steps', total: 70000 }], weeks: 4 });
  M(259, '七萬步八連週', '🚀', 'legendary', '連續 8 週每週步數都達 70,000 步', { type: 'mh_week', conds: [{ metric: 'steps', total: 70000 }], weeks: 8, consecutive: true });

  // 系列二十三：【潛能數據】HRV & 血氧 (趣味型，最高僅金級) (#260 ~ #269)
  cat('23. 潛能數據 (HRV/血氧)');
  [
    [260, '自律神經覺醒', '🧠', 'common', 50],
    [261, '高變異心流', '🎼', 'rare', 80],
    [262, '鋼鐵神經', '🎻', 'epic', 100]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `單日心率變異度 (HRV) 達 ${v} ms`, { type: 'mh_day_count', when: { hrv: v }, min: 1 }));
  M(263, 'HRV 上升 I', '📈', 'rare', '近 7 天平均 HRV 比「最初 7 天基準」提升 10% 以上', { type: 'mh_trend', metric: 'hrv', dir: 'up', pct: 10 });
  M(264, 'HRV 上升 II', '🚀', 'epic', '近 7 天平均 HRV 比「最初 7 天基準」提升 20% 以上', { type: 'mh_trend', metric: 'hrv', dir: 'up', pct: 20 });
  M(265, '恢復大師', '🧘‍♀️', 'epic', '累計 20 天 HRV 達 60 ms', { type: 'mh_day_count', when: { hrv: 60 }, min: 20 });
  M(266, '深呼吸', '🫁', 'common', '單日血氧 (SpO2) 達 98%', { type: 'mh_day_count', when: { spo2: 98 }, min: 1 });
  M(267, '血氧穩定週', '🩸', 'common', '累計 7 天血氧 (SpO2) 達 95%', { type: 'mh_day_count', when: { spo2: 95 }, min: 7 });
  M(268, '氧氣充沛', '🌬️', 'rare', '連續 14 天血氧 (SpO2) 都達 96%', { type: 'mh_streak', when: { spo2: 96 }, min: 14 });
  M(269, '滿格氧氣', '💯', 'rare', '單日血氧 (SpO2) 達 100%', { type: 'mh_day_count', when: { spo2: 100 }, min: 1 });

  // 系列二十四：【幸運彩蛋 2.0】趣味巧合 (#270 ~ #283)
  cat('24. 幸運彩蛋 2.0 (趣味)');
  M(270, '幸運七七七七', '🎰', 'epic', '單日步數中含有「7777」(如 17,777 步)', { type: 'mh_day_count', when: { stepsHas: '7777' }, min: 1 });
  M(271, '整千強迫症', '📏', 'rare', '單日步數剛好是 1,000 的整數倍 (如 12,000 步)', { type: 'mh_day_count', when: { stepsMultiple: 1000 }, min: 1 });
  M(272, '壓線萬步', '🐢', 'common', '單日步數剛好落在 10,000 ~ 10,099 步 (多一步都不走！)', { type: 'mh_day_count', when: { steps: { min: 10000, max: 10099 } }, min: 1 });
  M(273, '回文步伐', '🔁', 'epic', '單日步數達 10,000 且為回文數字 (如 12,321 步)', { type: 'mh_day_count', when: { stepsPalindrome: true }, min: 1 });
  M(274, '整整八小時', '⏱️', 'rare', '單晚睡眠剛好 480 分鐘 (8 小時 0 分)', { type: 'mh_day_count', when: { sleep: { min: 480, max: 480 } }, min: 1 });
  M(275, '夜貓冒險者', '🦉', 'common', '某天在凌晨 01:00 之後才就寢 (偶爾熬夜也是一種冒險)', { type: 'mh_day_count', when: { bedAfter: '01:00' }, min: 1 });
  M(276, '賴床大師', '🛌', 'common', '某天在 10:00 之後才起床', { type: 'mh_day_count', when: { wakeAfter: '10:00' }, min: 1 });
  M(277, '步數新高', '📈', 'rare', '累積 14 天數據後，再次刷新個人單日步數紀錄', { type: 'mh_personal_best', metric: 'steps', afterDays: 14 });
  M(278, '睡神新紀錄', '🥱', 'rare', '累積 14 天數據後，再次刷新個人單晚睡眠時長紀錄', { type: 'mh_personal_best', metric: 'sleep', afterDays: 14 });
  M(279, '耍廢充電日', '🛋️', 'common', '單日步數不到 2,000 步但睡滿 9 小時 (完全充電模式)', { type: 'mh_day_count', when: { steps: { max: 2000 }, sleep: 540 }, min: 1 });
  M(280, '步步高升', '🪜', 'rare', '連續 5 天步數一天比一天多', { type: 'mh_rising', metric: 'steps', min: 5 });
  M(281, '早鳥萬五', '🐤', 'epic', '06:00 (含) 前起床且當天步數達 15,000 步', { type: 'mh_day_count', when: { wakeBy: '06:00', steps: 15000 }, min: 1 });
  M(282, '深度修復', '🔧', 'rare', '同一天睡眠 7 小時且靜止心率 ≤ 55 bpm', { type: 'mh_day_count', when: { sleep: 420, rhr: { max: 55 } }, min: 1 });
  M(283, '全服揪團日', '🤝', 'rare', '某天全服至少 3 位英雄 (含自己) 步數都達 10,000 步', { type: 'mh_squad_day', when: { steps: 10000 }, minHeroes: 3 });

  // 系列二十五：【晨昏雙修】健康組合 (#284 ~ #291)
  cat('25. 晨昏雙修 (健康組合)');
  [
    [284, '走睡平衡', '⚖️', 'common', 1],
    [285, '平衡十日', '☯️', 'rare', 10],
    [286, '平衡三十日', '🎋', 'epic', 30],
    [287, '平衡六十日', '🌳', 'legendary', 60]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `${v === 1 ? '' : `累計 ${v} 天`}同一天步數達 10,000 步且睡眠 7 小時`, { type: 'mh_day_count', when: { steps: 10000, sleep: 420 }, min: v }));
  M(288, '平衡七連', '🎐', 'epic', '連續 7 天每天步數 10,000 且睡眠 7 小時', { type: 'mh_streak', when: { steps: 10000, sleep: 420 }, min: 7 });
  M(289, '平衡雙週', '🏯', 'legendary', '連續 14 天每天步數 10,000 且睡眠 7 小時', { type: 'mh_streak', when: { steps: 10000, sleep: 420 }, min: 14 });
  M(290, '早睡活力派', '🌙', 'rare', '累計 10 天活動分鐘達 30 分鐘且在 23:00 前就寢', { type: 'mh_day_count', when: { activeMin: 30, bedBy: '23:00' }, min: 10 });
  M(291, '早起萬步五連', '🌅', 'epic', '連續 5 天在 06:30 前起床且步數達 10,000 步', { type: 'mh_streak', when: { wakeBy: '06:30', steps: 10000 }, min: 5 });

  // 系列二十六：【殿堂神話 2.0】手機傳奇 (#292 ~ #300)
  cat('26. 殿堂神話 2.0 (手機傳奇)');
  [
    [292, '健康收藏家', '🎒', 'common', 10],
    [293, '健康鑑賞家', '🧳', 'rare', 25],
    [294, '健康策展人', '🖼️', 'epic', 50],
    [295, '健康博物館', '🏛️', 'legendary', 100],
    [296, '健康全書', '📚', 'mythic', 150]
  ].forEach(([n, nm, ic, r, v]) => M(n, nm, ic, r, `累計解鎖 ${v} 枚手機健康徽章 (不含本系列收藏徽章)`, { type: 'mh_badge_collector', min: v }));
  M(297, '百日築基', '🧱', 'legendary', '累計 100 天單日步數達 8,000 步', { type: 'mh_day_count', when: { steps: 8000 }, min: 100 });
  M(298, '全能健康王', '👑', 'mythic', '連續 30 天每天步數 8,000 且睡眠 7 小時', { type: 'mh_streak', when: { steps: 8000, sleep: 420 }, min: 30 });
  M(299, '完美九十天', '🌈', 'mythic', '連續 90 天每天步數都達 6,000 步', { type: 'mh_streak', when: { steps: 6000 }, min: 90 });
  M(300, '健康三冠王', '🏆', 'mythic', `累計 20 天同時達成${WK}、步數 10,000、睡眠 7 小時、活動 30 分鐘`, { type: 'mh_day_count', when: { workouts: 1, steps: 10000, sleep: 420, activeMin: 30 }, min: 20 });

  const MOBILE_BADGE_IDS = new Set(MOBILE_BADGES.map(b => b.id));

  // ==========================================================================
  // 2. 每日序列預處理 (每位英雄只做一次)
  // ==========================================================================
  const DAY_MS = 86400000;
  const pad2 = (n) => String(n).padStart(2, '0');

  // 'YYYY-MM-DD' / 'YYYY/MM/DD' / 'YYYY/MM/DD HH:mm:ss' → UTC 午夜毫秒 (以日期字面值計算，避免時區/日光節約誤差)
  function dayUtc(dateStr) {
    const m = String(dateStr || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function utcToYmd(t) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}/${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())}`;
  }
  // ISO 週序號 (以週一為一週開始；連續週相差 1)
  function weekOrdinal(t) {
    const wd = (new Date(t).getUTCDay() + 6) % 7; // 0 = 週一
    return Math.round((t - wd * DAY_MS) / (7 * DAY_MS));
  }
  function parseHM(s) {
    const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  // 就寢時間以「中午 12:00 為界」換算為連續分鐘 (00:30 → 1470，23:00 → 1380)，跨午夜也能正確比較與計算標準差
  const normBed = (min) => (min == null ? null : (min < 720 ? min + 1440 : min));
  const posNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const hmStr = (min) => { if (min == null) return '--:--'; const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; };
  const sleepStr = (min) => `${Math.floor(min / 60)}h${pad2(Math.round(min % 60))}m`;

  const MAX_CALENDAR_DAYS = 800;

  /**
   * 建立單一英雄的連續日曆序列：days[i] = { t, ymd, key, wd, week, has, steps, sleep, activeMin, kcal, rhr, hrv, spo2, bed, wake, workouts, workoutMin, workoutName, workoutId }
   * 沒有資料的日期也會存在 (has = false、各指標 null)，讓「連續天數」判定可以正確中斷。
   */
  function buildHeroSeries(rows, acts) {
    const merged = new Map(); // t -> 合併後的每日資料 (同日多筆以較佳值合併)
    rows.forEach(r => {
      const t = dayUtc(r.date);
      if (!Number.isFinite(t)) return;
      let d = merged.get(t);
      if (!d) { d = { steps: null, sleep: null, activeMin: null, kcal: null, rhr: null, hrv: null, spo2: null, bed: null, wake: null }; merged.set(t, d); }
      const mx = (k, v) => { if (v != null && (d[k] == null || v > d[k])) d[k] = v; };
      const steps = posNum(r.steps);
      mx('steps', steps != null ? Math.round(steps) : null);
      mx('sleep', posNum(r.sleep_minutes) != null ? Math.round(Number(r.sleep_minutes)) : null);
      mx('activeMin', posNum(r.active_minutes) != null ? Math.round(Number(r.active_minutes)) : null);
      mx('kcal', posNum(r.active_kcal) != null ? Math.round(Number(r.active_kcal)) : null);
      mx('hrv', posNum(r.hrv_ms));
      let spo2 = posNum(r.spo2_pct);
      if (spo2 != null && spo2 <= 1) spo2 = spo2 * 100; // 相容 0.97 這種小數格式
      mx('spo2', spo2 != null ? Math.round(spo2 * 10) / 10 : null);
      const rhr = posNum(r.resting_hr);
      if (rhr != null && (d.rhr == null || rhr < d.rhr)) d.rhr = Math.round(rhr);
      if (d.bed == null) d.bed = normBed(parseHM(r.bed_time));
      if (d.wake == null) d.wake = parseHM(r.wake_time);
    });
    if (merged.size === 0) return null;

    const ts = Array.from(merged.keys()).sort((a, b) => a - b);
    let start = ts[0];
    const end = ts[ts.length - 1];
    if ((end - start) / DAY_MS > MAX_CALENDAR_DAYS) start = end - MAX_CALENDAR_DAYS * DAY_MS;

    // 有效運動 (依日期彙整)
    const wkByDay = new Map();
    acts.forEach(a => {
      const t = dayUtc(a.date || a.time);
      if (!Number.isFinite(t) || t < start || t > end) return;
      let w = wkByDay.get(t);
      if (!w) { w = { n: 0, min: 0, name: '', id: null }; wkByDay.set(t, w); }
      w.n += 1;
      w.min += Number(a.duration) || 0;
      if (!w.name) { w.name = a.title || a.name || a.type || '有效運動'; w.id = a.id; }
    });

    const days = [];
    for (let t = start; t <= end; t += DAY_MS) {
      const h = merged.get(t);
      const w = wkByDay.get(t);
      const dObj = new Date(t);
      const base = h || { steps: null, sleep: null, activeMin: null, kcal: null, rhr: null, hrv: null, spo2: null, bed: null, wake: null };
      days.push({
        t,
        ymd: utcToYmd(t),
        wd: dObj.getUTCDay(),
        week: weekOrdinal(t),
        has: Boolean(h && (base.steps != null || base.sleep != null || base.activeMin != null || base.kcal != null || base.rhr != null || base.hrv != null || base.spo2 != null || base.bed != null || base.wake != null)),
        ...base,
        workouts: w ? w.n : 0,
        workoutMin: w ? Math.round(w.min) : 0,
        workoutName: w ? w.name : '',
        workoutId: w ? w.id : null
      });
    }
    // ISO 週分組
    const weeks = [];
    days.forEach((d, i) => {
      const last = weeks[weeks.length - 1];
      if (last && last.week === d.week) last.idx.push(i);
      else weeks.push({ week: d.week, idx: [i] });
    });
    return { days, weeks };
  }

  // ==========================================================================
  // 3. 每日條件 (when) 編譯器
  // ==========================================================================
  const METRIC_KEYS = ['steps', 'sleep', 'activeMin', 'kcal', 'rhr', 'hrv', 'spo2', 'workouts', 'workoutMin'];
  const isPalindrome = (n) => { const s = String(n); return s === s.split('').reverse().join(''); };

  function compileWhen(w) {
    if (!w) return () => false;
    if (w.__fn) return w.__fn;
    const checks = [];
    METRIC_KEYS.forEach(k => {
      if (w[k] === undefined) return;
      const c = typeof w[k] === 'number' ? { min: w[k] } : (w[k] || {});
      const mn = c.min, mx = c.max;
      checks.push(d => {
        const v = d[k];
        if (v == null) return false;
        if (mn != null && v < mn) return false;
        if (mx != null && v > mx) return false;
        return true;
      });
    });
    if (w.bedBy) { const t = normBed(parseHM(w.bedBy)); checks.push(d => d.bed != null && d.bed <= t); }
    if (w.bedAfter) { const t = normBed(parseHM(w.bedAfter)); checks.push(d => d.bed != null && d.bed >= t); }
    if (w.wakeBy) { const t = parseHM(w.wakeBy); checks.push(d => d.wake != null && d.wake <= t); }
    if (w.wakeAfter) { const t = parseHM(w.wakeAfter); checks.push(d => d.wake != null && d.wake >= t); }
    if (Array.isArray(w.weekdays)) { const s = new Set(w.weekdays); checks.push(d => s.has(d.wd)); }
    if (w.hasData) checks.push(d => d.has);
    if (w.allCore) checks.push(d => d.steps != null && d.sleep != null && d.rhr != null && d.activeMin != null);
    if (w.stepsHas) { const p = String(w.stepsHas); checks.push(d => d.steps != null && String(d.steps).includes(p)); }
    if (w.stepsMultiple) { const m = Number(w.stepsMultiple); checks.push(d => d.steps != null && d.steps >= m && d.steps % m === 0); }
    if (w.stepsPalindrome) checks.push(d => d.steps != null && d.steps >= 10000 && isPalindrome(d.steps));
    const fn = (d) => Boolean(d) && checks.every(f => f(d));
    Object.defineProperty(w, '__fn', { value: fn, enumerable: false });
    return fn;
  }

  // 依條件組出「達成紀錄」文字 (只列出條件有用到的指標)
  function describeDay(d, w) {
    const parts = [];
    const use = (k) => w && w[k] !== undefined;
    if (use('workouts') || use('workoutMin')) parts.push(`🏋️ ${d.workoutName || '有效運動'}${d.workouts > 1 ? ` 等 ${d.workouts} 筆` : ''}`);
    if (use('steps') || (w && (w.stepsHas || w.stepsMultiple || w.stepsPalindrome))) parts.push(`👣 ${fmt(d.steps || 0)} 步`);
    if (use('sleep') && d.sleep != null) parts.push(`😴 ${sleepStr(d.sleep)}`);
    if (w && (w.bedBy || w.bedAfter) && d.bed != null) parts.push(`🛏️ ${hmStr(d.bed)} 就寢`);
    if (w && (w.wakeBy || w.wakeAfter) && d.wake != null) parts.push(`⏰ ${hmStr(d.wake)} 起床`);
    if (use('activeMin') && d.activeMin != null) parts.push(`⚡ 活動 ${d.activeMin} 分`);
    if (use('kcal') && d.kcal != null) parts.push(`🔥 ${fmt(d.kcal)} kcal`);
    if (use('rhr') && d.rhr != null) parts.push(`💓 靜止心率 ${d.rhr}`);
    if (use('hrv') && d.hrv != null) parts.push(`🧠 HRV ${Math.round(d.hrv)} ms`);
    if (use('spo2') && d.spo2 != null) parts.push(`🫁 SpO2 ${d.spo2}%`);
    if (w && w.allCore) parts.push(`👣 ${fmt(d.steps)}・😴 ${sleepStr(d.sleep)}・💓 ${d.rhr}・⚡ ${d.activeMin} 分`);
    if (parts.length === 0) parts.push('健康數據同步');
    return parts.join('・');
  }

  const METRIC_LABEL = {
    steps: (v) => `${fmt(Math.round(v))} 步`,
    sleep: (v) => sleepStr(v),
    activeMin: (v) => `${Math.round(v)} 分鐘`,
    kcal: (v) => `${fmt(Math.round(v))} kcal`,
    rhr: (v) => `${Math.round(v * 10) / 10} bpm`,
    hrv: (v) => `${Math.round(v)} ms`,
    spo2: (v) => `${Math.round(v * 10) / 10}%`,
    bed: (v) => hmStr(v),
    wake: (v) => hmStr(v)
  };
  const ml = (metric, v) => (METRIC_LABEL[metric] ? METRIC_LABEL[metric](v) : String(v));

  // ==========================================================================
  // 4. 規則判定器 (rule.type → (rule, ctx) => { i, label, actId? } | null)
  // ==========================================================================
  const RULES = {
    // 累計 N 天符合條件 (N = 1 即「單日達成」)
    mh_day_count(r, ctx) {
      const { days } = ctx;
      const fn = compileWhen(r.when);
      const nextFn = r.when && r.when.next ? compileWhen(r.when.next) : null;
      const need = r.min || 1;
      let cnt = 0;
      for (let i = 0; i < days.length; i++) {
        if (!fn(days[i])) continue;
        let at = i;
        if (nextFn) {
          if (i + 1 >= days.length || !nextFn(days[i + 1])) continue;
          at = i + 1;
        }
        cnt += 1;
        if (cnt >= need) {
          const dd = days[at];
          let label = r.when && Object.keys(r.when).some(k => k !== 'next') ? describeDay(days[i], r.when) : '';
          if (nextFn) label = (label ? `${label} → ` : '') + describeDay(dd, r.when.next);
          return { i: at, label: need > 1 ? `第 ${cnt} 次達成・${label}` : label, actId: days[i].workoutId || undefined };
        }
      }
      return null;
    },

    // 連續 N 個日曆日都符合條件 (缺資料的日子視為中斷)
    mh_streak(r, ctx) {
      const { days } = ctx;
      const fn = compileWhen(r.when);
      let run = 0;
      for (let i = 0; i < days.length; i++) {
        run = fn(days[i]) ? run + 1 : 0;
        if (run >= r.min) return { i, label: `連續 ${run} 天達成・${days[i - run + 1].ymd} 起・${describeDay(days[i], r.when)}` };
      }
      return null;
    },

    // 指標累計總和
    mh_total(r, ctx) {
      let sum = 0;
      const { days } = ctx;
      for (let i = 0; i < days.length; i++) {
        const v = days[i][r.metric];
        if (v == null) continue;
        sum += v;
        if (sum >= r.min) return { i, label: `累計 ${ml(r.metric, sum)}` };
      }
      return null;
    },

    // 滾動視窗 (window 天) 的平均值或標準差
    mh_rolling(r, ctx) {
      const { days } = ctx;
      const win = r.window || 7;
      const minData = r.minData || Math.ceil(win * 0.7);
      for (let i = win - 1; i < days.length; i++) {
        const vals = [];
        for (let j = i - win + 1; j <= i; j++) { const v = days[j][r.metric]; if (v != null) vals.push(v); }
        if (vals.length < minData) continue;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const val = r.stat === 'std' ? Math.sqrt(vals.reduce((s, v) => s + (v - avg) * (v - avg), 0) / vals.length) : avg;
        if (r.min != null && val < r.min) continue;
        if (r.max != null && val > r.max) continue;
        const what = r.stat === 'std' ? `標準差 ${Math.round(val * 10) / 10} 分鐘 (平均 ${ml(r.metric, avg)})` : `平均 ${ml(r.metric, val)}`;
        return { i, label: `${days[i - win + 1].ymd} ~ ${days[i].ymd} ${what}` };
      }
      return null;
    },

    // 趨勢：近 7 天平均 vs. 最初 7 筆資料的基準平均
    mh_trend(r, ctx) {
      const { days } = ctx;
      const baseN = r.base || 7, win = r.window || 7, minData = r.minData || 5;
      const baseVals = [];
      let baseEnd = -1;
      for (let i = 0; i < days.length && baseVals.length < baseN; i++) {
        const v = days[i][r.metric];
        if (v != null) { baseVals.push(v); baseEnd = i; }
      }
      if (baseVals.length < baseN) return null;
      const baseAvg = baseVals.reduce((s, v) => s + v, 0) / baseN;
      for (let i = baseEnd + win; i < days.length; i++) {
        const vals = [];
        for (let j = i - win + 1; j <= i; j++) { const v = days[j][r.metric]; if (v != null) vals.push(v); }
        if (vals.length < minData) continue;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const ok = r.dir === 'down'
          ? (r.delta != null ? avg <= baseAvg - r.delta : avg <= baseAvg * (1 - (r.pct || 0) / 100))
          : (r.delta != null ? avg >= baseAvg + r.delta : avg >= baseAvg * (1 + (r.pct || 0) / 100));
        if (ok) return { i, label: `基準 ${ml(r.metric, baseAvg)} → 近 7 天平均 ${ml(r.metric, avg)}` };
      }
      return null;
    },

    // 累積 afterDays 天資料後，刷新個人紀錄
    mh_personal_best(r, ctx) {
      const { days } = ctx;
      let best = -Infinity, seen = 0;
      for (let i = 0; i < days.length; i++) {
        const v = days[i][r.metric];
        if (v == null) continue;
        if (seen >= (r.afterDays || 14) && v > best) return { i, label: `新紀錄 ${ml(r.metric, v)} (舊紀錄 ${ml(r.metric, best)})` };
        if (v > best) best = v;
        seen += 1;
      }
      return null;
    },

    // 連續 N 天數值一天比一天高
    mh_rising(r, ctx) {
      const { days } = ctx;
      let run = 0, prev = null;
      for (let i = 0; i < days.length; i++) {
        const v = days[i][r.metric];
        if (v == null) { run = 0; prev = null; continue; }
        run = (prev != null && v > prev) ? run + 1 : 1;
        prev = v;
        if (run >= r.min) return { i, label: `連續 ${run} 天遞增・今日 ${ml(r.metric, v)}` };
      }
      return null;
    },

    // 週目標：同一 ISO 週 (週一~週日) 內所有 conds 都達成；weeks = 需要幾週、consecutive = 是否須連續週
    mh_week(r, ctx) {
      const { days, weeks } = ctx;
      const conds = (r.conds || []).map(c => (c.when ? { fn: compileWhen(c.when), min: c.min || 1 } : { metric: c.metric, total: c.total }));
      const needWeeks = r.weeks || 1;
      let qualified = 0, run = 0, prevWeek = null;
      for (const wk of weeks) {
        const acc = conds.map(() => 0);
        let doneAt = -1;
        for (const i of wk.idx) {
          const d = days[i];
          conds.forEach((c, k) => {
            if (c.fn) { if (c.fn(d)) acc[k] += 1; }
            else if (d[c.metric] != null) acc[k] += d[c.metric];
          });
          if (conds.every((c, k) => (c.fn ? acc[k] >= c.min : acc[k] >= c.total))) { doneAt = i; break; }
        }
        if (doneAt >= 0) {
          qualified += 1;
          run = (prevWeek != null && wk.week === prevWeek + 1 && run > 0) ? run + 1 : 1;
          const count = r.consecutive ? run : qualified;
          if (count >= needWeeks) {
            const totals = conds.map((c, k) => (c.fn ? `${acc[k]} 天` : `累計 ${ml(c.metric, acc[k])}`)).join('・');
            const prefix = needWeeks > 1 ? (r.consecutive ? `連續 ${count} 週達標・` : `第 ${count} 週達標・`) : '';
            return { i: doneAt, label: `${prefix}${days[wk.idx[0]].ymd} 當週 ${totals}` };
          }
        } else {
          run = 0;
        }
        prevWeek = wk.week;
      }
      return null;
    },

    // 全服揪團：同一天至少 minHeroes 位英雄 (含自己) 符合條件
    mh_squad_day(r, ctx) {
      const { days, squad } = ctx;
      const fn = compileWhen(r.when);
      const countMap = squad(r);
      for (let i = 0; i < days.length; i++) {
        if (!fn(days[i])) continue;
        const c = countMap.get(days[i].t) || 0;
        if (c >= r.minHeroes) return { i, label: `當天全服 ${c} 位英雄達成・${describeDay(days[i], r.when)}` };
      }
      return null;
    }
  };

  /**
   * 擴充接口：註冊新的手機健康規則類型 (fn(rule, ctx) → { i, label } | null，i 為 ctx.days 的索引)
   */
  function registerMobileBadgeRule(type, fn) {
    if (type && typeof fn === 'function') RULES[type] = fn;
  }

  // ==========================================================================
  // 5. 主流程：掛載為 badgesCatalog.js 的徽章外掛
  // ==========================================================================
  function isMobileSyncOn(state) {
    return Boolean(state && state.gmOps && state.gmOps.mobileSync && state.gmOps.mobileSync.enabled);
  }

  function evaluateMobileBadges(ctx) {
    const state = ctx.state || {};
    const resultByHero = ctx.resultByHero || {};
    if (!isMobileSyncOn(state)) {
      // 未開啟手機同步：不顯示也不計算 (即使 GM 曾手動授勳手機徽章，也先隱藏，維持經典 100 枚)
      Object.values(resultByHero).forEach(map => {
        Object.keys(map || {}).forEach(id => { if (MOBILE_BADGE_IDS.has(id)) delete map[id]; });
      });
      return;
    }
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const badgeStartT = ctx.badgeStartYMD ? dayUtc(ctx.badgeStartYMD) : NaN;
    const inRange = (dateStr) => !Number.isFinite(badgeStartT) || dayUtc(dateStr) >= badgeStartT;

    // 每日健康數據依英雄分組 (套用 GM 設定之徽章起算日)
    const rowsByHero = new Map();
    (state.dailyHealth || []).forEach(r => {
      if (!r || !r.hero || !inRange(r.date)) return;
      if (!rowsByHero.has(r.hero)) rowsByHero.set(r.hero, []);
      rowsByHero.get(r.hero).push(r);
    });
    // 有效運動：isValidAttack === true (已內含 GM 最低時長門檻 / 賽季範圍 / 重複上傳排除)
    const actsByHero = new Map();
    (state.activities || []).forEach(a => {
      if (!a || a.isValidAttack !== true || a.isExcluded) return;
      if (!inRange(a.date || a.time)) return;
      if (!actsByHero.has(a.hero)) actsByHero.set(a.hero, []);
      actsByHero.get(a.hero).push(a);
    });

    const heroes = ctx.heroes || state.heroes || [];
    const seriesByHero = new Map();
    heroes.forEach(h => {
      const rows = rowsByHero.get(h.name);
      if (!rows || rows.length === 0) return;
      const s = buildHeroSeries(rows, actsByHero.get(h.name) || []);
      if (s) seriesByHero.set(h.name, s);
    });

    // 全服揪團 (跨英雄) 的每日人數，依規則快取
    const squadCache = new Map();
    const squad = (rule) => {
      if (squadCache.has(rule)) return squadCache.get(rule);
      const fn = compileWhen(rule.when);
      const m = new Map();
      seriesByHero.forEach(s => s.days.forEach(d => { if (fn(d)) m.set(d.t, (m.get(d.t) || 0) + 1); }));
      squadCache.set(rule, m);
      return m;
    };

    const collectors = MOBILE_BADGES.filter(b => b.rule.type === 'mh_badge_collector');
    const normal = MOBILE_BADGES.filter(b => b.rule.type !== 'mh_badge_collector');

    heroes.forEach(h => {
      const map = resultByHero[h.name] || (resultByHero[h.name] = {});
      const series = seriesByHero.get(h.name);
      if (series) {
        const rctx = { days: series.days, weeks: series.weeks, heroName: h.name, squad, state };
        normal.forEach(b => {
          if (map[b.id]) return; // GM 手動授勳紀錄優先保留
          const fn = RULES[b.rule.type];
          if (!fn) return;
          let hit = null;
          try { hit = fn(b.rule, rctx); } catch (e) { console.warn('[MobileBadges] 規則判定失敗', b.id, e); }
          if (hit && series.days[hit.i]) {
            const label = `📱 ${hit.label}`;
            const entry = { unlockedAt: series.days[hit.i].ymd, actName: label, actTitle: label };
            if (hit.actId != null) entry.actId = hit.actId;
            map[b.id] = entry;
          }
        });
      }
      // 收藏家徽章：只計算本擴充包內「非收藏家」的手機徽章
      const unlockedMobile = Object.keys(map).filter(id => MOBILE_BADGE_IDS.has(id) && !collectors.some(c => c.id === id));
      const dates = unlockedMobile.map(id => {
        const n = window.normalizeDateYMD ? window.normalizeDateYMD(map[id].unlockedAt) : String(map[id].unlockedAt || '');
        return n;
      }).filter(Boolean).sort();
      collectors.forEach(b => {
        if (map[b.id]) return;
        const need = b.rule.min || 10;
        if (unlockedMobile.length >= need) {
          const label = `📱 累積解鎖 ${unlockedMobile.length} 枚手機健康徽章`;
          map[b.id] = { unlockedAt: dates[need - 1] || dates[dates.length - 1] || (window.getTodayYMD ? window.getTodayYMD() : ''), actName: label, actTitle: label };
        }
      });
    });

    const t1 = (window.performance && performance.now) ? performance.now() : Date.now();
    window.__mobileBadgeEvalMs = Math.round((t1 - t0) * 10) / 10;
  }

  // 對外接口
  window.MOBILE_BADGE_CATALOG = MOBILE_BADGES;
  window.isMobileBadgeId = (id) => MOBILE_BADGE_IDS.has(id);
  window.registerMobileBadgeRule = registerMobileBadgeRule;
  window.evaluateMobileBadges = evaluateMobileBadges;
  window.__mobileBadgeInternals = { buildHeroSeries, compileWhen, RULES };

  if (typeof window.registerBadgePlugin === 'function') {
    window.registerBadgePlugin({
      id: 'mobile',
      getCatalog: (state) => (isMobileSyncOn(state) ? MOBILE_BADGES : []),
      getAllBadges: () => MOBILE_BADGES,
      evaluate: evaluateMobileBadges
    });
  } else {
    console.warn('[MobileBadges] 找不到 registerBadgePlugin，請確認 mobileBadges.js 在 badgesCatalog.js 之後載入');
  }
})();
