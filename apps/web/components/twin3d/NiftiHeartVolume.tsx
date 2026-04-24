'use client';

/**
 * NiftiHeartVolume — Real Cardiac Mesh Renderer
 * ──────────────────────────────────────────────────────────────────────────────
 * Loads pre-baked triangle meshes from NIfTI segmentation:
 *   /heart/aorta_mesh.json
 *   /heart/coronary_arteries_mesh.json
 *   /heart/left_atrium_mesh.json
 *   /heart/left_ventricle_mesh.json
 *   /heart/myocardium_mesh.json
 *   /heart/pulmonary_artery_mesh.json
 *   /heart/right_atrium_mesh.json
 *   /heart/right_ventricle_mesh.json
 */

import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCardiacFrame, toCardiacT } from '../../lib/cardiacAnimator';

// ─── JSON mesh format ─────────────────────────────────────────────────────────
interface MeshJson {
  vertices: number[];
  normals:  number[];
  faces:    number[];
}

// ─── Build BufferGeometry ─────────────────────────────────────────────────────
async function loadMeshJson(url: string): Promise<THREE.BufferGeometry> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${url}`);
  const data: MeshJson = await resp.json();

  let geo = new THREE.BufferGeometry();
  const posArr = new Float32Array(data.vertices);
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(data.faces), 1));

  try {
    geo = mergeVertices(geo, 1e-4) as THREE.BufferGeometry;
  } catch { /* fall through */ }
  geo.computeVertexNormals();
  geo.normalizeNormals();

  return geo;
}

// ─── Stress → emissive colour ─────────────────────────────────────────────────
function stressEmissive(sf: number): THREE.Color {
  if (sf < 0.5) {
    const s = sf * 2;
    return new THREE.Color(s * 0.85, (1 - s) * 0.40 + s * 0.25, (1 - s) * 0.75);
  }
  const s = (sf - 0.5) * 2;
  return new THREE.Color(0.85 + s * 0.15, 0.25 * (1 - s * 0.85), 0);
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface NiftiHeartVolumeProps {
  stressScore:  number;
  heartRate:    number;
  spO2:         number;
  temperature:  number;
  clipPlane?:   THREE.Plane | null;
  showVessels?: boolean;
  visibleClasses?: Record<string, boolean>;
  opacity?: number;
  stenosisToolActive?: boolean;
  stenosisRadius?: number;
  stenosisIntensity?: number;
  resetSignal?: number;
  onStenosis?: (occlusion: number, wss: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const NiftiHeartVolume = ({
  stressScore,
  heartRate,
  spO2,
  temperature,
  clipPlane,
  showVessels = true,
  visibleClasses = {},
  opacity = 1.0,
  stenosisToolActive = false,
  stenosisRadius = 0.08,
  stenosisIntensity = 0.70,
  resetSignal = 0,
  onStenosis,
}: NiftiHeartVolumeProps) => {
  const [geometries, setGeometries] = useState<Record<string, THREE.BufferGeometry | null>>({});
  const [loading,    setLoading   ] = useState(true);
  const [error,      setError     ] = useState('');
  // Bounding-box centre of each segment — used to scale around the segment's
  // own geometric centroid instead of the world origin (prevents meshes from
  // sliding into each other during the cardiac cycle).
  const [centroids,  setCentroids ] = useState<Record<string, THREE.Vector3>>({});

  const groupRef   = useRef<THREE.Group>(null);

  // ── Per-segment animation refs (CardiacAnimator drives these) ─────────────
  const lvRef    = useRef<THREE.Group>(null);   // Left Ventricle
  const rvRef    = useRef<THREE.Group>(null);   // Right Ventricle
  const laRef    = useRef<THREE.Group>(null);   // Left Atrium
  const raRef    = useRef<THREE.Group>(null);   // Right Atrium
  const myoRef   = useRef<THREE.Group>(null);   // Myocardium wall
  const aortaRef = useRef<THREE.Group>(null);   // Aorta
  const paRef    = useRef<THREE.Group>(null);   // Pulmonary Artery
  const corRef   = useRef<THREE.Group>(null);   // Coronary Arteries

  // Materials that need to be updated on each frame
  const anatomyMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const vesselMats  = useRef<THREE.MeshStandardMaterial[]>([]);

  // Backup for stenosis revert
  const originalPos = useRef<Float32Array | null>(null);
  const originalColor = useRef<Float32Array | null>(null);

  // ── Load meshes on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    
    const parts = [
      'aorta', 'coronary_arteries', 'left_atrium', 'left_ventricle',
      'myocardium', 'pulmonary_artery', 'right_atrium', 'right_ventricle'
    ];
    
    Promise.all(parts.map(part => loadMeshJson(`/heart/${part}_mesh.json`)))
      .then(loaded => {
        if (!alive) return;
        const geos: Record<string, THREE.BufferGeometry> = {};
        parts.forEach((p, i) => {
          const geo = loaded[i];
          if (p === 'coronary_arteries') {
            const posAttr = geo.getAttribute('position');
            const count = posAttr.count;
            const colors = new Float32Array(count * 3);
            const c = new THREE.Color('#f032e6'); // Magenta
            for (let j = 0; j < count; j++) {
              colors[j * 3] = c.r;
              colors[j * 3 + 1] = c.g;
              colors[j * 3 + 2] = c.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            // Backup original state
            originalPos.current = new Float32Array(posAttr.array);
            originalColor.current = new Float32Array(colors);
          }
          geos[p] = geo;
        });
        setGeometries(geos);

        // Compute bounding-box centroid for every segment geometry.
        // These are static values derived from the NIfTI mesh positions.
        const comps: Record<string, THREE.Vector3> = {};
        Object.entries(geos).forEach(([key, geo]) => {
          geo.computeBoundingBox();
          const c = new THREE.Vector3();
          geo.boundingBox!.getCenter(c);
          comps[key] = c;
        });
        setCentroids(comps);

        setLoading(false);
      })
      .catch(e => {
        if (alive) { setError(String(e)); setLoading(false); }
      });
      
    return () => { alive = false; };
  }, []);

  // ── Handle Reset Signal ────────────────────────────────────────────────────
  useEffect(() => {
    if (resetSignal > 0 && geometries.coronary_arteries && originalPos.current && originalColor.current) {
      const geo = geometries.coronary_arteries;
      const pos = geo.getAttribute('position');
      const color = geo.getAttribute('color');

      pos.array.set(originalPos.current);
      if (color) color.array.set(originalColor.current);

      pos.needsUpdate = true;
      if (color) color.needsUpdate = true;
      geo.computeVertexNormals();
    }
  }, [resetSignal, geometries.coronary_arteries]);

  // ── Colors setup ───────────────────────────────────────────────────────────
  const lvColor      = useMemo(() => new THREE.Color('#e6194B'), []); // Red
  const rvColor      = useMemo(() => new THREE.Color('#4363d8'), []); // Blue
  const laColor      = useMemo(() => new THREE.Color('#f58231'), []); // Orange
  const raColor      = useMemo(() => new THREE.Color('#3cb44b'), []); // Green
  const myoColor     = useMemo(() => new THREE.Color('#ffe119'), []); // Yellow
  const aortaColor   = useMemo(() => new THREE.Color('#911eb4'), []); // Purple
  const pulmColor    = useMemo(() => new THREE.Color('#46f0f0'), []); // Cyan
  const vesselColor  = useMemo(() => new THREE.Color('#f032e6'), []); // Magenta

  // ── Animation loop ─────────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    // ── CardiacAnimator: per-segment scale + rotation ────────────────────────
    const ct    = toCardiacT(elapsed, heartRate);
    const frame = getCardiacFrame(ct);

    // Left Ventricle — scale + apical Z-torsion
    if (lvRef.current) {
      lvRef.current.scale.set(...frame.leftVentricle.scale);
      lvRef.current.rotation.z = frame.leftVentricle.rotation[2];
    }
    // Right Ventricle — scale + mild counter-twist
    if (rvRef.current) {
      rvRef.current.scale.set(...frame.rightVentricle.scale);
      rvRef.current.rotation.z = frame.rightVentricle.rotation[2];
    }
    // Left Atrium
    if (laRef.current) laRef.current.scale.set(...frame.leftAtrium.scale);
    // Right Atrium
    if (raRef.current) raRef.current.scale.set(...frame.rightAtrium.scale);
    // Myocardium — radial wall thickening
    if (myoRef.current) myoRef.current.scale.set(...frame.myocardium.scale);
    // Aorta — radial pressure-wave expansion
    if (aortaRef.current) aortaRef.current.scale.set(...frame.aorta.scale);
    // Pulmonary Artery — more compliant radial expansion
    if (paRef.current) paRef.current.scale.set(...frame.pulmonaryArtery.scale);
    // Coronaries — systolic compression → diastolic reactive hyperaemia
    if (corRef.current) corRef.current.scale.set(...frame.coronaries.scale);

    // ── Slow cinematic drift on the whole heart ──────────────────────────────
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(elapsed * 0.08) * 0.25;
      groupRef.current.rotation.z = Math.sin(elapsed * 0.05) * 0.04;
    }

    // ── Emissive material update ─────────────────────────────────────────────
    const sf   = stressScore / 100;
    const ox   = spO2 / 100;
    const tdev = Math.max(0, temperature - 36.5) / 3.0;

    // Emissive brightens at peak ventricular systole for a "glow" heartbeat effect
    const beatPulse = frame.phase === 'ventricularSystole'
      ? frame.phaseProgress * 0.20
      : 0;
    const emI = 0.10 + sf * 0.45 + tdev * 0.15 + beatPulse;

    anatomyMats.current.forEach(mat => {
      mat.emissive.copy(stressEmissive(sf));
      mat.emissiveIntensity = emI;
    });

    // Coronary vessels brighten during their diastolic reperfusion burst
    const oxy = ox * ox;
    const corPulse = frame.phase === 'diastole' && frame.phaseProgress < 0.35
      ? (frame.phaseProgress / 0.35) * 0.28
      : 0;
    vesselMats.current.forEach(mat => {
      mat.emissive.setRGB(0.55 * oxy + 0.10, 0.01, 0.02 + 0.25 * (1 - oxy));
      mat.emissiveIntensity = 0.18 + sf * 0.40 + corPulse;
    });
  });

  // ── Stenosis Pinch Tool ───────────────────────────────────────────────────
  const handleCoronaryClick = (e: any) => {
    if (!stenosisToolActive) return;
    e.stopPropagation();

    const pt = e.point;
    const normal = e.face?.normal;
    if (!normal) return;

    const worldNormal = normal.clone().transformDirection(e.object.matrixWorld).normalize();

    // Approximate center of vessel (assuming radius ~ 0.04)
    const worldCenter = pt.clone().sub(worldNormal.multiplyScalar(0.04));
    const localCenter = e.object.worldToLocal(worldCenter);
    const localPt = e.object.worldToLocal(pt.clone());

    const geo = geometries.coronary_arteries;
    if (!geo) return;
    const pos = geo.getAttribute('position');
    const color = geo.getAttribute('color');

    const radius = stenosisRadius;
    const pinchFactor = stenosisIntensity;

    const cStress = new THREE.Color('#ffff00'); // Yellow stress color

    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const d = v.distanceTo(localPt);

      if (d < radius) {
        // Falloff scales with the chosen radius
        const falloff = Math.exp(-(d * d) / (radius * radius * 0.25));
        const pinch = falloff * pinchFactor;

        const dir = localCenter.clone().sub(v);
        v.add(dir.multiplyScalar(pinch));
        pos.setXYZ(i, v.x, v.y, v.z);

        if (color) {
          const curC = new THREE.Color(color.getX(i), color.getY(i), color.getZ(i));
          const newC = curC.lerp(cStress, falloff);
          color.setXYZ(i, newC.r, newC.g, newC.b);
        }
      }
    }

    pos.needsUpdate = true;
    if (color) color.needsUpdate = true;
    geo.computeVertexNormals();

    if (onStenosis) {
      // Occlusion depends on pinch factor
      const baseOcclusion = stenosisIntensity * 100;
      const occlusion = Math.max(5, Math.floor(baseOcclusion + (Math.random() * 10 - 5))); 
      
      // WSS (Wall Shear Stress) typically increases non-linearly with stenosis.
      // Normal WSS is ~1-7 Pa. Severe stenosis can push it much higher.
      const wssBase = 2.5;
      const wssScale = Math.pow(1.5, (occlusion / 20)); // Exponential increase
      const wss = (wssBase + wssScale + Math.random() * 2).toFixed(1);
      
      onStenosis(occlusion, Number(wss));
    }
  };

  // ── Clip plane ────────────────────────────────────────────────────────────
  const clipProps = clipPlane
    ? { clippingPlanes: [clipPlane], clipShadows: true as const }
    : {};

  // ── Helper to register materials for animation ─────────────────────────────
  const registerAnatomyMat = (m: THREE.MeshStandardMaterial | null) => {
    if (m && !anatomyMats.current.includes(m)) anatomyMats.current.push(m);
  };
  const registerVesselMat = (m: THREE.MeshStandardMaterial | null) => {
    if (m && !vesselMats.current.includes(m)) vesselMats.current.push(m);
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <group>
        <mesh>
          <sphereGeometry args={[0.50, 20, 20]} />
          <meshBasicMaterial color="#0d2244" wireframe />
        </mesh>
        <mesh position={[0, 0.3, 0]} scale={[0.65, 0.55, 0.60]}>
          <sphereGeometry args={[0.50, 16, 16]} />
          <meshBasicMaterial color="#0a1a33" wireframe />
        </mesh>
      </group>
    );
  }

  if (error) {
    return (
      <mesh>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshBasicMaterial color="#cc2222" wireframe />
      </mesh>
    );
  }

  // Standard material props
  const matProps = {
    roughness: 0.55,
    metalness: 0.0,
    flatShading: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    transparent: opacity < 1.0,
    opacity: opacity,
    ...clipProps
  };

  const isVisible = (part: string) => visibleClasses[part] !== false;

  // ── Scale-around-centroid helpers ─────────────────────────────────────────
  // cg(key) → [cx, cy, cz]  — the group's world position (= segment centroid)
  // ci(key) → [-cx,-cy,-cz] — the mesh's local offset so its world pos = 0,0,0
  //
  // Math: group at (cx,cy,cz) scales its children around (cx,cy,cz).
  //       Mesh at local (-cx,-cy,-cz) renders at world (0,0,0) when scale=1.
  //       After group scale (sx,sy,sz):
  //         vertex_world = (cx,cy,cz) + (sx,sy,sz)*(v_local - 0)
  //                      = (cx*(1-sx)+sx*vx, ...)   ← scales around centroid ✓
  const cg = (key: string): [number, number, number] => {
    const c = centroids[key];
    return c ? [c.x, c.y, c.z] : [0, 0, 0];
  };
  const ci = (key: string): [number, number, number] => {
    const c = centroids[key];
    return c ? [-c.x, -c.y, -c.z] : [0, 0, 0];
  };

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>

      {/* ── MYOCARDIUM — wall thickens radially during systole ──────────────
           CardiacAnimator: scale [1.08,1.08,1.02] at peak systole.
           Group origin = myocardium mesh centroid → scales outward correctly. */}
      {isVisible('myocardium') && geometries.myocardium && (
        <group ref={myoRef} position={cg('myocardium')}>
          <mesh geometry={geometries.myocardium} position={ci('myocardium')} castShadow receiveShadow>
            <meshStandardMaterial ref={registerAnatomyMat} color={myoColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── LEFT VENTRICLE — scale [0.84,0.84,0.91] + −5.7° apical twist ───
           Centroid ≈ left-inferior of global origin → shrinks toward its own
           centre, not sliding across heart.                                 */}
      {isVisible('left_ventricle') && geometries.left_ventricle && (
        <group ref={lvRef} position={cg('left_ventricle')}>
          <mesh geometry={geometries.left_ventricle} position={ci('left_ventricle')} castShadow receiveShadow>
            <meshStandardMaterial ref={registerAnatomyMat} color={lvColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── RIGHT VENTRICLE — scale [0.87,0.87,0.93] + mild counter-twist ──*/}
      {isVisible('right_ventricle') && geometries.right_ventricle && (
        <group ref={rvRef} position={cg('right_ventricle')}>
          <mesh geometry={geometries.right_ventricle} position={ci('right_ventricle')} castShadow receiveShadow>
            <meshStandardMaterial ref={registerAnatomyMat} color={rvColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── LEFT ATRIUM — scale [0.91,0.91,0.91] during atrial systole ─────*/}
      {isVisible('left_atrium') && geometries.left_atrium && (
        <group ref={laRef} position={cg('left_atrium')}>
          <mesh geometry={geometries.left_atrium} position={ci('left_atrium')} castShadow receiveShadow>
            <meshStandardMaterial ref={registerAnatomyMat} color={laColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── RIGHT ATRIUM — scale [0.91,0.91,0.91] during atrial systole ────*/}
      {isVisible('right_atrium') && geometries.right_atrium && (
        <group ref={raRef} position={cg('right_atrium')}>
          <mesh geometry={geometries.right_atrium} position={ci('right_atrium')} castShadow receiveShadow>
            <meshStandardMaterial ref={registerAnatomyMat} color={raColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── AORTA — radial expansion [1.05,1.05,1.00] on pressure wave ─────*/}
      {isVisible('aorta') && geometries.aorta && (
        <group ref={aortaRef} position={cg('aorta')}>
          <mesh geometry={geometries.aorta} position={ci('aorta')} castShadow receiveShadow>
            <meshStandardMaterial ref={registerAnatomyMat} color={aortaColor} {...matProps} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* ── PULMONARY ARTERY — more compliant radial [1.07,1.07,1.00] ──────*/}
      {isVisible('pulmonary_artery') && geometries.pulmonary_artery && (
        <group ref={paRef} position={cg('pulmonary_artery')}>
          <mesh geometry={geometries.pulmonary_artery} position={ci('pulmonary_artery')} castShadow receiveShadow>
            <meshStandardMaterial ref={registerAnatomyMat} color={pulmColor} {...matProps} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* ── CORONARIES — systolic compression [0.94] → diastolic burst [1.03]
           Coronaries have a fine tubular mesh — subtle scale is very visible. */}
      {showVessels && isVisible('coronary_arteries') && geometries.coronary_arteries && (
        <group ref={corRef} position={cg('coronary_arteries')}>
          <mesh
            geometry={geometries.coronary_arteries}
            position={ci('coronary_arteries')}
            castShadow
            onClick={stenosisToolActive ? handleCoronaryClick : undefined}
            onPointerOver={(e: any) => {
              if (stenosisToolActive) {
                e.stopPropagation();
                document.body.style.cursor = 'crosshair';
              }
            }}
            onPointerOut={(e: any) => {
              if (stenosisToolActive) {
                e.stopPropagation();
                document.body.style.cursor = 'auto';
              }
            }}
          >
            <meshStandardMaterial
              ref={registerVesselMat}
              color="#ffffff"
              vertexColors={true}
              roughness={0.35}
              metalness={0.05}
              flatShading={false}
              side={THREE.FrontSide}
              transparent={opacity < 1.0}
              opacity={opacity}
              {...clipProps}
            />
          </mesh>
        </group>
      )}
    </group>
  );
};