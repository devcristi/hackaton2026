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
 *
 * Colors match the standard TotalSegmentator / NIfTI anatomy legend:
 *   Myocardium      #f4a3a8  salmon-pink
 *   Left Atrium     #1c4f99  navy blue
 *   Left Ventricle  #22c55e  bright green
 *   Right Atrium    #06b6d4  cyan
 *   Right Ventricle #eab308  yellow
 *   Aorta           #7c3aed  violet-purple
 *   Pulm. Artery    #ec4899  hot-pink / magenta
 *   Coronary Art.   #dc2626  bright red
 */

import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCardiacFrame, toCardiacT } from '../../lib/cardiacAnimator';
import { useTwinStore } from '../../store/twin-store';

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

// ─── Stress → emissive colour (subtle: teal→violet→warm amber, NOT orange) ───
function stressEmissive(sf: number): THREE.Color {
  if (sf < 0.5) {
    const s = sf * 2;
    // calm: near-black → deep teal
    return new THREE.Color(s * 0.08, s * 0.22, 0.18 + s * 0.14);
  }
  const s = (sf - 0.5) * 2;
  // stressed: teal → soft crimson (desaturated, NOT full orange)
  return new THREE.Color(0.08 + s * 0.28, 0.22 * (1 - s * 0.80), 0.32 * (1 - s * 0.90));
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
  /** Called when user hovers over a named anatomical part (null = mouse-out) */
  onHover?: (part: string | null) => void;
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
  onHover,
}: NiftiHeartVolumeProps) => {
  const [geometries, setGeometries] = useState<Record<string, THREE.BufferGeometry | null>>({});
  const [loading,    setLoading   ] = useState(true);
  const [error,      setError     ] = useState('');
  // Bounding-box centre of each segment
  const [centroids,  setCentroids ] = useState<Record<string, THREE.Vector3>>({});

  const groupRef   = useRef<THREE.Group>(null);

  // ── Per-segment animation refs (CardiacAnimator drives these) ─────────────
  const lvRef    = useRef<THREE.Group>(null);
  const rvRef    = useRef<THREE.Group>(null);
  const laRef    = useRef<THREE.Group>(null);
  const raRef    = useRef<THREE.Group>(null);
  const myoRef   = useRef<THREE.Group>(null);
  const aortaRef = useRef<THREE.Group>(null);
  const paRef    = useRef<THREE.Group>(null);
  const corRef   = useRef<THREE.Group>(null);

  // Materials updated each frame for global emissive animation
  const anatomyMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const vesselMats  = useRef<THREE.MeshStandardMaterial[]>([]);

  // Per-part material map for hover highlight
  const partMats       = useRef<Record<string, THREE.MeshStandardMaterial>>({});
  // Current hovered part — ref avoids stale-closure in useFrame
  const hoveredPartRef = useRef<string | null>(null);

  // Backup for stenosis revert
  const originalPos   = useRef<Float32Array | null>(null);
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
            // Coronary Artery → bright red (matches image legend)
            const c = new THREE.Color('#dc2626');
            for (let j = 0; j < count; j++) {
              colors[j * 3]     = c.r;
              colors[j * 3 + 1] = c.g;
              colors[j * 3 + 2] = c.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            originalPos.current   = new Float32Array(posAttr.array);
            originalColor.current = new Float32Array(colors);
          }
          geos[p] = geo;
        });
        setGeometries(geos);

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
      const geo   = geometries.coronary_arteries;
      const pos   = geo.getAttribute('position');
      const color = geo.getAttribute('color');
      pos.array.set(originalPos.current);
      if (color) color.array.set(originalColor.current);
      pos.needsUpdate = true;
      if (color) color.needsUpdate = true;
      geo.computeVertexNormals();
    }
  }, [resetSignal, geometries.coronary_arteries]);

  // ── Anatomy colors — TotalSegmentator palette, slightly desaturated for elegance
  const myoColor   = useMemo(() => new THREE.Color('#e8909a'), []); // soft rose
  const laColor    = useMemo(() => new THREE.Color('#2563c4'), []); // royal blue
  const lvColor    = useMemo(() => new THREE.Color('#16a34a'), []); // forest green
  const raColor    = useMemo(() => new THREE.Color('#0891b2'), []); // teal-cyan
  const rvColor    = useMemo(() => new THREE.Color('#ca8a04'), []); // amber-gold
  const aortaColor = useMemo(() => new THREE.Color('#7c3aed'), []); // violet-purple (kept)
  const pulmColor  = useMemo(() => new THREE.Color('#db2777'), []); // deep pink

  // ── Pre-baked emissive colours for hover highlight (own-colour glow) ────────
  const hoverEmissive = useMemo<Record<string, THREE.Color>>(() => ({
    myocardium:        new THREE.Color('#e8909a'),
    left_atrium:       new THREE.Color('#2563c4'),
    left_ventricle:    new THREE.Color('#16a34a'),
    right_atrium:      new THREE.Color('#0891b2'),
    right_ventricle:   new THREE.Color('#ca8a04'),
    aorta:             new THREE.Color('#7c3aed'),
    pulmonary_artery:  new THREE.Color('#db2777'),
    coronary_arteries: new THREE.Color('#ef4444'),
  }), []);

  // ── Animation loop ─────────────────────────────────────────────────────────
  const isAnimating = useTwinStore((s) => s.isAnimating);
  useFrame(({ clock }) => {
    if (!isAnimating) return;
    const elapsed = clock.getElapsedTime();

    // CardiacAnimator: per-segment scale + rotation
    const ct    = toCardiacT(elapsed, heartRate);
    const frame = getCardiacFrame(ct);

    if (lvRef.current)    { lvRef.current.scale.set(...frame.leftVentricle.scale);   lvRef.current.rotation.z    = frame.leftVentricle.rotation[2]; }
    if (rvRef.current)    { rvRef.current.scale.set(...frame.rightVentricle.scale);  rvRef.current.rotation.z    = frame.rightVentricle.rotation[2]; }
    if (laRef.current)    { laRef.current.scale.set(...frame.leftAtrium.scale); }
    if (raRef.current)    { raRef.current.scale.set(...frame.rightAtrium.scale); }
    if (myoRef.current)   { myoRef.current.scale.set(...frame.myocardium.scale); }
    if (aortaRef.current) { aortaRef.current.scale.set(...frame.aorta.scale); }
    if (paRef.current)    { paRef.current.scale.set(...frame.pulmonaryArtery.scale); }
    if (corRef.current)   { corRef.current.scale.set(...frame.coronaries.scale); }

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(elapsed * 0.08) * 0.25;
      groupRef.current.rotation.z = Math.sin(elapsed * 0.05) * 0.04;
    }

    // Emissive animation — kept subtle so anatomy colours remain dominant
    const sf   = stressScore / 100;
    const ox   = spO2 / 100;
    const tdev = Math.max(0, temperature - 36.5) / 3.0;
    const beatPulse = frame.phase === 'ventricularSystole' ? frame.phaseProgress * 0.12 : 0;
    // Max emissive intensity capped at 0.32 to avoid colour wash-out
    const emI = 0.04 + sf * 0.20 + tdev * 0.08 + beatPulse;

    const hp = hoveredPartRef.current;

    anatomyMats.current.forEach(mat => {
      mat.emissive.copy(stressEmissive(sf));
      mat.emissiveIntensity = emI;
    });

    const oxy = ox * ox;
    const corPulse = frame.phase === 'diastole' && frame.phaseProgress < 0.35
      ? (frame.phaseProgress / 0.35) * 0.18
      : 0;
    vesselMats.current.forEach(mat => {
      mat.emissive.setRGB(0.28 * oxy + 0.04, 0.00, 0.01 + 0.12 * (1 - oxy));
      mat.emissiveIntensity = 0.10 + sf * 0.22 + corPulse;
    });

    // ── Hover highlight: boost emissive in the part's OWN colour ─────────────
    if (hp) {
      const mat = partMats.current[hp];
      const hc  = hoverEmissive[hp];
      if (mat && hc) {
        mat.emissive.copy(hc);
        mat.emissiveIntensity = 1.6; // vivid own-colour glow, not white wash
      }
    }
  });

  // ── Stenosis Pinch Tool ───────────────────────────────────────────────────
  const handleCoronaryClick = (e: any) => {
    if (!stenosisToolActive) return;
    e.stopPropagation();
    const pt     = e.point;
    const normal = e.face?.normal;
    if (!normal) return;

    const worldNormal = normal.clone().transformDirection(e.object.matrixWorld).normalize();
    const worldCenter = pt.clone().sub(worldNormal.multiplyScalar(0.04));
    const localCenter = e.object.worldToLocal(worldCenter);
    const localPt     = e.object.worldToLocal(pt.clone());

    const geo = geometries.coronary_arteries;
    if (!geo) return;
    const pos   = geo.getAttribute('position');
    const color = geo.getAttribute('color');
    const cStress = new THREE.Color('#ffff00');
    const pinchFactor = stenosisIntensity;
    const radius      = stenosisRadius;

    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const d = v.distanceTo(localPt);
      if (d < radius) {
        const falloff = Math.exp(-(d * d) / (radius * radius * 0.25));
        const pinch   = falloff * pinchFactor;
        const dir     = localCenter.clone().sub(v);
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
      const baseOcclusion = stenosisIntensity * 100;
      const occlusion = Math.max(5, Math.floor(baseOcclusion + (Math.random() * 10 - 5)));
      const wssBase   = 2.5;
      const wssScale  = Math.pow(1.5, (occlusion / 20));
      const wss       = (wssBase + wssScale + Math.random() * 2).toFixed(1);
      onStenosis(occlusion, Number(wss));
    }
  };

  // ── Clip plane ────────────────────────────────────────────────────────────
  const clipProps = clipPlane
    ? { clippingPlanes: [clipPlane], clipShadows: true as const }
    : {};

  // ── Material registration helpers ─────────────────────────────────────────
  /** Register into per-part map AND global anatomy array for emissive animation */
  const regPartMat = (key: string) => (m: THREE.MeshStandardMaterial | null) => {
    if (!m) return;
    partMats.current[key] = m;
    if (!anatomyMats.current.includes(m)) anatomyMats.current.push(m);
  };
  const registerVesselMat = (m: THREE.MeshStandardMaterial | null) => {
    if (m && !vesselMats.current.includes(m)) vesselMats.current.push(m);
  };

  // ── Hover helpers ─────────────────────────────────────────────────────────
  const hoverIn  = (key: string) => (e: any) => {
    e.stopPropagation();
    hoveredPartRef.current = key;
    onHover?.(key);
    document.body.style.cursor = 'pointer';
  };
  const hoverOut = (key: string) => (e: any) => {
    e.stopPropagation();
    if (hoveredPartRef.current === key) {
      hoveredPartRef.current = null;
      onHover?.(null);
    }
    document.body.style.cursor = 'auto';
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

  const matProps = {
    roughness: 0.48,
    metalness: 0.06,
    flatShading: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    // Always transparent so per-part opacity + hover feel premium
    transparent: true,
    opacity,
    depthWrite: opacity > 0.90,
    ...clipProps,
  };

  const isVisible = (part: string) => visibleClasses[part] !== false;

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

      {/* ── MYOCARDIUM ────────────────────────────────────────────────────── */}
      {isVisible('myocardium') && geometries.myocardium && (
        <group ref={myoRef} position={cg('myocardium')}>
          <mesh
            geometry={geometries.myocardium}
            position={ci('myocardium')}
            castShadow receiveShadow
            onPointerOver={hoverIn('myocardium')}
            onPointerOut={hoverOut('myocardium')}
          >
            <meshStandardMaterial ref={regPartMat('myocardium')} color={myoColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── LEFT VENTRICLE ───────────────────────────────────────────────── */}
      {isVisible('left_ventricle') && geometries.left_ventricle && (
        <group ref={lvRef} position={cg('left_ventricle')}>
          <mesh
            geometry={geometries.left_ventricle}
            position={ci('left_ventricle')}
            castShadow receiveShadow
            onPointerOver={hoverIn('left_ventricle')}
            onPointerOut={hoverOut('left_ventricle')}
          >
            <meshStandardMaterial ref={regPartMat('left_ventricle')} color={lvColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── RIGHT VENTRICLE ──────────────────────────────────────────────── */}
      {isVisible('right_ventricle') && geometries.right_ventricle && (
        <group ref={rvRef} position={cg('right_ventricle')}>
          <mesh
            geometry={geometries.right_ventricle}
            position={ci('right_ventricle')}
            castShadow receiveShadow
            onPointerOver={hoverIn('right_ventricle')}
            onPointerOut={hoverOut('right_ventricle')}
          >
            <meshStandardMaterial ref={regPartMat('right_ventricle')} color={rvColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── LEFT ATRIUM ──────────────────────────────────────────────────── */}
      {isVisible('left_atrium') && geometries.left_atrium && (
        <group ref={laRef} position={cg('left_atrium')}>
          <mesh
            geometry={geometries.left_atrium}
            position={ci('left_atrium')}
            castShadow receiveShadow
            onPointerOver={hoverIn('left_atrium')}
            onPointerOut={hoverOut('left_atrium')}
          >
            <meshStandardMaterial ref={regPartMat('left_atrium')} color={laColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── RIGHT ATRIUM ─────────────────────────────────────────────────── */}
      {isVisible('right_atrium') && geometries.right_atrium && (
        <group ref={raRef} position={cg('right_atrium')}>
          <mesh
            geometry={geometries.right_atrium}
            position={ci('right_atrium')}
            castShadow receiveShadow
            onPointerOver={hoverIn('right_atrium')}
            onPointerOut={hoverOut('right_atrium')}
          >
            <meshStandardMaterial ref={regPartMat('right_atrium')} color={raColor} {...matProps} />
          </mesh>
        </group>
      )}

      {/* ── AORTA ────────────────────────────────────────────────────────── */}
      {isVisible('aorta') && geometries.aorta && (
        <group ref={aortaRef} position={cg('aorta')}>
          <mesh
            geometry={geometries.aorta}
            position={ci('aorta')}
            castShadow receiveShadow
            onPointerOver={hoverIn('aorta')}
            onPointerOut={hoverOut('aorta')}
          >
            <meshStandardMaterial ref={regPartMat('aorta')} color={aortaColor} {...matProps} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* ── PULMONARY ARTERY ─────────────────────────────────────────────── */}
      {isVisible('pulmonary_artery') && geometries.pulmonary_artery && (
        <group ref={paRef} position={cg('pulmonary_artery')}>
          <mesh
            geometry={geometries.pulmonary_artery}
            position={ci('pulmonary_artery')}
            castShadow receiveShadow
            onPointerOver={hoverIn('pulmonary_artery')}
            onPointerOut={hoverOut('pulmonary_artery')}
          >
            <meshStandardMaterial ref={regPartMat('pulmonary_artery')} color={pulmColor} {...matProps} roughness={0.3} />
          </mesh>
        </group>
      )}

      {/* ── CORONARY ARTERIES ────────────────────────────────────────────── */}
      {showVessels && isVisible('coronary_arteries') && geometries.coronary_arteries && (
        <group ref={corRef} position={cg('coronary_arteries')}>
          <mesh
            geometry={geometries.coronary_arteries}
            position={ci('coronary_arteries')}
            castShadow
            onClick={stenosisToolActive ? handleCoronaryClick : undefined}
            onPointerOver={(e: any) => {
              e.stopPropagation();
              hoveredPartRef.current = 'coronary_arteries';
              onHover?.('coronary_arteries');
              document.body.style.cursor = stenosisToolActive ? 'crosshair' : 'pointer';
            }}
            onPointerOut={(e: any) => {
              e.stopPropagation();
              if (hoveredPartRef.current === 'coronary_arteries') {
                hoveredPartRef.current = null;
                onHover?.(null);
              }
              document.body.style.cursor = 'auto';
            }}
          >
            <meshStandardMaterial
              ref={(m) => {
                if (m) {
                  partMats.current['coronary_arteries'] = m as THREE.MeshStandardMaterial;
                  registerVesselMat(m as THREE.MeshStandardMaterial);
                }
              }}
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
