"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResult, DiscoveredTV, TvConnection } from "@/lib/types";
import { startPairing, getPairingStatus } from "@/lib/api-client";
import AllowPromptIllustration from "@/components/setup/AllowPromptIllustration";
import Spinner from "@/components/setup/Spinner";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/setup/styles";

interface PairStepProps {
  tv: DiscoveredTV;
  connection: TvConnection | null;
  onConnectionUpdate: (conn: TvConnection) => void;
  onPaired: () => void;
  onCancel: () => void;
}

const PAIR_TIMEOUT_SECS = 60;

type View = "connecting" | "waiting" | "paired" | "rejected" | "error" | "timeout";

export default function PairStep({
  tv,
  connection,
  onConnectionUpdate,
  onPaired,
  onCancel,
}: PairStepProps) {
  const [secondsLeft, setSecondsLeft] = useState(PAIR_TIMEOUT_SECS);
  /** True while the POST that asks the TV to show its prompt is in flight. */
  const [requesting, setRequesting] = useState(false);

  // Use a ref (not state) so React 18 Strict Mode's double-invoke doesn't
  // fire two simultaneous pair requests to the TV.
  const hasStartedRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while the effect is live; lets async work started before an unmount
  // notice it and bail out instead of creating intervals nobody clears.
  const mountedRef = useRef(false);
  // Each pairing attempt gets an id so late responses from an earlier attempt
  // (e.g. after "Ask again") are ignored.
  const attemptRef = useRef(0);

  // Always call the latest callbacks from timers.
  const onPairedRef = useRef(onPaired);
  const onConnectionUpdateRef = useRef(onConnectionUpdate);
  onPairedRef.current = onPaired;
  onConnectionUpdateRef.current = onConnectionUpdate;

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
    stopPolling();
    const attempt = ++attemptRef.current;
    setSecondsLeft(PAIR_TIMEOUT_SECS);
    setRequesting(true);
    onConnectionUpdateRef.current({
      tvId: tv.id,
      status: "connecting",
      errorMessage: null,
      connectedAt: null,
    });

    let res: ApiResult<{ tvId: string }>;
    try {
      res = await startPairing(tv.id);
    } catch {
      res = {
        ok: false,
        error: "Network error",
        hint: "This device couldn't reach the uploader. Check its connection and try again.",
      };
    }
    if (!mountedRef.current || attempt !== attemptRef.current) return;
    setRequesting(false);

    if (!res.ok) {
      onConnectionUpdateRef.current({
        tvId: tv.id,
        status: "error",
        errorMessage: res.hint || res.error,
        connectedAt: null,
      });
      return;
    }

    // Poll status every second
    pollingRef.current = setInterval(async () => {
      let statusRes: ApiResult<TvConnection>;
      try {
        statusRes = await getPairingStatus(tv.id);
      } catch {
        return; // transient; the next tick retries
      }
      if (!mountedRef.current || attempt !== attemptRef.current) return;
      if (!statusRes.ok) return;

      const conn = statusRes.data;
      if (conn.status === "paired") {
        stopPolling();
        onConnectionUpdateRef.current(conn);
        // Let the success state show briefly; schedule once even if two
        // in-flight polls both report "paired".
        if (!pairedTimerRef.current) {
          pairedTimerRef.current = setTimeout(() => {
            if (mountedRef.current) onPairedRef.current();
          }, 800);
        }
      } else if (pollingRef.current) {
        // Ignore stragglers that land after polling stopped (e.g. timed out).
        onConnectionUpdateRef.current(conn);
        if (conn.status === "rejected" || conn.status === "error") stopPolling();
      }
    }, 1000);

    // Countdown, computed from a deadline so throttled background tabs stay accurate.
    const deadline = Date.now() + PAIR_TIMEOUT_SECS * 1000;
    countdownRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) stopPolling();
    }, 1000);
  };

  // Auto-start pairing on mount
  useEffect(() => {
    mountedRef.current = true;
    if (!hasStartedRef.current) {
      startPairingFlow();
    }
    return () => {
      mountedRef.current = false;
      stopPolling();
      if (pairedTimerRef.current) {
        clearTimeout(pairedTimerRef.current);
        pairedTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = connection?.status ?? "connecting";
  const view: View =
    status === "paired"
      ? "paired"
      : status === "rejected"
        ? "rejected"
        : status === "error"
          ? "error"
          : secondsLeft === 0
            ? "timeout"
            : status === "awaiting_approval"
              ? "waiting"
              : "connecting";

  const chooseDifferentTv = () => {
    attemptRef.current++; // drop any in-flight responses
    stopPolling();
    onCancel();
  };

  const copy = headingCopy(view, tv);

  return (
    <div className="mx-auto grid w-full max-w-[1180px] items-center gap-8 py-1 sm:py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-14 lg:py-12">
      <div className="mx-auto w-full max-w-xl lg:max-w-none">
        <AllowPromptIllustration state={view === "paired" ? "done" : "prompt"} />
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <h1 className="m-0 text-[28px] leading-[1.15] tracking-[-0.01em] text-ink sm:text-[34px]">
            {copy.heading}
          </h1>
          <p className="mb-0 mt-3 text-base text-muted">{copy.body}</p>
        </div>

        <StatusCard view={view} secondsLeft={secondsLeft} tv={tv} connection={connection} />

        {view !== "paired" && (
          <>
            <section
              aria-labelledby="pair-help-heading"
              className="flex flex-col gap-2 rounded-xl border border-line-strong px-5 py-[18px]"
            >
              <h2 id="pair-help-heading" className="m-0 font-sans text-sm font-semibold text-ink">
                Not seeing the prompt?
              </h2>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-muted">
                <li>Wake the TV. It can&apos;t ask while fully off.</li>
                <li>
                  Make sure this device and the TV ({tv.ip}) are on the same network.
                </li>
                <li>
                  If you once pressed Deny, re-allow the app in the TV&apos;s Device Connection
                  Manager.
                </li>
              </ul>
            </section>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => startPairingFlow()}
                disabled={requesting}
                className={PRIMARY_BUTTON}
              >
                {requesting ? (
                  <>
                    <Spinner />
                    Asking the TV…
                  </>
                ) : (
                  "Ask again"
                )}
              </button>
              <button type="button" onClick={chooseDifferentTv} className={SECONDARY_BUTTON}>
                Choose a different TV
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function headingCopy(view: View, tv: DiscoveredTV): { heading: string; body: string } {
  switch (view) {
    case "paired":
      return {
        heading: `${tv.name} is connected`,
        body: "Permission granted. The app remembers this TV, so you won't need to do this again.",
      };
    case "rejected":
      return {
        heading: "The TV didn't allow the connection",
        body: `${tv.name} answered Deny, or the prompt was closed. Press Ask again and choose Allow this time.`,
      };
    case "error":
      return {
        heading: `Couldn't connect to ${tv.name}`,
        body: "Something went wrong while asking the TV for permission.",
      };
    case "timeout":
      return {
        heading: "No answer from the TV",
        body: `${tv.name} didn't respond within ${PAIR_TIMEOUT_SECS} seconds. Press Ask again to show the prompt again.`,
      };
    default:
      return {
        heading: "Press Allow on your TV remote",
        body: `${tv.name} is asking for permission. You only do this once. The app remembers this TV afterwards.`,
      };
  }
}

interface StatusCardProps {
  view: View;
  secondsLeft: number;
  tv: DiscoveredTV;
  connection: TvConnection | null;
}

/**
 * One persistent live region whose content changes with the state, so screen
 * readers announce each transition. The per-second countdown is hidden from
 * assistive tech; a coarser "about N seconds" line is announced instead.
 */
function StatusCard({ view, secondsLeft, tv, connection }: StatusCardProps) {
  const counting = view === "connecting" || view === "waiting";
  const tone =
    view === "paired"
      ? "border-success bg-[#EEF7F1]"
      : view === "rejected" || view === "error" || view === "timeout"
        ? "border-danger-line bg-[#FCF3F2]"
        : "border-line bg-surface";

  let title: string;
  let detail: string | null = null;
  switch (view) {
    case "connecting":
      title = `Contacting ${tv.name}…`;
      break;
    case "waiting":
      title = "Waiting for the TV";
      break;
    case "paired":
      title = "Connected. One moment…";
      break;
    case "rejected":
      title = "Not allowed";
      detail = connection?.errorMessage ?? "The TV declined the request.";
      break;
    case "error":
      title = "Connection failed";
      detail =
        connection?.errorMessage ?? "Make sure the TV is on and on the same network as this device.";
      break;
    case "timeout":
      title = "Timed out";
      detail = "The TV didn't answer in time. Nothing was changed on the TV.";
      break;
  }

  // Announce remaining time only at 15 second steps.
  const coarse = Math.ceil(secondsLeft / 15) * 15;

  return (
    <div
      role="status"
      className={`flex flex-col gap-2.5 rounded-xl border px-5 py-[18px] ${tone}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`flex items-center gap-2 font-semibold ${
            view === "paired"
              ? "text-success"
              : view === "rejected" || view === "error" || view === "timeout"
                ? "text-danger"
                : "text-ink"
          }`}
        >
          {view === "connecting" && <Spinner />}
          {view === "paired" && (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          )}
          {title}
        </span>
        {counting && (
          <>
            <span aria-hidden="true" className="text-muted [font-variant-numeric:tabular-nums]">
              {secondsLeft} s left
            </span>
            <span className="sr-only">About {coarse} seconds left.</span>
          </>
        )}
      </div>
      {counting && (
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-[3px] bg-wall">
          <div
            className="h-full rounded-[3px] bg-accent transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
            style={{ width: `${(secondsLeft / PAIR_TIMEOUT_SECS) * 100}%` }}
          />
        </div>
      )}
      {detail && <p className="m-0 text-ink">{detail}</p>}
    </div>
  );
}
