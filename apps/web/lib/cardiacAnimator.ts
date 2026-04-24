/**
 * cardiacAnimator.ts
 *
 * Biologically-accurate cardiac cycle animator for 3D medical volume segments.
 *
 * ─── Cardiac Cycle Timeline (one full beat, t = 0.0 → 1.0 ≈ 0.8 s @ 75 bpm) ───
 *
 *  t = 0.00 → 0.15  │ Phase 1 – Atrial Systole
 *                   │   P-wave on ECG.  Atria depolarise and contract,
 *                   │   pushing residual blood into the relaxed ventricles.
 *
 *  t = 0.15 → 0.50  │ Phase 2 – Ventricular Systole
 *                   │   QRS complex → T-wave on ECG.  Both ventricles
 *                   │   contract violently (LV ~120 mmHg, RV ~25 mmHg).
 *                   │   The myocardial wall thickens, great vessels expand
 *                   │   from the pressure wave, and coronaries are squeezed.
 *                   │   The LV apex twists counter-clockwise (apical rotation,
 *                   │   driven by helical myofibres) — a key biomechanical marker.
 *
 *  t = 0.50 → 1.00  │ Phase 3 – Diastole / Ventricular Filling
 *                   │   Isovolumetric relaxation, then passive + active filling.
 *                   │   Coronaries rebound with a reactive overshoot (they fill
 *                   │   predominantly in diastole — reverse of every other vessel).
 *                   │   Great vessels show a Windkessel elastic recoil overshoot.
 *                   │   Atria preload slowly with returning venous blood (late preload).
 *
 * ─── Coordinate convention ────────────────────────────────────────────────────
 *   X, Y  = short-axis / transverse plane
 *   Z     = long-axis (base → apex points in +Z direction)
 *   Rotations use right-hand rule (radians).
 *   LV twist is encoded as rotation.z (CCW at apex → negative Z in RHR).
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *   // In a requestAnimationFrame / useFrame loop:
 *   const bpm   = 140;            // e.g. neonatal heart rate
 *   const t     = (elapsedSeconds * bpm / 60) % 1.0;
 *   const frame = getCardiacFrame(t);
 *
 *   // Map to Three.js:
 *   lvMesh.scale.set(...frame.leftVentricle.scale);
 *   lvMesh.rotation.set(...frame.leftVentricle.rotation);
 *
 *   // Or to a raw 4×4 matrix uniform — build TRS from the returned arrays.
 *
 * All math is pure JS/TS — zero external dependencies.
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Per-segment transform state for one instant of the cardiac cycle. */
export interface SegmentTransform {
  /**
   * Multiplicative scale factor per axis [x, y, z].
   * Resting / end-diastolic baseline = [1, 1, 1].
   */
  scale: [number, number, number];

  /**
   * Additive Euler rotation in radians per axis [rx, ry, rz].
   * Resting baseline = [0, 0, 0].
   * Applied in XYZ order — match your renderer's Euler order if it differs.
   */
  rotation: [number, number, number];
}

/** Full cardiac frame: one transform per anatomical segment + metadata. */
export interface CardiacFrame {
  // ── Atria ──────────────────────────────────────────────────────────────────
  leftAtrium:      SegmentTransform;
  rightAtrium:     SegmentTransform;
  // ── Ventricles ─────────────────────────────────────────────────────────────
  leftVentricle:   SegmentTransform;
  rightVentricle:  SegmentTransform;
  // ── Myocardium (wall) ──────────────────────────────────────────────────────
  myocardium:      SegmentTransform;
  // ── Great Vessels ──────────────────────────────────────────────────────────
  aorta:           SegmentTransform;
  pulmonaryArtery: SegmentTransform;
  // ── Coronary Arteries ──────────────────────────────────────────────────────
  coronaries:      SegmentTransform;

  /** Human-readable phase name — useful for ECG overlay labels / debugging. */
  phase: 'atrialSystole' | 'ventricularSystole' | 'diastole';

  /**
   * Progress [0, 1] within the *current* phase.
   * 0 = phase just started, 1 = phase about to end.
   */
  phaseProgress: number;
}

// ─── Phase Boundary Constants ─────────────────────────────────────────────────

/** End of atrial systole (as fraction of full cycle). */
const P1_END = 0.15;
/** End of ventricular systole (as fraction of full cycle). */
const P2_END = 0.50;

// ─── Easing / Interpolation Primitives ───────────────────────────────────────

/**
 * smoothstep(t):  3t² − 2t³
 *
 * Classic Hermite cubic. Zero first-derivative at both endpoints → no
 * perceptible velocity "snap" when the animation enters or exits a plateau.
 * Used whenever we want a smooth onset AND smooth tapering.
 */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * easeInOutSine(t):  −(cos(πt) − 1) / 2
 *
 * Built on the half-cosine curve → perfectly sinusoidal acceleration followed
 * by sinusoidal deceleration.  Maps to the gentle, peristaltic squeeze of the
 * atria — which contract softly rather than violently.
 */
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * easeOutCubic(t):  1 − (1−t)³
 *
 * Fast initial change that decelerates to zero as t → 1.
 * Models the explosive onset of ventricular contraction (rapid ejection) and
 * the swift atrial recoil after their squeeze completes.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * easeInOutCubic(t):  symmetric cubic S-curve
 *
 * Used for ventricular diastolic relaxation: gradual isovolumetric onset,
 * fast mid-fill phase, then a decelerating plateau matching end-diastolic
 * volume (the "reverse" of the explosive systolic snap).
 */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Linear interpolation — scalar. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Per-axis linear interpolation — returns a new [x, y, z] triple. */
function lerpV3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// ─── Anatomical Baseline & Peak-Contraction Targets ──────────────────────────

const REST_SCALE: [number, number, number] = [1.0, 1.0, 1.0];
const REST_ROT:   [number, number, number] = [0.0, 0.0, 0.0];

/**
 * ATRIA — thin-walled, low-pressure reservoir chambers.
 * Contract uniformly (all axes equal) because they squeeze like a bag
 * with no preferred axis of stronger shortening.
 * Target: ~20 % reduction in all axes ≈ 49 % volume ejected.
 */
const ATRIA_SYS: [number, number, number] = [0.91, 0.91, 0.91];

/**
 * LEFT VENTRICLE — thick-walled, high-pressure pump.
 * Short-axis (X,Y) shortening: ~30 % → scale 0.70
 * Long-axis (Z) shortening:    ~15 % → scale 0.85
 * These ratios reproduce an ejection fraction of ~60 % (physiological).
 */
const LV_SYS: [number, number, number] = [0.84, 0.84, 0.91];

/**
 * LEFT VENTRICLE TORSIONAL ROTATION (apical twist).
 * Helical myofibres in the subendocardium (right-handed helix) and
 * subepicardium (left-handed helix) produce a net counter-clockwise
 * rotation at the apex of ~12–15° during systole when viewed from the apex.
 * Encoded as −Z rotation (CCW in right-hand convention, Z = long axis to base).
 * −0.22 rad ≈ −12.6°
 */
const LV_TWIST_Z = -0.10;

/**
 * RIGHT VENTRICLE — crescent-shaped, "bellows" contraction.
 * The free wall moves toward the septum rather than twisting.
 * Slightly less volume reduction than LV; mild counter-rotation vs LV.
 * +0.07 rad ≈ +4° (net slight clockwise from apex perspective due to
 * shared septal shortening pulling RV in the opposite direction).
 */
const RV_SYS:       [number, number, number] = [0.87, 0.87, 0.93];
const RV_TWIST_Z    = 0.04;

/**
 * MYOCARDIUM (wall mass).
 * The muscle doesn't disappear — as the cavity shrinks the WALL thickens.
 * Radial (X,Y) thickening: ~40–50 % increase in wall thickness.
 * Long-axis (Z) change is small (mostly cavity shortening, not wall).
 * Scale 1.25 in X,Y represents a 25 % increase in *mesh* radial extent,
 * which visually approximates real wall thickening.
 */
const MYO_SYS: [number, number, number] = [1.08, 1.08, 1.02];

/**
 * AORTA — stiffened by collagen but compliant enough to act as a Windkessel.
 * Radial expansion only (Z = vessel long-axis stays constant).
 * ~12 % radial expansion at peak systolic pressure (~120 mmHg).
 */
const AORTA_SYS: [number, number, number] = [1.05, 1.05, 1.00];

/**
 * PULMONARY ARTERY — more compliant than the aorta (thinner, lower pressure).
 * ~18 % radial expansion at peak RV pressure (~25 mmHg).
 * Counter-intuitively MORE expansion because the wall is thinner and
 * the pressure wave arrives with a larger relative strain.
 */
const PA_SYS:      [number, number, number] = [1.07, 1.07, 1.00];

/**
 * CORONARIES — intramyocardial arteries are COMPRESSED during systole.
 * The contracting myocardium squeezes them shut; the majority of coronary
 * blood flow occurs during DIASTOLE when the muscle relaxes.
 * ~10–12 % compression during peak systole.
 */
const COR_SYS:          [number, number, number] = [0.94, 0.94, 0.97];

/**
 * CORONARIES peak diastolic overshoot.
 * On release of myocardial pressure, the coronaries spring open with a brief
 * reactive hyperaemia (adenosine-mediated vasodilation + compliance recall).
 * ~6 % overshoot above resting diameter at peak diastolic filling.
 */
const COR_DIA_PEAK: [number, number, number] = [1.03, 1.03, 1.01];

// ─── CardiacAnimator Class ────────────────────────────────────────────────────

export class CardiacAnimator {
  /**
   * Evaluate the anatomical state of every heart segment at normalised
   * cycle-time `t`.
   *
   * @param t  Cycle progress in [0, 1].  Values outside this range are clamped.
   *           Convert from real time:  `t = (elapsedSeconds * bpm / 60) % 1`
   * @returns  CardiacFrame — transforms for every segment + phase metadata.
   */
  evaluate(t: number): CardiacFrame {
    const tc = Math.max(0, Math.min(1, t));

    if (tc < P1_END) {
      return this._phase1_atrialSystole(tc);
    } else if (tc < P2_END) {
      return this._phase2_ventricularSystole(tc);
    } else {
      return this._phase3_diastole(tc);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Atrial Systole  (t = 0.00 → 0.15)
  // ──────────────────────────────────────────────────────────────────────────
  private _phase1_atrialSystole(t: number): CardiacFrame {
    // Normalise to [0,1] within this phase
    const p = t / P1_END;

    // ── Atria ───────────────────────────────────────────────────────────────
    // easeInOutSine creates a sinusoidal squeeze — the atria accelerate gently
    // into contraction and decelerate as they approach full ejection.
    // This prevents the jarring "snap" that a linear ramp would produce at t=0.
    const atriaEase  = easeInOutSine(p);                 // 0→1 progress
    const atriaScale = lerpV3(REST_SCALE, ATRIA_SYS, atriaEase);

    return {
      leftAtrium:      { scale: atriaScale, rotation: REST_ROT },
      rightAtrium:     { scale: atriaScale, rotation: REST_ROT },

      // Ventricles are completely relaxed and passively distended with the
      // atrial blood just arriving — resting scale throughout Phase 1.
      leftVentricle:   { scale: REST_SCALE, rotation: REST_ROT },
      rightVentricle:  { scale: REST_SCALE, rotation: REST_ROT },

      // Myocardium at rest (no active contraction yet)
      myocardium:      { scale: REST_SCALE, rotation: REST_ROT },

      // Great vessels at baseline (aortic/pulmonic valves still closed)
      aorta:           { scale: REST_SCALE, rotation: REST_ROT },
      pulmonaryArtery: { scale: REST_SCALE, rotation: REST_ROT },

      // Coronaries still at their residual diastolic fill from the previous beat
      coronaries:      { scale: REST_SCALE, rotation: REST_ROT },

      phase: 'atrialSystole',
      phaseProgress: p,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Ventricular Systole  (t = 0.15 → 0.50)
  // ──────────────────────────────────────────────────────────────────────────
  private _phase2_ventricularSystole(t: number): CardiacFrame {
    const p = (t - P1_END) / (P2_END - P1_END); // normalise to [0,1]

    // ── Atria: swift rebound ─────────────────────────────────────────────────
    // After completing their ejection, the atria immediately recoil (elastic
    // rebound) and begin re-filling with returning venous blood.
    // easeOutCubic: fast initial spring-back that decelerates to rest — models
    // the rapid drop in atrial wall tension once systole ends.
    const atriaRecov  = easeOutCubic(p);
    const atriaScale  = lerpV3(ATRIA_SYS, REST_SCALE, atriaRecov);

    // ── Ventricular contraction driver ──────────────────────────────────────
    // The mechanical sequence has three sub-regions:
    //
    //  p [0.00 → 0.40]  Isovolumetric contraction + Rapid Ejection
    //    → easeOutCubic: explosive onset (mimics rapid depolarisation wave)
    //      that decelerates as the ventricle reaches peak contraction.
    //
    //  p [0.40 → 1.00]  Reduced Ejection → Near-Peak Hold
    //    → smoothstep: the ventricle HOLDS near peak contraction (aortic /
    //      pulmonic valves still open, blood still flowing forward).
    //      Very slight relaxation (1.0 → 0.95) prevents a frozen look.
    let vProg: number;
    if (p < 0.40) {
      vProg = easeOutCubic(p / 0.40);                    // 0 → 1
    } else {
      // Plateau: starts at 1.0 (peak), eases to 0.95 by end of Phase 2
      vProg = lerp(1.0, 0.95, smoothstep((p - 0.40) / 0.60));
    }

    const lvScale = lerpV3(REST_SCALE, LV_SYS, vProg);
    const rvScale = lerpV3(REST_SCALE, RV_SYS, vProg);

    // ── LV apical torsion ────────────────────────────────────────────────────
    // The twist is mechanically coupled to contraction — helical fibres shorten
    // AND rotate simultaneously.  Same progress driver (vProg) as scale.
    const lvRotZ: [number, number, number] = [0, 0, LV_TWIST_Z * vProg];
    const rvRotZ: [number, number, number] = [0, 0, RV_TWIST_Z * vProg];

    // ── Myocardium: wall thickening ──────────────────────────────────────────
    // Wall thickening is driven by the same myofibres → tracks vProg closely.
    const myoScale = lerpV3(REST_SCALE, MYO_SYS, vProg);

    // ── Great vessels: pressure-wave expansion ───────────────────────────────
    // The aortic valve opens at ~p = 0.05 (end-isovolumetric).
    // The pressure wave travels at ~6 m/s → arrives in the ascending aorta
    // almost immediately.  We model with a very fast rise (easeOutCubic over
    // the first 20 % of Phase 2) then a very slight elastic recoil plateau.
    let vsProg: number;
    if (p < 0.20) {
      vsProg = easeOutCubic(p / 0.20);
    } else {
      // Slight recoil (Windkessel compliance stores energy, pressure drops
      // a bit as stroke volume is delivered to periphery)
      vsProg = lerp(1.0, 0.97, smoothstep((p - 0.20) / 0.80));
    }

    const aortaScale = lerpV3(REST_SCALE, AORTA_SYS, vsProg);
    const paScale    = lerpV3(REST_SCALE, PA_SYS,    vsProg);

    // ── Coronary compression ─────────────────────────────────────────────────
    // Intramyocardial pressure compresses coronaries in synchrony with
    // myocardial thickening.  Same vProg driver (cause–effect coupling).
    const corScale = lerpV3(REST_SCALE, COR_SYS, vProg);

    return {
      leftAtrium:      { scale: atriaScale, rotation: REST_ROT },
      rightAtrium:     { scale: atriaScale, rotation: REST_ROT },

      leftVentricle:   { scale: lvScale,    rotation: lvRotZ  },
      rightVentricle:  { scale: rvScale,    rotation: rvRotZ  },

      myocardium:      { scale: myoScale,   rotation: REST_ROT },

      aorta:           { scale: aortaScale, rotation: REST_ROT },
      pulmonaryArtery: { scale: paScale,    rotation: REST_ROT },

      coronaries:      { scale: corScale,   rotation: REST_ROT },

      phase: 'ventricularSystole',
      phaseProgress: p,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Diastole / Ventricular Filling  (t = 0.50 → 1.00)
  // ──────────────────────────────────────────────────────────────────────────
  private _phase3_diastole(t: number): CardiacFrame {
    const p = (t - P2_END) / (1.0 - P2_END); // normalise to [0,1]

    // At the *start* of Phase 3 the ventricles are still near their peak
    // contraction (vProg plateau ended at 0.95).  We need to start relaxation
    // from that intermediate point, not from the absolute peak, for continuity.
    const ventStartFrac = 0.95;

    // ── Ventricular relaxation ───────────────────────────────────────────────
    // easeInOutCubic: slow isovolumetric onset (valves briefly closed, pressure
    // falls but volume unchanged) → rapid mid-phase filling (forward filling
    // from the AV pressure gradient) → decelerating final plateau matching
    // end-diastolic volume.
    const ventRelax = easeInOutCubic(p);

    // Start scale = REST + ventStartFrac * (SYS - REST)  for each axis
    const lvStart = lerpV3(REST_SCALE, LV_SYS, ventStartFrac);
    const rvStart = lerpV3(REST_SCALE, RV_SYS, ventStartFrac);

    const lvScale  = lerpV3(lvStart, REST_SCALE, ventRelax);
    const rvScale  = lerpV3(rvStart, REST_SCALE, ventRelax);

    // ── LV torsion unwind ────────────────────────────────────────────────────
    // The LV "recoil twist" (suction effect) unwinds actively — same easing
    // as ventricular relaxation since it is mechanically coupled.
    const lvRotZ: [number, number, number] = [0, 0, LV_TWIST_Z * ventStartFrac * (1 - ventRelax)];
    const rvRotZ: [number, number, number] = [0, 0, RV_TWIST_Z * ventStartFrac * (1 - ventRelax)];

    // ── Myocardium: wall thinning ────────────────────────────────────────────
    // Tracks ventricular relaxation (same muscle mass).
    const myoStart = lerpV3(REST_SCALE, MYO_SYS, ventStartFrac);
    const myoScale = lerpV3(myoStart, REST_SCALE, ventRelax);

    // ── Great vessels: Windkessel elastic recoil ─────────────────────────────
    // As systole ends and the pressure gradient reverses, the aortic/pulmonic
    // valves close (dicrotic notch).  The vessel walls — pre-stretched by the
    // systolic pressure wave — now recoil elastically.
    //
    // We model this as:
    //   1.  A fast base recovery (easeOutCubic) back toward REST.
    //   2.  A superimposed DAMPED SINE overshoot that peaks around p ≈ 0.12
    //       (corresponding to ~10ms after valve closure) and decays quickly.
    //       This rebound is the physical origin of the dicrotic notch / pulse.
    const vesselBase  = easeOutCubic(p);
    // Damped sine: A ∙ sin(ωt) ∙ e^(−αt)
    //   ω chosen so first peak ≈ p=0.12 → ω ≈ π/0.12 ≈ 26 (but scaled to p∈[0,1])
    const overshoot   = 0.030 * Math.sin(Math.PI * p / 0.12) * Math.exp(-p * 8.0);
    const aStart      = lerpV3(REST_SCALE, AORTA_SYS, 0.97);
    const pStart      = lerpV3(REST_SCALE, PA_SYS,    0.97);
    const aBase       = lerpV3(aStart, REST_SCALE, vesselBase);
    const pBase       = lerpV3(pStart, REST_SCALE, vesselBase);
    const aortaScale: [number, number, number] = [
      aBase[0] + overshoot,
      aBase[1] + overshoot,
      1.0,
    ];
    const paScale: [number, number, number] = [
      pBase[0] + overshoot,
      pBase[1] + overshoot,
      1.0,
    ];

    // ── Coronary diastolic filling ───────────────────────────────────────────
    // Two distinct sub-phases with opposite dynamics:
    //
    //  p [0.00 → 0.35]  Rapid coronary reperfusion (reactive hyperaemia):
    //    As myocardial compression releases, adenosine and local metabolites
    //    trigger vasodilation.  Coronaries spring from compressed to OVERFILLED.
    //    easeOutCubic: sudden release, decelerating as vessels reach peak fill.
    //
    //  p [0.35 → 1.00]  Gradual return to resting calibre:
    //    Metabolic drive wanes, autoregulation restores normal diameter.
    //    easeInOutSine: smooth symmetric fade back to REST.
    let corScale: [number, number, number];
    if (p < 0.35) {
      const corRush = easeOutCubic(p / 0.35);
      corScale = lerpV3(COR_SYS, COR_DIA_PEAK, corRush);
    } else {
      const corSettle = easeInOutSine((p - 0.35) / 0.65);
      corScale = lerpV3(COR_DIA_PEAK, REST_SCALE, corSettle);
    }

    // ── Atria: passive preload ───────────────────────────────────────────────
    // The atria re-fill throughout diastole with returning venous blood.
    // This is a very subtle swell (max +3 % at late diastole).
    // It only becomes visible in the last 30 % of the cycle (late diastolic
    // reservoir), consistent with the gradual venous return pressure gradient.
    const preloadOnset = Math.max(0, (p - 0.70) / 0.30);  // 0 until p=0.70
    const preload      = 0.03 * smoothstep(preloadOnset);
    const atriaScale: [number, number, number] = [
      1.0 + preload,
      1.0 + preload,
      1.0 + preload,
    ];

    return {
      leftAtrium:      { scale: atriaScale, rotation: REST_ROT },
      rightAtrium:     { scale: atriaScale, rotation: REST_ROT },

      leftVentricle:   { scale: lvScale,    rotation: lvRotZ  },
      rightVentricle:  { scale: rvScale,    rotation: rvRotZ  },

      myocardium:      { scale: myoScale,   rotation: REST_ROT },

      aorta:           { scale: aortaScale, rotation: REST_ROT },
      pulmonaryArtery: { scale: paScale,    rotation: REST_ROT },

      coronaries:      { scale: corScale,   rotation: REST_ROT },

      phase: 'diastole',
      phaseProgress: p,
    };
  }
}

// ─── Convenience singleton + functional wrapper ───────────────────────────────

/**
 * Module-level singleton — avoids allocating a new class instance per frame
 * in functional React components or plain rAF loops.
 */
const _animator = new CardiacAnimator();

/**
 * Stateless functional wrapper around `CardiacAnimator.evaluate()`.
 * Prefer this over `new CardiacAnimator()` when you don't need to hold
 * instance state.
 *
 * @param t  Normalised cycle time in [0, 1].
 *
 * @example
 * // Three.js / React Three Fiber  (useFrame hook):
 * useFrame(({ clock }) => {
 *   const bpm = sensorData.bpm ?? 140;
 *   const t   = (clock.getElapsedTime() * bpm / 60) % 1.0;
 *   const f   = getCardiacFrame(t);
 *
 *   lvRef.current.scale.set(...f.leftVentricle.scale);
 *   lvRef.current.rotation.set(...f.leftVentricle.rotation);
 *
 *   aortaRef.current.scale.set(...f.aorta.scale);
 *   // etc.
 * });
 */
export function getCardiacFrame(t: number): CardiacFrame {
  return _animator.evaluate(t);
}

/**
 * Convert real-time elapsed seconds + BPM into a normalised cycle time `t`.
 *
 * @param elapsedSeconds  `clock.getElapsedTime()` or `performance.now() / 1000`
 * @param bpm             Heart rate in beats per minute (e.g. 140 for a neonate)
 */
export function toCardiacT(elapsedSeconds: number, bpm: number): number {
  return ((elapsedSeconds * bpm) / 60) % 1.0;
}
