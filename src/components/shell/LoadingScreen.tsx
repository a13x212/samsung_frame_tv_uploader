import Logo from "./Logo";

/** Neutral placeholder while the saved session is being restored. */
export default function LoadingScreen() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center border-b border-line bg-surface px-4 py-3.5 sm:px-8">
        <Logo />
      </header>
      <div
        role="status"
        className="flex flex-col items-center justify-center gap-3 px-4 py-32 text-muted"
      >
        <svg aria-hidden="true" className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#D5D8DC" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="#15171A" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span>Loading…</span>
      </div>
    </div>
  );
}
