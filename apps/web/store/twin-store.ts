import { create } from "zustand";
import type { TwinState, SensorReading } from "../lib/types";
import type { FsmState } from "../components/FsmStatusBar";

const HISTORY_MAX = 300;

type TwinStore = {
  state: TwinState | null;
  history: SensorReading[];
  fsmStateOverride: FsmState | null;
  setState: (s: TwinState) => void;
  addHistory: (r: SensorReading) => void;
  clearHistory: () => void;
  setFsmStateOverride: (s: FsmState | null) => void;
};

export const useTwinStore = create<TwinStore>((set) => ({
  state: null,
  history: [],
  fsmStateOverride: null,

  setState: (s: TwinState) => {
    console.log(`[twin-store] setState severity=${s.severity}, accelX=${s.reading.accelX}`);
    set({ state: s });
  },

  addHistory: (r: SensorReading) =>
    set((prev) => ({
      history:
        prev.history.length >= HISTORY_MAX
          ? [...prev.history.slice(1), r]
          : [...prev.history, r],
    })),

  clearHistory: () => set({ history: [] }),

  setFsmStateOverride: (s: FsmState | null) => {
    console.log(`[twin-store] setFsmStateOverride=${s}`);
    set({ fsmStateOverride: s });
  },
}));
