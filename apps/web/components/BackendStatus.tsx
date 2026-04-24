"use client";
import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "error";

interface HealthPayload {
  status?: string;
  [key: string]: unknown;
}

export const BackendStatus = () => {
  const [status, setStatus]   = useState<Status>("checking");
  const [detail, setDetail]   = useState<string>("");
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${base}/health`, {
          // ngrok free tier injects a browser-warning page; bypass it
          headers: { "ngrok-skip-browser-warning": "1" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HealthPayload;
        if (!cancelled) {
          setStatus("ok");
          setDetail(json.status ?? "ok");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStatus("error");
          setDetail(err instanceof Error ? err.message : "unreachable");
        }
      }
    };

    void check();
    const id = setInterval(() => void check(), 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [base]);

  if (status === "checking") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400 font-mono animate-pulse">
        <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
        connecting…
      </span>
    );
  }

  if (status === "ok") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
        Backend OK — <span className="text-emerald-300 font-semibold">{detail}</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs font-mono text-red-400">
      <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
      Backend offline — {detail}
    </span>
  );
};
