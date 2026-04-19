"use client";

import { useState, useRef, useCallback } from "react";
import type { TvConnection } from "@/lib/types";
import { startPairing, getPairingStatus, disconnectTv } from "@/lib/api-client";

export function useTvConnection(tvId: string | null) {
  const [connection, setConnection] = useState<TvConnection | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pair = useCallback(async () => {
    if (!tvId) return;
    stopPolling();

    setConnection({
      tvId,
      status: "connecting",
      token: null,
      errorMessage: null,
      connectedAt: null,
    });

    const res = await startPairing(tvId);
    if (!res.ok) {
      setConnection({
        tvId,
        status: "error",
        token: null,
        errorMessage: res.hint,
        connectedAt: null,
      });
      return;
    }

    // Poll for status updates every second
    pollingRef.current = setInterval(async () => {
      const statusRes = await getPairingStatus(tvId);
      if (!statusRes.ok) return;

      const conn = statusRes.data;
      setConnection(conn);

      if (conn.status === "paired" || conn.status === "rejected" || conn.status === "error") {
        stopPolling();
      }
    }, 1000);
  }, [tvId, stopPolling]);

  const disconnect = useCallback(async () => {
    if (!tvId) return;
    stopPolling();
    await disconnectTv(tvId);
    setConnection(null);
  }, [tvId, stopPolling]);

  return { connection, pair, disconnect, stopPolling };
}
