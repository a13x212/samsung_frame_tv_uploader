"use client";

import { useState } from "react";
import type { DiscoveredTV } from "@/lib/types";
import { discoverTvs } from "@/lib/api-client";
import TvCard from "@/components/TvCard";
import ErrorBanner from "@/components/ErrorBanner";

interface DiscoverStepProps {
  tvs: DiscoveredTV[];
  onTvsFound: (tvs: DiscoveredTV[]) => void;
  onSelectTv: (tv: DiscoveredTV) => void;
}

export default function DiscoverStep({
  tvs,
  onTvsFound,
  onSelectTv,
}: DiscoverStepProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<{ error: string; hint: string } | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [manualIp, setManualIp] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true);
    setError(null);
    setHasScanned(false);

    const result = await discoverTvs();
    setScanning(false);
    setHasScanned(true);

    if (!result.ok) {
      setError({ error: result.error, hint: result.hint });
      return;
    }

    onTvsFound(result.data.tvs);

    if (result.data.tvs.length === 0) {
      setError({
        error: "No Frame TVs found",
        hint: "Make sure your TV is on and connected to the same Wi-Fi network.",
      });
    }
  };

  const addManual = async () => {
    if (!manualIp.trim()) return;
    setManualLoading(true);
    setManualError(null);

    try {
      const res = await fetch("/api/tv/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualIp: manualIp.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setManualError(data.hint || "Could not reach TV at that IP address.");
      } else {
        onTvsFound(data.data.tvs);
        if (data.data.tvs.length === 0) {
          setManualError("No Samsung Frame TV found at that IP. Double-check the address.");
        } else {
          setShowManual(false);
          setManualIp("");
        }
      }
    } catch {
      setManualError("Network error. Make sure you are on the same Wi-Fi as your TV.");
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-9 h-9 text-blue-600"
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

        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Find Your Frame TV
        </h2>
        <p className="text-slate-500 mb-6 max-w-sm mx-auto">
          We'll automatically search for Samsung Frame TVs on your Wi-Fi network.
        </p>

        <button
          onClick={scan}
          disabled={scanning}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-8 py-3 rounded-xl transition-colors"
        >
          {scanning ? (
            <>
              <Spinner />
              Searching…
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
                />
              </svg>
              Find My TV
            </>
          )}
        </button>

        {scanning && (
          <p className="text-sm text-slate-400 mt-3">
            Looking for Samsung Frame TVs on your network…
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <ErrorBanner
          error={error.error}
          hint={error.hint}
          onDismiss={() => setError(null)}
        />
      )}

      {/* TV list */}
      {tvs.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-600">
            {tvs.length === 1 ? "1 TV found" : `${tvs.length} TVs found`}
          </p>
          {tvs.map((tv) => (
            <TvCard key={tv.id} tv={tv} onSelect={onSelectTv} />
          ))}
        </div>
      )}

      {/* Manual IP entry */}
      {(hasScanned || tvs.length > 0) && (
        <div className="text-center">
          {!showManual ? (
            <button
              onClick={() => setShowManual(true)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2"
            >
              Enter IP address manually
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">
                Enter your TV's IP address
              </p>
              <p className="text-xs text-slate-400">
                Find it in your TV settings under Network → Network Status
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addManual()}
                  placeholder="192.168.1.100"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addManual}
                  disabled={manualLoading || !manualIp.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {manualLoading ? "…" : "Add"}
                </button>
                <button
                  onClick={() => {
                    setShowManual(false);
                    setManualIp("");
                    setManualError(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 px-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {manualError && (
                <p className="text-xs text-red-600">{manualError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
