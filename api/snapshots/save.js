const { getGameState, setGameState } = require('../_kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const snapshot = body.snapshot;
    if (!snapshot) return res.status(400).json({ success: false, error: "Missing snapshot" });

    const state = await getGameState();
    if (!state.snapshots) state.snapshots = [];

    const snapId = snapshot.id;
    state.snapshots = state.snapshots.filter(s => s.id !== snapId);
    state.snapshots.unshift(snapshot);
    state.archivedSeasons = state.snapshots;

    await setGameState(state);
    res.status(200).json({ success: true, snapshot });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
