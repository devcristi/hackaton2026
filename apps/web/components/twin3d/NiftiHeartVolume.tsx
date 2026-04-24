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

  const groupRef   = useRef<THREE.Group>(null);
  
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
  const bps = heartRate / 60;

  useFrame(({ clock }) => {
    const t     = clock.getElapsedTime();
    const phase = (t * bps) % 1.0;

    // Heart beat eliminated (systole = 0)
    const systole = 0;
    const pulseScale = 1.0;

    if (groupRef.current) {
      groupRef.current.scale.setScalar(pulseScale);
      groupRef.current.rotation.y = 0;
      groupRef.current.rotation.z = 0;
    }

    const sf    = stressScore / 100;
    const ox    = spO2 / 100;
    const tdev  = Math.max(0, temperature - 36.5) / 3.0;
    const emI   = 0.10 + sf * 0.45 + tdev * 0.15 + systole * 0.15;

    // Update standard anatomy materials
    anatomyMats.current.forEach(mat => {
      mat.emissive.copy(stressEmissive(sf));
      mat.emissiveIntensity = emI;
    });

    // Update vessel materials (coronaries)
    const oxy = ox * ox;
    vesselMats.current.forEach(mat => {
      // Base color remains distinct, just pulse the emissive based on oxygenation/stress
      mat.emissive.setRGB(0.55 * oxy + 0.10, 0.01, 0.02 + 0.25 * (1 - oxy));
      mat.emissiveIntensity = 0.18 + sf * 0.40 + systole * 0.22;
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

  const isVisible = (part: string) => {
    return visibleClasses[part] !== false; // true by default
  };

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>
      
      {/* Myocardium */}
      {isVisible('myocardium') && geometries.myocardium && (
        <mesh geometry={geometries.myocardium} castShadow receiveShadow>
          <meshStandardMaterial ref={registerAnatomyMat} color={myoColor} {...matProps} />
        </mesh>
      )}

      {/* Left Ventricle */}
      {isVisible('left_ventricle') && geometries.left_ventricle && (
        <mesh geometry={geometries.left_ventricle} castShadow receiveShadow>
          <meshStandardMaterial ref={registerAnatomyMat} color={lvColor} {...matProps} />
        </mesh>
      )}

      {/* Right Ventricle */}
      {isVisible('right_ventricle') && geometries.right_ventricle && (
        <mesh geometry={geometries.right_ventricle} castShadow receiveShadow>
          <meshStandardMaterial ref={registerAnatomyMat} color={rvColor} {...matProps} />
        </mesh>
      )}

      {/* Left Atrium */}
      {isVisible('left_atrium') && geometries.left_atrium && (
        <mesh geometry={geometries.left_atrium} castShadow receiveShadow>
          <meshStandardMaterial ref={registerAnatomyMat} color={laColor} {...matProps} />
        </mesh>
      )}

      {/* Right Atrium */}
      {isVisible('right_atrium') && geometries.right_atrium && (
        <mesh geometry={geometries.right_atrium} castShadow receiveShadow>
          <meshStandardMaterial ref={registerAnatomyMat} color={raColor} {...matProps} />
        </mesh>
      )}

      {/* Aorta */}
      {isVisible('aorta') && geometries.aorta && (
        <mesh geometry={geometries.aorta} castShadow receiveShadow>
          <meshStandardMaterial ref={registerAnatomyMat} color={aortaColor} {...matProps} roughness={0.3} />
        </mesh>
      )}

      {/* Pulmonary Artery */}
      {isVisible('pulmonary_artery') && geometries.pulmonary_artery && (
        <mesh geometry={geometries.pulmonary_artery} castShadow receiveShadow>
          <meshStandardMaterial ref={registerAnatomyMat} color={pulmColor} {...matProps} roughness={0.3} />
        </mesh>
      )}

      {/* Coronary Arteries */}
      {showVessels && isVisible('coronary_arteries') && geometries.coronary_arteries && (
        <mesh
          geometry={geometries.coronary_arteries}
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
      )}
    </group>
  );
};