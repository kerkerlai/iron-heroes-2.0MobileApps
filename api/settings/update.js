const { getGameState, setGameState } = require('../_kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const state = await getGameState();

    for (const [k, v] of Object.entries(body)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && typeof state[k] === 'object') {
        state[k] = Object.assign(state[k], v);
      } else {
        state[k] = v;
      }
    }

    await setGameState(state);
    res.status(200).json({ success: true, state });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
