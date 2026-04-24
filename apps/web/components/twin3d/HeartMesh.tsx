'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { stressToColor } from './useStressColor';

export interface HeartMeshProps {
  stressScore: number;
  heartRate:   number;        // bpm — drives systole/diastole cycle
  temperature: number;
  clipPlane?:  THREE.Plane | null;
}

export const HeartMesh = ({ stressScore, heartRate, temperature, clipPlane }: HeartMeshProps) => {
  const groupRef      = useRef<THREE.Group>(null);
  const heartBodyRef  = useRef<THREE.Group>(null);

  // Stress color blend
  const [sr, sg, sb]  = stressToColor(stressScore);
  const stressVec     = useMemo(() => new THREE.Color(sr, sg, sb), [sr, sg, sb]);

  // ── Anatomical class colors ──────────────────────────────────────────────────
  // Left-side (oxygenated) → warm arterial red
  const lvColor      = useMemo(() => new THREE.Color(0.78, 0.06, 0.08), []);   // Left Ventricle
  const laColor      = useMemo(() => new THREE.Color(0.72, 0.10, 0.14), []);   // Left Atrium
  // Right-side (deoxygenated) → darker maroon / purple-red
  const rvColor      = useMemo(() => new THREE.Color(0.42, 0.03, 0.22), []);   // Right Ventricle
  const raColor      = useMemo(() => new THREE.Color(0.36, 0.03, 0.28), []);   // Right Atrium
  // Septum — intermediate between L/R
  const septumColor  = useMemo(() => new THREE.Color(0.55, 0.04, 0.14), []);
  // Apex — darker tip
  const apexColor    = useMemo(() => new THREE.Color(0.68, 0.05, 0.06), []);
  // Great arteries — bright red/orange
  const aortaColor   = useMemo(() => new THREE.Color(0.90, 0.14, 0.04), []);   // Aorta (oxygenated)
  // Pulmonary system — blue-purple (deoxygenated → lungs)
  const venousColor  = useMemo(() => new THREE.Color(0.22, 0.08, 0.62), []);   // Pulmonary trunk
  // Systemic veins — deeper indigo
  const vcaColor     = useMemo(() => new THREE.Color(0.16, 0.05, 0.50), []);   // Vena Cava

  // Emissive: ramp up with stress
  const emissiveColor = useMemo(() => {
    const base = new THREE.Color(0.50, 0.00, 0.00);
    return base.clone().lerp(stressVec, (stressScore / 100) * 0.55);
  }, [stressScore, stressVec]);

  const tempDev   = Math.max(0, temperature - 36.5) / 3.0;
  const emissiveI = 0.25 + (stressScore / 100) * 0.55 + tempDev * 0.3;

  // Beats-per-second → angular frequency
  const bps = heartRate / 60;

  useFrame(({ clock }) => {
    const t     = clock.getElapsedTime();
    const phase = (t * bps) % 1.0;           // 0..1 per beat

    // Sharp systolic contraction (first 35% of cycle), then gradual diastolic fill
    let systole: number;
    if (phase < 0.12) {
      // Rapid ejection phase — quick squeeze
      systole = Math.sin((phase / 0.12) * Math.PI);
    } else if (phase < 0.35) {
      // Reduced ejection
      systole = Math.sin(((phase - 0.12) / 0.23) * Math.PI * 0.5) * 0.35;
    } else {
      systole = 0;
    }

    // Scale pulse: heart shrinks during systole (blood ejected = smaller)
    const pulseScale = 1.0 - systole * 0.07;
    if (heartBodyRef.current) {
      heartBodyRef.current.scale.setScalar(pulseScale);
    }

    // Slow Y drift for cinematic effect
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.08) * 0.25;
      groupRef.current.rotation.z = Math.sin(t * 0.05) * 0.04;
    }
  });

  // Shared material props (clipping plane applied when active)
  const clipProps = clipPlane ? { clippingPlanes: [clipPlane], clipShadows: true as const } : {};

  const matProps = {
    roughness:         0.70,
    metalness:         0.10,
    emissive:          emissiveColor,
    emissiveIntensity: emissiveI,
    ...clipProps,
  } as const;

  return (
    <group ref={groupRef} position={[0, 0.1, 0]}>
      <group ref={heartBodyRef}>

        {/* ── LEFT VENTRICLE — largest chamber, left-inferior ────────── */}
        <mesh position={[-0.20, -0.10, 0.00]}>
          <sphereGeometry args={[0.50, 32, 32]} />
          <meshStandardMaterial color={lvColor} {...matProps} />
        </mesh>

        {/* ── RIGHT VENTRICLE — right-anterior, slightly smaller ──────── */}
        <mesh position={[0.24, -0.06, 0.06]} scale={[0.86, 0.96, 0.80]}>
          <sphereGeometry args={[0.46, 32, 32]} />
          <meshStandardMaterial color={rvColor} {...matProps} />
        </mesh>

        {/* ── LEFT ATRIUM — posterior-superior ───────────────────────── */}
        <mesh position={[-0.24, 0.54, -0.20]} scale={[0.82, 0.72, 0.74]}>
          <sphereGeometry args={[0.30, 24, 24]} />
          <meshStandardMaterial color={laColor} {...matProps} />
        </mesh>

        {/* ── RIGHT ATRIUM — right-superior ───────────────────────────── */}
        <mesh position={[0.20, 0.50, -0.14]} scale={[0.76, 0.68, 0.70]}>
          <sphereGeometry args={[0.28, 24, 24]} />
          <meshStandardMaterial color={raColor} {...matProps} />
        </mesh>

        {/* ── INTERVENTRICULAR SEPTUM hint (thin flattened sphere) ────── */}
        <mesh position={[0.04, -0.08, 0.02]} scale={[0.22, 0.90, 0.70]}>
          <sphereGeometry args={[0.48, 20, 20]} />
          <meshStandardMaterial color={septumColor} {...matProps} />
        </mesh>

        {/* ── APEX — inferior pointed tip ─────────────────────────────── */}
        <mesh position={[-0.10, -0.65, 0.00]} scale={[0.58, 0.52, 0.52]}>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshStandardMaterial color={apexColor} {...matProps} />
        </mesh>

        {/* ── AORTIC ROOT — ascending aorta ───────────────────────────── */}
        <mesh position={[0.06, 0.82, -0.04]} rotation={[0.10, 0, -0.12]}>
          <cylinderGeometry args={[0.11, 0.15, 0.50, 16]} />
          <meshStandardMaterial color={aortaColor} {...matProps} emissiveIntensity={emissiveI * 0.9} />
        </mesh>

        {/* ── AORTIC ARCH — curving over to descend ───────────────────── */}
        <mesh position={[0.25, 1.00, -0.06]} rotation={[Math.PI / 2, 0, 0.35]}>
          <torusGeometry args={[0.20, 0.09, 12, 24, Math.PI * 0.75]} />
          <meshStandardMaterial color={aortaColor} {...matProps} emissiveIntensity={emissiveI * 0.9} />
        </mesh>

        {/* ── DESCENDING AORTA stub ───────────────────────────────────── */}
        <mesh position={[0.42, 0.78, -0.06]} rotation={[0, 0, -1.45]}>
          <cylinderGeometry args={[0.09, 0.11, 0.42, 14]} />
          <meshStandardMaterial color={aortaColor} {...matProps} emissiveIntensity={emissiveI * 0.9} />
        </mesh>

        {/* ── PULMONARY TRUNK — anterior, goes up-left ────────────────── */}
        <mesh position={[-0.06, 0.80, 0.14]} rotation={[-0.30, 0.10, 0.10]}>
          <cylinderGeometry args={[0.09, 0.12, 0.44, 14]} />
          <meshStandardMaterial color={venousColor} {...matProps} emissiveIntensity={emissiveI * 0.6} />
        </mesh>

        {/* ── PULMONARY BIFURCATION stubs ─────────────────────────────── */}
        <mesh position={[-0.18, 1.04, 0.14]} rotation={[0, 0, 0.55]}>
          <cylinderGeometry args={[0.06, 0.08, 0.28, 12]} />
          <meshStandardMaterial color={venousColor} {...matProps} emissiveIntensity={emissiveI * 0.5} />
        </mesh>
        <mesh position={[0.06, 1.04, 0.14]} rotation={[0, 0, -0.55]}>
          <cylinderGeometry args={[0.06, 0.08, 0.28, 12]} />
          <meshStandardMaterial color={venousColor} {...matProps} emissiveIntensity={emissiveI * 0.5} />
        </mesh>

        {/* ── SUPERIOR VENA CAVA — enters right atrium from above ─────── */}
        <mesh position={[0.36, 0.80, -0.14]} rotation={[0.15, 0, 0.05]}>
          <cylinderGeometry args={[0.07, 0.08, 0.35, 12]} />
          <meshStandardMaterial color={vcaColor} {...matProps} emissiveIntensity={emissiveI * 0.4} />
        </mesh>

      </group>
    </group>
  );
};
