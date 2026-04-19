"use client";

import { useEffect, useRef, useState } from "react";
import type { DiscoveredTV, TvConnection } from "@/lib/types";
import { startPairing, getPairingStatus } from "@/lib/api-client";
import ErrorBanner from "@/components/ErrorBanner";

interface PairStepProps {
  tv: DiscoveredTV;
  connection: TvConnection | null;
  onConnectionUpdate: (conn: TvConnection) => void;
  onPaired: () => void;
  onCancel: () => void;
}

const PAIR_TIMEOUT_SECS = 60;

export default function PairStep({
  tv,
  connection,
  onConnectionUpdate,
  onPaired,
  onCancel,
}: PairStepProps) {
  const [secondsLeft, setSecondsLeft] = useState(PAIR_TIMEOUT_SECS);
  // Use a ref (not state) so React 18 Strict Mode's double-invoke doesn't
  // fire two simultaneous pair requests to the TV.
  const hasStartedRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const startPairingFlow = async () => {
    hasStartedRef.current = true;
    setSecondsLeft(PAIR_TIMEOUT_SECS);

    const res = await startPairing(tv.id);
    if (!res.ok) {
      onConnectionUpdate({
        tvId: tv.id,
        status: "error",
        token: null,
        errorMessage: res.hint,
        connectedAt: null,
      });
      return;
    }

    // Poll status every second
    pollingRef.current = setInterval(async () => {
      const statusRes = await getPairingStatus(tv.id);
      if (!statusRes.ok) return;

      const conn = statusRes.data;
      onConnectionUpdate(conn);

      if (conn.status === "paired") {
        stopPolling();
        setTimeout(onPaired, 800);
      } else if (conn.status === "rejected" || conn.status === "error") {
        stopPolling();
      }
    }, 1000);

    // Countdown
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          stopPolling();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  // Auto-start pairing on mount
  useEffect(() => {
    if (!hasStartedRef.current) {
      startPairingFlow();
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = connection?.status ?? "connecting";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          {/* TV animation */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div
              className={`w-20 h-20 rounded-2xl flex items-center justify-center ${
                status === "paired"
                  ? "bg-green-100"
                  : status === "rejected" || status === "error"
                  ? "bg-red-100"
                  : "bg-blue-100"
              }`}
            >
              <svg
                className={`w-11 h-11 ${
                  status === "paired"
                    ? "text-green-600"
                    : status === "rejected" || status === "error"
                    ? "text-red-500"
                    : "text-blue-600"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z"
                />
              </svg>
            </div>
            {status === "awaiting_approval" && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500" />
              </span>
            )}
          </div>

          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {tv.name}
          </h2>

          {/* Status messages */}
          {status === "connecting" && (
            <>
              <p className="text-slate-500 mb-1">Connecting…</p>
              <div className="flex justify-center mt-3">
                <Spinner />
              </div>
            </>
          )}

          {status === "awaiting_approval" && (
            <>
              <p className="text-slate-700 font-medium mb-1">
                Look at your TV and press <span className="text-blue-600">Allow</span>
              </p>
              <p className="text-slate-500 text-sm mb-4">
                A permission dialog is showing on your TV screen. Use your remote to approve it.
              </p>
              <div className="inline-flex items-center gap-2 text-sm text-slate-400">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {secondsLeft}s remaining
              </div>
            </>
          )}

          {status === "paired" && (
            <>
              <p className="text-green-700 font-medium mb-1">Connected!</p>
              <p className="text-slate-500 text-sm">Taking you to the upload screen…</p>
            </>
          )}
        </div>

        {/* Error states */}
        {(status === "rejected" || status === "error") && (
          <div className="mt-4 space-y-4">
            <ErrorBanner
              error={
                status === "rejected"
                  ? "TV denied the connection"
                  : "Connection failed"
              }
              hint={
                connection?.errorMessage ??
                (status === "rejected"
                  ? "Press Allow when the dialog appears on your TV screen."
                  : "Make sure your TV is on and on the same Wi-Fi network.")
              }
            />
            <button
              onClick={() => {
                hasStartedRef.current = false;
                startPairingFlow();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Cancel */}
      {status !== "paired" && (
        <div className="text-center">
          <button
            onClick={() => {
              stopPolling();
              onCancel();
            }}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cancel and go back
          </button>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
