'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { stressToColor } from './useStressColor';

interface BabyMeshProps {
  stressScore: number;
  heartRate: number; // bpm — drives breathing/pulse speed
  temperature: number; // °C
}

// Procedural baby body built from Three.js primitives.
// Each body segment can pulse/glow independently based on stress.
export const BabyMesh = ({ stressScore, heartRate, temperature }: BabyMeshProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Mesh>(null);
  const lArmRef = useRef<THREE.Mesh>(null);
  const rArmRef = useRef<THREE.Mesh>(null);
  const lLegRef = useRef<THREE.Mesh>(null);
  const rLegRef = useRef<THREE.Mesh>(null);

  const [sr, sg, sb] = stressToColor(stressScore);
  const stressColor = new THREE.Color(sr, sg, sb);

  // Skin base color — slightly pinkish
  const skinColor = new THREE.Color(0.97, 0.78, 0.70);

  // Blended color based on stress
  const blendedColor = skinColor.clone().lerp(stressColor, stressScore / 100 * 0.8);

  const hrHz = (heartRate / 60); // heartbeats per second

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const breathCycle = Math.sin(t * 0.6) * 0.03; // breathing at ~0.3 Hz
    const heartPulse = Math.abs(Math.sin(t * Math.PI * hrHz)) * 0.04; // heart pulse

    // Torso breathes in and out
    if (torsoRef.current) {
      torsoRef.current.scale.y = 1 + breathCycle;
      torsoRef.current.scale.x = 1 + breathCycle * 0.5;
    }

    // Head bobs slightly with heartbeat
    if (headRef.current) {
      headRef.current.position.y = 1.05 + heartPulse * 0.3;
    }

    // Arms flex gently
    if (lArmRef.current) lArmRef.current.rotation.z = 0.3 + Math.sin(t * 0.5) * 0.08;
    if (rArmRef.current) rArmRef.current.rotation.z = -0.3 - Math.sin(t * 0.5) * 0.08;

    // Legs kick slightly
    if (lLegRef.current) lLegRef.current.rotation.x = Math.sin(t * 0.4) * 0.06;
    if (rLegRef.current) rLegRef.current.rotation.x = -Math.sin(t * 0.4) * 0.06;

    // Group slow Y rotation
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.15) * 0.3;
    }
  });

  // Emissive intensity increases with temperature deviation & stress
  const tempDeviation = Math.max(0, temperature - 36.5) / 3; // 0→1 over 36.5–39.5°C
  const emissiveIntensity = 0.1 + (stressScore / 100) * 0.5 + tempDeviation * 0.4;

  return (
    <group ref={groupRef} position={[0, -0.3, 0]}>
      {/* HEAD */}
      <mesh ref={headRef} position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.28, 32, 32]} />
        <meshStandardMaterial
          color={blendedColor}
          emissive={stressColor}
          emissiveIntensity={emissiveIntensity * 0.6}
          roughness={0.6}
          metalness={0.0}
        />
      </mesh>

      {/* NECK */}
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.18, 16]} />
        <meshStandardMaterial
          color={blendedColor}
          emissive={stressColor}
          emissiveIntensity={emissiveIntensity * 0.4}
          roughness={0.65}
        />
      </mesh>

      {/* TORSO */}
      <mesh ref={torsoRef} position={[0, 0.25, 0]}>
        <capsuleGeometry args={[0.25, 0.55, 8, 16]} />
        <meshStandardMaterial
          color={blendedColor}
          emissive={stressColor}
          emissiveIntensity={emissiveIntensity}
          roughness={0.55}
          metalness={0.0}
        />
      </mesh>

      {/* LEFT ARM */}
      <mesh ref={lArmRef} position={[-0.38, 0.42, 0]} rotation={[0, 0, 0.3]}>
        <capsuleGeometry args={[0.08, 0.38, 6, 12]} />
        <meshStandardMaterial
          color={blendedColor}
          emissive={stressColor}
          emissiveIntensity={emissiveIntensity * 0.5}
          roughness={0.6}
        />
      </mesh>

      {/* LEFT HAND */}
      <mesh position={[-0.46, 0.13, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color={blendedColor} roughness={0.6} />
      </mesh>

      {/* RIGHT ARM */}
      <mesh ref={rArmRef} position={[0.38, 0.42, 0]} rotation={[0, 0, -0.3]}>
        <capsuleGeometry args={[0.08, 0.38, 6, 12]} />
        <meshStandardMaterial
          color={blendedColor}
          emissive={stressColor}
          emissiveIntensity={emissiveIntensity * 0.5}
          roughness={0.6}
        />
      </mesh>

      {/* RIGHT HAND */}
      <mesh position={[0.46, 0.13, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color={blendedColor} roughness={0.6} />
      </mesh>

      {/* LEFT LEG */}
      <mesh ref={lLegRef} position={[-0.14, -0.42, 0]}>
        <capsuleGeometry args={[0.1, 0.45, 6, 12]} />
        <meshStandardMaterial
          color={blendedColor}
          emissive={stressColor}
          emissiveIntensity={emissiveIntensity * 0.4}
          roughness={0.6}
        />
      </mesh>

      {/* LEFT FOOT */}
      <mesh position={[-0.14, -0.74, 0.06]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshStandardMaterial color={blendedColor} roughness={0.7} />
      </mesh>

      {/* RIGHT LEG */}
      <mesh ref={rLegRef} position={[0.14, -0.42, 0]}>
        <capsuleGeometry args={[0.1, 0.45, 6, 12]} />
        <meshStandardMaterial
          color={blendedColor}
          emissive={stressColor}
          emissiveIntensity={emissiveIntensity * 0.4}
          roughness={0.6}
        />
      </mesh>

      {/* RIGHT FOOT */}
      <mesh position={[0.14, -0.74, 0.06]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshStandardMaterial color={blendedColor} roughness={0.7} />
      </mesh>

      {/* HEART glow sphere (inside torso) */}
      <mesh position={[-0.06, 0.35, 0.15]}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial
          color={new THREE.Color(1, 0.1, 0.1)}
          emissive={new THREE.Color(1, 0, 0)}
          emissiveIntensity={0.2 + (stressScore / 100) * 1.2}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
};
