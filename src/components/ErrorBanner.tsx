interface ErrorBannerProps {
  error: string;
  hint?: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ error, hint, onDismiss }: ErrorBannerProps) {
  return (
    <div role="alert" className="rounded-xl border border-danger-line bg-[#FCF3F2] py-3 pl-4 pr-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 py-1">
          <svg
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div className="min-w-0">
            <p className="m-0 font-semibold text-danger">{error}</p>
            {hint && <p className="m-0 mt-1 text-ink">{hint}</p>}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-danger transition-colors hover:bg-[#F6E3E1] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
            aria-label="Dismiss"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
