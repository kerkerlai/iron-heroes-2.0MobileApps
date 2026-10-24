const { getGameState } = require('./_kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const state = await getGameState();
  const heroes = state.heroes || [];
  const activities = state.activities || [];

  const heroStats = heroes.map(h => {
    const acts = activities.filter(a => a.hero === h.name && !a.isExcluded && a.isValidAttack !== false);
    const validCount = acts.length;
    const totalDmg = acts.reduce((s, a) => s + (a.damage || 0), 0);
    const totalCal = acts.reduce((s, a) => s + (a.calories || 0), 0);
    const totalDur = acts.reduce((s, a) => s + (a.duration || 0), 0);
    const maxGap = acts.reduce((m, a) => Math.max(m, a.gap || 0), 0);
    const physDmg = acts.reduce((s, a) => s + (a.physDmg || a.calories || 0), 0);
    const magDmg = acts.reduce((s, a) => s + (a.magDmg || 0), 0);
    const critDmg = acts.reduce((s, a) => s + (a.critDmg || 0), 0);

    return {
      name: h.name,
      guild: h.guild,
      avatar: h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`,
      validWorkouts: validCount,
      totalDamage: totalDmg,
      totalCalories: totalCal,
      totalDuration: totalDur,
      maxGap: maxGap,
      physDmg: physDmg,
      magDmg: magDmg,
      critDmg: critDmg
    };
  });

  res.status(200).json(heroStats);
};
