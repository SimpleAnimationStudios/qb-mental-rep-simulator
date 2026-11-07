/**
 * reads.js — v12 Crucible-style correct-read rules (original names; no Crucible assets).
 * Contour = closed (one-high / MFC) | open (two-high / MFO) | man.
 * Prefer authored football logic + read keys; bestRead probe is fallback / hot override.
 * Sources & gaps: docs/crucible-reads.md
 */
(function (root) {
  const D = root.QBData || (typeof require !== 'undefined' ? require('./data.js') : null);

  /** Map coverage id / shell / variant → contour. */
function contourOf(cov) {
    // closed ≈ one-high / MFC (C3); open ≈ two-high / MFO; man ≈ C0 / C1 / 2-man
    const id = (typeof cov === 'string' ? cov : (cov && (cov.id || cov.coverage || cov.shell || cov.variant)) || '').toLowerCase();
    const v = (typeof cov === 'object' && cov && (cov.variant || '') || '').toLowerCase();
    const blob = id + ' ' + v;
    if (/cover2man|c2_man|2-man|2man|cover0|\bc0\b|c0_|\bzero\b/.test(blob)) return 'man';
    if (/cover1|\bc1\b|c1_|robber/.test(blob)) return 'man';
    if (/cover3|\bc3\b|c3_|cloud|buzz/.test(blob)) return 'closed';
    if (/tampa|palms|cover2|cover4|cover6|cover2dime|\bc2\b|\bc4\b|\bc6\b|c2_|c4_|c6_/.test(blob)) return 'open';
    return 'closed';
  }

  function conceptOf(play) {
    const n = ((play && play.name) || '') + ' ' + ((play && play.id) || '');
    if (/stick|flat-curl/i.test(n)) return 'STICK';
    if (/snag|spot|spacing/i.test(n)) return 'SNAG';
    if (/mesh/i.test(n)) return 'MESH';
    if (/flood|sail/i.test(n)) return 'SAIL';
    if (/smash/i.test(n)) return 'SMASH';
    if (/four\s*vert|verts/i.test(n)) return 'VERTS';
    if (/dagger/i.test(n)) return 'DAGGER';
    if (/curl.?flat/i.test(n)) return 'CURLFLAT';
    if (/drive|shallow/i.test(n)) return 'DRIVE';
    if (/y-?cross|ycross/i.test(n)) return 'YCROSS';
    if (/levels/i.test(n)) return 'LEVELS';
    if (/mills|post-dig/i.test(n)) return 'MILLS';
    if (/texas/i.test(n)) return 'TEXAS';
    if (/sluggo|hitch.?go|double/i.test(n)) return 'SLUGGO';
    if (/hot|slant|fire|nickel_hot|mug/i.test(n)) return 'HOT';
    if (/screen|bubble/i.test(n)) return 'SCREEN';
    if (/boot|deep\s*over|pa\s/i.test(n)) return 'PA';
    return null;
  }

  /**
   * Per-concept: progression order by contour + default pick + optional read-key.
   * readKey.role hints which defender to watch; rule describes mapping (documented, used when we can probe leverage).
   */
  const CONCEPTS = {
    STICK: {
      key: 'flat', // curl/flat / apex defender — horizontal stretch
      rule: 'widen→stick (#2), sit/sink on stick→flat (#3/RB); go clears',
      by: {
        closed: { order: ['H', 'Y', 'RB'], pick: 'H', ideal: 1.5 }, // C3/C1 zone: stick first vs curl/flat
        open: { order: ['H', 'Y', 'RB'], pick: 'Y', ideal: 1.4 },   // two-high: flat often wins vs squat
        man: { order: ['H', 'Y', 'RB'], pick: 'H', ideal: 1.3 },    // stick settles vs trail
      },
    },
    SNAG: {
      key: 'CB',
      rule: 'low-high on the corner: CB up→spot/snag, CB sink→flat/arrow',
      by: {
        closed: { order: ['Y', 'H', 'X', 'RB'], pick: 'H', ideal: 1.6 },
        open: { order: ['Y', 'H', 'X', 'RB'], pick: 'Y', ideal: 1.5 },
        man: { order: ['Y', 'H', 'RB'], pick: 'Y', ideal: 1.4 },
      },
    },
    MESH: {
      key: 'rat',
      rule: 'man→crosser away from rat; zone→settled shallow / sit',
      by: {
        closed: { order: ['X', 'H', 'Y', 'RB'], pick: 'H', ideal: 1.6 },
        open: { order: ['X', 'H', 'Y', 'RB'], pick: 'H', ideal: 1.5 },
        man: { order: ['X', 'H', 'RB'], pick: 'X', ideal: 1.3 },
      },
    },
    SAIL: {
      key: 'flat',
      rule: 'high-to-low three levels: go clear → sail/corner → flat',
      by: {
        closed: { order: ['Y', 'H', 'RB'], pick: 'Y', ideal: 2.0 }, // vs cloud/sky sail over squat
        open: { order: ['Y', 'H', 'RB'], pick: 'H', ideal: 1.8 },
        man: { order: ['Y', 'H', 'RB'], pick: 'Y', ideal: 1.7 },
      },
    },
    SMASH: {
      key: 'CB',
      rule: 'hi-lo on squat corner: CB squat→corner, CB bail→hitch',
      by: {
        closed: { order: ['H', 'X', 'RB'], pick: 'X', ideal: 1.6 }, // C3 cloud: hitch often
        open: { order: ['H', 'X', 'RB'], pick: 'H', ideal: 1.9 },   // C2/C4: corner into the hole
        man: { order: ['H', 'X', 'RB'], pick: 'H', ideal: 1.7 },
      },
    },
    VERTS: {
      key: 'FS',
      rule: 'one-high: seams stress FS; two-high: outside shoulder / check',
      by: {
        closed: { order: ['H', 'Y', 'X', 'RB'], pick: 'H', ideal: 1.9 },
        open: { order: ['X', 'Z', 'RB'], pick: 'X', ideal: 2.0 },
        man: { order: ['H', 'Y', 'RB'], pick: 'H', ideal: 1.8 },
      },
    },
    DAGGER: {
      key: 'S',
      rule: 'safety drives dig→seam; stays on seam→dig',
      by: {
        closed: { order: ['H', 'Y', 'RB'], pick: 'Y', ideal: 2.2 },
        open: { order: ['H', 'Y', 'RB'], pick: 'H', ideal: 2.4 },
        man: { order: ['Y', 'H', 'RB'], pick: 'Y', ideal: 2.0 },
      },
    },
    CURLFLAT: {
      key: 'flat',
      rule: 'curl-flat defender widen→curl; sit→flat',
      by: {
        closed: { order: ['X', 'H', 'Y', 'RB'], pick: 'X', ideal: 1.6 },
        open: { order: ['X', 'H', 'RB'], pick: 'H', ideal: 1.5 },
        man: { order: ['X', 'H', 'RB'], pick: 'X', ideal: 1.4 },
      },
    },
    DRIVE: {
      key: 'hook',
      rule: 'shallow pulls hook; dig behind vs zone; shallow vs man trail',
      by: {
        closed: { order: ['X', 'H', 'RB'], pick: 'H', ideal: 2.0 },
        open: { order: ['H', 'X', 'RB'], pick: 'H', ideal: 2.0 },
        man: { order: ['X', 'H', 'RB'], pick: 'X', ideal: 1.5 },
      },
    },
    YCROSS: {
      key: 'hook',
      rule: 'crosser under deep third / away from hooks',
      by: { closed: { order: ['Y', 'Z', 'RB'], pick: 'Y', ideal: 2.4 }, open: { order: ['Y', 'Z', 'RB'], pick: 'Y', ideal: 2.2 }, man: { order: ['Y', 'RB'], pick: 'Y', ideal: 2.0 } },
    },
    LEVELS: {
      key: 'hook',
      rule: 'low in jumps→high in behind',
      by: { closed: { order: ['Y', 'H', 'Z', 'RB'], pick: 'Y', ideal: 1.9 }, open: { order: ['Y', 'H', 'Z', 'RB'], pick: 'Y', ideal: 1.9 }, man: { order: ['Y', 'H', 'RB'], pick: 'H', ideal: 1.6 } },
    },
    MILLS: {
      key: 'S',
      rule: 'safety jumps dig→post behind',
      by: { closed: { order: ['X', 'H', 'RB'], pick: 'X', ideal: 2.5 }, open: { order: ['X', 'H', 'RB'], pick: 'X', ideal: 2.5 }, man: { order: ['X', 'H', 'RB'], pick: 'X', ideal: 2.3 } },
    },
    TEXAS: {
      key: 'LB',
      rule: 'RB angle vs man LB',
      by: { closed: { order: ['RB', 'H', 'Y'], pick: 'RB', ideal: 1.8 }, open: { order: ['RB', 'H'], pick: 'RB', ideal: 1.8 }, man: { order: ['RB', 'H', 'Y'], pick: 'RB', ideal: 1.8 } },
    },
    HOT: {
      key: 'blitz',
      rule: 'ball out on the hot vs free rusher',
      by: { closed: { order: ['H', 'Y', 'X', 'RB'], pick: 'H', ideal: 0.9 }, open: { order: ['H', 'X', 'RB'], pick: 'H', ideal: 0.9 }, man: { order: ['H', 'X', 'RB'], pick: 'H', ideal: 0.9 } },
    },
    SCREEN: {
      key: 'edge',
      rule: 'let rushers clear; dump to screen',
      by: { closed: { order: ['RB', 'H'], pick: 'RB', ideal: 1.0 }, open: { order: ['H', 'RB'], pick: 'H', ideal: 0.7 }, man: { order: ['RB', 'H'], pick: 'RB', ideal: 1.0 } },
    },
    PA: {
      key: 'LB',
      rule: 'PA freezes LBs; hit the over/boot',
      by: { closed: { order: ['H', 'X', 'Y'], pick: 'H', ideal: 2.4 }, open: { order: ['H', 'X'], pick: 'H', ideal: 2.4 }, man: { order: ['Y', 'X'], pick: 'Y', ideal: 1.9 } },
    },
    SLUGGO: {
      key: 'CB',
      rule: 'CB bites slant→go over top',
      by: { closed: { order: ['X', 'Z', 'H', 'RB'], pick: 'X', ideal: 2.6 }, open: { order: ['X', 'Z', 'RB'], pick: 'X', ideal: 2.6 }, man: { order: ['X', 'Z', 'H', 'RB'], pick: 'X', ideal: 2.6 } },
    },
  };

  function idsOnPlay(play, order) {
    const routes = play.routes || {};
    return (order || []).filter((id) => routes[id]);
  }

  /**
   * Resolve the coaching answer for a play vs its coverage.
   * Returns { concept, contour, correct, ideal, order, why, source:'table'|'authored'|'none' }
   */
  function resolveRead(play, cov) {
    if (!play || play.type === 'run') return null;
    const concept = conceptOf(play);
    const contour = contourOf(cov || play.coverage);
    if (!concept || !CONCEPTS[concept]) {
      return { concept, contour, correct: play.correct || (play.progression || [])[0], ideal: play.idealTime || 1.6, order: play.progression || [], why: 'no concept table — authored/fallback', source: play.correct ? 'authored' : 'none' };
    }
    const row = CONCEPTS[concept].by[contour] || CONCEPTS[concept].by.closed;
    const order = idsOnPlay(play, row.order);
    let pick = row.pick;
    if (!play.routes || !play.routes[pick]) pick = order[0] || play.correct;
    // Stick / Curl-flat read-key: if play has both stick+flat bodies, keep table pick (documented); optional leverage probe is in grading via sim.
    return {
      concept, contour, correct: pick, ideal: row.ideal, order,
      why: `${concept} vs ${contour}: ${CONCEPTS[concept].rule}`,
      source: 'table', key: CONCEPTS[concept].key,
    };
  }

  /**
   * Optional live read-key adjustment when we have a sim (Stick / Snag / Smash).
   * Looks at the apex/flat or outside CB lateral move between 0.6–1.3 s.
   */
  function applyReadKey(sim, base) {
    if (!sim || !base || !base.concept) return base;
    const play = sim.play;
    const t = Math.min(1.25, (base.ideal || 1.5));
    const findFlatDef = () => {
      // underneath zone defender nearest the stick/snag receiver pre-snap
      const stickId = ['H', 'Y'].find((id) => play.routes && /stick|spot|sit/.test(play.routes[id] || ''));
      const recv = stickId && sim.refs[stickId];
      if (!recv) return null;
      let best = null, bd = 99;
      sim.defense.forEach((d) => {
        const j = d.job0 || d.job; if (!j || j.type !== 'zone' || j.deep) return;
        const dd = Math.hypot((d.sx0 || d.x) - recv.sx0, (d.sy0 || d.y) - recv.sy0);
        if (dd < bd) { bd = dd; best = d; }
      });
      return best;
    };
    if (base.concept === 'STICK' || base.concept === 'CURLFLAT') {
      const def = findFlatDef();
      if (def) {
        // approximate: if defender's job landmark is wider than stick receiver → expect stick; else flat
        const stickId = (play.progression || []).find((id) => /stick|sit|spot/.test((play.routes || {})[id] || '')) || 'H';
        const flatId = (play.progression || []).find((id) => /flat|arrow|check/.test((play.routes || {})[id] || '')) || 'Y';
        const recv = sim.refs[stickId];
        if (recv && play.routes[flatId]) {
          const widens = Math.abs((def.job0 || def.job).x - D.FIELD.ballX) > Math.abs(recv.sx0 - D.FIELD.ballX) + 2;
          const pick = widens ? stickId : flatId;
          return Object.assign({}, base, { correct: pick, why: base.why + (widens ? ' (key widened → stick)' : ' (key sat → flat)'), source: 'readkey' });
        }
      }
    }
    if (base.concept === 'SMASH') {
      // open contour already prefers corner; closed prefers hitch — table enough
      return base;
    }
    return base;
  }

  const api = { contourOf, conceptOf, CONCEPTS, resolveRead, applyReadKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBReads = api;
})(typeof window !== 'undefined' ? window : globalThis);
