"use client";
import type { ReactNode } from "react";
import type { Severity } from "../../lib/types";
import { SEVERITY_BG } from "../../lib/types";

type Props = {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  icon?: ReactNode;
  severity?: Severity;
  sub?: string;
};

export const SensorCard = ({ label, value, unit, icon, severity = "normal", sub }: Props) => {
  const display = value === null || value === undefined ? "—" : String(value);

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${SEVERITY_BG[severity]}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wider">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="text-2xl font-bold text-white">
        {display}
        {unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
};
