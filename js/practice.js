/**
 * practice.js — Practice-mode selection logic (pure, no DOM; Node-testable).
 * Offense: 'random' = the exact Free Play pool for the mode (QBModes.pool), or 'pick' = only the chosen plays
 *          (concept chips are shortcuts that select every play of that concept).
 * Defense: 'own' = each play keeps its authored look (Free Play behaviour), or 'pick' = only the chosen coverages.
 * Both sides draw from independent shuffle bags: every selected item appears once before any repeats, and a new bag
 * never starts with the item that just ended the previous one (when there is more than one item).
 * Saved locally inside the existing profile (localStorage 'pocketiq.v8' → prefs.practice = { offense, plays, defense, covs }).
 */
(function (root) {
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const D = root.QBData || req('./data.js'), M = root.QBModes || req('./modes.js'), R = root.QBReads || req('./reads.js');
  const FAMILY_ORDER = ['C0', 'C1', 'C2', 'C3', 'C4'];
  const FAMILY_NAMES = { C0: 'Cover 0', C1: 'Cover 1', C2: 'Cover 2', C3: 'Cover 3', C4: 'Cover 4 / Quarters' };
  const concept = (p) => p.name.replace(' (audible)', '');
  const allCovs = () => Object.keys(D.COVERAGES);
  const families = () => FAMILY_ORDER.map((f) => ({ id: f, label: FAMILY_NAMES[f], covs: allCovs().filter((k) => D.COVERAGES[k].shell === f) })).filter((g) => g.covs.length);
  const blank = () => ({ offense: 'random', plays: [], defense: 'own', covs: [] });
  function normalize(c) {
    const b = blank(); if (!c || typeof c !== 'object') return b;
    return { offense: c.offense === 'pick' ? 'pick' : 'random', plays: Array.isArray(c.plays) ? [...new Set(c.plays.filter((x) => typeof x === 'string'))] : [],
      defense: c.defense === 'pick' ? 'pick' : 'own', covs: Array.isArray(c.covs) ? [...new Set(c.covs.filter((k) => D.COVERAGES[k]))] : [] };
  }
  /** Free Play's pool for the mode (passing / running / normal) — identical list, nothing hidden. */
  const freePlayPool = (mode) => M.pool(mode);
  function offensePool(mode, cfg) { const base = freePlayPool(mode); return cfg.offense === 'random' ? base : base.filter((p) => cfg.plays.includes(p.id)); }
  /** -> { ok, errors[], plays[], covs[] } — empty selections are errors, never a silent fallback. */
  function validate(mode, cfgIn) {
    const cfg = normalize(cfgIn), plays = offensePool(mode, cfg), errors = [];
    if (!plays.length) errors.push(cfg.offense === 'pick' && cfg.plays.length ? 'None of the selected plays are in this mode — pick plays from the list (or switch mode).' : 'Select at least one play, or choose Fully random.');
    const covs = cfg.defense === 'pick' ? cfg.covs : null;
    if (covs && !covs.length) errors.push('Select at least one coverage, or choose “Each play’s own look”.');
    return { ok: !errors.length, errors, plays, covs, cfg };
  }
  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  /** shuffle bag: each item once per round; no back-to-back repeat across rounds when items.length > 1. */
  function makeBag(items, rnd) {
    const src = items.slice(); if (!src.length) throw new Error('empty bag');
    let bag = [], last;
    return { size: src.length, next() {
      if (!bag.length) { bag = shuffle(src.slice(), rnd); if (src.length > 1 && bag[bag.length - 1] === last) { const k = Math.floor(rnd() * (bag.length - 1)); [bag[k], bag[bag.length - 1]] = [bag[bag.length - 1], bag[k]]; } }
      last = bag.pop(); return last;
    } };
  }
  const blitzFits = (pressure, cov) => Object.keys((D.BLITZES[pressure] || {}).set || {}).every((id) => D.COVERAGES[cov].defenders.some((d) => d.id === id));
  /** play vs a chosen coverage. Same play, new look; pressure kept when it fits the look (an all-out ZERO only with Cover 0).
   *  If the concept has no read table, the authored answer belonged to the old look, so grading probes the engine (lookProbe). */
  function withLook(play, cov) {
    if (!cov || cov === play.coverage) return { ...play };
    let pressure = play.pressure || 'NONE';
    if ((pressure === 'ZERO' && cov !== 'cover0') || !blitzFits(pressure, cov)) pressure = 'NONE';
    const out = { ...play, coverage: cov, pressure, practiceLook: true };
    if (play.type !== 'run') {
      const rr = R && R.resolveRead ? R.resolveRead(out, cov) : null;
      if (!rr || rr.source !== 'table') out.lookProbe = true;
    }
    return out;
  }
  /** a practice run: independent bags for offense and defense. */
  function createRun(mode, cfgIn, rnd = Math.random) {
    const v = validate(mode, cfgIn); if (!v.ok) throw new Error(v.errors.join(' '));
    const offBag = makeBag(v.plays.map((p) => p.id), rnd), byId = Object.fromEntries(v.plays.map((p) => [p.id, p]));
    const covBag = v.covs ? makeBag(v.covs, rnd) : null;
    return { plays: v.plays, covs: v.covs, cfg: v.cfg, next() { const p = byId[offBag.next()]; return withLook(p, covBag ? covBag.next() : null); } };
  }
  function label(mode, cfgIn) {
    const v = validate(mode, cfgIn), c = v.cfg;
    const off = c.offense === 'random' ? 'Fully random' : (() => { const cs = [...new Set(v.plays.map(concept))]; return cs.length <= 2 ? cs.join(' + ') : `${v.plays.length} plays`; })();
    const def = c.defense === 'own' ? 'own looks' : v.covs.length <= 2 ? v.covs.map((k) => D.COVERAGES[k].name.replace(/ \(.*\)$/, '')).join(' / ') : `${v.covs.length} coverages`;
    return `${off} vs ${def}`;
  }
  const api = { blank, normalize, freePlayPool, offensePool, validate, makeBag, withLook, createRun, label, families, allCovs, concept, FAMILY_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QBPractice = api;
})(typeof window !== 'undefined' ? window : globalThis);
