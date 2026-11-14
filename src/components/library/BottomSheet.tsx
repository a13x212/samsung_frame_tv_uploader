"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface BottomSheetProps {
  open: boolean;
  /** id of the element that names the sheet (its heading). */
  labelledBy: string;
  onClose: () => void;
  /** While true, Escape and backdrop clicks do not close the sheet. */
  busy?: boolean;
  /**
   * While true (another modal, e.g. a confirm dialog, is open on top), the
   * sheet ignores keyboard events so it doesn't fight that modal's focus trap.
   */
  suspended?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Phone-only modal bottom sheet (role="dialog"). Focus moves into the sheet on
 * open, is trapped while open and returns to the opener on close. Escape and
 * a backdrop tap close it. Sits at z-40: above the shell's tab bar (z-30) and
 * below ConfirmDialog (z-50), so a delete confirmation can open on top.
 */
export default function BottomSheet({
  open,
  labelledBy,
  onClose,
  busy = false,
  suspended = false,
  children,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const suspendedRef = useRef(suspended);
  onCloseRef.current = onClose;
  busyRef.current = busy;
  suspendedRef.current = suspended;

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (suspendedRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      const el = returnFocusRef.current;
      if (el && typeof el.focus === "function" && document.contains(el)) el.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[rgba(21,23,26,0.45)]"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[18px] bg-surface px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2 text-ink shadow-[0_-12px_32px_rgba(21,23,26,0.25)] focus:outline-none"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
        {children}
      </div>
    </div>
  );
}
