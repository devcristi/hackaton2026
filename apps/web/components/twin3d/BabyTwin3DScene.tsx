'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { NiftiHeartVolume } from './NiftiHeartVolume';
import { stressToHex } from './useStressColor';
import { useTwinStore } from '../../store/twin-store';

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

  useEffect(() => {
    if (targetPosition) {
      camera.position.set(...targetPosition);
      // Let OrbitControls handle the look direction
    }
  }, [targetPosition, camera]);

  return null;
};

// ─── Three.js scene (runs inside <Canvas>) ────────────────────────────────────
interface SceneProps {
  stressScore:   number;
  heartRate:     number;
  temperature:   number;
  spO2:          number;
  showVessels:   boolean;
  clipPlane:     THREE.Plane | null;
  visibleClasses: Record<string, boolean>;
  opacity:       number;
  stenosisToolActive: boolean;
  stenosisRadius: number;
  stenosisIntensity: number;
  resetSignal: number;
  onStenosis: (occlusion: number, wss: number) => void;
  onHover: (part: string | null) => void;
  targetCameraPosition: [number, number, number] | null;
}

const Scene = ({
  stressScore,
  heartRate,
  temperature,
  spO2,
  showVessels,
  clipPlane,
  visibleClasses,
  opacity,
  stenosisToolActive,
  stenosisRadius,
  stenosisIntensity,
  resetSignal,
  onStenosis,
  onHover,
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
    <OrbitControls enablePan={false} minDistance={0.5} maxDistance={40.0} autoRotate={false} makeDefault />

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
      onHover={onHover}
    />

  </>
);

// ─── Anatomy legend data (kept in sync with NiftiHeartVolume colour palette) ─
const ANATOMY_LEGEND: { key: string; label: string; color: string }[] = [
  { key: 'myocardium',        label: 'Myocardium',       color: '#e8909a' },
  { key: 'left_atrium',       label: 'Left Atrium',      color: '#2563c4' },
  { key: 'left_ventricle',    label: 'Left Ventricle',   color: '#16a34a' },
  { key: 'right_atrium',      label: 'Right Atrium',     color: '#0891b2' },
  { key: 'right_ventricle',   label: 'Right Ventricle',  color: '#ca8a04' },
  { key: 'aorta',             label: 'Aorta',            color: '#7c3aed' },
  { key: 'pulmonary_artery',  label: 'Pulmonary Artery', color: '#db2777' },
  { key: 'heart_and_fat',     label: 'Heart & Fat',      color: '#d4d4aa' },
  { key: 'coronary_arteries', label: 'Coronary Artery',  color: '#ef4444' },
];

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
  const isAnimating     = useTwinStore((s) => s.isAnimating);
  const toggleAnimation = useTwinStore((s) => s.toggleAnimation);
  const [showVessels,   setShowVessels]  = useState(true);
  const [hoveredPart,   setHoveredPart]  = useState<string | null>(null);
  const [hoveredLabel,  setHoveredLabel] = useState<string | null>(null);

  const [stenosisMode, setStenosisMode] = useState(false);
  const [stenosisEvent, setStenosisEvent] = useState<{occlusion: number, wss: number} | null>(null);
  const [stenosisRadius, setStenosisRadius] = useState(0.08);
  const [stenosisIntensity, setStenosisIntensity] = useState(0.70);
  const [resetSignal, setResetSignal] = useState(0);

  const [targetCameraPosition, setTargetCameraPosition] = useState<[number, number, number] | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      canvasContainerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

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
  const [opacity, setOpacity] = useState(82);

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

          {/* Toggle heartbeat animation */}
          <button
            onClick={toggleAnimation}
            className={`text-xs font-mono px-2 py-0.5 rounded border transition-all ${
              isAnimating
                ? 'bg-pink-700/50 text-pink-200 border-pink-600/50 hover:bg-pink-800/60'
                : 'bg-slate-700/40 text-slate-400 border-slate-600/40 hover:bg-slate-600/40'
            }`}
          >
            {isAnimating ? '⏸ Pause Beat' : '▶ Resume Beat'}
          </button>

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

      {/* ── SIMULATION CONTROLS PANEL ────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-2 py-2 bg-slate-900/70 rounded-lg border border-slate-700/40">

        {/* ─ Row: slice mode selector ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <HudLabel>✂ Slice</HudLabel>

          {(['horizontal', 'vertical'] as SliceMode[]).map((mode) => {
            const labels: Record<SliceMode, string> = {
              none:       '⊘ Off',
              horizontal: '— Horiz (Y)',
              vertical:   '| Vert (X)',
            };
            const active = sliceMode === mode;
            return (
              <button
                key={mode}
                onClick={() => { setSliceMode(mode); }}
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
            {anatomyParts.map((part) => {
              const legend  = ANATOMY_LEGEND.find(l => l.key === part.key);
              const color   = legend?.color ?? '#94a3b8';
              const hovered = hoveredLabel === part.key || hoveredPart === part.key;
              return (
                <label
                  key={part.key}
                  onMouseEnter={() => setHoveredLabel(part.key)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded cursor-pointer transition-all duration-150"
                  style={{
                    backgroundColor: hovered ? `${color}22` : 'rgba(30,41,59,0.5)',
                    color:           hovered ? color        : '#cbd5e1',
                    border:          `1px solid ${hovered ? `${color}66` : 'transparent'}`,
                    boxShadow:       hovered ? `0 0 8px 1px ${color}44` : 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibleClasses[part.key] !== false}
                    onChange={(e) => setVisibleClasses(prev => ({ ...prev, [part.key]: e.target.checked }))}
                    className="accent-violet-500"
                  />
                  {part.label}
                </label>
              );
            })}
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
      <div
        ref={canvasContainerRef}
        className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-700/50 bg-gradient-to-b from-slate-900 to-[#060a10]"
      >

        {/* Fullscreen Toggle Button */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Expand to Fullscreen'}
          className="absolute top-4 left-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-slate-950/70 backdrop-blur-md border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800/80 hover:border-cyan-500/50 hover:shadow-[0_0_10px_rgba(0,220,255,0.25)] transition-all duration-200 shadow-lg"
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V3h4"/><path d="M17 3h4v4"/><path d="M21 17v4h-4"/><path d="M7 21H3v-4"/>
            </svg>
          )}
        </button>

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

        {stenosisEvent && (() => {
          const intensity = stenosisEvent.occlusion / 100;
          const pinchW     = Math.max(6, Math.round(40 * (1 - intensity)));  // lumen width at stenosis
          const pinchX     = 80 - pinchW / 2;
          const pressureKPa = (intensity * 8.5 + 1.5).toFixed(1);
          return (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#020916]/95 border border-cyan-500/40 rounded-xl p-3 shadow-[0_0_28px_rgba(0,200,255,0.35)] z-10 flex flex-col items-center animate-in fade-in slide-in-from-top-4 min-w-[220px]">
              <span className="text-cyan-300 text-xs font-mono font-bold uppercase tracking-widest mb-1">⚙ Mechanical Stress Simulation</span>

              {/* ── Pressure Heat-Map ─────────────────────────────── */}
              <svg width="200" height="110" viewBox="0 0 200 110" className="my-2 rounded-lg overflow-visible">
                <defs>
                  {/* vibrant-blue radial pressure bloom — sits ABOVE the stenosis */}
                  <radialGradient id="pgHot" cx="50%" cy="38%" r="52%">
                    <stop offset="0%"   stopColor="#00ffff" stopOpacity={0.95 * Math.min(1, intensity + 0.25)} />
                    <stop offset="28%"  stopColor="#00aaff" stopOpacity={0.75 * Math.min(1, intensity + 0.2)} />
                    <stop offset="60%"  stopColor="#0044cc" stopOpacity={0.35 * Math.min(1, intensity + 0.1)} />
                    <stop offset="100%" stopColor="#001166" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="pgCore" cx="50%" cy="36%" r="22%">
                    <stop offset="0%"   stopColor="#eeffff" stopOpacity={0.85 * Math.min(1, intensity + 0.3)} />
                    <stop offset="100%" stopColor="#00ffff" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="lumenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%"   stopColor="#0d2244" />
                    <stop offset="100%" stopColor="#060e1c" />
                  </linearGradient>
                  {/* low-pressure zone below stenosis */}
                  <radialGradient id="pgLow" cx="50%" cy="78%" r="35%">
                    <stop offset="0%"   stopColor="#0033aa" stopOpacity={0.4 * intensity} />
                    <stop offset="100%" stopColor="#001133" stopOpacity="0" />
                  </radialGradient>
                  <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L6,3 Z" fill="#0055aa" />
                  </marker>
                </defs>

                {/* background */}
                <rect width="200" height="110" fill="#020916" rx="8" />

                {/* ── vessel — upper normal lumen (above stenosis) */}
                <rect x="80" y="4" width="40" height="46" fill="url(#lumenGrad)" />
                {/* vessel walls upper */}
                <line x1="80" y1="4"  x2="80"  y2="50" stroke="#1e4488" strokeWidth="1.5" />
                <line x1="120" y1="4" x2="120" y2="50" stroke="#1e4488" strokeWidth="1.5" />

                {/* ── HIGH-PRESSURE HEATMAP — above & around the narrowing */}
                <ellipse cx="100" cy="44" rx="55" ry="28" fill="url(#pgHot)" />
                <ellipse cx="100" cy="40" rx="22" ry="12" fill="url(#pgCore)" />

                {/* ── stenosis narrowing geometry */}
                <path
                  d={`M 80 50 Q ${80 + (40 - pinchW) * 0.4} 62 ${pinchX} 70 L ${pinchX + pinchW} 70 Q ${120 - (40 - pinchW) * 0.4} 62 120 50 Z`}
                  fill="#060e1c"
                  stroke="#0066cc"
                  strokeWidth="1.2"
                />

                {/* ── vessel — lower narrow lumen (below stenosis) */}
                <rect x={pinchX} y="70" width={pinchW} height="32" fill="#040c18" />
                <line x1={pinchX}          y1="70" x2={pinchX}          y2="102" stroke="#0e2d5a" strokeWidth="1.2" />
                <line x1={pinchX + pinchW} y1="70" x2={pinchX + pinchW} y2="102" stroke="#0e2d5a" strokeWidth="1.2" />

                {/* ── low-pressure zone below */}
                <ellipse cx="100" cy="88" rx="32" ry="14" fill="url(#pgLow)" />

                {/* ── labels */}
                <text x="136" y="38" fill="#00e5ff" fontSize="8" fontFamily="monospace" fontWeight="bold">↑ {pressureKPa} kPa</text>
                <text x="136" y="49" fill="#0088bb" fontSize="7" fontFamily="monospace">HIGH</text>
                <text x="136" y="88" fill="#1a4488" fontSize="7" fontFamily="monospace">P DROP</text>

                {/* flow arrow */}
                <text x="56" y="58" fill="#0055aa" fontSize="9" fontFamily="monospace">flow</text>
                <line x1="68" y1="44" x2="68" y2="66" stroke="#0055aa" strokeWidth="1" markerEnd="url(#arr)" />

                {/* scale bar */}
                <rect x="20" y="20" width="6" height={Math.round(intensity * 60 + 10)} rx="3"
                  fill={`rgba(0,${Math.round(200 - intensity * 60)},255,0.85)`} />
                <rect x="20" y={80 - Math.round(intensity * 30 + 8)} width="6" height={Math.round(intensity * 30 + 8)} rx="3"
                  fill="rgba(0,60,160,0.5)" />
                <text x="14" y="18" fill="#0088cc" fontSize="6" fontFamily="monospace">P</text>
              </svg>

              <div className="text-white font-bold text-base">{stenosisEvent.occlusion}% Vessel Occlusion</div>
              <div className="text-cyan-200 text-xs font-mono mt-0.5">Wall Shear Stress: <span className="text-cyan-400 font-bold">{stenosisEvent.wss} Pa</span></div>
              <button
                onClick={() => setStenosisEvent(null)}
                className="mt-2 text-[10px] uppercase tracking-wider text-slate-400 hover:text-cyan-300 border border-slate-700 hover:border-cyan-700 rounded px-3 py-1 hover:bg-cyan-950/40 transition-colors"
              >
                Dismiss
              </button>
            </div>
          );
        })()}

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
            clipPlane={clipPlane}
            visibleClasses={visibleClasses}
            opacity={opacity / 100.0}
            stenosisToolActive={stenosisMode}
            stenosisRadius={stenosisRadius}
            stenosisIntensity={stenosisIntensity}
            resetSignal={resetSignal}
            onStenosis={(occlusion, wss) => setStenosisEvent({ occlusion, wss })}
            onHover={(p) => setHoveredPart(p)}
            targetCameraPosition={targetCameraPosition}
          />
        </Canvas>
      </div>

    </div>
  );
};
