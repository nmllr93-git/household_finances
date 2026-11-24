# Larenest on Linux

There are three ways to run Larenest on Linux. They all run the same server and use the same data format, and the Larenest apps connect to any of them.

| Option | Best for | Updates |
|---|---|---|
| **Docker** | Home servers, NAS boxes (Unraid, TrueNAS, Synology), Proxmox, Raspberry Pi 4/5 | Pull the new image |
| **Installer (systemd service)** | A Linux server or always-on PC without Docker | Run the installer again |
| **Desktop app (AppImage or .deb)** | A Linux desktop, with the same window, tray and QR codes as on Windows | The AppImage updates itself; for the .deb, download the new one |

Requirements:

- **Processor:** x86-64 or ARM64. The installer also handles 32-bit ARM (armv7) when it downloads Node itself.
- **Disk space:** about 150 MB, plus your data.
- **Port:** one network port, 8080 by default.

---

## Docker

```yaml
# docker-compose.yml
services:
  larenest:
    image: ghcr.io/nmllr93-git/larenest:latest
    container_name: larenest
    restart: unless-stopped
    network_mode: host            # lets QR codes show your server's real address
    environment:
      TZ: America/Chicago
      LARENEST_ADMIN_USER: alex           # first login (only used when there are none)
      LARENEST_ADMIN_PASSWORD: change-me  # remove after you've signed in
    volumes:
      - ./data:/data
```

```sh
docker compose up -d
docker logs larenest      # shows the addresses and the certificate fingerprint
```

Then open `https://<server-address>:8080`. The browser warns once, because the certificate is your server's own (see *Encryption* below).

- **Without host networking** (Docker Desktop on Mac or Windows, or if you prefer port mapping): use `ports: ["8080:8080"]` and set `LARENEST_ADDRESSES: "192.168.1.20,myserver.local"`, so QR codes and links point at the server instead of the container.
- **Commands:**
    - `docker exec -it larenest node server.js add-user sam personal,shared`
    - `docker exec -it larenest node server.js passwd alex`
    - `docker exec larenest node server.js backup`
- **Data:** everything is in the `./data` folder: `finance.db`, the daily `backups/`, settings and keys. Back that folder up.
- **Raspberry Pi:** the image is multi-architecture, so the same compose file works on a Pi 4 or 5 running 64-bit Raspberry Pi OS.
- **Unraid, TrueNAS, Synology:** create a container from `ghcr.io/nmllr93-git/larenest:latest`. Map `/data` to a share, use host networking (or map 8080 and set `LARENEST_ADDRESSES`), and add the first login variables.

## Installer (systemd service)

```sh
curl -fsSL https://larenest.app/install.sh | sudo bash
# a different port:
curl -fsSL https://larenest.app/install.sh | sudo bash -s -- --port 8443
```

What it does:

- **Node:** uses Node 22.13+ if you already have it. Otherwise it downloads the official Node 22 build from nodejs.org into `/opt/larenest/node` and checks it against nodejs.org's published checksums.
- **App:** downloads the latest Larenest server from GitHub into `/opt/larenest/app`.
- **Data:** keeps it in `/var/lib/larenest`, owned by a `larenest` system user.
- **Service:** adds a hardened systemd service, `larenest`, that starts on boot and restarts if it crashes.
- **Command:** adds a `larenest` command: `larenest add-user <name> personal,shared`, `larenest passwd <name>`, `larenest users`, `larenest backup`.
- **First login:** asks you to create one if you're at a terminal.

| To | Run |
|---|---|
| See the logs | `journalctl -u larenest -f` |
| Update | Run the installer again (your data isn't touched) |
| Uninstall | `sudo bash /opt/larenest/app/scripts/install-linux.sh --uninstall` (data stays in `/var/lib/larenest`) |

Open port 8080 on the server's firewall if one is enabled, e.g. `sudo ufw allow 8080/tcp`.

## Desktop app

- **AppImage:** works on almost any distribution. Download `Larenest-<version>-linux-x86_64.AppImage` (or `-arm64`) from [larenest.app/download](https://larenest.app/download/), make it executable (`chmod +x`), and run it. It checks for updates itself.
- **.deb** (Debian, Ubuntu, Mint, Pop!_OS): `sudo apt install ./Larenest-<version>-linux-amd64.deb`. Install new versions the same way.

The desktop app works exactly as on Windows:

- the host window with Host options, QR codes for phones, and backups;
- a tray icon, if your desktop has one (GNOME needs the AppIndicator extension);
- **Start at login**, through `~/.config/autostart`.

Data is in `~/.local/share/household-finances`.

---

## Which devices can connect?

All of them, whichever way you run the server:

- **Android:** the Larenest app. Scan the QR code from ⚙ Settings → Connect a phone, then add home-screen widgets.
- **Windows and Mac:** the Larenest desktop app in "connect to another computer" mode, or any web browser.
- **iPhone and iPad:** Safari, until the iOS app is in the App Store. Open the server's address and use Share → Add to Home Screen for an app-like icon. Safari warns once about the server's own certificate. With Tailscale HTTPS (below) there's no warning.
- **Any other device:** any modern web browser.

## Encryption

The server makes its own HTTPS certificate on first start. The Larenest phone and desktop apps learn its fingerprint from the QR code and trust exactly that certificate, so connections from the apps are encrypted, even on plain home Wi-Fi. The fingerprint is printed in the log at startup.

A browser opening an `https://` address shows a one-time warning, because no public authority vouches for the certificate. For a warning-free address, use Tailscale (free):

1. Install Tailscale on the server and turn on **HTTPS Certificates** in the Tailscale admin console (DNS page).
2. Let Larenest use it:
    - **Installer setup:** run `sudo tailscale set --operator=larenest`, or add `TS_PERMIT_CERT_UID=larenest` to `/etc/default/tailscaled`, then restart Larenest. Larenest asks Tailscale for a certificate for the server's `*.ts.net` name and renews it automatically.
    - **Docker:** the container can't reach the host's Tailscale. Use `tailscale serve --bg --https=443 https+insecure://localhost:8080` on the host instead, which gives you a trusted `https://<server>.<tailnet>.ts.net` address.

Tailscale also lets your phone reach Larenest away from home, with nothing opened to the internet. **Don't** forward Larenest's port on your router.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `/data` (Docker), `/var/lib/larenest` (installer) | Database, backups, settings |
| `PORT` | `8080` | The one port for both HTTPS and HTTP |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `LARENEST_ADDRESSES` | (detected) | Comma-separated addresses other devices use to reach the server (needed for Docker bridge networking) |
| `LARENEST_ADMIN_USER` / `LARENEST_ADMIN_PASSWORD` | – | Create the first login when there are none |
| `TZ` | system | Time zone for bill dates and budgets |

Market and economy data keys (optional) are added in ⚙ Settings → Data sources, or in `$DATA_DIR/api-keys.json`.
