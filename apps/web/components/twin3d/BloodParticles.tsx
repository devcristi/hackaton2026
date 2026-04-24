'use client';

/**
 * BloodParticles.tsx
 * GPU-efficient particle system: blood cells (RBCs) traveling along the same
 * CatmullRomCurve3 paths used by CoronaryArteries.
 *
 * Each particle:
 *  - Has a t ∈ [0, 1] offset on its vessel curve
 *  - Advances t by (speed × delta) each frame, wrapping at 1
 *  - Uses a custom GLSL PointsMaterial for biconcave-disc appearance
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Particle shaders ────────────────────────────────────────────────────────

const particleVertex = /* glsl */ `
  attribute float aSize;

  uniform float uPixelRatio;

  void main() {
    vec4 mvPos    = modelViewMatrix * vec4(position, 1.0);
    // Perspective size attenuation — looks natural in 3-space
    gl_PointSize  = aSize * uPixelRatio * (220.0 / -mvPos.z);
    gl_Position   = projectionMatrix * mvPos;
  }
`;

const particleFragment = /* glsl */ `
  uniform vec3  uColorCenter; // brighter RBC disc
  uniform vec3  uColorRim;    // slightly darker rim
  uniform float uOpacity;

  void main() {
    // gl_PointCoord: 0..1 in both axes, origin top-left
    vec2  uv = gl_PointCoord * 2.0 - 1.0;  // -1..+1
    float r  = dot(uv, uv);                 // radial distance²

    // Discard outside circle
    if (r > 1.0) discard;

    // Biconcave disc: bright at rim, dimmer in centre (classic RBC look)
    float disc    = 1.0 - smoothstep(0.30, 0.72, r);   // central depression
    float rim     = smoothstep(0.55, 0.90, r);          // bright rim
    float edge    = 1.0 - smoothstep(0.88, 1.00, r);   // soft outer edge

    vec3  col     = mix(uColorCenter * (0.5 + disc * 0.5), uColorRim * 1.3, rim);
    float alpha   = edge * (0.55 + rim * 0.45) * uOpacity;

    gl_FragColor  = vec4(col, alpha);
  }
`;

// ─── Vessel curve definitions (must match CoronaryArteries.tsx) ───────────────

const VESSEL_POINTS: [number, number, number][][] = [
  // RCA
  [[ 0.14,  0.70,  0.05],[ 0.46,  0.44,  0.10],[ 0.62,  0.12,  0.04],
   [ 0.60, -0.22, -0.06],[ 0.46, -0.50, -0.16],[ 0.18, -0.65, -0.26],[-0.04, -0.60, -0.32]],
  // LAD
  [[-0.04,  0.72,  0.08],[-0.10,  0.54,  0.32],[-0.13,  0.26,  0.54],
   [-0.14, -0.04,  0.56],[-0.14, -0.30,  0.51],[-0.10, -0.56,  0.36],[-0.04, -0.68,  0.14]],
  // LCX
  [[-0.04,  0.72,  0.08],[-0.22,  0.60,  0.18],[-0.52,  0.34,  0.04],
   [-0.64,  0.08, -0.12],[-0.56, -0.22, -0.28],[-0.36, -0.46, -0.36]],
  // PDA
  [[ 0.10, -0.58, -0.32],[ 0.00, -0.62, -0.36],[-0.10, -0.64, -0.36],
   [-0.20, -0.63, -0.32],[-0.28, -0.60, -0.26]],
  // Diagonal
  [[-0.13,  0.10,  0.53],[-0.28,  0.04,  0.47],[-0.46, -0.06,  0.36],[-0.52, -0.16,  0.22]],
];

// #particles per vessel (approx 1 particle per ~0.04 arc length)
const VESSEL_COUNTS = [42, 52, 36, 26, 20];

// Per-vessel base flow speed (fraction of curve length per second)
const VESSEL_SPEEDS = [0.18, 0.22, 0.17, 0.16, 0.15];

// ─── Build particle metadata ──────────────────────────────────────────────────

interface Particle {
  curveIdx: number;
  t:        number;   // current fractional position on curve
  speed:    number;   // individual speed variation
  size:     number;   // radius variation
}

function buildParticles(): Particle[] {
  const particles: Particle[] = [];
  VESSEL_COUNTS.forEach((count, vi) => {
    for (let i = 0; i < count; i++) {
      particles.push({
        curveIdx: vi,
        t:        i / count,                          // evenly spread
        speed:    VESSEL_SPEEDS[vi] * (0.85 + Math.random() * 0.30),
        size:     0.9 + Math.random() * 0.55,
      });
    }
  });
  return particles;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface BloodParticlesProps {
  spO2:      number;  // 85–100 — affects RBC colour
  heartRate: number;  // bpm    — scales flow speed globally
}

export const BloodParticles = ({ spO2, heartRate }: BloodParticlesProps) => {
  const pointsRef = useRef<THREE.Points>(null);

  // Build CatmullRom curves once
  const curves = useMemo(
    () => VESSEL_POINTS.map(
      (pts) => new THREE.CatmullRomCurve3(
        pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        false, 'catmullrom', 0.5,
      ),
    ),
    [],
  );

  // Particle metadata — stable reference
  const particles = useMemo(buildParticles, []);

  const totalCount = particles.length;

  // BufferGeometry with mutable positions
  const geometry = useMemo(() => {
    const geo      = new THREE.BufferGeometry();
    const pos      = new Float32Array(totalCount * 3);
    const sizes    = new Float32Array(totalCount);

    particles.forEach((p, i) => {
      const pt = curves[p.curveIdx].getPoint(p.t);
      pos[i * 3]     = pt.x;
      pos[i * 3 + 1] = pt.y;
      pos[i * 3 + 2] = pt.z;
      sizes[i]       = p.size;
    });

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
    return geo;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // built once — positions mutated by ref each frame

  // Oxygenation colours
  const { centerColor, rimColor } = useMemo(() => {
    const oxy = Math.min(1, Math.max(0, (spO2 - 85) / 15));
    return {
      centerColor: new THREE.Color().lerpColors(
        new THREE.Color(0.30, 0.01, 0.01),  // de-oxygenated centre
        new THREE.Color(0.88, 0.05, 0.05),  // oxygenated centre
        oxy,
      ),
      rimColor: new THREE.Color().lerpColors(
        new THREE.Color(0.55, 0.03, 0.04),
        new THREE.Color(1.00, 0.18, 0.12),
        oxy,
      ),
    };
  }, [spO2]);

  const uniforms = useMemo(() => ({
    uColorCenter: { value: centerColor },
    uColorRim:    { value: rimColor },
    uOpacity:     { value: 0.82 },
    uPixelRatio:  { value: typeof window !== 'undefined' ? window.devicePixelRatio : 1 },
  }), [centerColor, rimColor]);

  // Global speed: scaled by heartRate (more beats → faster flow)
  const globalSpeed = heartRate / 60;

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr     = posAttr.array as Float32Array;

    particles.forEach((p, i) => {
      p.t += p.speed * globalSpeed * delta;
      if (p.t > 1) p.t -= 1;

      const pt      = curves[p.curveIdx].getPoint(p.t);
      arr[i * 3]     = pt.x;
      arr[i * 3 + 1] = pt.y;
      arr[i * 3 + 2] = pt.z;
    });

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={particleVertex}
        fragmentShader={particleFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
