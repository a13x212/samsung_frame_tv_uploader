"use client";

import { useId, useState } from "react";
import type { DiscoveredTV } from "@/lib/types";
import { discoverTvs } from "@/lib/api-client";
import { ipv4Problem } from "./ipv4";
import Spinner from "./Spinner";
import { FOCUS_RING, SECONDARY_BUTTON } from "./styles";

interface ManualIpFormProps {
  onTvsFound: (tvs: DiscoveredTV[]) => void;
}

/** Add a TV by IP address. Always available, with or without a scan. */
export default function ManualIpForm({ onTvsFound }: ManualIpFormProps) {
  const id = useId();
  const inputId = `${id}-ip`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setSubmitted(true);
    setSuccess(null);

    const ip = value.trim();
    const problem = ipv4Problem(ip);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await discoverTvs({ manualIp: ip });
      if (!res.ok) {
        setError(res.hint ? `${res.error}. ${res.hint.replace(/\.$/, "")}.` : res.error);
        return;
      }
      onTvsFound(res.data.tvs);
      if (res.data.tvs.some((tv) => tv.ip === ip)) {
        setSuccess(`Added ${ip}. Press Connect next to it in the list.`);
        setValue("");
        setSubmitted(false);
      } else {
        setError("No Samsung TV answered at that address. Double-check it on the TV.");
      }
    } catch {
      setError("Network error. Make sure this device is on the same Wi-Fi as your TV.");
    } finally {
      setLoading(false);
    }
  };

  const onChange = (next: string) => {
    setValue(next);
    setSuccess(null);
    // Once the user has tried to submit, re-check as they type so the
    // message clears as soon as the address is fixed.
    if (submitted) setError(ipv4Problem(next));
  };

  const describedBy = error ? `${errorId} ${hintId}` : hintId;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface px-5 py-[18px]"
    >
      <h2 id={`${id}-heading`} className="m-0 font-sans text-sm font-semibold text-ink">
        Know your TV&apos;s IP address?
      </h2>
      <form noValidate onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="font-medium text-ink">
          TV IP address
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id={inputId}
            name="tv-ip"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="192.168.1.100"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`min-h-[48px] min-w-0 flex-1 rounded-[10px] border bg-surface px-3.5 text-base text-ink placeholder:text-muted [font-variant-numeric:tabular-nums] ${FOCUS_RING} ${
              error ? "border-danger" : "border-line-strong hover:border-muted"
            }`}
          />
          <button type="submit" disabled={loading} className={SECONDARY_BUTTON}>
            {loading ? (
              <>
                <Spinner />
                Checking…
              </>
            ) : (
              "Add TV"
            )}
          </button>
        </div>
        {error && (
          <p id={errorId} className="m-0 font-medium text-danger">
            {error}
          </p>
        )}
        <p id={hintId} className="m-0 text-[13px] text-muted">
          On the TV, open Settings &gt; General &gt; Network &gt; Network Status to see it.
        </p>
        <p role="status" className="m-0 text-[13px] font-medium text-success empty:hidden">
          {success}
        </p>
      </form>
    </section>
  );
}
