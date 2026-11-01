import fs from "fs";
import path from "path";
import crypto from "crypto";

const STORE_PATH = process.env.TOKEN_STORE_PATH
  ? path.resolve(process.env.TOKEN_STORE_PATH)
  : path.resolve(process.cwd(), "data", "tv-tokens.json");

interface TokenEntry {
  token: string;
  ip: string;
  savedAt: string; // ISO date
}

interface TokenStore {
  [tvId: string]: TokenEntry;
}

function ensureDir(): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore(): TokenStore {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as TokenStore;
  } catch {
    return {};
  }
}

function writeStore(store: TokenStore): void {
  ensureDir();
  const json = JSON.stringify(store, null, 2);
  // Write to a temp file then rename — atomic on POSIX, protects against partial writes on crash.
  // The temp file lives next to the store (not in os.tmpdir()): rename() across filesystems
  // fails with EXDEV (e.g. Docker volume vs. /tmp), and a predictable name in a shared /tmp
  // invites symlink attacks. "wx" = O_CREAT|O_EXCL, so an existing file or symlink at the
  // random path makes open fail instead of being followed.
  const tmp = path.join(
    path.dirname(STORE_PATH),
    `.${path.basename(STORE_PATH)}.${crypto.randomBytes(8).toString("hex")}.tmp`
  );
  try {
    const fd = fs.openSync(tmp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, json, { encoding: "utf-8" });
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw err;
  }
  // Ensure the final file has restricted permissions (rename preserves source mode on most OSes).
  try { fs.chmodSync(STORE_PATH, 0o600); } catch { /* non-POSIX FS — best effort */ }
}

export function saveToken(tvId: string, ip: string, token: string): void {
  const store = readStore();
  store[tvId] = { token, ip, savedAt: new Date().toISOString() };
  writeStore(store);
}

export function loadToken(tvId: string): string | null {
  const store = readStore();
  return store[tvId]?.token ?? null;
}

export function deleteToken(tvId: string): void {
  const store = readStore();
  delete store[tvId];
  writeStore(store);
}

export function loadAllTokens(): TokenStore {
  return readStore();
}
