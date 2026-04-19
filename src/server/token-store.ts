import fs from "fs";
import path from "path";
import os from "os";

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
  const tmp = path.join(os.tmpdir(), `tv-tokens-${process.pid}.json`);
  fs.writeFileSync(tmp, json, { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(tmp, STORE_PATH);
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
