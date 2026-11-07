/**
 * data.js — All football content lives here: formations, routes, coverages, plays.
 * Coordinates are in YARDS. x: 0 (left sideline) .. 53.3 (right sideline).
 * y: yards relative to the line of scrimmage (positive = downfield, negative = backfield).
 *
 * To add a play: pick a formation, assign a route to each eligible, pick a coverage,
 * then set the progression, the correct read and a coaching note. No engine changes needed.
 */
(function (root) {
  const FIELD = { width: 53.3, ballX: 26.65 };

  /** Formations: start spots for eligibles (X,H,Y,Z,RB) and QB. `side` -1=left, 1=right. */
  const FORMATIONS = {
    doubles: {
      name: '2x2 Doubles (Gun)',
      qb: [26.65, -5],
      players: { X: [4, 0], H: [13, -1], Y: [40, -1], Z: [49, 0], RB: [29.5, -5] },
    },
    tripsR: {
      name: '3x1 Trips Right (Gun)',
      qb: [26.65, -5],
      players: { X: [4, 0], Y: [35, -1], H: [41, -1], Z: [49, 0], RB: [23.5, -5] },
    },
    // v4: personnel groupings with in-line TE / fullback (run game + max protect).
    pistolTE: {
      name: '11 Pistol (TE right)', personnel: '11',
      qb: [26.65, -4], players: { X: [4, 0], H: [41, -1], Y: [33.9, -1], Z: [49, 0], RB: [26.65, -7] },
    },
    iform: {
      name: '21 I-Form (under centre)', personnel: '21', drop: 6, dropT: 1.0,
      qb: [26.65, -1], players: { X: [4, 0], Y: [33.9, -1], H: [26.65, -4.5], Z: [49, 0], RB: [26.65, -7] },
    },
    aceTwoTE: {
      name: '12 Ace (2 TE, under centre)', personnel: '12', drop: 6, dropT: 1.0,
      qb: [26.65, -1], players: { X: [4, 0], H: [19.4, -1], Y: [33.9, -1], Z: [49, 0], RB: [26.65, -6.5] },
    },
  };
  Object.values(FORMATIONS).forEach((f) => { f.personnel = f.personnel || '11'; f.drop = f.drop || 2; f.dropT = f.dropT || 0.6; });

  /**
   * Routes: waypoints as [dx, dy] offsets from the player's start (cumulative, not deltas).
   * dx is multiplied by the receiver's "outward" direction (left side = -1), so
   * positive dx = toward the sideline, negative dx = toward the middle.
   * `delay` = seconds before releasing (check-release backs).
   */
  const ROUTES = {
    hitch:     { name: 'Hitch',      pts: [[0, 6], [-0.5, 5]] },
    go:        { name: 'Go',         pts: [[0, 30]] },
    seam:      { name: 'Seam',       pts: [[-1, 4], [-1.5, 30]] },
    corner:    { name: 'Corner',     pts: [[0, 10], [7, 18]] },
    sail:      { name: 'Sail (12 out)', pts: [[0, 11], [3, 13], [8, 14]] },
    slant:     { name: 'Slant',      pts: [[0, 1.5], [-7, 7], [-14, 11]] },
    shallow:   { name: 'Shallow',    pts: [[-2, 2], [-24, 4]] },
    shallowHi: { name: 'Shallow (high)', pts: [[-2, 3], [-24, 6]] },
    dig:       { name: 'Dig',        pts: [[0, 12], [-16, 12.5]] },
    sit:       { name: 'Sit / option', pts: [[0, 6], [0, 5.5]] },
    stick:     { name: 'Stick',      pts: [[0, 5.5], [1.2, 5.5], [1.2, 5.2]] }, // v11: stem 5–6, sit/settle
    curl:      { name: 'Curl',       pts: [[0, 11], [-1, 9]] },
    flat:      { name: 'Flat',       pts: [[3, 1.5], [12, 3], [14, 3]] },
    check:     { name: 'Check-down', pts: [[2, 1], [3, 4], [3, 4.5]], delay: 0.6 },
    // ---- v4 route library ----
    out:       { name: 'Out (10)',   pts: [[0, 10], [0.5, 9.6], [7, 9.6]] },
    quickOut:  { name: 'Quick out',  pts: [[0, 4.5], [0.5, 4.5], [6, 4.5]] },
    post:      { name: 'Post',       pts: [[0, 12], [-8, 26]] },
    wheel:     { name: 'Wheel',      pts: [[4, 1], [8, 3], [9, 8], [9, 30]] },
    deepOver:  { name: 'Deep over',  pts: [[0, 6], [-8, 14], [-26, 18]] },
    cross:     { name: 'Y-Cross (deep cross)', pts: [[0, 6], [-6, 12], [-30, 15]] },
    texas:     { name: 'Texas / Angle', pts: [[3.5, 2], [3, 4], [-3, 5.5], [-6, 6]] },
    rbScreen:  { name: 'RB screen',  pts: [[3, -1], [6, -1.5], [7, -1]], delay: 0.9, yac: 7 },
    bubble:    { name: 'Bubble / WR screen', pts: [[1.5, -1], [5, -0.8], [7, 0]], yac: 6 },
    hotSlant:  { name: 'Hot slant',  pts: [[0, 1], [-5, 4], [-12, 8]] },
    sluggo:    { name: 'Slant-go (double move)', pts: [[0, 1.5], [-2.5, 4], [-2.5, 30]] },
    hitchGo:   { name: 'Hitch-and-go (double move)', pts: [[0, 6], [0, 5.3], [0.5, 30]] },
    in10:      { name: 'In (10)',    pts: [[0, 10], [-12, 10]] },
    in5:       { name: 'In (5)',     pts: [[0, 5], [-10, 5]] },
    spot:      { name: 'Spot / snag', pts: [[0, 5], [-2, 6], [-2.5, 6]] },
    arrow:     { name: 'Arrow',      pts: [[5, 3], [14, 5]] },
    bootFlat:  { name: 'Boot flat (drag across)', pts: [[-2, 1], [-22, 4], [-26, 5]] },
    stalk:     { name: 'Stalk block', pts: [[0, 3], [0, 4]], block: true },
    lead:      { name: 'Lead block', pts: [[0, 3]], block: true },
    block:     { name: 'Stay in / block', pts: [[0, 0]], block: true },
  };

  // Shared 4-man front used by every coverage.
  const DL = [
    { id: 'DE1', label: 'E', pre: { x: 19.8, y: 1 }, job: { type: 'rush' } },
    { id: 'DT1', label: 'T', pre: { x: 25.2, y: 1 }, job: { type: 'rush' } },
    { id: 'DT2', label: 'T', pre: { x: 28.3, y: 1 }, job: { type: 'rush' } },
    { id: 'DE2', label: 'E', pre: { x: 33.5, y: 1 }, job: { type: 'rush' } },
  ];

  /**
   * Coverages. `shell` is the answer the user must pick pre-snap.
   * Each defender: `pre` = pre-snap alignment, either absolute {x,y} or relative to a
   * receiver ref {ref,dx,dy}. Receiver refs: L1/L2 (outside-in, left), R1/R2/R3 (outside-in,
   * right), B (back). `job` = post-snap assignment:
   *   zone {x,y,r,deep,drop}  -> drop to landmark, then match threats inside radius r
   *   man  {ref}              -> trail that receiver (with reaction lag)
   *   rush / blitz            -> go get the QB (blitz adds to rush count = faster pressure)
   */
  const COVERAGES = {
    cover2: {
      name: 'Cover 2 Zone', shell: 'C2', variant: 'C2_ZONE',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 4 }, job: { type: 'zone', x: 6, y: 5, r: 6 } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 4 }, job: { type: 'zone', x: 47, y: 5, r: 6 } },
        { id: 'S1', label: 'FS', pre: { x: 16, y: 13 }, job: { type: 'zone', x: 15, y: 19, r: 7, deep: true } },
        { id: 'S2', label: 'SS', pre: { x: 37.5, y: 13 }, job: { type: 'zone', x: 38.5, y: 19, r: 7, deep: true } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1, dy: 5 }, job: { type: 'zone', x: 38, y: 9, r: 6 } },
        { id: 'W', label: 'W', pre: { x: 21, y: 5 }, job: { type: 'zone', x: 16, y: 9, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 29, y: 5 }, job: { type: 'zone', x: 27, y: 10, r: 6 } },
      ]),
    },
    cover3: {
      name: 'Cover 3 Sky', shell: 'C3', variant: 'C3_SKY',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 7 }, job: { type: 'zone', x: 8, y: 20, r: 7, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 7 }, job: { type: 'zone', x: 45.5, y: 20, r: 7, deep: true } },
        { id: 'S1', label: 'SS', pre: { x: 17, y: 8 }, job: { type: 'zone', x: 12, y: 7, r: 6 } },
        { id: 'S2', label: 'FS', pre: { x: 29, y: 13 }, job: { type: 'zone', x: 29.5, y: 20, r: 8, deep: true } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1, dy: 5 }, job: { type: 'zone', x: 42, y: 7, r: 6 } },
        { id: 'W', label: 'W', pre: { x: 22, y: 5 }, job: { type: 'zone', x: 21, y: 8, r: 5 } },
        { id: 'M', label: 'M', pre: { x: 31, y: 5 }, job: { type: 'zone', x: 32, y: 8, r: 5 } },
      ]),
    },
    // Cover 3 vs trips, disguised as 2-high pre-snap and rotated at the snap.
    cover3rot: {
      name: 'Cover 3 Sky (rotated from 2-high)', shell: 'C3', variant: 'C3_SKY',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 7 }, job: { type: 'zone', x: 8, y: 20, r: 7, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 7 }, job: { type: 'zone', x: 46, y: 22, r: 7, deep: true } },
        { id: 'S1', label: 'FS', pre: { x: 17, y: 13 }, job: { type: 'zone', x: 27, y: 21, r: 8, deep: true } },
        { id: 'S2', label: 'SS', pre: { x: 38, y: 13 }, job: { type: 'zone', x: 44, y: 5, r: 6 } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1, dy: 5 }, job: { type: 'zone', x: 37, y: 9, r: 5 } },
        { id: 'W', label: 'W', pre: { x: 22, y: 5 }, job: { type: 'zone', x: 12, y: 7, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 30, y: 5 }, job: { type: 'zone', x: 28, y: 8, r: 5 } },
      ]),
    },
    cover4: {
      name: 'Cover 4 Quarters', shell: 'C4', variant: 'C4_QTR',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 8 }, job: { type: 'zone', x: 6, y: 18, r: 6, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 8 }, job: { type: 'zone', x: 47, y: 18, r: 6, deep: true } },
        { id: 'S1', label: 'FS', pre: { x: 18, y: 11 }, job: { type: 'zone', x: 16, y: 16, r: 7, deep: true } },
        { id: 'S2', label: 'SS', pre: { x: 35.5, y: 11 }, job: { type: 'zone', x: 37, y: 16, r: 7, deep: true } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1, dy: 5 }, job: { type: 'zone', x: 46, y: 5, r: 6, prefer: 'out' } },
        { id: 'W', label: 'W', pre: { x: 20, y: 5 }, job: { type: 'zone', x: 10, y: 6, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 29, y: 5 }, job: { type: 'zone', x: 27, y: 6, r: 5 } },
      ]),
    },
    cover1: {
      name: 'Cover 1 Man Free', shell: 'C1', variant: 'C1_FREE',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 0.8, dy: 2 }, job: { type: 'man', ref: 'L1' } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -0.8, dy: 2 }, job: { type: 'man', ref: 'R1' } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -0.8, dy: 3 }, job: { type: 'man', ref: 'R2' } },
        { id: 'S1', label: 'SS', pre: { ref: 'L2', dx: 0.8, dy: 5 }, job: { type: 'man', ref: 'L2' } },
        { id: 'S2', label: 'FS', pre: { x: 26.65, y: 15 }, job: { type: 'zone', x: 26.65, y: 18, r: 9, deep: true } },
        { id: 'M', label: 'M', pre: { x: 29, y: 5 }, job: { type: 'man', ref: 'B' } },
        { id: 'W', label: 'W', pre: { x: 23, y: 6 }, job: { type: 'zone', x: 26.65, y: 10, r: 4, drop: 0.3 } },
      ]),
    },
    cover0: {
      name: 'Cover 0 (all-out man blitz)', shell: 'C0', variant: 'C0_ZERO',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 0.6, dy: 1 }, job: { type: 'man', ref: 'L1' } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -0.6, dy: 1 }, job: { type: 'man', ref: 'R1' } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -0.6, dy: 2 }, job: { type: 'man', ref: 'R2' } },
        { id: 'S1', label: 'SS', pre: { ref: 'L2', dx: 0.6, dy: 4 }, job: { type: 'man', ref: 'L2' } },
        { id: 'S2', label: 'FS', pre: { x: 29, y: 7 }, job: { type: 'man', ref: 'B' } },
        { id: 'W', label: 'W', pre: { x: 25.9, y: 1.8 }, job: { type: 'blitz' } },
        { id: 'M', label: 'M', pre: { x: 27.4, y: 1.8 }, job: { type: 'blitz' } },
      ]),
    },

    // ---------- v3 variants ----------
    cover1robber: {
      name: 'Cover 1 Robber', shell: 'C1', variant: 'C1_ROB',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 0.8, dy: 2 }, job: { type: 'man', ref: 'L1' } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -0.8, dy: 2 }, job: { type: 'man', ref: 'R1' } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -0.8, dy: 3 }, job: { type: 'man', ref: 'R2' } },
        { id: 'W', label: 'W', pre: { ref: 'L2', dx: 0.8, dy: 4 }, job: { type: 'man', ref: 'L2' } },
        { id: 'M', label: 'M', pre: { x: 28, y: 5 }, job: { type: 'man', ref: 'B' } },
        { id: 'S1', label: 'SS', pre: { x: 26, y: 9 }, job: { type: 'zone', x: 26.65, y: 11, r: 6, drop: 0.3 } },
        { id: 'S2', label: 'FS', pre: { x: 27.5, y: 16 }, job: { type: 'zone', x: 26.65, y: 20, r: 9, deep: true } },
      ]),
    },
    cover2man: {
      name: 'Cover 2 Man (2-Man)', shell: 'C2', variant: 'C2_MAN',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: -0.9, dy: 1.2 }, job: { type: 'man', ref: 'L1' } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: 0.9, dy: 1.2 }, job: { type: 'man', ref: 'R1' } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: 0.9, dy: 1.5 }, job: { type: 'man', ref: 'R2' } },
        { id: 'W', label: 'W', pre: { ref: 'L2', dx: 0.9, dy: 2.5 }, job: { type: 'man', ref: 'L2' } },
        { id: 'M', label: 'M', pre: { x: 28.5, y: 5 }, job: { type: 'man', ref: 'B' } },
        { id: 'S1', label: 'FS', pre: { x: 15, y: 14 }, job: { type: 'zone', x: 14, y: 20, r: 8, deep: true } },
        { id: 'S2', label: 'SS', pre: { x: 38.5, y: 14 }, job: { type: 'zone', x: 39.5, y: 20, r: 8, deep: true } },
      ]),
    },
    tampa2: {
      name: 'Tampa 2', shell: 'C2', variant: 'C2_TAMPA',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 4 }, job: { type: 'zone', x: 6, y: 5, r: 6 } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 4 }, job: { type: 'zone', x: 47, y: 5, r: 6 } },
        { id: 'S1', label: 'FS', pre: { x: 14, y: 14 }, job: { type: 'zone', x: 13, y: 20, r: 7, deep: true } },
        { id: 'S2', label: 'SS', pre: { x: 39.5, y: 14 }, job: { type: 'zone', x: 40.5, y: 20, r: 7, deep: true } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1.5, dy: 5 }, job: { type: 'zone', x: 36, y: 9, r: 6 } },
        { id: 'W', label: 'W', pre: { x: 20, y: 5 }, job: { type: 'zone', x: 17, y: 9, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 26.65, y: 7 }, job: { type: 'zone', x: 26.65, y: 16, r: 7, deep: true, drop: 0.2 } },
      ]),
    },
    cover3cloud: {
      name: 'Cover 3 Cloud (to the right)', shell: 'C3', variant: 'C3_CLOUD',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 7 }, job: { type: 'zone', x: 8, y: 20, r: 7, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 3 }, job: { type: 'zone', x: 47, y: 4, r: 6, prefer: 'out' } },
        { id: 'S2', label: 'SS', pre: { x: 41, y: 12 }, job: { type: 'zone', x: 45.5, y: 20, r: 7, deep: true } },
        { id: 'S1', label: 'FS', pre: { x: 22, y: 13 }, job: { type: 'zone', x: 27, y: 20, r: 8, deep: true } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1, dy: 5 }, job: { type: 'zone', x: 40, y: 8, r: 6 } },
        { id: 'W', label: 'W', pre: { x: 21, y: 5 }, job: { type: 'zone', x: 13, y: 7, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 30, y: 5 }, job: { type: 'zone', x: 28, y: 8, r: 5 } },
      ]),
    },
    cover3buzz: {
      name: 'Cover 3 Buzz', shell: 'C3', variant: 'C3_BUZZ',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 7 }, job: { type: 'zone', x: 8, y: 20, r: 7, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 7 }, job: { type: 'zone', x: 45.5, y: 20, r: 7, deep: true } },
        { id: 'S1', label: 'FS', pre: { x: 27, y: 13 }, job: { type: 'zone', x: 27, y: 20, r: 8, deep: true } },
        { id: 'S2', label: 'SS', pre: { x: 34, y: 8 }, job: { type: 'zone', x: 39, y: 7, r: 5 } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: 0, dy: 4 }, job: { type: 'zone', x: 45, y: 5, r: 6, prefer: 'out' } },
        { id: 'W', label: 'W', pre: { x: 17, y: 5 }, job: { type: 'zone', x: 10, y: 6, r: 6, prefer: 'out' } },
        { id: 'M', label: 'M', pre: { x: 25, y: 5 }, job: { type: 'zone', x: 22, y: 9, r: 5 } },
      ]),
    },
    palms: {
      name: 'Cover 4 Palms (2-Read)', shell: 'C4', variant: 'C4_PALMS',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: -0.5, dy: 6 }, job: { type: 'read', ref: 'L2', cond: 'out', at: 0.6, yes: { type: 'man', ref: 'L2' }, no: { type: 'zone', x: 6, y: 18, r: 6, deep: true } } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: 0.5, dy: 6 }, job: { type: 'read', ref: 'R2', cond: 'out', at: 0.6, yes: { type: 'man', ref: 'R2' }, no: { type: 'zone', x: 47, y: 18, r: 6, deep: true } } },
        { id: 'S1', label: 'FS', pre: { ref: 'L2', dx: 0, dy: 9 }, job: { type: 'read', ref: 'L2', cond: 'out', at: 0.6, yes: { type: 'man', ref: 'L1' }, no: { type: 'zone', x: 16, y: 16, r: 7, deep: true } } },
        { id: 'S2', label: 'SS', pre: { ref: 'R2', dx: 0, dy: 9 }, job: { type: 'read', ref: 'R2', cond: 'out', at: 0.6, yes: { type: 'man', ref: 'R1' }, no: { type: 'zone', x: 37, y: 16, r: 7, deep: true } } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: 0.5, dy: 5 }, job: { type: 'zone', x: 46, y: 5, r: 5, prefer: 'out' } },
        { id: 'W', label: 'W', pre: { x: 20, y: 5 }, job: { type: 'zone', x: 17, y: 8, r: 5 } },
        { id: 'M', label: 'M', pre: { x: 29, y: 5 }, job: { type: 'zone', x: 27, y: 7, r: 5 } },
      ]),
    },
    cover6: {
      name: 'Cover 6 (Quarters left, Cloud right)', shell: 'C4', variant: 'C4_C6',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 8 }, job: { type: 'zone', x: 6, y: 18, r: 6, deep: true } },
        { id: 'S1', label: 'FS', pre: { x: 18, y: 11 }, job: { type: 'zone', x: 16, y: 16, r: 7, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 2.5 }, job: { type: 'zone', x: 47, y: 4, r: 6, prefer: 'out' } },
        { id: 'S2', label: 'SS', pre: { x: 40, y: 13 }, job: { type: 'zone', x: 41, y: 19, r: 8, deep: true } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1, dy: 5 }, job: { type: 'zone', x: 38, y: 8, r: 5 } },
        { id: 'W', label: 'W', pre: { x: 20, y: 5 }, job: { type: 'zone', x: 12, y: 6, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 28, y: 5 }, job: { type: 'zone', x: 27, y: 8, r: 5 } },
      ]),
    },

    // ---------- v4: run-defense fronts (box counts) ----------
    cover1bear: {
      name: 'Cover 1 · Bear front (8-man box)', shell: 'C1', variant: 'C1_FREE', front: 'Bear (5 on the line, 8-man box)',
      defenders: [
        { id: 'DE1', label: 'E', pre: { x: 20.6, y: 1 }, job: { type: 'rush' } },
        { id: 'DT1', label: 'T', pre: { x: 24.2, y: 1 }, job: { type: 'rush' } },
        { id: 'NT', label: 'T', pre: { x: 26.65, y: 1 }, job: { type: 'rush' } },
        { id: 'DT2', label: 'T', pre: { x: 29.1, y: 1 }, job: { type: 'rush' } },
        { id: 'DE2', label: 'E', pre: { x: 34.6, y: 1 }, job: { type: 'rush' } },
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 0.8, dy: 2 }, job: { type: 'man', ref: 'L1' } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -0.8, dy: 2 }, job: { type: 'man', ref: 'R1' } },
        { id: 'S1', label: 'SS', pre: { x: 32, y: 5.5 }, job: { type: 'man', ref: 'R2' } },
        { id: 'W', label: 'W', pre: { x: 23, y: 4.5 }, job: { type: 'zone', x: 24, y: 9, r: 5 } },
        { id: 'M', label: 'M', pre: { x: 29.5, y: 4.5 }, job: { type: 'man', ref: 'B' } },
        { id: 'S2', label: 'FS', pre: { x: 26.65, y: 15 }, job: { type: 'zone', x: 26.65, y: 18, r: 9, deep: true } },
      ],
    },
    cover3down: {
      name: 'Cover 3 Sky · SS in the box (4-3 Over, 8-man box)', shell: 'C3', variant: 'C3_SKY', front: '4-3 Over + safety down (8-man box)',
      defenders: [
        { id: 'DE1', label: 'E', pre: { x: 19.8, y: 1 }, job: { type: 'rush' } },
        { id: 'DT1', label: 'T', pre: { x: 26.0, y: 1 }, job: { type: 'rush' } },
        { id: 'DT2', label: 'T', pre: { x: 30.0, y: 1 }, job: { type: 'rush' } },
        { id: 'DE2', label: 'E', pre: { x: 35.4, y: 1 }, job: { type: 'rush' } },
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 7 }, job: { type: 'zone', x: 8, y: 20, r: 7, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 7 }, job: { type: 'zone', x: 45.5, y: 20, r: 7, deep: true } },
        { id: 'S2', label: 'FS', pre: { x: 27, y: 13 }, job: { type: 'zone', x: 27, y: 20, r: 8, deep: true } },
        { id: 'S1', label: 'SS', pre: { x: 36, y: 6 }, job: { type: 'zone', x: 41, y: 7, r: 6 } },
        { id: 'SAM', label: 'S', pre: { x: 33.5, y: 4.5 }, job: { type: 'zone', x: 33, y: 8, r: 5 } },
        { id: 'M', label: 'M', pre: { x: 27.5, y: 4.5 }, job: { type: 'zone', x: 26, y: 9, r: 5 } },
        { id: 'W', label: 'W', pre: { x: 22, y: 4.5 }, job: { type: 'zone', x: 13, y: 7, r: 6 } },
      ],
    },
    under43: {
      name: 'Cover 3 Sky · 4-3 Under (7-man box)', shell: 'C3', variant: 'C3_SKY', front: '4-3 Under (7-man box)',
      defenders: [
        { id: 'DE1', label: 'E', pre: { x: 20.2, y: 1 }, job: { type: 'rush' } },
        { id: 'DT1', label: 'T', pre: { x: 23.0, y: 1 }, job: { type: 'rush' } },
        { id: 'DT2', label: 'T', pre: { x: 28.0, y: 1 }, job: { type: 'rush' } },
        { id: 'DE2', label: 'E', pre: { x: 32.6, y: 1 }, job: { type: 'rush' } },
        { id: 'SAM', label: 'S', pre: { x: 35.0, y: 2 }, job: { type: 'zone', x: 41, y: 6, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 27.5, y: 4.5 }, job: { type: 'zone', x: 28, y: 9, r: 5 } },
        { id: 'W', label: 'W', pre: { x: 22, y: 4.5 }, job: { type: 'zone', x: 19, y: 8, r: 5 } },
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 7 }, job: { type: 'zone', x: 8, y: 20, r: 7, deep: true } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 7 }, job: { type: 'zone', x: 45.5, y: 20, r: 7, deep: true } },
        { id: 'S1', label: 'SS', pre: { x: 15, y: 9 }, job: { type: 'zone', x: 11, y: 7, r: 6 } },
        { id: 'S2', label: 'FS', pre: { x: 27, y: 13 }, job: { type: 'zone', x: 27, y: 20, r: 8, deep: true } },
      ],
    },
    cover2dime: {
      name: 'Cover 2 Zone · Dime (5-man box)', shell: 'C2', variant: 'C2_ZONE', front: 'Dime (one linebacker, 5-man box)',
      defenders: DL.concat([
        { id: 'CB1', label: 'C', pre: { ref: 'L1', dx: 1, dy: 4 }, job: { type: 'zone', x: 6, y: 5, r: 6 } },
        { id: 'CB2', label: 'C', pre: { ref: 'R1', dx: -1, dy: 4 }, job: { type: 'zone', x: 47, y: 5, r: 6 } },
        { id: 'S1', label: 'FS', pre: { x: 16, y: 14 }, job: { type: 'zone', x: 15, y: 19, r: 7, deep: true } },
        { id: 'S2', label: 'SS', pre: { x: 37.5, y: 14 }, job: { type: 'zone', x: 38.5, y: 19, r: 7, deep: true } },
        { id: 'NB', label: 'N', pre: { ref: 'R2', dx: -1, dy: 5 }, job: { type: 'zone', x: 38, y: 9, r: 6 } },
        { id: 'DB', label: 'D', pre: { ref: 'L2', dx: 1, dy: 5 }, job: { type: 'zone', x: 16, y: 9, r: 6 } },
        { id: 'M', label: 'M', pre: { x: 27, y: 6 }, job: { type: 'zone', x: 27, y: 10, r: 6 } },
      ]),
    },
  };


  /**
   * Coverage variants (detailed calls). `tell` = what identifies it pre-snap / at the snap;
   * `post` = what it does after the snap. Used by the picker, the grade and the coaching note.
   */
  const VARIANTS = [
    { id: 'C0_ZERO', family: 'C0', label: 'Zero', name: 'Cover 0 all-out', tell: 'no deep safety at all, everyone pressed or walked up, both linebackers in the A-gaps', post: 'pure man with six-plus rushers — ball out hot' },
    { id: 'C1_FREE', family: 'C1', label: 'Free', name: 'Cover 1 Man Free', tell: 'one deep safety in the middle, press-man across, the second safety in man on #2 and a linebacker as the low hole player', post: 'man everywhere with a middle-field free safety and a short hole player' },
    { id: 'C1_ROB', family: 'C1', label: 'Robber', name: 'Cover 1 Robber', tell: 'one high safety at 15-16 yds PLUS a second safety parked in the middle at 8-10 yds', post: 'the robber reads the QB and jumps digs/crossers at 10-12 yds; outside is man with only the free safety deep' },
    { id: 'C2_ZONE', family: 'C2', label: 'Zone', name: 'Cover 2 Zone', tell: 'two high safeties at 12-13 yds, corners squatted at 4-5 yds with outside leverage', post: 'corners sink in the flats, safeties split the deep halves, three hook defenders underneath' },
    { id: 'C2_MAN', family: 'C2', label: '2-Man', name: 'Cover 2 Man', tell: 'two high safeties but the corners are pressed with INSIDE leverage (trail technique), nickel and LB walked up on #2', post: 'man underneath trailing every route, two deep halves over the top — crossers and option routes beat it' },
    { id: 'C2_TAMPA', family: 'C2', label: 'Tampa', name: 'Tampa 2', tell: 'two-high and squat corners like Cover 2, but the Mike is deeper (6-7 yds) right over the ball and safeties a touch wider', post: 'the Mike runs the deep middle seam, so the middle hole between safeties closes; the hook/curl window outside the Mike opens' },
    { id: 'C3_SKY', family: 'C3', label: 'Sky', name: 'Cover 3 Sky', tell: 'one deep safety, corners off at 7 yds, the strong SAFETY rotated down over #2 (or rotating down at the snap)', post: 'safety takes the curl/flat, corners and free safety take deep thirds' },
    { id: 'C3_CLOUD', family: 'C3', label: 'Cloud', name: 'Cover 3 Cloud', tell: 'one corner squatted at 2-3 yds while the safety on that side is high and wide over him; the other corner is off at 7', post: 'the cloud CORNER takes the flat and the safety bails to the deep third over him' },
    { id: 'C3_BUZZ', family: 'C3', label: 'Buzz', name: 'Cover 3 Buzz', tell: 'one high safety, the down safety aligned INSIDE (over the tackle/box at ~8 yds) and a linebacker or nickel widened out', post: 'the safety buzzes to the hook/curl, the linebacker/nickel run to the flat' },
    { id: 'C4_QTR', family: 'C4', label: 'Quarters', name: 'Cover 4 Quarters', tell: 'two high safeties at 10-11 yds, corners off at 8 yds with outside leverage, bailing at the snap', post: 'four deep quarters; safeties read #2 — vertical #2 gets matched, short #2 is passed to the flat player' },
    { id: 'C4_PALMS', family: 'C4', label: 'Palms', name: 'Cover 4 Palms (2-Read)', tell: 'two high safeties lower (8-9 yds) stacked over #2, corners at 6-7 yds with inside eyes', post: '2-read: if #2 goes out, the corner jumps him and the safety takes #1 deep; if #2 goes vertical it plays like quarters' },
    { id: 'C4_C6', family: 'C4', label: 'Cov 6', name: 'Cover 6', tell: 'split-field look: one side off-corner + low safety (quarters), the other side squatted corner with the safety wide and deep (cloud/half)', post: 'quarters to one side, Cover 2 (cloud) to the other — read each side separately' },
  ];

  /** Answer options for the pre-snap ID. */
  const COVERAGE_OPTIONS = [
    { id: 'C0', label: 'Cover 0 / Man blitz' },
    { id: 'C1', label: 'Cover 1 (Man)' },
    { id: 'C2', label: 'Cover 2' },
    { id: 'C3', label: 'Cover 3' },
    { id: 'C4', label: 'Cover 4' },
  ];
  /**
   * v4 pressure packages, applied ON TOP of a coverage. `set` overrides a defender's pre-snap
   * alignment and/or post-snap job. Rush jobs take a `gap` (LD LC LB LA | RA RB RC RD) and may
   * carry a `stunt` ('pen' = penetrator, 'loop' = looper) and a `delay`. Defenders who leave
   * their coverage leave a hole: that is where the hot throw goes.
   */
  const BLITZES = {
    NONE: { family: '4M', label: '4-man', name: 'Base 4-man rush', set: {},
      tell: 'four down linemen in normal splits, linebackers at 4-5 yards, nobody walked up or creeping',
      post: 'four rush and seven cover; the protection has a spare blocker' },
    TEX: { family: 'STUNT', label: 'TEX', name: 'TEX stunt (tackle-end twist)',
      set: { DT2: { pre: { x: 29.6, y: 1 }, job: { type: 'rush', gap: 'RC', stunt: 'pen' } }, DE2: { pre: { x: 32.6, y: 1 }, job: { type: 'rush', gap: 'RA', stunt: 'loop', delay: 0.35 } } },
      tell: 'the end and the 3-technique on the right are pinched tight together, the end narrower than normal with his weight forward',
      post: 'the tackle crashes out into the C-gap and the end loops inside behind him; man (BOB) blocking gets picked, zone/slide blocking passes it off' },
    TT: { family: 'STUNT', label: 'T-T', name: 'Tackle-tackle twist (inside game)',
      set: { DT1: { job: { type: 'rush', gap: 'RA', stunt: 'pen' } }, DT2: { job: { type: 'rush', gap: 'LA', stunt: 'loop', delay: 0.3 } } },
      tell: 'both tackles in a 1-technique / shade, slightly deeper (heels back) than the ends; linebackers bluffing to hold the guards',
      post: 'one tackle penetrates across the centre, the other loops behind him into the opposite A-gap' },
    MUG: { family: 'LB', label: 'A-Mug', name: 'Double A-gap mug',
      set: { W: { pre: { x: 25.4, y: 1.5 }, job: { type: 'rush', gap: 'LA' } }, M: { pre: { x: 27.9, y: 1.5 }, job: { type: 'rush', gap: 'RA' } } },
      tell: 'both inside linebackers walked up into the A-gaps, right over the centre at 1-2 yards',
      post: 'six rushers: both linebackers hit the A-gaps. 6-man protection picks it up; 5-man leaves one free and the hole/RB behind them is the hot throw' },
    XDOG: { family: 'LB', label: 'X-Dog', name: 'LB cross-dog',
      set: { M: { pre: { x: 28.8, y: 3.6 }, job: { type: 'rush', gap: 'LA', stunt: 'pen' } }, W: { pre: { x: 24.4, y: 3.6 }, job: { type: 'rush', gap: 'RA', stunt: 'loop', delay: 0.25 } } },
      tell: 'linebackers creeping to 3-4 yards, cheated inside, toes pointed at the line',
      post: 'the Mike goes first across the centre and the Will loops behind him to the other A-gap; man pickups get crossed up, slide blocking handles it' },
    OVER: { family: 'LB', label: 'Overload', name: 'Overload blitz (left)',
      set: { W: { pre: { x: 22.6, y: 2.2 }, job: { type: 'rush', gap: 'LB' } }, S1: { pre: { x: 17.6, y: 3 }, job: { type: 'rush', gap: 'LD' } } },
      tell: 'four rushers to one side: the Will walked up in the B-gap and a safety creeping off the edge, same side as the end',
      post: 'four come from the left; slide or half-slide (plus the back) to the overload, a protection to the other side leaves the edge free' },
    CB: { family: 'DB', label: 'Corner', name: 'Corner blitz (right)',
      set: { CB2: { pre: { ref: 'R1', dx: -1.4, dy: 1.6 }, job: { type: 'rush', gap: 'RD' } }, S2: { job: { type: 'zone', x: 45.5, y: 20, r: 7, deep: true } }, S1: { pre: { x: 22, y: 11 }, job: { type: 'zone', x: 27, y: 20, r: 8, deep: true } }, W: { job: { type: 'zone', x: 12, y: 7, r: 6 } } },
      tell: 'the corner creeps inside his receiver at 1-2 yards with his eyes on the QB, while a safety cheats toward his deep third',
      post: 'the corner comes off the edge, the safety rotates over the top; the receiver he left is the hot throw (quick out / hitch)' },
    SAF: { family: 'DB', label: 'Safety', name: 'Safety blitz (left)',
      set: { S1: { pre: { x: 20.4, y: 4.8 }, job: { type: 'rush', gap: 'LC' } }, W: { job: { type: 'man', ref: 'L2' } } },
      tell: 'a safety walks down from depth into the box late, timing his creep with the cadence',
      post: 'the safety comes off the left edge and a linebacker has to run with the slot — slide the protection to him or get the ball out' },
    NICK: { family: 'DB', label: 'Nickel', name: 'Nickel (slot) blitz',
      set: { NB: { pre: { ref: 'R2', dx: -1.6, dy: 2 }, job: { type: 'rush', gap: 'RD' } }, W: { job: { type: 'man', ref: 'R2' } } },
      tell: 'the nickel walks down inside the slot at 2 yards and creeps toward the line at the snap count',
      post: 'the slot defender blitzes off the edge; a linebacker has to run with the slot from the box — slants / option routes from the slot are open' },
    FIRE: { family: 'FIRE', label: 'Fire zone', name: 'Fire zone (zone blitz)',
      set: { NB: { pre: { ref: 'R2', dx: -1, dy: 3 }, job: { type: 'rush', gap: 'RD' } }, M: { pre: { x: 28.2, y: 2.6 }, job: { type: 'rush', gap: 'RA' } }, DE2: { pre: { x: 34, y: 1.5 }, job: { type: 'zone', x: 42, y: 6, r: 6, drop: 0.3 } }, W: { job: { type: 'zone', x: 25, y: 8, r: 6 } } },
      tell: 'nickel and Mike walked down showing pressure while three deep defenders stay home; the end on the blitz side is standing up',
      post: 'five rush and the end DROPS into the curl-flat: a hot throw to the flat runs into him; the hook the Mike left is open' },
    ZERO: { family: 'ZERO', label: 'All-out', name: 'All-out Cover 0 blitz',
      set: { W: { job: { type: 'blitz', gap: 'LA' } }, M: { job: { type: 'blitz', gap: 'RA' } } },
      tell: 'no deep safety, every defender pressed or walked up, linebackers in the A-gaps',
      post: 'more rushers than you can block if the back stays in (his man green-dogs). Hot / sight-adjust: ball out now' },
  };
  const PRESSURE_FAMILIES = [
    { id: '4M', label: '4-man', name: 'No blitz (4-man rush)' },
    { id: 'STUNT', label: 'Stunt', name: 'Stunt / twist' },
    { id: 'LB', label: 'LB blitz', name: 'Linebacker blitz' },
    { id: 'DB', label: 'DB blitz', name: 'Secondary blitz' },
    { id: 'FIRE', label: 'Zone blz', name: 'Zone blitz' },
    { id: 'ZERO', label: 'All-out', name: 'All-out (Cover 0)' },
  ];
  // Back-compat ids from v1-v3 data.
  const PRESSURE_ALIAS = { none: 'NONE', middle: 'ZERO', left: 'OVER', right: 'CB' };
  const PRESSURE_OPTIONS = PRESSURE_FAMILIES;

  /**
   * Plays. `progression` = read order (last is the check-down). `correct` = best read
   * vs this coverage. `idealTime` = on-time throw (seconds after snap).
   */
  const PLAYS = [
    {
      id: 'smash_c2', name: 'Smash', formation: 'doubles', coverage: 'cover2', pressure: 'none',
      routes: { X: 'hitch', H: 'corner', Y: 'corner', Z: 'hitch', RB: 'check' },
      progression: ['H', 'X', 'Y', 'RB'], correct: 'H', idealTime: 2.3,
      coaching: 'Two-high, squatted corners = Cover 2. The flat corner sits on the hitch and the half-field safety is too deep and too far inside to drive on the corner route. Throw the corner on the hole between the squat corner and the safety, before the safety gets width.',
    },
    {
      id: 'smash_c4', name: 'Smash', formation: 'doubles', coverage: 'cover4', pressure: 'none',
      routes: { X: 'hitch', H: 'corner', Y: 'corner', Z: 'hitch', RB: 'check' },
      progression: ['H', 'X', 'Y', 'RB'], correct: 'X',
      idealTime: 1.6,
      coaching: 'Two-high but the corners are off and bailing = Quarters. The corner and the quarter safety both stay over the top of the corner route, so the hitch is wide open underneath. Read the corner route, see it capped, and hit the hitch on time.',
    },
    {
      id: 'verts_c3', name: 'Four Verticals', formation: 'doubles', coverage: 'cover3', pressure: 'none',
      routes: { X: 'go', H: 'seam', Y: 'seam', Z: 'go', RB: 'check' },
      progression: ['H', 'Y', 'X', 'RB'], correct: 'H', idealTime: 2.0,
      coaching: 'One-high safety with a rolled-down strong safety = Cover 3. The middle-of-field safety can only take one seam, and he cheated right. Throw the left seam (H) over the hook defender and in front of the safety before he can get there.',
    },
    {
      id: 'stick_c4', name: 'Stick', formation: 'doubles', coverage: 'cover4', pressure: 'none',
      routes: { X: 'go', H: 'curl', Y: 'stick', Z: 'go', RB: 'flat' },
      progression: ['Y', 'RB', 'H', 'X'], correct: 'Y', idealTime: 1.5,
      coaching: 'Quarters: the safety reads the #2 receiver and the nickel has to widen to the flat. The stick at 6 yards settles in the window between the nickel and the hook linebacker. Quick game is the answer against quarters.',
    },
    {
      id: 'mesh_c1', name: 'Mesh', formation: 'doubles', coverage: 'cover1', pressure: 'none',
      routes: { X: 'go', H: 'shallow', Y: 'shallowHi', Z: 'go', RB: 'flat' },
      progression: ['H', 'Y', 'RB', 'X'], correct: 'H', idealTime: 1.9,
      coaching: 'One-high safety with press-man across = Cover 1. Man defenders have to fight through the mesh traffic and trail the crossers. Hit the low crosser (H) as he clears the hole player and runs away from his man.',
    },
    {
      id: 'slant_c0', name: 'Hot Slants', formation: 'doubles', coverage: 'cover0', pressure: 'middle',
      routes: { X: 'slant', H: 'slant', Y: 'slant', Z: 'slant', RB: 'check' },
      progression: ['X', 'Z', 'H', 'RB'], correct: 'X', idealTime: 1.1,
      coaching: 'Zero safeties deep and both linebackers walked into the A-gaps = Cover 0 pressure. You have more rushers than blockers, so the ball must come out hot. The outside slant (X) breaks inside of press-man leverage with no help in the middle.',
    },
    {
      id: 'flood_c3', name: 'Flood (Sail)', formation: 'tripsR', coverage: 'cover3rot', pressure: 'none',
      routes: { X: 'dig', Y: 'flat', H: 'sail', Z: 'go', RB: 'check' },
      progression: ['H', 'Y', 'X', 'RB'], correct: 'H', idealTime: 2.4,
      coaching: 'Disguised 2-high that rotates to Cover 3 at the snap: the strong safety drops down to the flat and the free safety spins to the middle. The go route carries the corner deep and the flat holds the rotated safety, so the sail is open in the void between them.',
    },

    // ---------- v3: one play per new variant ----------
    {
      id: 'dagger_c1r', name: 'Dagger', formation: 'doubles', coverage: 'cover1robber', pressure: 'none',
      routes: { X: 'hitch', H: 'shallow', Y: 'seam', Z: 'dig', RB: 'check' },
      progression: ['Y', 'Z', 'X', 'RB'], correct: 'Y', idealTime: 1.9,
      coaching: 'Single-high with a second safety sitting in the middle at 9 yards = Cover 1 Robber. The robber is reading your eyes to jump the dig. Hold him with your eyes and throw the seam behind him and in front of the free safety.',
    },
    {
      id: 'mesh_c2m', name: 'Mesh', formation: 'doubles', coverage: 'cover2man', pressure: 'none',
      routes: { X: 'go', H: 'shallow', Y: 'shallowHi', Z: 'go', RB: 'flat' },
      progression: ['H', 'Y', 'RB', 'X'], correct: 'H', idealTime: 1.8,
      coaching: 'Two-high with corners pressed in trail (inside) technique = 2-Man. Everyone underneath is in man with help over the top, so nothing deep is open. Crossers run away from trailing man defenders: hit the low crosser as he clears the mesh.',
    },
    {
      id: 'dig_t2', name: 'Seam-Dig', formation: 'doubles', coverage: 'tampa2', pressure: 'none',
      routes: { X: 'curl', H: 'dig', Y: 'seam', Z: 'hitch', RB: 'check' },
      progression: ['Y', 'H', 'X', 'RB'], correct: 'H', idealTime: 2.0,
      coaching: 'Two-high, squat corners and the Mike lined up deep over the ball = Tampa 2. The Mike runs the seam down the middle, so the middle seam is taken. That vacates the hook area: the dig settles behind the Will and in front of the safety.',
    },
    {
      id: 'smash_c3c', name: 'Smash', formation: 'doubles', coverage: 'cover3cloud', pressure: 'none',
      routes: { X: 'hitch', H: 'corner', Y: 'corner', Z: 'hitch', RB: 'check' },
      progression: ['Z', 'X', 'H', 'RB'], correct: 'X', idealTime: 1.5,
      coaching: 'One deep safety but the right corner is squatted at 3 yards with the safety high over him = Cover 3 Cloud to the right. The cloud corner sits on the right hitch, so work away from the cloud: the left corner is a deep-third player bailing at the snap, and the left hitch is open.',
    },
    {
      id: 'stick_c3b', name: 'Stick', formation: 'doubles', coverage: 'cover3buzz', pressure: 'none',
      routes: { X: 'go', H: 'hitch', Y: 'stick', Z: 'go', RB: 'flat' },
      progression: ['Y', 'RB', 'H', 'X'], correct: 'H', idealTime: 1.4,
      coaching: 'One-high with the down safety aligned inside over the box = Cover 3 Buzz. He buzzes to the right hook and sits on the stick, and the nickel widens for the flat. On the left the Will has to run out to the flat, which opens a window for the left curl inside the bailing corner.',
    },
    {
      id: 'stick_palms', name: 'Flat-Curl', formation: 'doubles', coverage: 'palms', pressure: 'none',
      routes: { X: 'curl', H: 'flat', Y: 'stick', Z: 'go', RB: 'check' },
      progression: ['H', 'X', 'Y', 'RB'], correct: 'Y', idealTime: 1.3,
      coaching: 'Two-high with the safeties low (9 yards) and stacked over the #2 receivers = Palms (2-read). On the left #2 goes to the flat, so the corner jumps him and the safety takes the curl. On the right the stick settles between the nickel and the Mike, under the safety that is carrying the go.',
    },
    {
      id: 'smash_c6', name: 'Smash', formation: 'doubles', coverage: 'cover6', pressure: 'none',
      routes: { X: 'hitch', H: 'corner', Y: 'corner', Z: 'hitch', RB: 'check' },
      progression: ['Y', 'X', 'H', 'RB'], correct: 'X', idealTime: 1.5,
      coaching: 'A split-field look, with an off corner and a low safety on the left but a squatted corner and a wide, high safety on the right = Cover 6. The right (cloud) side is Cover 2: the squat corner sits on the hitch and the half safety caps the corner route. On the left (quarters) side the corner bails to his deep quarter at the snap, so the left hitch is open right away. Read the side, not the whole field.',
    },
  ];

    PLAYS.forEach((p) => { p.type = p.type || 'pass'; p.pressure = PRESSURE_ALIAS[p.pressure] || p.pressure || 'NONE'; });
  const api = { FIELD, FORMATIONS, ROUTES, COVERAGES, VARIANTS, COVERAGE_OPTIONS, PRESSURE_OPTIONS, PRESSURE_FAMILIES, BLITZES, PLAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBData = api;
})(typeof window !== 'undefined' ? window : globalThis);
