"use client";

import { useId } from "react";
import { MATTE_TYPES, MATTE_COLORS } from "@/lib/types";
import type { MatteTypeId, MatteColorId } from "@/lib/types";
import { MATTE_TYPE_PADDING, matteColorCss, matteColorLabel } from "@/lib/matte";

export interface MattePickerProps {
  matteType: MatteTypeId;
  matteColor: MatteColorId;
  onTypeChange: (type: MatteTypeId) => void;
  onColorChange: (color: MatteColorId) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * "Matte style" grid + "Matte color" swatches. Controlled: the parent owns
 * matteType / matteColor. Colour swatches are hidden when the type is "none".
 */
export default function MattePicker({
  matteType,
  matteColor,
  onTypeChange,
  onColorChange,
  disabled = false,
  className = "",
}: MattePickerProps) {
  const styleHeadingId = useId();
  const colorHeadingId = useId();

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      <div role="group" aria-labelledby={styleHeadingId} className="flex flex-col gap-2.5">
        <h3 id={styleHeadingId} className="m-0 text-[13px] font-semibold text-ink">
          Matte style
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {MATTE_TYPES.map((t) => {
            const on = t.id === matteType;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onTypeChange(t.id)}
                className={`flex min-h-[44px] min-w-0 flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] font-medium leading-tight text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 ${
                  on
                    ? "border-accent bg-accent-tint shadow-[inset_0_0_0_1px_#2447D6]"
                    : "border-line-strong bg-surface hover:border-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="box-border block aspect-video w-full rounded-[2px]"
                  style={{
                    background: t.id === "none" ? "#111111" : matteColorCss(matteColor),
                    padding: MATTE_TYPE_PADDING[t.id],
                  }}
                >
                  <span className="block h-full w-full bg-[#6B7078]" />
                </span>
                <span className="block w-full whitespace-normal break-words text-center">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {matteType !== "none" && (
        <div role="group" aria-labelledby={colorHeadingId} className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id={colorHeadingId} className="m-0 text-[13px] font-semibold text-ink">
              Matte color
            </h3>
            <span className="text-[13px] text-muted" aria-live="polite">
              {matteColorLabel(matteColor)}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,44px)] justify-between gap-2">
            {MATTE_COLORS.map((c) => {
              const on = c.id === matteColor;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={on}
                  title={c.label}
                  disabled={disabled}
                  onClick={() => onColorChange(c.id)}
                  className={`h-11 w-11 rounded-full border border-[rgba(21,23,26,0.2)] p-0 outline outline-2 outline-offset-2 transition-[outline-color] focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-[6px] disabled:cursor-not-allowed disabled:opacity-50 ${
                    on ? "outline-accent" : "outline-transparent hover:outline-line-strong"
                  }`}
                  style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
