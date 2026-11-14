"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DiscoveredTV } from "@/lib/types";

interface TvSwitcherProps {
  tv: DiscoveredTV;
  /** Opens the disconnect confirmation (the shell owns the dialog). */
  onDisconnect: () => void;
  /** Phone header: hides the "Connected" word to save space. */
  compact?: boolean;
}

/** "● Kitchen TV  Connected  v" button with a small menu (Disconnect…). */
export default function TvSwitcher({ tv, onDisconnect, compact = false }: TvSwitcherProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-[44px] max-w-full items-center rounded-[10px] border border-line-strong bg-surface font-medium text-ink hover:border-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          compact ? "gap-2 px-3" : "gap-2.5 px-3.5"
        }`}
      >
        <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-success" />
        <span className="min-w-0 truncate">{tv.name}</span>
        <span className={compact ? "sr-only" : "font-normal text-muted"}>Connected</span>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#555A62"
          strokeWidth="2"
          className={`flex-none transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={tv.name}
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-[0_10px_24px_rgba(21,23,26,0.18)]"
        >
          <div className="px-3 py-2" role="none">
            <p className="m-0 truncate font-semibold text-ink">{tv.name}</p>
            <p className="m-0 text-xs text-muted">
              Connected · {tv.ip}
            </p>
          </div>
          <div className="my-1 h-px bg-line" role="none" />
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
            className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left font-medium text-danger hover:bg-ground focus-visible:bg-ground focus-visible:outline-none"
          >
            Disconnect…
          </button>
        </div>
      )}
    </div>
  );
}
