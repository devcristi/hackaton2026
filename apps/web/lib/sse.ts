'use client';
import { useEffect, useRef } from "react";
import type { TwinState } from "./types";
import { getStreamUrl } from "./api";
import { useTwinStore } from "../store/twin-store";

/**
 * Connects to the SSE /stream endpoint and pushes TwinState updates
 * into the Zustand store. Auto-reconnects on disconnect.
 */
export function useTwinStream(): void {
  const esRef = useRef<EventSource | null>(null);
  const setState = useTwinStore((s) => s.setState);
  const addHistory = useTwinStore((s) => s.addHistory);

  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect(): void {
      const es = new EventSource(getStreamUrl());
      esRef.current = es;

      es.onopen = () => {
        console.log("frontend e conectat la resebery pi.");
      };

      es.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as TwinState;
          setState(data);
          addHistory(data.reading);
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      esRef.current?.close();
    };
  }, [setState, addHistory]);
}
