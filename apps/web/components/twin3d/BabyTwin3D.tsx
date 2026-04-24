'use client';

import dynamic from 'next/dynamic';

// Three.js uses browser-only APIs (WebGL, window) — must be loaded client-side only.
const BabyTwin3DScene = dynamic(
  () => import('./BabyTwin3DScene').then((m) => ({ default: m.BabyTwin3DScene })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full min-h-[420px] rounded-xl bg-slate-900/60 border border-slate-700/40">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-violet-500/60 border-t-violet-400 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm font-mono">Initializing Bio-Twin 3D…</span>
        </div>
      </div>
    ),
  }
);

export interface BabyTwin3DProps {
  stressScore: number;
  heartRate: number;
  temperature: number;
  spO2: number;
}

// Public wrapper — safe to import in any Server or Client component.
export const BabyTwin3D = (props: BabyTwin3DProps) => {
  return (
    <div className="w-full h-full min-h-0">
      <BabyTwin3DScene {...props} />
    </div>
  );
};
