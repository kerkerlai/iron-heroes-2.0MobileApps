const { getGameState } = require('./_kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const state = await getGameState();
  const boss = state.boss || {};
  const activities = state.activities || [];
  const heroes = state.heroes || [];
  const guilds = state.guilds || [];

  const validActs = activities.filter(a => a.isValidAttack !== false && !a.isExcluded);

  const totalPhys = validActs.reduce((s, a) => s + (a.physDmg || a.calories || 0), 0);
  const totalMag = validActs.reduce((s, a) => s + (a.magDmg || 0), 0);
  const totalCrit = validActs.reduce((s, a) => s + (a.critDmg || 0), 0);
  const totalDamage = validActs.reduce((s, a) => s + (a.damage || 0), 0);

  const maxHp = boss.maxHp || 350000;
  const currentHp = Math.max(0, maxHp - totalDamage);

  const heroStats = heroes.map(h => {
    const hActs = validActs.filter(a => a.hero === h.name);
    return {
      name: h.name,
      guild: h.guild,
      avatar: h.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${h.name}`,
      validWorkouts: hActs.length,
      totalDamage: hActs.reduce((s, a) => s + (a.damage || 0), 0),
      totalCalories: hActs.reduce((s, a) => s + (a.calories || 0), 0),
      totalDuration: hActs.reduce((s, a) => s + (a.duration || 0), 0),
      maxGap: hActs.reduce((m, a) => Math.max(m, a.gap || 0), 0),
      physDmg: hActs.reduce((s, a) => s + (a.physDmg || a.calories || 0), 0),
      magDmg: hActs.reduce((s, a) => s + (a.magDmg || 0), 0),
      critDmg: hActs.reduce((s, a) => s + (a.critDmg || 0), 0)
    };
  });

  const guildContributions = guilds.map(g => {
    const gActs = validActs.filter(a => a.guild === g.name);
    const gDmg = gActs.reduce((s, a) => s + (a.damage || 0), 0);
    return {
      name: g.name,
      badge: g.badge || '🛡️',
      color: g.color || '#3b82f6',
      totalDamage: gDmg,
      pct: totalDamage > 0 ? Math.round((gDmg / totalDamage) * 1000) / 10 : 0
    };
  });

  res.status(200).json({
    summary: {
      totalPhys,
      totalMag,
      totalCrit,
      totalDamage
    },
    boss: {
      ...boss,
      currentHp
    },
    heroStats,
    guildContributions
  });
};
