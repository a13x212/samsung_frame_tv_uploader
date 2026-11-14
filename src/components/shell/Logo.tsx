/** App mark + name. `compact` shows the short title only (phone header). */
export default function Logo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <span className="font-display text-base font-semibold text-ink">Frame TV</span>;
  }
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-md bg-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <rect x="7.5" y="9" width="9" height="6" />
        </svg>
      </span>
      <span className="font-display text-base font-semibold text-ink">Frame TV Uploader</span>
    </div>
  );
}
