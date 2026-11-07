/* v10: off-main-thread rep analysis. The audible EV table (M.evalPlay over the called play + every audible, each running
 * the engine's bestRead probe) and the protection table took 1–5 s of synchronous main-thread time; in v9 that ran 60 ms
 * after the snap and froze the game (clicks queued, no frames) right when the user threw. Now it runs here. */
importScripts('data.js', 'playbook.js', 'protections.js', 'runplay.js', 'defense.js', 'engine.js', 'audible-ev.js', 'modes.js');
const M = self.QBModes;
self.onmessage = (e) => {
  const { id, base, play, opts, mode, menu } = e.data;
  let evals = null, protTable = null, err = null;
  try {
    evals = M.audibleEvals(base, menu || M.audibleTree(base, mode), opts);
  } catch (x) { err = String(x && x.stack || x); }
  try { protTable = play.type === 'run' ? null : M.protectionTable(play, { ...opts }); } catch (x) { err = (err || '') + String(x); }
  self.postMessage({ id, evals, protTable, err });
};
