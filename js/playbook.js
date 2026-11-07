/**
 * playbook.js — v4 premade plays (pass + run). Pushed onto QBData.PLAYS.
 * `correct` / `idealTime` for passes were baked by tests/bake-reads.cjs (engine probe vs the
 * authored defence) and then reviewed; coaching is hand-written. Runs carry {run:{concept,carrier,scheme,dir}}.
 */
(function (root) {
  const D = root.QBData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const P = (id, name, formation, coverage, pressure, routes, progression, correct, idealTime, coaching, extra) =>
    Object.assign({ id, name, type: 'pass', formation, coverage, pressure, routes, progression, correct, idealTime, coaching }, extra || {});
  const R = (id, name, formation, coverage, pressure, concept, dir, coaching, extra) =>
    Object.assign({ id, name, type: 'run', formation, coverage, pressure, run: { concept, dir, carrier: concept === 'SNEAK' ? 'QB' : 'RB' },
      routes: { X: 'stalk', Z: 'stalk', H: formation === 'iform' ? 'lead' : 'stalk', Y: 'block', RB: 'block' }, progression: [], coaching }, extra || {});
  const NEW = [
    // ---------------- passes ----------------
    P('curlflat_c3', 'Curl-Flat', 'doubles', 'cover3', 'NONE', { X: 'curl', H: 'flat', Y: 'curl', Z: 'curl', RB: 'check' }, ['X', 'H', 'Y', 'RB'], 'X', 1.6,
      'Cover 3 sky: the curl-flat defender cannot carry the curl and the flat at once. Read him — he widened to the flat, so the curl outside is open behind the hook.'),
    P('dagger_c4', 'Dagger', 'doubles', 'cover4', 'NONE', { X: 'go', H: 'seam', Y: 'dig', Z: 'go', RB: 'check' }, ['H', 'Y', 'RB'], 'H', 2.4,
      'Quarters: the safety reads #2 — when he drives on the dig coming underneath, the seam by #2 splits the safeties. If he stays on top of the seam, the dig is your answer.'),
    P('levels_c2', 'Levels', 'tripsR', 'cover2', 'NONE', { X: 'go', Y: 'in10', H: 'in5', Z: 'hitch', RB: 'check' }, ['Y', 'H', 'Z', 'RB'], 'Y', 1.9,
      'Cover 2: the hook defender jumps the 5-yard in, opening the 10-yard in behind him and under the half-field safety.'),
    P('drive_c1', 'Drive', 'doubles', 'cover1', 'NONE', { X: 'shallow', H: 'dig', Y: 'curl', Z: 'go', RB: 'flat' }, ['X', 'H', 'RB'], 'H', 2.4,
      'Man free: the shallow drags the hook/robber defender down with him, and the dig settles behind him at 12 yards. Shallow is the alert if the robber sits deep.'),
    P('shallow_c3', 'Shallow Cross', 'doubles', 'cover3', 'NONE', { X: 'shallow', H: 'dig', Y: 'stick', Z: 'go', RB: 'check' }, ['X', 'H', 'Y', 'RB'], 'H', 2.0,
      'Cover 3: the shallow pulls the hook defender down; the dig sits behind him in the void.'),
    P('ycross_c3', 'Y-Cross', 'tripsR', 'cover3', 'NONE', { X: 'post', Y: 'cross', H: 'go', Z: 'curl', RB: 'flat' }, ['Y', 'Z', 'RB'], 'Y', 2.4,
      'Cover 3: the crossing route runs away from the hook defenders and under the deep third. Hit it over the curl-flat defender.'),
    P('postwheel_c1', 'Post-Wheel', 'doubles', 'cover1', 'NONE', { X: 'post', H: 'wheel', Y: 'curl', Z: 'go', RB: 'check' }, ['H', 'X', 'Y', 'RB'], 'H', 2.3,
      'Man coverage: the post occupies the corner and the nickel has to run the wheel from inside out — the wheel wins up the sideline.'),
    P('deepover_pa_c3', 'PA Deep Over', 'pistolTE', 'cover3', 'NONE', { X: 'go', H: 'deepOver', Y: 'flat', Z: 'curl', RB: 'block' }, ['H', 'Z', 'Y'], 'H', 2.6,
      'Play-action freezes the linebackers; the deep over climbs behind them and under the deep third.', { pa: true }),
    P('texas_c2m', 'Texas (RB angle)', 'doubles', 'cover2man', 'NONE', { X: 'go', H: 'curl', Y: 'curl', Z: 'go', RB: 'texas' }, ['RB', 'H', 'Y'], 'RB', 1.8,
      'Cover 2 man: the linebacker on the back cannot match the angle route breaking back inside.'),
    P('rbscreen_ob', 'RB Screen vs blitz', 'doubles', 'cover1', 'ZERO', { X: 'go', H: 'slant', Y: 'slant', Z: 'go', RB: 'rbScreen' }, ['RB', 'H'], 'RB', 1.1,
      'Blitzers run right past the back. Let them come, then dump the screen behind them with blockers in front.', { screen: true, screenTo: 'RB', protection: 'MAN' }),
    P('bubble_c3', 'WR Bubble screen', 'tripsR', 'cover3', 'NONE', { X: 'go', Y: 'stalk', H: 'bubble', Z: 'stalk', RB: 'check' }, ['H', 'RB'], 'H', 0.6,
      'Three receivers vs two defenders to the trips side: throw the bubble and let the stalk blocks lead.', { screen: true, screenTo: 'H' }),
    P('paboot_c1', 'PA Boot (flood)', 'pistolTE', 'cover1', 'NONE', { X: 'cross', H: 'go', Y: 'bootFlat', Z: 'curl', RB: 'block' }, ['Y', 'X', 'Z'], 'Y', 1.9,
      'Boot to the right: the tight end leaks to the flat after the run fake and his man gets caught in the wash.', { pa: true, boot: 'R' }),
    P('pashot_c3', 'PA Shot (post)', 'iform', 'cover3', 'NONE', { X: 'post', Y: 'block', H: 'lead', Z: 'go', RB: 'block' }, ['X', 'Z'], 'X', 2.7,
      'Under-center play-action: the safety bites on the run and the post splits the middle of the field.', { pa: true, protection: 'MAX' }),
    P('mills_c4', 'Mills (post-dig)', 'doubles', 'cover4', 'NONE', { X: 'post', H: 'dig', Y: 'dig', Z: 'go', RB: 'check' }, ['X', 'H', 'RB'], 'X', 2.5,
      'Quarters: the safety jumps the dig and the post runs behind him. Read the safety.'),
    P('spacing_c3', 'Spacing', 'tripsR', 'cover3', 'NONE', { X: 'hitch', Y: 'spot', H: 'flat', Z: 'curl', RB: 'check' }, ['Y', 'H', 'X', 'RB'], 'H', 1.6,
      'Horizontal stretch of the underneath zones. The curl-flat defender sinks under the spot route, so the flat is the open throw — take the easy completion.'),
    P('fourverts_c3', 'Four Verticals', 'doubles', 'cover3', 'NONE', { X: 'go', H: 'seam', Y: 'seam', Z: 'go', RB: 'check' }, ['H', 'Y', 'RB'], 'H', 1.9,
      'Four verticals vs three deep: the seam puts the middle safety in conflict.'),
    P('flood_c3c', 'Flood vs cloud', 'tripsR', 'cover3cloud', 'NONE', { X: 'go', Y: 'sail', H: 'flat', Z: 'go', RB: 'check' }, ['Y', 'H', 'RB'], 'Y', 2.0,
      'Cloud corner squats on the flat — the sail is open over his head.'),
    P('stick_c3', 'Stick vs sky', 'tripsR', 'cover3', 'NONE', { X: 'go', Y: 'flat', H: 'stick', Z: 'go', RB: 'check' }, ['H', 'Y', 'RB'], 'Y', 1.5,
      'Stick: #2 stems to 5–6 and sits; #3 (or RB) runs the flat; #1 clears. Read the curl/flat defender — widen = stick, sit on stick = throw the flat.'),
    P('smash_c2r', 'Smash (rookie)', 'doubles', 'cover2', 'NONE', { X: 'hitch', H: 'corner', Y: 'corner', Z: 'hitch', RB: 'check' }, ['H', 'X', 'RB'], 'H', 1.9,
      'Cover 2: the corner route attacks the hole between the squat corner and the half safety.'),
    P('mesh_c1z', 'Mesh vs man', 'doubles', 'cover1', 'NONE', { X: 'shallow', H: 'shallowHi', Y: 'stick', Z: 'go', RB: 'flat' }, ['X', 'H', 'RB'], 'X', 1.3,
      'Man coverage: the crossers rub the defenders; the shallow comes open first.'),
    P('hot_mug', 'Hot slants vs A-gap mug', 'doubles', 'cover1', 'MUG', { X: 'slant', H: 'slant', Y: 'slant', Z: 'slant', RB: 'check' }, ['H', 'Y', 'X', 'RB'], 'H', 0.9,
      'Double A-gap mug: both inside linebackers leave the middle. Slide/6-man protection picks it up — or get the slant out right now behind the blitz.', { protection: 'SIX' }),
    P('hot_saf', 'Hot vs safety blitz', 'doubles', 'cover1', 'SAF', { X: 'slant', H: 'slant', Y: 'curl', Z: 'go', RB: 'flat' }, ['H', 'X', 'RB'], 'H', 0.9,
      'The safety walked down to the left edge and the Will must run with the slot. The slant to that side is open immediately.'),
    P('sluggo_c1', 'Sluggo (double move)', 'doubles', 'cover1', 'NONE', { X: 'sluggo', H: 'slant', Y: 'curl', Z: 'hitchGo', RB: 'check' }, ['X', 'Z', 'H', 'RB'], 'X', 2.6,
      'Man vs single-high: the corner bites on the slant and the go goes over the top. Needs time — protect it.'),
    P('fire_zone', 'Quick game vs fire zone', 'doubles', 'cover3', 'FIRE', { X: 'quickOut', H: 'stick', Y: 'stick', Z: 'quickOut', RB: 'check' }, ['X', 'Y', 'H', 'RB'], 'X', 1.3,
      'Fire zone: the nickel and Mike blitz, the end drops underneath the sticks. The quick out to the boundary (away from the dropping end) is open before the pressure arrives.'),
    P('nickel_hot', 'Slant vs nickel blitz', 'doubles', 'cover1', 'NICK', { X: 'go', H: 'slant', Y: 'curl', Z: 'slant', RB: 'flat' }, ['Z', 'Y', 'RB'], 'Z', 1.0,
      'The nickel blitzes off the right edge and the Will has to run with the slot — the backside slant is open behind the pressure.'),
    // ---------------- runs ----------------
    R('iz_light', 'Inside Zone vs light box', 'doubles', 'cover2dime', 'NONE', 'IZ', 'R', 'Dime personnel with a 5-man box: you have the numbers — hand it off.'),
    R('iz_bear', 'Inside Zone vs Bear', 'pistolTE', 'cover1bear', 'NONE', 'IZ', 'R', 'Bear front covers both guards and the centre. Inside zone has no doubles — check to a pass or to toss.'),
    R('oz_43', 'Outside Zone vs 4-3 Under', 'pistolTE', 'under43', 'NONE', 'OZ', 'R', 'Seven-man box vs seven blockers: stretch it and cut back off the flowing linebackers.'),
    R('power_c4', 'Power vs two-high', 'iform', 'cover4', 'NONE', 'POWER', 'R', 'Two-high quarters: only six in the box vs your seven with the FB. Gap power hits the B-gap with the puller on the linebacker.'),
    R('counter_xdog', 'Counter vs cross-dog', 'pistolTE', 'cover1', 'XDOG', 'COUNTER', 'L', 'Cross-dog linebackers flow with the first step; counter goes back away from them.'),
    R('draw_zero', 'Draw vs all-out', 'doubles', 'cover0', 'ZERO', 'DRAW', 'R', 'Everyone rushes up-field — nobody is home behind them. The draw is a great answer to Cover 0.'),
    R('dive_c3d', 'Dive vs 8-man box', 'iform', 'cover3down', 'NONE', 'DIVE', 'R', 'Safety down, 8-man box: too many bodies. Audible to a pass.'),
    R('toss_bear', 'Toss vs Bear', 'aceTwoTE', 'cover1bear', 'NONE', 'TOSS', 'R', 'Bear squeezes the interior; nobody is outside the tight end. Toss it to the edge.'),
    R('toss_c2', 'Toss vs Cover 2', 'doubles', 'cover2', 'NONE', 'TOSS', 'R', 'Cover 2 squat corners are the force players — the toss gets turned back inside.'),
    R('sneak_short', 'QB Sneak', 'iform', 'cover2', 'NONE', 'SNEAK', 'R', 'Short yardage: count the defenders over the centre and guards before you sneak.', { togo: 1 }),
    R('rpo_bubble', 'RPO: IZ / bubble', 'tripsR', 'cover3', 'NONE', 'IZ', 'L', 'Read the conflict defender (the nickel). If he stays in the box the bubble is open; if he widens, hand it off.',
      { rpo: { target: 'H', conflict: 'NB', window: 0.6 }, routes: { X: 'stalk', Y: 'stalk', H: 'bubble', Z: 'stalk', RB: 'block' }, progression: ['H'] }),
  ];
  NEW.forEach((p) => { if (!D.PLAYS.some((q) => q.id === p.id)) D.PLAYS.push(p); });
  if (typeof module !== 'undefined' && module.exports) module.exports = NEW;
})(typeof window !== 'undefined' ? window : globalThis);
