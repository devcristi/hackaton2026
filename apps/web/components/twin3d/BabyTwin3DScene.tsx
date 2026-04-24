'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { NiftiHeartVolume } from './NiftiHeartVolume';
import { BloodParticles } from './BloodParticles';
import { stressToHex } from './useStressColor';

interface BabyTwin3DSceneProps {
  stressScore: number;
  heartRate:   number;
  temperature: number;
  spO2:        number;
}

type SliceMode = 'none' | 'horizontal' | 'vertical';

// ─── SpO2 → oxygenation color strip ──────────────────────────────────────────
function spO2Color(spO2: number): string {
  if (spO2 >= 96) return '#00e5ff';
  if (spO2 >= 92) return '#66ffaa';
  if (spO2 >= 88) return '#ffcc00';
  return '#ff4422';
}

// ─── Enable WebGL local clipping (must run inside Canvas) ────────────────────
const EnableClipping = () => {
  const { gl } = useThree();
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);
  return null;
};

// ─── Camera manager to handle smooth transitions ─────────────────────────────
const CameraManager = ({ targetPosition }: { targetPosition: [number, number, number] | null }) => {
  const { camera } = useThree();
  const targetVec = useMemo(() => new THREE.Vector3(), []);
  const isAnimating = useRef(false);

  useEffect(() => {
    if (targetPosition) {
      targetVec.set(...targetPosition);
      isAnimating.current = true;
    }
  }, [targetPosition, targetVec]);

  useFrame(() => {
    if (isAnimating.current && targetPosition) {
      // Smoothly interpolate position
      camera.position.lerp(targetVec, 0.1);
      camera.lookAt(0, 0, 0);

      // Stop animating when close enough to target
      if (camera.position.distanceTo(targetVec) < 0.001) {
        isAnimating.current = false;
        camera.position.copy(targetVec);
      }
    }
  });

  return null;
};

// ─── Three.js scene (runs inside <Canvas>) ────────────────────────────────────
interface SceneProps {
  stressScore:   number;
  heartRate:     number;
  temperature:   number;
  spO2:          number;
  showVessels:   boolean;
  showParticles: boolean;
  clipPlane:     THREE.Plane | null;
  visibleClasses: Record<string, boolean>;
  opacity:       number;
  stenosisToolActive: boolean;
  stenosisRadius: number;
  stenosisIntensity: number;
  resetSignal: number;
  onStenosis: (occlusion: number, wss: number) => void;
  targetCameraPosition: [number, number, number] | null;
}

const Scene = ({
  stressScore,
  heartRate,
  temperature,
  spO2,
  showVessels,
  showParticles,
  clipPlane,
  visibleClasses,
  opacity,
  stenosisToolActive,
  stenosisRadius,
  stenosisIntensity,
  resetSignal,
  onStenosis,
  targetCameraPosition,
}: SceneProps) => (
  <>
    <EnableClipping />
    <CameraManager targetPosition={targetCameraPosition} />
    {/* ... lights and helpers ... */}
    <color attach="background" args={['#080c12']} />
    <ambientLight intensity={0.25} />
    <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow />
    <pointLight position={[-2.5, 1, -1.5]} intensity={0.8} color="#2255cc" />
    <pointLight position={[0, -2, 2]} intensity={0.5} color="#881122" />
    <spotLight position={[0, 3, 2]} angle={0.55} penumbra={0.7} intensity={1.2} color="#ffffff" castShadow />
    <gridHelper args={[6, 30, '#0d1a2e', '#0a1220']} position={[0, -1.2, 0]} />
    <OrbitControls enablePan={false} minDistance={0.5} maxDistance={8.0} autoRotate={false} makeDefault />

    <NiftiHeartVolume
      stressScore={stressScore}
      heartRate={heartRate}
      temperature={temperature}
      spO2={spO2}
      showVessels={showVessels}
      clipPlane={clipPlane}
      visibleClasses={visibleClasses}
      opacity={opacity}
      stenosisToolActive={stenosisToolActive}
      stenosisRadius={stenosisRadius}
      stenosisIntensity={stenosisIntensity}
      resetSignal={resetSignal}
      onStenosis={onStenosis}
    />

    {showParticles && (
      <BloodParticles spO2={spO2} heartRate={heartRate} />
    )}
  </>
);

// ─── Reusable small label ─────────────────────────────────────────────────────
const HudLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest whitespace-nowrap">
    {children}
  </span>
);

// ─── Public wrapper with HUD chrome ──────────────────────────────────────────

export const BabyTwin3DScene = ({
  stressScore,
  heartRate,
  temperature,
  spO2,
}: BabyTwin3DSceneProps) => {
  const [showVessels,   setShowVessels]   = useState(true);
  const [showParticles, setShowParticles] = useState(true);

  const [stenosisMode, setStenosisMode] = useState(false);
  const [stenosisEvent, setStenosisEvent] = useState<{occlusion: number, wss: number} | null>(null);
  const [stenosisRadius, setStenosisRadius] = useState(0.08);
  const [stenosisIntensity, setStenosisIntensity] = useState(0.70);
  const [resetSignal, setResetSignal] = useState(0);

  const [targetCameraPosition, setTargetCameraPosition] = useState<[number, number, number] | null>(null);

  // ── Anatomy Visibility & Opacity ────────────────────────────────────────────
  const [visibleClasses, setVisibleClasses] = useState<Record<string, boolean>>({
    myocardium: true,
    left_ventricle: true,
    right_ventricle: true,
    left_atrium: true,
    right_atrium: true,
    aorta: true,
    pulmonary_artery: true,
    coronary_arteries: true,
  });
  const [opacity, setOpacity] = useState(100);

  const anatomyParts = [
    { key: 'myocardium', label: 'Myocardium' },
    { key: 'left_ventricle', label: 'Left Ventricle' },
    { key: 'right_ventricle', label: 'Right Ventricle' },
    { key: 'left_atrium', label: 'Left Atrium' },
    { key: 'right_atrium', label: 'Right Atrium' },
    { key: 'aorta', label: 'Aorta' },
    { key: 'pulmonary_artery', label: 'Pulm. Artery' },
    { key: 'coronary_arteries', label: 'Coronaries' },
  ];

  // ── Slicing state ───────────────────────────────────────────────────────────
  const [sliceMode,  setSliceMode]  = useState<SliceMode>('none');
  const [sliceDepth, setSliceDepth] = useState(0);   // 0–100

  // Derive THREE.Plane from slice settings (-1.5 = all visible, +1.5 = all clipped)
  const clipPlane = useMemo<THREE.Plane | null>(() => {
    if (sliceMode === 'none') return null;
    // map sliceDepth 0..100 → constant -1.5..+1.5
    // Plane equation: n·x + c = 0; keeps n·x + c ≥ 0
    // => keeps y ≥ -c (horiz) or x ≥ -c (vert)
    // At c=1.5 (depth=0):  y ≥ -1.5  = show everything
    // At c=-1.5 (depth=100): y ≥ 1.5  = show nothing
    const c = 1.5 - (sliceDepth / 100) * 3.0;
    const normal =
      sliceMode === 'horizontal'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    return new THREE.Plane(normal, c);
  }, [sliceMode, sliceDepth]);

  const stressHex = stressToHex(stressScore);
  const o2Hex     = spO2Color(spO2);

  return (
    <div className="flex flex-col gap-2 w-full h-full">

      {/* ── Top toolbar row ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800/60 rounded-lg border border-slate-700/50 flex-wrap gap-y-1">

        <span className="text-xs text-slate-400 font-mono uppercase tracking-widest">
          ❤ Cardiac Bio-Twin 3D
        </span>

        <div className="flex gap-2 items-center flex-wrap">
          {/* Vitals mini-badges */}
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-800/40">
            ♥ {heartRate} bpm
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-800/40">
            {temperature.toFixed(1)}°C
          </span>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded border"
            style={{ backgroundColor: `${o2Hex}18`, color: o2Hex, borderColor: `${o2Hex}44` }}
          >
            SpO₂ {spO2}%
          </span>

          {/* Toggle coronary vessels */}
          <button
            onClick={() => setShowVessels((v) => !v)}
            className={`text-xs font-mono px-2 py-0.5 rounded border transition-all ${
              showVessels
                ? 'bg-red-700/50 text-red-200 border-red-600/50'
                : 'bg-slate-700/40 text-slate-400 border-slate-600/40 hover:bg-slate-600/40'
            }`}
          >
            {showVessels ? '🩸 Vessels ON' : '🩸 Vessels OFF'}
          </button>

          {/* Toggle blood particles */}
          <button
            onClick={() => setShowParticles((v) => !v)}
            className={`text-xs font-mono px-2 py-0.5 rounded border transition-all ${
              showParticles
                ? 'bg-rose-800/50 text-rose-200 border-rose-700/50'
                : 'bg-slate-700/40 text-slate-400 border-slate-600/40 hover:bg-slate-600/40'
            }`}
          >
            {showParticles ? '💉 RBCs ON' : '💉 RBCs OFF'}
          </button>

          {/* Stenosis Tool */}
          <button
            onClick={() => setStenosisMode((v) => !v)}
            className={`text-xs font-mono px-2 py-0.5 rounded border transition-all ${
              stenosisMode
                ? 'bg-yellow-600/50 text-yellow-100 border-yellow-500/60 animate-pulse'
                : 'bg-slate-700/40 text-slate-400 border-slate-600/40 hover:bg-slate-600/40'
            }`}
          >
            {stenosisMode ? '⚠️ STENOSIS TOOL ACTIVE' : '🔧 Create Stenosis'}
          </button>
        </div>
      </div>

      {/* ── Stress bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs text-slate-500 font-mono w-16">STRESS</span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${stressScore}%`, backgroundColor: stressHex, boxShadow: `0 0 8px ${stressHex}` }}
          />
        </div>
        <span className="text-xs font-mono font-bold w-8 text-right" style={{ color: stressHex }}>
          {stressScore}
        </span>
      </div>

      {/* ── SpO2 bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs text-slate-500 font-mono w-16">SpO₂</span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${spO2}%`, backgroundColor: o2Hex, boxShadow: `0 0 6px ${o2Hex}` }}
          />
        </div>
        <span className="text-xs font-mono font-bold w-8 text-right" style={{ color: o2Hex }}>
          {spO2}%
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ── SIMULATION CONTROLS PANEL ────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-2 py-2 bg-slate-900/70 rounded-lg border border-slate-700/40">

        {/* ─ Row: slice mode selector ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <HudLabel>✂ Slice</HudLabel>

          {(['none', 'horizontal', 'vertical'] as SliceMode[]).map((mode) => {
            const labels: Record<SliceMode, string> = {
              none:       '⊘ Off',
              horizontal: '— Horiz (Y)',
              vertical:   '| Vert (X)',
            };
            const active = sliceMode === mode;
            return (
              <button
                key={mode}
                onClick={() => { setSliceMode(mode); if (mode === 'none') setSliceDepth(0); }}
                className={`text-xs font-mono px-2 py-0.5 rounded border transition-all ${
                  active
                    ? 'bg-violet-700/60 text-violet-100 border-violet-500/60'
                    : 'bg-slate-700/30 text-slate-400 border-slate-600/30 hover:bg-slate-700/50'
                }`}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>

        {/* ─ Slice depth slider (only when slice active) ───────────────────── */}
        {sliceMode !== 'none' && (
          <div className="flex items-center gap-2">
            <HudLabel>Depth</HudLabel>
            <span className="text-[10px] font-mono text-slate-500 w-12">Open</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sliceDepth}
              onChange={(e) => setSliceDepth(Number(e.target.value))}
              className="flex-1 h-1.5 accent-violet-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-slate-500 w-12 text-right">Cut</span>
            <span className="text-xs font-mono text-violet-300 w-8 text-right">
              {sliceDepth}%
            </span>
          </div>
        )}

        {/* ─ Row: Anatomy visibility ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap border-t border-slate-700/40 pt-2 mt-2">
          <HudLabel>👁 Parts</HudLabel>
          <div className="flex gap-2 flex-wrap">
            {anatomyParts.map((part) => (
              <label key={part.key} className="flex items-center gap-1 text-xs font-mono text-slate-300 bg-slate-800/50 px-2 py-0.5 rounded cursor-pointer hover:bg-slate-700/50">
                <input
                  type="checkbox"
                  checked={visibleClasses[part.key] !== false}
                  onChange={(e) => setVisibleClasses(prev => ({ ...prev, [part.key]: e.target.checked }))}
                  className="accent-violet-500"
                />
                {part.label}
              </label>
            ))}
          </div>
        </div>

        {/* ─ Row: Global Opacity ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-t border-slate-700/40 pt-2 mt-2">
          <HudLabel>Opacity</HudLabel>
          <span className="text-[10px] font-mono text-slate-500 w-8">0%</span>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="flex-1 h-1.5 accent-violet-500 cursor-pointer"
          />
          <span className="text-[10px] font-mono text-slate-500 w-8 text-right">{opacity}%</span>
        </div>

        {/* ─ Row: Stenosis Modeller ────────────────────────────────────── */}
        <div className="flex flex-col gap-2 border-t border-slate-700/40 pt-2 mt-2">
          <div className="flex items-center justify-between">
            <HudLabel>Stenosis Modeller</HudLabel>
            <button
              onClick={() => setResetSignal(Date.now())}
              className="text-[9px] font-mono px-2 py-0.5 rounded border border-red-900/40 bg-red-950/20 text-red-400 hover:bg-red-900/40 transition-colors"
            >
              ⟲ Reset Vessel Geometry
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500 w-16 uppercase">Radius</span>
            <input
              type="range"
              min={0.02}
              max={0.20}
              step={0.01}
              value={stenosisRadius}
              onChange={(e) => setStenosisRadius(Number(e.target.value))}
              className="flex-1 h-1 accent-yellow-600 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-yellow-500 w-10 text-right">
              {stenosisRadius.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500 w-16 uppercase">Pinch</span>
            <input
              type="range"
              min={0.10}
              max={0.95}
              step={0.05}
              value={stenosisIntensity}
              onChange={(e) => setStenosisIntensity(Number(e.target.value))}
              className="flex-1 h-1 accent-yellow-600 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-yellow-500 w-10 text-right">
              {Math.round(stenosisIntensity * 100)}%
            </span>
          </div>
        </div>

      </div>

      {/* ── 3D Canvas ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-700/50 bg-gradient-to-b from-slate-900 to-[#060a10]">
        
        {/* Navigation Gizmo Overlay */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-2">
          <div className="bg-slate-950/60 backdrop-blur-md p-1.5 rounded-full border border-slate-700/50 flex flex-col items-center gap-1 shadow-2xl">
            <button 
              onClick={() => setTargetCameraPosition([0, 4, 0])}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
              title="Top View (Y)"
            >
              Y
            </button>
            <div className="flex gap-1">
              <button 
                onClick={() => setTargetCameraPosition([4, 0, 0])}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20"
                title="Right View (X)"
              >
                X
              </button>
              <button 
                onClick={() => setTargetCameraPosition([0.8, 1.2, 3.5])}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white hover:bg-slate-700 transition-all border border-slate-600 shadow-inner"
                title="Reset View"
              >
                🏠
              </button>
              <button 
                onClick={() => setTargetCameraPosition([0, 0, 4])}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-400 hover:bg-blue-500/20 transition-all border border-blue-500/20"
                title="Front View (Z)"
              >
                Z
              </button>
            </div>
            <div className="text-[8px] text-slate-500 font-bold uppercase mt-1">Orbit</div>
          </div>
        </div>

        {stenosisEvent && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-500/50 rounded-xl p-3 shadow-[0_0_20px_rgba(220,38,38,0.4)] z-10 flex flex-col items-center animate-in fade-in slide-in-from-top-4">
            <span className="text-red-400 text-xs font-mono font-bold uppercase tracking-widest mb-1">Hemodynamics Alert</span>
            <div className="text-white font-bold text-lg">{stenosisEvent.occlusion}% Vessel Occlusion</div>
            <div className="text-amber-200 text-sm font-mono mt-1">Est. Wall Shear Stress: {stenosisEvent.wss} Pa</div>
            <button
              onClick={() => setStenosisEvent(null)}
              className="mt-3 text-[10px] uppercase tracking-wider text-slate-400 hover:text-white border border-slate-700 rounded px-3 py-1 hover:bg-slate-800 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {stenosisMode && !stenosisEvent && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-yellow-950/80 border border-yellow-500/50 rounded px-4 py-2 z-10 pointer-events-none">
             <span className="text-yellow-200 text-xs font-mono whitespace-nowrap">Click anywhere on the magenta coronary arteries to simulate stenosis</span>
          </div>
        )}

        <Canvas
          camera={{ position: [0.8, 1.2, 3.5], fov: 38 }}
          shadows
          gl={{ antialias: true, alpha: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <Scene
            stressScore={stressScore}
            heartRate={heartRate}
            temperature={temperature}
            spO2={spO2}
            showVessels={showVessels}
            showParticles={showParticles}
            clipPlane={clipPlane}
            visibleClasses={visibleClasses}
            opacity={opacity / 100.0}
            stenosisToolActive={stenosisMode}
            stenosisRadius={stenosisRadius}
            stenosisIntensity={stenosisIntensity}
            resetSignal={resetSignal}
            onStenosis={(occlusion, wss) => setStenosisEvent({ occlusion, wss })}
            targetCameraPosition={targetCameraPosition}
          />
        </Canvas>
      </div>

      {/* ── Real anatomy legend ───────────────────────────────────────────── */}
      <div className="flex justify-center gap-3 px-2 pb-1 flex-wrap">
        {[
          { label: 'LV',    color: '#c41020', desc: 'Left Ventricle' },
          { label: 'RV',    color: '#941010', desc: 'Right Ventricle' },
          { label: 'Aorta', color: '#a00808', desc: 'Aorta' },
          { label: 'PA',    color: '#3828aa', desc: 'Pulm. Artery' },
          { label: 'LAD',   color: '#dd1818', desc: 'Coronary (art.)' },
          { label: 'Vein',  color: '#5012aa', desc: 'Coronary vein' },
          { label: 'Flow',  color: '#ff6644', desc: 'RBC particles' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: item.color, boxShadow: `0 0 4px ${item.color}` }}
            />
            <span className="text-xs text-slate-400 font-mono">
              {item.label}{' '}
              <span className="text-slate-600 hidden sm:inline">{item.desc}</span>
            </span>
          </div>
        ))}
      </div>

    </div>
  );
};
