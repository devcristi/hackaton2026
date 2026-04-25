import type { TwinState, WhatIfRequest, WhatIfResponse } from "./types";
import { generateMockTwinState } from "./mock-data";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/pi";
export const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

export async function fetchState(): Promise<TwinState> {
  if (MOCK_MODE) {
    return generateMockTwinState();
  }
  const res = await fetch(`${BASE}/state`, { cache: "no-store" });
  if (!res.ok) {
    // Keep the dashboard usable while backend state endpoint is warming up or unstable.
    console.warn(`[api] /state failed with HTTP ${res.status}; using temporary mock snapshot.`);
    return generateMockTwinState();
  }
  return res.json() as Promise<TwinState>;
}

export async function fetchHistory(seconds = 60): Promise<Record<string, unknown>[]> {
  if (MOCK_MODE) {
    return Array.from({ length: seconds }, (_, i) => ({
      ...generateMockTwinState().reading,
      ts: Date.now() / 1000 - i,
    }));
  }
  const res = await fetch(`${BASE}/history?seconds=${seconds}`, { cache: "no-store" });
  if (!res.ok) {
    console.warn(`[api] /history failed with HTTP ${res.status}; returning empty history.`);
    return [];
  }
  return res.json() as Promise<Record<string, unknown>[]>;
}

export async function postWhatIf(request: WhatIfRequest): Promise<WhatIfResponse> {
  if (MOCK_MODE) {
    return {
      trajectory: Array.from({ length: 10 }, (_, i) => ({
        step: i,
        ts: Date.now() / 1000 + i * 10,
        bpm: 140 + (i % 2 === 0 ? 1 : -1),
        sys: 55 + (i % 3 === 0 ? 1 : -1),
        dia: 35 + (i % 3 === 0 ? 1 : -1),
        spO2: 92.0 + (i % 5 === 0 ? 0.2 : -0.2),
        severity: "normal",
        rules: [],
      })),
      summary: "Mock simulation results.",
      timeToRiskSec: null,
    };
  }
  const res = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`/simulate ${res.status}`);
  return res.json() as Promise<WhatIfResponse>;
}

export async function postServoAngle(angle: number): Promise<void> {
  if (MOCK_MODE) {
    console.log(`[MOCK] Setting servo angle to ${angle}`);
    return;
  }
  await fetch(`${BASE}/servo?angle=${angle}`, { method: "POST" });
}

export function getStreamUrl(): string {
  return `${BASE}/stream`;
}
