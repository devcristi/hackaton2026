'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { stressToColor } from './useStressColor';
import { getCardiacFrame, toCardiacT } from '../../lib/cardiacAnimator';
import { useTwinStore } from '../../store/twin-store';

export interface HeartMeshProps {
  stressScore: number;
  heartRate:   number;        // bpm — drives systole/diastole cycle
  temperature: number;
  clipPlane?:  THREE.Plane | null;
}

export const HeartMesh = ({
  stressScore,
  heartRate,
  temperature,
  clipPlane,
}: HeartMeshProps) => {
  const isAnimating = useTwinStore((s) => s.isAnimating);

  // ── Top-level cinematic drift group ──────────────────────────────────────
  const groupRef = useRef<THREE.Group>(null);

  // ── Per-anatomical-class animation refs ──────────────────────────────────
  // Each ref wraps the meshes belonging to one CardiacAnimator segment.
  // Scaling the GROUP multiplies with the inner mesh's static shape-scale,
  // keeping proportions correct while the animation drives volume changes.
  const lvRef    = useRef<THREE.Group>(null);   // Left Ventricle
  const rvRef    = useRef<THREE.Group>(null);   // Right Ventricle
  const laRef    = useRef<THREE.Group>(null);   // Left Atrium
  const raRef    = useRef<THREE.Group>(null);   // Right Atrium
  const myoRef   = useRef<THREE.Group>(null);   // Myocardium (septum + apex)
  const aortaRef = useRef<THREE.Group>(null);   // Aorta (all segments)
  const paRef    = useRef<THREE.Group>(null);   // Pulmonary Artery (trunk + bifurcation)

  // ── Stress colour ─────────────────────────────────────────────────────────
  const [sr, sg, sb] = stressToColor(stressScore);
  const stressVec    = useMemo(() => new THREE.Color(sr, sg, sb), [sr, sg, sb]);

  // ── Anatomical class colours ──────────────────────────────────────────────
  // Left-side (oxygenated) → warm arterial red
  const lvColor     = useMemo(() => new THREE.Color(0.78, 0.06, 0.08), []);
  const laColor     = useMemo(() => new THREE.Color(0.72, 0.10, 0.14), []);
  // Right-side (deoxygenated) → darker maroon / purple-red
  const rvColor     = useMemo(() => new THREE.Color(0.42, 0.03, 0.22), []);
  const raColor     = useMemo(() => new THREE.Color(0.36, 0.03, 0.28), []);
  // Myocardial wall tissues
  const septumColor = useMemo(() => new THREE.Color(0.55, 0.04, 0.14), []);
  const apexColor   = useMemo(() => new THREE.Color(0.68, 0.05, 0.06), []);
  // Great arteries — bright red/orange (oxygenated)
  const aortaColor  = useMemo(() => new THREE.Color(0.90, 0.14, 0.04), []);
  // Pulmonary system — blue-purple (deoxygenated → lungs)
  const venousColor = useMemo(() => new THREE.Color(0.22, 0.08, 0.62), []);
  // Systemic veins — deeper indigo
  const vcaColor    = useMemo(() => new THREE.Color(0.16, 0.05, 0.50), []);

  // ── Emissive: ramps up with stress + temperature deviation ───────────────
  const emissiveColor = useMemo(() => {
    const base = new THREE.Color(0.50, 0.00, 0.00);
    return base.clone().lerp(stressVec, (stressScore / 100) * 0.55);
  }, [stressScore, stressVec]);

  const tempDev   = Math.max(0, temperature - 36.5) / 3.0;
  const emissiveI = 0.25 + (stressScore / 100) * 0.55 + tempDev * 0.3;

  // ── Animation loop ────────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    // When paused: freeze at diastolic baseline; drift still runs
    if (!isAnimating) {
      if (groupRef.current) {
        groupRef.current.rotation.y = Math.sin(elapsed * 0.08) * 0.25;
        groupRef.current.rotation.z = Math.sin(elapsed * 0.05) * 0.04;
      }
      return;
    }

    // Convert wall-clock seconds + BPM → normalised cardiac cycle time [0,1]
    const t     = toCardiacT(elapsed, heartRate);
    const frame = getCardiacFrame(t);

    // ── Left Ventricle: scale + apical torsion (Z-rotation) ────────────────
    if (lvRef.current) {
      lvRef.current.scale.set(...frame.leftVentricle.scale);
      // Apply ONLY the Z torsion; X/Y rotations stay 0 (preserves anatomical
      // orientation — we only add the apical twist, not full Euler override)
      lvRef.current.rotation.z = frame.leftVentricle.rotation[2];
    }

    // ── Right Ventricle: scale + mild counter-twist ─────────────────────────
    if (rvRef.current) {
      rvRef.current.scale.set(...frame.rightVentricle.scale);
      rvRef.current.rotation.z = frame.rightVentricle.rotation[2];
    }

    // ── Left Atrium ─────────────────────────────────────────────────────────
    if (laRef.current) {
      laRef.current.scale.set(...frame.leftAtrium.scale);
    }

    // ── Right Atrium ────────────────────────────────────────────────────────
    if (raRef.current) {
      raRef.current.scale.set(...frame.rightAtrium.scale);
    }

    // ── Myocardium (wall thickening) ────────────────────────────────────────
    // Scaling the septum + apex GROUP radially (X,Y >> Z) creates the visual
    // illusion of wall thickening around the cavity — same effect as MRI-
    // measured systolic wall thickening.
    if (myoRef.current) {
      myoRef.current.scale.set(...frame.myocardium.scale);
    }

    // ── Aorta: radial expansion from systolic pressure wave ─────────────────
    // The CardiacAnimator AORTA scale is [1.12, 1.12, 1.00] at peak systole →
    // applying it to the aorta GROUP makes the cylinders/torus visibly fatter
    // in the transverse plane while preserving Z length.
    if (aortaRef.current) {
      aortaRef.current.scale.set(...frame.aorta.scale);
    }

    // ── Pulmonary Artery: more compliant radial expansion ───────────────────
    if (paRef.current) {
      paRef.current.scale.set(...frame.pulmonaryArtery.scale);
    }

    // ── Coronaries are handled by <CoronaryArteries> (separate component). ──
    // Pass `frame.coronaries` as a prop to that component for full integration.

    // ── Slow cinematic Y / Z drift ──────────────────────────────────────────
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(elapsed * 0.08) * 0.25;
      groupRef.current.rotation.z = Math.sin(elapsed * 0.05) * 0.04;
    }
  });

  // ── Shared material template ──────────────────────────────────────────────
  const clipProps = clipPlane
    ? { clippingPlanes: [clipPlane], clipShadows: true as const }
    : {};

  const matProps = {
    roughness:         0.70,
    metalness:         0.10,
    emissive:          emissiveColor,
    emissiveIntensity: emissiveI,
    ...clipProps,
  } as const;

  // ─────────────────────────────────────────────────────────────────────────
  // JSX — each anatomical class is wrapped in its own <group ref=…> so the
  // CardiacAnimator scale is applied independently on top of each mesh's
  // intrinsic shape-scale (which is baked into the inner <mesh> scale prop).
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <group ref={groupRef} position={[0, 0.1, 0]}>

      {/* ── LEFT VENTRICLE — largest chamber, left-inferior ─────────────────
           CardiacAnimator: scale [0.70, 0.70, 0.85] at peak systole
                            rotation.z ≈ −0.22 rad (apical CCW twist)       */}
      <group ref={lvRef}>
        <mesh position={[-0.20, -0.10, 0.00]}>
          <sphereGeometry args={[0.50, 32, 32]} />
          <meshStandardMaterial color={lvColor} {...matProps} />
        </mesh>
      </group>

      {/* ── RIGHT VENTRICLE — right-anterior, crescent bellows contraction ──
           CardiacAnimator: scale [0.75, 0.75, 0.88] at peak systole
                            rotation.z ≈ +0.07 rad (mild counter-twist)     */}
      <group ref={rvRef}>
        <mesh position={[0.24, -0.06, 0.06]} scale={[0.86, 0.96, 0.80]}>
          <sphereGeometry args={[0.46, 32, 32]} />
          <meshStandardMaterial color={rvColor} {...matProps} />
        </mesh>
      </group>

      {/* ── LEFT ATRIUM — posterior-superior ────────────────────────────────
           CardiacAnimator: scale [0.80, 0.80, 0.80] during atrial systole  */}
      <group ref={laRef}>
        <mesh position={[-0.24, 0.54, -0.20]} scale={[0.82, 0.72, 0.74]}>
          <sphereGeometry args={[0.30, 24, 24]} />
          <meshStandardMaterial color={laColor} {...matProps} />
        </mesh>
      </group>

      {/* ── RIGHT ATRIUM — right-superior ───────────────────────────────────
           CardiacAnimator: scale [0.80, 0.80, 0.80] during atrial systole  */}
      <group ref={raRef}>
        <mesh position={[0.20, 0.50, -0.14]} scale={[0.76, 0.68, 0.70]}>
          <sphereGeometry args={[0.28, 24, 24]} />
          <meshStandardMaterial color={raColor} {...matProps} />
        </mesh>
      </group>

      {/* ── MYOCARDIUM  (interventricular septum + apex) ─────────────────────
           These two meshes represent the muscular wall mass.
           CardiacAnimator: scale [1.25, 1.25, 1.05] at peak systole
           → radial thickening makes the septum/apex visually swell outwards,
             simulating the ~40 % increase in wall thickness seen on cardiac MRI. */}
      <group ref={myoRef}>
        {/* Interventricular septum — thin flattened sphere between chambers */}
        <mesh position={[0.04, -0.08, 0.02]} scale={[0.22, 0.90, 0.70]}>
          <sphereGeometry args={[0.48, 20, 20]} />
          <meshStandardMaterial color={septumColor} {...matProps} />
        </mesh>

        {/* Apex — inferior pointed tip of the LV */}
        <mesh position={[-0.10, -0.65, 0.00]} scale={[0.58, 0.52, 0.52]}>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshStandardMaterial color={apexColor} {...matProps} />
        </mesh>
      </group>

      {/* ── AORTA  (root + arch + descending stub) ───────────────────────────
           CardiacAnimator: scale [1.12, 1.12, 1.00] at peak systole
           → X/Y radial expansion only (Z = vessel long-axis stays constant).
             The group pivot is roughly at the aortic root, so all three
             segments expand outward from the same origin correctly.         */}
      <group ref={aortaRef}>
        {/* Ascending aortic root */}
        <mesh position={[0.06, 0.82, -0.04]} rotation={[0.10, 0, -0.12]}>
          <cylinderGeometry args={[0.11, 0.15, 0.50, 16]} />
          <meshStandardMaterial
            color={aortaColor}
            {...matProps}
            emissiveIntensity={emissiveI * 0.9}
          />
        </mesh>

        {/* Aortic arch — half-torus curving left */}
        <mesh position={[0.25, 1.00, -0.06]} rotation={[Math.PI / 2, 0, 0.35]}>
          <torusGeometry args={[0.20, 0.09, 12, 24, Math.PI * 0.75]} />
          <meshStandardMaterial
            color={aortaColor}
            {...matProps}
            emissiveIntensity={emissiveI * 0.9}
          />
        </mesh>

        {/* Descending aorta stub */}
        <mesh position={[0.42, 0.78, -0.06]} rotation={[0, 0, -1.45]}>
          <cylinderGeometry args={[0.09, 0.11, 0.42, 14]} />
          <meshStandardMaterial
            color={aortaColor}
            {...matProps}
            emissiveIntensity={emissiveI * 0.9}
          />
        </mesh>
      </group>

      {/* ── PULMONARY ARTERY  (trunk + bifurcation stubs) ────────────────────
           CardiacAnimator: scale [1.18, 1.18, 1.00] at peak systole
           → More compliant than aorta → larger radial expansion fraction.   */}
      <group ref={paRef}>
        {/* Pulmonary trunk — anterior, goes up-left */}
        <mesh position={[-0.06, 0.80, 0.14]} rotation={[-0.30, 0.10, 0.10]}>
          <cylinderGeometry args={[0.09, 0.12, 0.44, 14]} />
          <meshStandardMaterial
            color={venousColor}
            {...matProps}
            emissiveIntensity={emissiveI * 0.6}
          />
        </mesh>

        {/* Left pulmonary artery stub */}
        <mesh position={[-0.18, 1.04, 0.14]} rotation={[0, 0, 0.55]}>
          <cylinderGeometry args={[0.06, 0.08, 0.28, 12]} />
          <meshStandardMaterial
            color={venousColor}
            {...matProps}
            emissiveIntensity={emissiveI * 0.5}
          />
        </mesh>

        {/* Right pulmonary artery stub */}
        <mesh position={[0.06, 1.04, 0.14]} rotation={[0, 0, -0.55]}>
          <cylinderGeometry args={[0.06, 0.08, 0.28, 12]} />
          <meshStandardMaterial
            color={venousColor}
            {...matProps}
            emissiveIntensity={emissiveI * 0.5}
          />
        </mesh>
      </group>

      {/* ── SUPERIOR VENA CAVA — static (venous return, low pressure, no pulse)
           Not animated by CardiacAnimator — SVC pressure barely oscillates.  */}
      <mesh position={[0.36, 0.80, -0.14]} rotation={[0.15, 0, 0.05]}>
        <cylinderGeometry args={[0.07, 0.08, 0.35, 12]} />
        <meshStandardMaterial
          color={vcaColor}
          {...matProps}
          emissiveIntensity={emissiveI * 0.4}
        />
      </mesh>

    </group>
  );
};
