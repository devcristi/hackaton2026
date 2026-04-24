'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { stressToColor } from './useStressColor';

interface NRRDPointCloudProps {
  stressScore: number;
  visible: boolean;
}

// Simulates a volumetric NRRD scan (like MRI/CT) rendered as a 3D point cloud.
// In production this would parse a real .nrrd file; here we generate synthetic data.
export const NRRDPointCloud = ({ stressScore, visible }: NRRDPointCloudProps) => {
  const meshRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const GRID = 28; // resolution of the volumetric grid

  // Generate volumetric scan data once — returns positions and base densities
  const { positions, densities } = useMemo(() => {
    const pos: number[] = [];
    const dens: number[] = [];

    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        for (let z = 0; z < GRID; z++) {
          // Normalise to [-1, 1]
          const nx = (x / (GRID - 1)) * 2 - 1;
          const ny = (y / (GRID - 1)) * 2 - 1;
          const nz = (z / (GRID - 1)) * 2 - 1;

          // Baby-shaped ellipsoid: taller (y) than wide
          const bodyEllipsoid = (nx * nx) / 0.4 + (ny * ny) / 1.0 + (nz * nz) / 0.3;
          // Head sphere sitting on top of body
          const headEllipsoid =
            (nx * nx) / 0.2 + ((ny - 1.1) * (ny - 1.1)) / 0.2 + (nz * nz) / 0.2;

          const inBody = bodyEllipsoid < 1.0;
          const inHead = headEllipsoid < 1.0;

          if (!inBody && !inHead) continue;

          // Simulate MRI-style tissue density noise
          const noise =
            Math.sin(nx * 7.3) * Math.cos(ny * 5.1) * Math.sin(nz * 6.7) * 0.15;
          const density = inHead
            ? 0.6 + noise
            : 0.4 + Math.abs(Math.sin(ny * 3)) * 0.4 + noise;

          // Sub-sample — skip low density voxels to keep point count reasonable
          if (Math.random() > 0.35) continue;

          pos.push(nx * 1.1, ny * 1.1, nz * 0.9);
          dens.push(Math.max(0, Math.min(1, density)));
        }
      }
    }
    return { positions: new Float32Array(pos), densities: new Float32Array(dens) };
  }, []);

  // Build colors buffer — updated every frame based on stress
  const colors = useMemo(() => new Float32Array((positions.length / 3) * 3), [positions]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    timeRef.current = clock.getElapsedTime();

    const [sr, sg, sb] = stressToColor(stressScore);
    const pulse = 0.85 + Math.sin(timeRef.current * 2.5) * 0.15; // heartbeat pulse

    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      const d = densities[i];
      const glow = d * pulse;

      // Blend base tissue color (blue-grey) with stress color
      const t = (stressScore / 100) * 0.7 + d * 0.3;
      colors[i * 3 + 0] = (1 - t) * 0.2 + t * sr * glow;
      colors[i * 3 + 1] = (1 - t) * 0.5 + t * sg * glow;
      colors[i * 3 + 2] = (1 - t) * 0.9 + t * sb * glow;
    }

    const geom = meshRef.current.geometry;
    const colorAttr = geom.getAttribute('color') as THREE.BufferAttribute;
    colorAttr.needsUpdate = true;

    // Slow Y-axis rotation for volumetric scan effect
    meshRef.current.rotation.y = timeRef.current * 0.12;
  });

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [positions, colors]);

  if (!visible) return null;

  return (
    <points ref={meshRef} geometry={geometry} position={[0, 0, 0]}>
      <pointsMaterial
        size={0.045}
        vertexColors
        transparent
        opacity={0.75}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};
