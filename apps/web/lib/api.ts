import type { TwinState, WhatIfRequest, WhatIfResponse } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchState(): Promise<TwinState> {
  const res = await fetch(`${BASE}/state`, { cache: "no-store" });
  if (!res.ok) throw new Error(`/state ${res.status}`);
  return res.json() as Promise<TwinState>;
}

export async function fetchHistory(seconds = 60): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}/history?seconds=${seconds}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`/history ${res.status}`);
  return res.json() as Promise<Record<string, unknown>[]>;
}

export async function postWhatIf(request: WhatIfRequest): Promise<WhatIfResponse> {
  const res = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`/simulate ${res.status}`);
  return res.json() as Promise<WhatIfResponse>;
}

export async function postServoAngle(angle: number): Promise<void> {
  await fetch(`${BASE}/servo?angle=${angle}`, { method: "POST" });
}

export function getStreamUrl(): string {
  return `${BASE}/stream`;
}
