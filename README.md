# Samsung Frame TV Uploader

Upload artwork to your Samsung Frame TV from your local network.

## Requirements

- Samsung Frame TV on the same local network as your machine
- Node.js 22+ (local) or Docker (container)

---

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

All variables are optional — defaults work out of the box.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `TV_APP_NAME` | `Frame Uploader` | Name shown on the TV during pairing |
| `TOKEN_STORE_PATH` | `./data/tv-tokens.json` | Where pairing tokens are persisted |
| `SSDP_TIMEOUT_MS` | `4000` | SSDP discovery timeout (ms) |
| `NETWORK_SCAN_TIMEOUT_MS` | `500` | Per-host scan timeout (ms) |

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

---

## TV Pairing

1. Open the app in your browser.
2. Enter your Frame TV's IP address (or use auto-discover if on Linux).
3. A PIN prompt will appear on the TV — enter it in the app.
4. The TV is now paired and ready to receive artwork.
