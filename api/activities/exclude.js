const { getGameState, setGameState } = require('../_kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const actId = String(body.id || '');
    const isExcluded = Boolean(body.isExcluded);

    const state = await getGameState();
    if (state.activities) {
      for (const a of state.activities) {
        if (String(a.id) === actId) {
          a.isExcluded = isExcluded;
          break;
        }
      }
    }

    await setGameState(state);
    res.status(200).json({ success: true, id: actId, isExcluded });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
