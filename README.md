# Samsung Frame TV Uploader

Upload artwork to your Samsung Frame TV from your local network.

## Requirements

- Samsung Frame TV on the same local network as your machine
- Node.js 22.23.4 or newer 22.x (local; see `.nvmrc`, e.g. `nvm use`) or Docker (container; the image pins `node:22.23.4-alpine`)

---

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **macOS: "Find My TV" finds nothing / `EHOSTUNREACH`?**
> macOS Local Network Privacy (Sequoia+) silently blocks Homebrew-installed Node from reaching the LAN — discovery probes fail instantly even though the TV is online. As a workaround, run the dev server with `sudo` (root bypasses the per-binary privacy check):
>
> ```bash
> sudo npm run dev
> ```
>
> A cleaner permanent fix is to install Node from the official notarized installer at [nodejs.org](https://nodejs.org) instead of Homebrew, then grant it access under System Settings → Privacy & Security → Local Network.

### Environment variables

All variables are optional — defaults work out of the box.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `TV_APP_NAME` | `Frame Uploader` | Name shown on the TV during pairing |
| `TOKEN_STORE_PATH` | `./data/tv-tokens.json` | Where pairing tokens are persisted |
| `SSDP_TIMEOUT_MS` | `4000` | SSDP discovery timeout (ms) |
| `NETWORK_SCAN_TIMEOUT_MS` | `500` | Per-host scan timeout (ms) |
| `TRUST_PROXY` | _(unset)_ | Express `trust proxy` value (hop count, `true`, `loopback`, CIDR). Set only when behind a reverse proxy; otherwise clients can spoof `X-Forwarded-For` and bypass rate limits |

---

## Running with Docker

### macOS

```bash
docker-compose up
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** SSDP auto-discovery does not work on macOS Docker because `network_mode: host` is Linux-only. Enter your TV's IP address manually in the UI instead.

### Linux

For SSDP auto-discovery to work, switch to host networking. Edit `docker-compose.yml`:

```yaml
services:
  frame-uploader:
    network_mode: host   # replaces the ports mapping
    # ports:             # remove or comment this out
    #   - "3000:3000"
```

Then:

```bash
docker-compose up
```

The app is still accessible at [http://localhost:3000](http://localhost:3000) — no port mapping needed with host networking.

### Persisting TV pairing tokens

The `tv-tokens` Docker volume keeps your TV paired across container restarts. To reset all pairings:

```bash
docker-compose down -v
```

### Upgrading from an older image (volume ownership)

The container now runs as the unprivileged `node` user (uid 1000) instead of root. A fresh `tv-tokens` volume picks up the correct ownership automatically, but a volume created by an older root-running image is still owned by root, and the app won't be able to write tokens to it. Fix it once before starting the new image.

Docker Compose prefixes volume names with the project name, which defaults to the directory name (lowercased), so the volume is `<project>_tv-tokens`, e.g. `samsung_frame_tv_uploader_tv-tokens`. Check with `docker volume ls`, then run:

```bash
docker run --rm -v <project>_tv-tokens:/app/data alpine chown -R 1000:1000 /app/data
```

---

## TV Pairing

1. Open the app in your browser.
2. Enter your Frame TV's IP address (or use auto-discover if on Linux).
3. A PIN prompt will appear on the TV — enter it in the app.
4. The TV is now paired and ready to receive artwork.
