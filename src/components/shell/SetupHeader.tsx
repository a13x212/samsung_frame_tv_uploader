import Logo from "./Logo";
import type { SetupStep } from "./types";

interface SetupHeaderProps {
  step: SetupStep;
  /** Name of the TV chosen in step 1, shown as "Found <name>" once done. */
  tvName?: string | null;
  /** When set, a "Cancel" action is shown (used during pairing). */
  onCancel?: () => void;
}

/** First-run header: logo + "Find TV -> Allow on TV -> Add photos" stepper. */
export default function SetupHeader({ step, tvName, onCancel }: SetupHeaderProps) {
  const currentIdx = step === "discover" ? 0 : 1;
  const steps = [
    currentIdx > 0 && tvName ? `Found ${tvName}` : "Find TV",
    "Allow on TV",
    "Add photos",
  ];

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line bg-surface px-4 py-3.5 sm:px-8">
      <Logo />
      <ol
        aria-label="Setup progress"
        className="m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0 font-medium"
      >
        {steps.map((label, idx) => {
          const done = idx < currentIdx;
          const current = idx === currentIdx;
          return (
            <li
              key={idx}
              aria-current={current ? "step" : undefined}
              className={`flex items-center gap-2 ${current ? "font-semibold text-ink" : "text-muted"}`}
            >
              {done ? (
                <span
                  aria-hidden="true"
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`box-border flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs ${
                    current ? "bg-accent text-white" : "border border-[#8A9099]"
                  }`}
                >
                  {idx + 1}
                </span>
              )}
              {/* On phones only the current step keeps its label */}
              <span className={current ? "" : "sr-only sm:not-sr-only"}>
                {label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-[44px] items-center px-2 font-medium text-accent hover:text-ink"
        >
          Cancel
        </button>
      ) : (
        // keeps the stepper centred between logo and the (absent) action
        <span aria-hidden="true" className="hidden w-[60px] sm:block" />
      )}
    </header>
  );
}
