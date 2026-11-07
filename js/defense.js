/**
 * defense.js — v10 data-driven defensive FRONTS & PERSONNEL (pure logic; browser, worker + Node).
 * A front re-aligns the front seven (DE1 DT1 DT2 DE2 W M) and re-labels the nickel (NB) without touching the
 * coverage defenders (CB1 CB2 S1 S2), so every coverage/read stays valid while the box, the rush count,
 * the stance (down vs stand-up) and the techniques change. 11 defenders on every snap.
 * Positions are authored for STRENGTH RIGHT (+x) and mirrored when the offense's strength is left.
 * Techniques (x offset from the ball, yd): 0 head-up C, 1 C/G shade, 2i, 2 head-up G, 3 outside G, 4i, 4 head-up T,
 * 5 outside T, 6/7 inline-TE shades, 9 outside TE, w9 wide-9.   See docs/defense-research.md for sources.
 */
(function (root) {
  const BX = 26.65;
  const TECH = { 0: 0, 1: 1.3, '2i': 2.0, 2: 2.5, 3: 3.5, '4i': 4.4, 4: 5.0, 5: 5.9, 6: 6.9, 7: 7.6, 9: 8.8, w9: 10.2 };
  // slot helpers: dl(tech, side, extra) side: +1 strong / -1 weak ; stand-up rushers / droppers
  const at = (tech, side) => BX + side * TECH[tech];
  const DL = (tech, side, o) => Object.assign({ tech: String(tech) + (side > 0 ? 'S' : 'W'), x: at(tech, side), y: 1, down: true, role: 'DL', rush: true }, o || {});
  const UP = (tech, side, y, o) => Object.assign({ tech: String(tech) + (side > 0 ? 'S' : 'W'), x: at(tech, side), y: y || 1.4, down: false, role: 'LB', rush: true }, o || {});
  const LB = (x, y, o) => Object.assign({ x, y, down: false, role: 'LB' }, o || {});
  const DROP = (x, y, r) => ({ type: 'zone', x, y, r: r || 5.5 });

  const FAMILIES = [
    { id: 'EVEN', label: 'Even (4 down)', short: '4-down' },
    { id: 'ODD', label: 'Odd (3 down)', short: '3-down' },
    { id: 'HEAVY', label: 'Heavy / goal line (5-6 down)', short: 'Heavy' },
    { id: 'SUB', label: 'Sub / pass-rush (0-2 down)', short: 'Sub' },
  ];
  /* Each front: id, family, name, label (chip), personnel name, slots (DE1 DT1 DT2 DE2 W M NB overrides), tell, why. */
  const FRONTS = [
    // ---------------- EVEN (four down) ----------------
    { id: 'NICKEL_OVER', family: 'EVEN', label: 'Nickel Over', name: '4-2-5 Nickel Over', pkg: 'Nickel',
      slots: { DE1: DL(5, -1, { label: 'E' }), DT1: DL(1, -1, { label: 'N' }), DT2: DL(3, 1, { label: 'T' }), DE2: DL(5, 1, { label: 'E' }) },
      tell: 'four down, 3-technique to the passing strength, a nickel DB over the slot, two off-ball linebackers', why: 'The modern base vs 11 personnel: four-man rush, five DBs, a six-man box.' },
    { id: 'NICKEL_UNDER', family: 'EVEN', label: 'Nickel Under', name: '4-2-5 Nickel Under', pkg: 'Nickel',
      slots: { DE1: DL(5, -1, { label: 'R' }), DT1: DL(3, -1, { label: 'T' }), DT2: DL(1, 1, { label: 'N' }), DE2: DL(5, 1, { label: 'E' }) },
      tell: 'the 3-technique set AWAY from strength, nose shaded strong, weak end loose', why: 'Gets the best rusher (3-tech + Rush end) one-on-one to the weak side.' },
    { id: 'OVER43', family: 'EVEN', label: '4-3 Over', name: '4-3 Over (base)', pkg: 'Base 4-3',
      slots: { DE1: DL(5, -1), DT1: DL(1, -1, { label: 'N' }), DT2: DL(3, 1), DE2: DL(5, 1), NB: { role: 'LB', label: 'S', x: at(9, 1) + 0.5, y: 4.2 } },
      tell: '3-technique strong, a SAM linebacker (not a nickel) over the tight end / strong edge, three linebackers', why: 'Balanced gap-sound base front vs 12/21 personnel.' },
    { id: 'UNDER43', family: 'EVEN', label: '4-3 Under', name: '4-3 Under (Sam on the line)', pkg: 'Base 4-3',
      slots: { DE1: DL(5, -1, { label: 'R', x: at(5, -1) - 0.6 }), DT1: DL(3, -1), DT2: DL(1, 1, { label: 'N' }), DE2: DL(5, 1), NB: { role: 'LB', label: 'S', x: at(9, 1), y: 1.6 } },
      tell: 'Sam walked up on the strong edge, 3-tech weak, shade nose strong', why: 'Monte Kiffin / Tampa-2 front: forces runs strong into the walked-up Sam.' },
    { id: 'WIDE9', family: 'EVEN', label: 'Wide 9', name: '4-2-5 Wide-9', pkg: 'Nickel',
      slots: { DE1: DL('w9', -1, { label: 'E' }), DT1: DL(3, -1), DT2: DL(3, 1), DE2: DL('w9', 1, { label: 'E' }) },
      tell: 'both ends split extremely wide (outside where a tight end would be), two 3-techniques', why: 'Speed-rush angles off the edge; soft vs runs inside the ends.' },
    { id: 'EVEN_G', family: 'EVEN', label: 'Even / G', name: '4-3 Even (2i–3)', pkg: 'Nickel',
      slots: { DE1: DL(5, -1), DT1: DL('2i', -1), DT2: DL(3, 1), DE2: DL(5, 1) },
      tell: 'both guards covered (2i and 3), centre uncovered, A-gaps open for linebackers', why: 'Covers both guards so they cannot climb to the linebackers.' },
    { id: 'DIME416', family: 'EVEN', label: 'Dime 4-1-6', name: 'Dime 4-1-6', pkg: 'Dime',
      slots: { DE1: DL(5, -1), DT1: DL(2, -1), DT2: DL(2, 1), DE2: DL(5, 1), M: { role: 'DB', label: '$', x: 27, y: 6.5 } },
      tell: 'only ONE linebacker; a sixth DB ($) at 6-7 yds in the middle; four down', why: 'Passing downs vs 10/11 personnel: speed in coverage, light five-man box.' },
    { id: 'NASCAR', family: 'EVEN', label: 'NASCAR', name: 'NASCAR (four edge rushers)', pkg: 'Dime',
      slots: { DE1: DL(9, -1, { label: 'E' }), DT1: DL(3, -1, { label: 'E' }), DT2: DL(3, 1, { label: 'E' }), DE2: DL(9, 1, { label: 'E' }), M: { role: 'DB', label: '$', x: 27, y: 7 } },
      tell: 'four lighter edge players down (two of them inside at 3-tech), dime behind', why: 'Third-and-long speed rush package.' },
    // ---------------- ODD (three down) ----------------
    { id: 'TITE', family: 'ODD', label: 'Tite 4i-0-4i', name: 'Tite / Mint (4i-0-4i)', pkg: 'Nickel (3-3-5)',
      slots: { DE1: UP(9, -1, 1.4, { label: 'J' }), DT1: DL('4i', -1, { label: 'E' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL('4i', 1, { label: 'E' }) },
      tell: 'zero-nose head-up on the centre, both ends inside-shading the tackles (4i), a stand-up edge (Jack) weak', why: 'Closes the B-gaps vs spread inside zone; overhangs handle the perimeter.' },
    { id: 'OKIE', family: 'ODD', label: 'Okie 5-0-5', name: '3-4 Okie (5-0-5)', pkg: 'Base 3-4',
      slots: { DE1: UP(9, -1, 1.4, { label: 'O' }), DT1: DL(5, -1, { label: 'E' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL(5, 1, { label: 'E' }), NB: { role: 'LB', label: 'O', x: at(9, 1) + 1, y: 1.8 } },
      tell: 'nose head-up, ends outside the tackles, BOTH outside linebackers standing on the edges', why: 'Classic 3-4: two-gapping linemen, outside backers set the edge or rush.' },
    { id: 'STACK404', family: 'ODD', label: 'Stack 4-0-4', name: '3-4 Stack (4-0-4)', pkg: 'Base 3-4',
      slots: { DE1: UP(9, -1, 1.4, { label: 'O' }), DT1: DL(4, -1, { label: 'E' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL(4, 1, { label: 'E' }), NB: { role: 'LB', label: 'O', x: at(9, 1) + 1, y: 1.8 }, W: LB(at(4, -1), 4.5), M: LB(at(4, 1) - 1, 4.5) },
      tell: 'ends head-up on the tackles, inside linebackers stacked directly behind them', why: 'Two-way go for the ends; hard for guards to reach a 4-tech on zone.' },
    { id: 'ODD335', family: 'ODD', label: '3-3-5 Stack', name: '3-3-5 Odd Stack', pkg: 'Nickel (3-3-5)',
      slots: { DE1: LB(at(5, -1), 4.2, { label: 'S', rush: false, job: DROP(19, 8, 5.5) }), DT1: DL(5, -1, { label: 'E' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL(5, 1, { label: 'E' }), W: LB(BX, 4.5), M: LB(at(5, 1), 4.5) },
      tell: 'three down, THREE linebackers stacked behind them at 4-5 yds, nobody on the edges', why: 'Disguise: any of the stacked backers can come; vs a base call it rushes 3 and drops 8.' },
    { id: 'OKIE_DROP', family: 'ODD', label: 'Okie Drop', name: '3-4 Okie, drop the OLB', pkg: 'Base 3-4',
      slots: { DE1: UP(9, -1, 1.6, { label: 'O', rush: false, job: DROP(16, 6, 5) }), DT1: DL(5, -1, { label: 'E' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL(5, 1, { label: 'E' }), NB: { role: 'LB', label: 'O', x: at(9, 1) + 1, y: 1.8 } },
      tell: 'looks like Okie, but the weak OLB is a little deeper and wider (heels at 1.5-2 yds)', why: 'Three-man rush, eight in coverage; the OLB drops to the weak curl/flat.' },
    { id: 'PENNY', family: 'ODD', label: 'Penny 5-1', name: 'Penny (5-1, Fangio)', pkg: 'Penny (3-3-5)',
      slots: { DE1: UP(9, -1, 1.3, { label: 'O' }), DT1: DL('4i', -1, { label: 'E' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL('4i', 1, { label: 'E' }), W: LB(at(9, 1) + 0.8, 1.6, { label: 'O', role: 'LB', job: DROP(39, 6, 5.5) }), M: LB(BX + 0.5, 4.8) },
      tell: 'five on the line (3 down + 2 stand-up edges), ONE off-ball linebacker, two-high safeties', why: 'Fangio-style light box vs 11 personnel; edges rush or drop, safeties fit from depth.' },
    { id: 'DOLLAR', family: 'ODD', label: 'Dollar 3-2-6', name: 'Dollar 3-2-6', pkg: 'Dollar',
      slots: { DE1: UP(9, -1, 1.4, { label: 'O' }), DT1: DL('4i', -1, { label: 'E' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL('4i', 1, { label: 'E' }), M: { role: 'DB', label: '$', x: 28, y: 6.5 } },
      tell: 'three down + one stand-up edge, one linebacker plus a sixth DB in the box', why: 'Passing-down package with a 4-man rush from a 3-down look.' },
    { id: 'QUARTER317', family: 'ODD', label: 'Quarter 3-1-7', name: 'Quarter / prevent (3-1-7)', pkg: 'Quarter',
      slots: { DE1: DL(5, -1, { label: 'E' }), DT1: DL(0, -1, { label: 'N' }), DT2: { role: 'DB', label: 'Q', x: BX, y: 17, down: false, rush: false, job: { type: 'zone', x: BX, y: 24, r: 8, deep: true } }, DE2: DL(5, 1, { label: 'E' }), M: { role: 'DB', label: '$', x: 27, y: 8 } },
      tell: 'only three down linemen and a seventh DB deep in the middle (15+ yds)', why: 'End-of-half / very long yardage: rush three, take away everything deep.' },
    // ---------------- HEAVY ----------------
    { id: 'BEAR46', family: 'HEAVY', label: 'Bear 46', name: '46 / Bear (3-0-3 covered)', pkg: 'Base (46)',
      slots: { DE1: DL(5, -1, { label: 'E' }), DT1: DL(3, -1), DT2: DL(0, 1, { label: 'N' }), DE2: DL(3, 1), W: UP(9, 1, 1.5, { label: 'J', x: at(5, 1) + 1.6 }), M: LB(BX - 1, 4.5), NB: { role: 'LB', label: 'S', x: at(9, 1) + 1.5, y: 3.5 } },
      tell: 'centre AND both guards covered (3-0-3), an extra stand-up rusher on the strong edge, eight in the box', why: 'Buddy Ryan 46: kills interior runs and man protection; five come.' },
    { id: 'EAGLE52', family: 'HEAVY', label: '5-2 Eagle', name: '5-2 Eagle', pkg: 'Heavy 5-2',
      slots: { DE1: DL(5, -1), DT1: DL(2, -1, { label: 'T' }), DT2: DL(0, 1, { label: 'N' }), DE2: DL(2, 1, { label: 'T' }), W: DL(5, 1, { label: 'E', role: 'DL' }), M: LB(BX - 1.5, 4.2), NB: { role: 'LB', label: 'S', x: at(9, 1) + 1, y: 4 } },
      tell: 'FIVE down linemen across the line, only two off-ball backers', why: 'Heavy run front: every interior gap has a lineman; five rush on passes.' },
    { id: 'GOAL62', family: 'HEAVY', label: 'Goal line 6-1', name: 'Goal line 6-1 (jumbo)', pkg: 'Goal line',
      slots: { DE1: DL(7, -1, { label: 'E' }), DT1: DL(3, -1), DT2: DL(1, 1, { label: 'N' }), DE2: DL(3, 1), W: DL(7, 1, { label: 'E', role: 'DL' }), M: DL(9, 1, { label: 'E', role: 'DL', x: at(9, 1) + 1 }), NB: { role: 'LB', label: 'S', x: BX, y: 3.5 } },
      tell: 'SIX down linemen, everybody inside the tight ends, one backer', why: 'Short-yardage wall: six rush/penetrate, coverage is thin.' },
    // ---------------- SUB / PASS-RUSH ----------------
    { id: 'MUG245', family: 'SUB', label: '2-4-5 Mug', name: '2-4-5 Double-mug', pkg: 'Nickel (2-4-5)',
      slots: { DE1: UP(5, -1, 1.3, { label: 'O' }), DT1: DL(3, -1), DT2: DL(3, 1), DE2: UP(5, 1, 1.3, { label: 'O' }), W: LB(BX - 1.3, 1.9, { label: 'W' }), M: LB(BX + 1.3, 1.9, { label: 'M' }) },
      tell: 'only TWO hands in the dirt, both inside backers walked up into the A-gaps (they bail at the snap)', why: 'Simulated pressure look: six threaten, four come — protection has to declare.' },
    { id: 'PSYCHO', family: 'SUB', label: 'Psycho 0-down', name: 'Psycho / Amoeba (0 down)', pkg: 'Dime (amoeba)',
      slots: { DE1: UP(5, -1, 2.2, { label: 'O' }), DT1: LB(BX - 1.8, 3.2, { label: 'R', rush: false, job: DROP(BX - 3, 7, 5) }), DT2: UP(2, 1, 2.6, { label: 'R' }), DE2: UP(5, 1, 2.2, { label: 'O' }), M: { role: 'DB', label: '$', x: 28.5, y: 6 } },
      tell: 'NOBODY in a stance — everyone standing and milling at 2-4 yds', why: 'Amoeba look: three rush from unknown spots, eight drop.' },
    { id: 'NICKEL_TILT', family: 'SUB', label: 'Tilt 3-down', name: '3-3-5 Tilt (tilted nose)', pkg: 'Nickel (3-3-5)',
      slots: { DE1: UP('w9', -1, 1.3, { label: 'J' }), DT1: DL(3, -1, { label: 'E' }), DT2: DL(1, 1, { label: 'N', tilt: true }), DE2: DL(5, 1, { label: 'E' }) },
      tell: 'nose angled (tilted) toward the strong A-gap, Jack stand-up wide-9 weak', why: 'Tilted nose slants into the A-gap; fast edge from a wide angle.' },
  ];
  const BY = Object.fromEntries(FRONTS.map((f) => [f.id, f]));
  const BASE_ROLE = { DE1: 'DL', DT1: 'DL', DT2: 'DL', DE2: 'DL', W: 'LB', M: 'LB', NB: 'DB', CB1: 'DB', CB2: 'DB', S1: 'DB', S2: 'DB' };

  /** offensive personnel group from a formation (RB count + TE count), e.g. '11', '12', '21', '10'. */
  function offPersonnel(formId) {
    return { doubles: '11', tripsR: '11', pistolTE: '11', iform: '21', aceTwoTE: '12' }[formId] || '11';
  }
  /** which fronts a defense would show vs this offense personnel + pressure + down/distance. */
  const PAIR = {
    '10': ['NICKEL_OVER', 'DIME416', 'NASCAR', 'PSYCHO', 'MUG245', 'DOLLAR', 'TITE', 'QUARTER317'],
    '11': ['NICKEL_OVER', 'NICKEL_UNDER', 'WIDE9', 'EVEN_G', 'TITE', 'PENNY', 'MUG245', 'ODD335', 'NICKEL_TILT', 'DIME416', 'OKIE_DROP', 'DOLLAR', 'PSYCHO'],
    '12': ['OVER43', 'UNDER43', 'OKIE', 'STACK404', 'PENNY', 'TITE', 'BEAR46', 'EVEN_G'],
    '21': ['OVER43', 'UNDER43', 'OKIE', 'STACK404', 'BEAR46', 'EAGLE52', 'WIDE9'],
  };
  function candidates(play) {
    const pers = offPersonnel(play.formation); let c = (PAIR[pers] || PAIR['11']).slice();
    if ((play.togo || 10) <= 2) c = c.concat(['GOAL62', 'EAGLE52', 'BEAR46']);
    if ((play.togo || 10) >= 15) c = c.concat(['QUARTER317', 'DIME416', 'NASCAR']);
    // the front must not fight the called pressure: blitzes that re-align the DL/LBs keep a 4-down base under them
    if (play.pressure && play.pressure !== 'NONE') c = c.filter((id) => !['QUARTER317', 'PSYCHO', 'GOAL62', 'OKIE_DROP', 'ODD335'].includes(id));
    return Array.from(new Set(c));
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /** deterministic front for (play, seed) from the personnel pairing (never consumes the sim rng). */
  function pick(play, seed) { const c = candidates(play); return c[hashStr(play.id + '|' + seed) % c.length]; }
  function strengthOf(offense) {
    const y = offense.find((p) => p.id === 'Y');
    if (y && Math.abs(y.x - BX) <= 9.5) return Math.sign(y.x - BX) || 1;
    const l = offense.filter((p) => p.x < BX - 1 && p.id !== 'RB').length, r = offense.filter((p) => p.x > BX + 1 && p.id !== 'RB').length;
    return r >= l ? 1 : -1;
  }
  /** Apply a front to a defender spec (coverage defender def0) → {pre, job, label, role, down, tech}; null = untouched. */
  function slot(front, id, strong, isRunOrBlitz) {
    const s = front && front.slots[id]; if (!s) return null;
    const mx = (x) => (strong < 0 ? 2 * BX - x : x);
    const o = { label: s.label, role: s.role, down: s.down, tech: s.tech, tilt: s.tilt };
    if (s.x != null) o.pre = { x: mx(s.x), y: s.y };
    if (s.job) o.job = Object.assign({}, s.job, { x: mx(s.job.x) });
    else if (s.rush === true && s.role !== 'DB') o.job = { type: 'rush' };
    return o;
  }
  function personnel(defense) {
    const n = { DL: 0, LB: 0, DB: 0, CB: 0, S: 0, down: 0 };
    defense.forEach((d) => { n[d.role] = (n[d.role] || 0) + 1; if (d.down) n.down++; if (d.role === 'DB') { if (/^C|^N/.test(d.label)) n.CB++; else n.S++; } });
    return n;
  }
  const api = { FRONTS, FAMILIES, BY, BASE_ROLE, TECH, offPersonnel, candidates, pick, strengthOf, slot, personnel, PAIR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QBDefense = api;
})(typeof window !== 'undefined' ? window : globalThis);
