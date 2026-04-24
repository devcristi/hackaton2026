'use client';

/**
 * CoronaryArteries.tsx
 * Renders the 4 major coronary vessel trees (RCA, LAD, LCX, PDA + diagonal)
 * using TubeGeometry + custom GLSL shader that animates blood flow.
 *
 * SpO2 affects oxygenation brightness; heartRate affects flow speed.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── GLSL shaders ────────────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader producing discrete RBC (red blood cell) boluses
 * separated by brighter plasma, all flowing along the tube axis.
 *
 * vUv.x = 0..1 along tube length  (longitudinal)
 * vUv.y = 0..1 around tube cross-section (circumferential, 0=bottom 1=top)
 */
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;       // cells per second
  uniform float uCellDensity; // cells per UV unit
  uniform vec3  uColorRBC;    // oxygenated RBC (bright arterial red)
  uniform vec3  uColorPlasma; // plasma (dark venous / translucent)
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    // ── Flow animation ────────────────────────────────────────────────
    float along = fract(vUv.x * uCellDensity - uTime * uSpeed);

    // Smooth cell profile:  gap(0-0.15) → leading edge → cell body → trailing → gap
    float cell = smoothstep(0.10, 0.28, along) * smoothstep(0.68, 0.50, along);

    // ── Cross-section shading ─────────────────────────────────────────
    float cs       = vUv.y * 2.0 - 1.0;           // -1 .. +1
    float tubeRim  = 1.0 - cs * cs;               // parabolic bell
    tubeRim        = max(0.0, pow(tubeRim, 0.45));

    // Specular highlight on upper-left rim (medical HUD look)
    float spec = pow(max(0.0, 1.0 - abs(cs + 0.45) * 3.0), 3.0) * 0.45;

    // ── Compose ───────────────────────────────────────────────────────
    vec3 col    = mix(uColorPlasma, uColorRBC, cell) * tubeRim;
    col        += spec;

    float alpha = tubeRim * mix(0.40, 0.92, cell) * uOpacity;

    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface VesselDef {
  name:   string;
  points: [number, number, number][];
  radius: number;          // tube radius in scene units
  cellDensity: number;     // # of cells visible per unit tube length
  speed:  number;          // base flow speed multiplier
}

// ─── Vessel definitions (coordinates relative to heart centroid at origin) ───
//
// All paths are anatomically approximate for the hackathon demo:
// - RCA  : right atrioventricular groove → posterior
// - LAD  : anterior interventricular groove → apex
// - LCX  : left AV groove → posterolateral
// - PDA  : posterior interventricular groove (from RCA crux)
// - Diag : diagonal branch off LAD → lateral LV

const VESSEL_DEFS: VesselDef[] = [
  {
    name: 'RCA',
    points: [
      [ 0.14,  0.70,  0.05],
      [ 0.46,  0.44,  0.10],
      [ 0.62,  0.12,  0.04],
      [ 0.60, -0.22, -0.06],
      [ 0.46, -0.50, -0.16],
      [ 0.18, -0.65, -0.26],
      [-0.04, -0.60, -0.32],
    ],
    radius:      0.032,
    cellDensity: 6,
    speed:       1.0,
  },
  {
    name: 'LAD',
    points: [
      [-0.04,  0.72,  0.08],
      [-0.10,  0.54,  0.32],
      [-0.13,  0.26,  0.54],
      [-0.14, -0.04,  0.56],
      [-0.14, -0.30,  0.51],
      [-0.10, -0.56,  0.36],
      [-0.04, -0.68,  0.14],
    ],
    radius:      0.030,
    cellDensity: 6,
    speed:       1.0,
  },
  {
    name: 'LCX',
    points: [
      [-0.04,  0.72,  0.08],
      [-0.22,  0.60,  0.18],
      [-0.52,  0.34,  0.04],
      [-0.64,  0.08, -0.12],
      [-0.56, -0.22, -0.28],
      [-0.36, -0.46, -0.36],
    ],
    radius:      0.026,
    cellDensity: 5,
    speed:       0.95,
  },
  {
    name: 'PDA',
    points: [
      [ 0.10, -0.58, -0.32],
      [ 0.00, -0.62, -0.36],
      [-0.10, -0.64, -0.36],
      [-0.20, -0.63, -0.32],
      [-0.28, -0.60, -0.26],
    ],
    radius:      0.020,
    cellDensity: 5,
    speed:       0.90,
  },
  {
    name: 'Diagonal',
    points: [
      [-0.13,  0.10,  0.53],
      [-0.28,  0.04,  0.47],
      [-0.46, -0.06,  0.36],
      [-0.52, -0.16,  0.22],
    ],
    radius:      0.018,
    cellDensity: 4,
    speed:       0.85,
  },
];

// ─── Uniforms factory ─────────────────────────────────────────────────────────

function makeUniforms(spO2: number, speed: number, cellDensity: number) {
  // SpO2 98% → bright arterial red; 85% → dull dark red
  const oxygenation = Math.min(1, Math.max(0, (spO2 - 85) / 15));
  const rbc   = new THREE.Color().lerpColors(
    new THREE.Color(0.45, 0.02, 0.02),   // de-oxygenated (dark)
    new THREE.Color(0.95, 0.08, 0.08),   // oxygenated (bright)
    oxygenation,
  );
  const plasma = new THREE.Color(0.20, 0.01, 0.01);

  return {
    uTime:        { value: 0 },
    uSpeed:       { value: speed },
    uCellDensity: { value: cellDensity },
    uColorRBC:    { value: rbc },
    uColorPlasma: { value: plasma },
    uOpacity:     { value: 0.88 },
  };
}

// ─── Single vessel component ──────────────────────────────────────────────────

interface VesselProps {
  def:         VesselDef;
  spO2:        number;
  heartRate:   number;
  vesselScale: number;                  // 0.2 = stenosis … 2.0 = dilation
  clipPlane:   THREE.Plane | null;
}

const Vessel = ({ def, spO2, heartRate, vesselScale, clipPlane }: VesselProps) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  // CatmullRom curve through control points
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(
      def.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false, 'catmullrom', 0.5,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const tubeGeo = useMemo(
    () => new THREE.TubeGeometry(curve, 64, def.radius * vesselScale, 10, false),
    [curve, def.radius, vesselScale],
  );

  const uniforms = useMemo(
    () => makeUniforms(spO2, def.speed * (heartRate / 60), def.cellDensity),
    // Recreate only when spO2 / heartRate change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spO2, heartRate],
  );

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <mesh geometry={tubeGeo}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        clippingPlanes={clipPlane ? [clipPlane] : []}
        clipShadows
      />
    </mesh>
  );
};

// ─── Public component ─────────────────────────────────────────────────────────

export interface CoronaryArteriesProps {
  spO2:        number;               // 85–100 — affects blood colour
  heartRate:   number;               // bpm   — affects flow speed
  vesselScale: number;               // 0.2 stenosis … 2.0 dilation (1.0 = normal)
  clipPlane:   THREE.Plane | null;   // active cutting plane (null = no clip)
}

export const CoronaryArteries = ({ spO2, heartRate, vesselScale, clipPlane }: CoronaryArteriesProps) => (
  <group>
    {VESSEL_DEFS.map((def) => (
      <Vessel
        key={def.name}
        def={def}
        spO2={spO2}
        heartRate={heartRate}
        vesselScale={vesselScale}
        clipPlane={clipPlane}
      />
    ))}
  </group>
);
