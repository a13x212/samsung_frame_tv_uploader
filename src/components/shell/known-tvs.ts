// Remembers (per browser) which TVs have been paired before, so the shell can
// tell a first-time pairing (-> "Add photos") from a returning TV (-> "On the TV").
// Best effort only: storage can be unavailable (private mode, blocked).

const KEY = "frameTv.knownTvIds";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function isKnownTv(tvId: string): boolean {
  return read().includes(tvId);
}

export function rememberTv(tvId: string): void {
  try {
    const ids = read();
    if (!ids.includes(tvId)) {
      window.localStorage.setItem(KEY, JSON.stringify([...ids, tvId].slice(-20)));
    }
  } catch {
    // ignore
  }
}
