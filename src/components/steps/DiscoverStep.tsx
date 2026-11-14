"use client";

import { useState } from "react";
import type { ApiResult, DiscoverData, DiscoveredTV } from "@/lib/types";
import { discoverTvs } from "@/lib/api-client";
import TvCard from "@/components/TvCard";
import ErrorBanner from "@/components/ErrorBanner";
import ManualIpForm from "@/components/setup/ManualIpForm";
import Spinner from "@/components/setup/Spinner";
import { PRIMARY_BUTTON } from "@/components/setup/styles";

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

  const scan = async () => {
    setScanning(true);
    setError(null);
    setHasScanned(false);

    let result: ApiResult<DiscoverData>;
    try {
      result = await discoverTvs();
    } catch {
      result = {
        ok: false,
        error: "Couldn't search",
        hint: "This device couldn't reach the uploader. Check its connection and try again.",
      };
    }
    setScanning(false);
    setHasScanned(true);

    if (!result.ok) {
      setError({ error: result.error, hint: result.hint });
      return;
    }
    onTvsFound(result.data.tvs);
  };

  const noResults = hasScanned && !error && tvs.length === 0;
  const announcement = scanning
    ? "Searching your network for TVs."
    : error
      ? ""
      : hasScanned
        ? tvs.length === 0
          ? "No TVs found."
          : `${tvs.length === 1 ? "1 TV" : `${tvs.length} TVs`} found.`
        : "";

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-6 py-1 sm:gap-8 sm:py-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:py-12">
      {/* Intro + primary action */}
      <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
        <div>
          <h1 className="m-0 text-[28px] leading-[1.15] tracking-[-0.01em] text-ink sm:text-[34px]">
            Find your Frame TV
          </h1>
          <p className="mb-0 mt-3 text-base text-muted">
            Turn the TV on and make sure it&apos;s on the same Wi-Fi as this device. The search
            usually takes a few seconds.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            className={`${PRIMARY_BUTTON} w-full sm:w-auto`}
          >
            {scanning ? (
              <>
                <Spinner />
                Searching…
              </>
            ) : hasScanned ? (
              "Search again"
            ) : (
              "Find my TV"
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      <section
        aria-labelledby="discover-results-heading"
        className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <h2
          id="discover-results-heading"
          className="m-0 font-sans text-sm font-semibold text-ink"
        >
          {tvs.length > 0
            ? `${tvs.length === 1 ? "1 TV" : `${tvs.length} TVs`} on your network`
            : "TVs on your network"}
        </h2>
        <p role="status" className="sr-only">
          {announcement}
        </p>

        {error && (
          <ErrorBanner error={error.error} hint={error.hint} onDismiss={() => setError(null)} />
        )}

        {tvs.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {tvs.map((tv) => (
              <li key={tv.id}>
                <TvCard tv={tv} onSelect={onSelectTv} />
              </li>
            ))}
          </ul>
        )}

        {tvs.length === 0 && scanning && (
          <div className="flex min-h-[180px] items-center justify-center gap-3 rounded-[14px] bg-wall px-6 py-10 text-ink">
            <Spinner className="h-5 w-5" />
            <span className="font-medium">Looking for Samsung TVs on your network…</span>
          </div>
        )}

        {tvs.length === 0 && !scanning && !hasScanned && !error && (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-1 rounded-[14px] bg-wall px-6 py-10 text-center">
            <p className="m-0 font-semibold text-ink">Your TV will show up here</p>
            <p className="m-0 text-muted">
              Press Find my TV, or add it by IP address.
            </p>
          </div>
        )}

        {noResults && !scanning && (
          <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface px-5 py-[18px]">
            <p className="m-0 text-base font-semibold text-ink">No TVs found</p>
            <p className="m-0 text-muted">Some things to check before you search again:</p>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-ink">
              <li>The TV is switched on. Some TVs stop answering in deep standby.</li>
              <li>
                This device is on the same Wi-Fi as the TV, not a guest network, and no VPN is
                running.
              </li>
              <li>
                Some routers hide devices from each other (often called client or AP isolation).
                If so, add the TV by its IP address instead.
              </li>
            </ul>
          </div>
        )}
      </section>

      {/* Manual entry: always available */}
      <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
        <ManualIpForm onTvsFound={onTvsFound} />
      </div>
    </div>
  );
}
