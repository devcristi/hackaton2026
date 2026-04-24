'use client';

import { useMemo } from 'react';

// Maps a stress score (0–100) to an RGB color
// 0–30: cool blue/green (calm)
// 31–60: yellow/amber (mild)
// 61–100: orange/red (stressed)
export const stressToColor = (score: number): [number, number, number] => {
  const t = Math.max(0, Math.min(100, score)) / 100;

  // Blue → Green → Yellow → Red gradient
  if (t < 0.33) {
    const s = t / 0.33;
    return [0, 0.4 + s * 0.4, 1 - s * 0.5]; // blue → teal
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return [s * 1.0, 0.8, 0.5 - s * 0.5]; // teal → yellow
  } else {
    const s = (t - 0.66) / 0.34;
    return [1.0, 0.8 - s * 0.8, 0]; // yellow → red
  }
};

export const stressToHex = (score: number): string => {
  const [r, g, b] = stressToColor(score);
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const useStressColor = (score: number) => {
  return useMemo(() => stressToColor(score), [score]);
};
