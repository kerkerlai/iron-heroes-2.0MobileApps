const { getGameState, setGameState } = require('../_kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const state = await getGameState();
    if (!state.activities) state.activities = [];

    const hero = (state.heroes || []).find(h => h.name === body.hero) || { maxHr: 185, guild: '自由英雄' };
    const maxHrEst = hero.maxHr || (220 - (hero.age || 35));
    const duration = parseFloat(body.duration || 0);
    const avgHr = parseFloat(body.avgHr || 0);
    const maxHr = parseFloat(body.maxHr || 0);
    const calories = parseFloat(body.calories || 0);

    const minDur = state.boss?.rules?.minDurationMinutes || 30.0;
    const physMult = state.boss?.rules?.physMultiplier || 1.0;
    const magMult = state.boss?.rules?.magicMultiplier || 15.0;
    const critMult = state.boss?.rules?.critMultiplier || 100.0;

    let physDmg = 0, magDmg = 0, critDmg = 0, totalDmg = 0, trimp = 0, gap = 0;
    const isValidAttack = duration >= minDur;

    if (isValidAttack) {
      physDmg = Math.round(calories * physMult);
      if (maxHrEst > 0 && avgHr > 0) {
        const ratio = avgHr / maxHrEst;
        trimp = duration * ratio * Math.exp(1.92 * ratio);
        magDmg = Math.round(trimp * magMult);
      }
      gap = Math.max(0, maxHr - avgHr);
      critDmg = Math.round(gap * critMult);
      totalDmg = physDmg + magDmg + critDmg;
    }

    const newAct = Object.assign({}, body, {
      id: body.id || `ACT-${Date.now()}`,
      guild: hero.guild || '自由英雄',
      physDmg,
      magDmg,
      critDmg,
      damage: totalDmg,
      trimp: Math.round(trimp * 10) / 10,
      gap,
      isValidAttack,
      inSeason: true,
      isExcluded: false,
      source: 'manual'
    });

    state.activities.unshift(newAct);
    await setGameState(state);

    res.status(200).json({ success: true, activity: newAct });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
