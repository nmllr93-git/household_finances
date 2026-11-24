# Larenest

A private budgeting and net-worth dashboard for a household, run on your own computer. Your statements, balances and budgets stay on a machine you control. Nothing goes to a cloud service unless you turn on the optional market-data features, and even those only send stock symbols, never your financial data.

**What it does**
- Imports bank and card statements (CSV, PDF, OFX/QFX) and sorts transactions into categories and vendors.
- Shows spending, income, budgets, subscriptions, net worth, investments, loans and savings goals in charts and tables.
- Supports several **budgets** (called *dashboards* in the app), such as one per person plus a shared household one. Each login sees only the dashboards it's allowed to.
- Optional: live stock prices, market overview, interest rates and inflation, using free API keys.

**Ways to run it**

| Option | Best for | Section |
|---|---|---|
| **Desktop app (Windows installer)** | Easiest. One install; a tray icon starts and stops it. | [A](#a-desktop-app-windows) |
| **Self-hosted server (Node.js)** | An always-on PC or home server; full control from the command line. | [B](#b-self-hosted-server-windows-linux-macos) |
| **Phone / other devices** | Opening the dashboard from phones and laptops once A or B is running. | [C](#c-using-it-from-phones-and-other-devices) |
| **Android app, phone-only** | One person, no PC: everything stays on the phone. | [mobile/README.md](mobile/README.md) |
| **Old Android phone as the server** | Experimental, low-power hosting. | [D](#d-hosting-on-an-old-android-phone-optional) |

Both A and B use the same data format, so you can switch between them later (see [Moving between setups](#moving-between-the-desktop-app-and-the-self-hosted-server)).

---

## Contents
- [Key ideas](#key-ideas)
- [A. Desktop app (Windows)](#a-desktop-app-windows)
- [B. Self-hosted server](#b-self-hosted-server-windows-linux-macos)
- [C. Using it from phones and other devices](#c-using-it-from-phones-and-other-devices)
- [D. Hosting on an old Android phone](#d-hosting-on-an-old-android-phone-optional)
- [First steps after installing](#first-steps-after-installing)
- [Basic configuration](#basic-configuration)
- [Feature guide](#feature-guide)
- [Optional data sources (API keys)](#optional-data-sources-api-keys)
- [Maintenance: backups, passwords, updates](#maintenance)
- [Moving between setups](#moving-between-the-desktop-app-and-the-self-hosted-server)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [For developers](#for-developers)

---

## Key ideas

- **Server:** the program that stores the data and serves the pages. It runs on one computer, the *host*. Every other device just opens it in a browser or the app.
- **Dashboard (budget):** a separate set of accounts, transactions and budgets. A typical household has *Alex – Personal*, *Sam – Personal* and *Shared household*. Each dashboard can be marked Personal or Shared in Settings.
- **Login:** a username and password. Each login is given access to one or more dashboards. Logins never see dashboards they weren't given.
- **Data folder:** one folder holds everything: the database (`finance.db`), daily backups, settings, API keys and caches. Back this folder up and you've backed up everything.
- **Modes:**
  - **local:** only the host computer can open the dashboard. Most private.
  - **host:** other devices on your home network, or anywhere over a VPN like Tailscale, can sign in too.

---

## A. Desktop app (Windows)

The app bundles everything it needs. The PCs you install it on don't need Node.js.

### A1. Get the installer
1. Go to the **Releases** page of the public releases repository (`household_finances-releases`).
2. Under the newest release, download **`Larenest Setup x.y.z.exe`**.
3. Run it. Windows SmartScreen may say *"Windows protected your PC"*, because the installer isn't code-signed. Click **More info → Run anyway**.
4. Pick an install folder, or keep the default, and finish. A desktop shortcut and a Start-menu entry are created.

### A2. First-run setup
The app opens a short setup screen.

1. **How will you use this computer?**
   - **Keep my finances on this computer:** this PC becomes the host. Continue to step 2.
   - **Connect to another computer:** the data lives on a server somewhere else. You'll be asked for its address; see [C2](#c2-the-connect-screen-desktop-and-android-apps).
2. **Who can open it?**
   - **Only this computer:** local mode.
   - **This computer, my phone and other devices:** host mode. You can change this any time from the tray icon.
3. **Port:** keep **8080** unless another program already uses it. If a self-hosted copy is running on this PC, either stop it first or use **8081**.
4. **Data folder:** the default is `%APPDATA%\HouseholdFinances`.
   - **Moving from the self-hosted server?** Choose that install's `data` folder, the one containing `finance.db`. The screen confirms *"Found existing finance data"* and uses it as-is.
5. **Start with Windows:** tick it to have the app start quietly in the tray when you sign in.
6. Click **Start**. If the data folder has no logins yet, you're asked to **create a login**: name, password (8+ characters) and which dashboards it can see. You can add more logins from the same screen.
7. Click **Open dashboard** and sign in with the login you just made.

A brand-new data folder starts with two empty dashboards, **Personal** and **Shared household**. You can rename them, add more, and set each one's type in the app (see [Basic configuration](#basic-configuration)).

### A3. Host options and the tray icon
When this PC is the host, the app window has two tabs: **Dashboard** and **Host options**. Host options has every control listed below, so you can manage hosting over Remote Desktop or on a virtual display without the tray. If you close the window, reopen it from the Start menu or desktop shortcut.

There's also a tray icon (bottom right, by the clock) controls the server. Right-click it for:

| Menu item | What it does |
|---|---|
| **Open dashboard** | Shows the window. Clicking the icon does the same. |
| Status line | ● Running · this computer only / ● Running · other devices can connect / ○ Stopped |
| **Start server / Stop server** | Turns the server on or off. Stopping makes it unreachable from every device. |
| **Allow other devices** | Switches between local and host mode. Takes effect immediately. |
| **Phone & other device addresses** | Your network and Tailscale addresses; click one to copy it. |
| **Tailscale** | Shows whether Tailscale is on, or links to download it. |
| **Start with Windows** | Starts the app in the tray when you sign in. |
| **Back up now** | Writes a backup to the data folder's `backups` folder. |
| **Open data folder** | Opens it in File Explorer. |
| **Check for updates…** | Looks for a newer version (see [Updating](#updating)). |
| **Change setup…** | Reopens the setup screen: change port or folder, add logins. |
| **Quit** | Stops the server and closes the app. |

Closing the window doesn't stop the server; it keeps running in the tray. Use **Quit** to stop it.

The first time you allow other devices, Windows may ask whether to let **Node.js** through the firewall. Choose **Private networks** only.

### A4. Where the desktop app keeps things
| What | Where |
|---|---|
| Finance data (database, backups, API keys, settings) | The data folder chosen in setup, default `%APPDATA%\HouseholdFinances` |
| App preferences (role, port, start with Windows) | `%APPDATA%\Larenest\desktop.json` |
| Server log | `%APPDATA%\Larenest\server.log` |

Uninstalling the app does **not** delete your finance data.

---

## B. Self-hosted server (Windows, Linux, macOS)

Use this for an always-on machine, or if you prefer running it yourself. It needs **no npm packages**, only **Node.js 22.13 or newer**.

### B1. Install on Windows
1. **Install Node.js:** download the current **LTS** from https://nodejs.org and accept the defaults.
2. **Unzip the app** somewhere permanent, for example `C:\HouseholdFinances`. Don't use a OneDrive or Dropbox folder; syncing a live database can corrupt it.
3. **Create logins:** double-click `scripts\setup-windows.bat`. It:
   - checks your Node.js version,
   - lists the existing dashboards (on a new install, `personal` and `shared`),
   - optionally creates another dashboard (for example id `sam`, name `Sam – Personal`),
   - asks for each login's name, the dashboards it can see (for example `personal,shared`) and a password. Typed passwords don't show. Leave the login name blank to finish.
4. **Start it** in one of two ways:
   - **To try it out:** double-click `scripts\start-windows.bat`. Closing that window stops the server.
   - **To keep it running in the background:** open **Terminal (Admin)** in the folder and run:
     ```
     powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
     ```
     This creates a scheduled task, **Larenest**, that starts the server at boot with no window. It also opens port 8080 to your home (Private) network only.
5. **Open it:** on the PC, go to http://localhost:8080. The server also prints *"on your network"* addresses (like `http://192.168.1.50:8080`) for other devices.

Also check two Windows settings:
- Your home network should be set to **Private**: Settings → Network & internet → Wi-Fi or Ethernet → your network → **Private**. The firewall rule only applies on Private networks.
- If other devices need to reach the PC, stop it from sleeping: Settings → System → Power.

### B2. Install on Linux or macOS
**Linux:** the easiest options are Docker (`ghcr.io/nmllr93-git/larenest`, with a ready `deploy/docker-compose.yml`) or the one-line installer (`curl -fsSL https://larenest.app/install.sh | sudo bash`), which sets Larenest up as a service that starts on boot. Both are covered in [docs/LINUX.md](docs/LINUX.md). By hand, on Linux or macOS:
```bash
# Node.js 22.13+ from https://nodejs.org or your package manager
unzip household-finance.zip && cd household-finance
node server.js budgets                          # list dashboards
node server.js add-budget sam "Sam – Personal"  # optional: create another
node server.js add-user alex personal,shared    # prompts for a password
node server.js                                  # start (Ctrl+C to stop)
```
To keep it running after reboots on Linux, use the installer above; it creates a hardened systemd service.

### B3. Command-line reference
Run these from the app folder. Commands that change logins can be run while the server is running.

| Command | What it does |
|---|---|
| `node server.js` | Starts the server |
| `node server.js budgets` | Lists dashboards with their ids |
| `node server.js add-budget <id> <name>` | Creates a dashboard, or renames one if the id exists |
| `node server.js add-user <name> <ids>` | Creates a login (or replaces its dashboard list), then asks for a password. Example: `add-user sam sam,shared`. Add `:view` for **view-only** access, e.g. `add-user parent shared:view`. |
| `node server.js passwd <name>` | Changes a password and signs that login out everywhere |
| `node server.js users` | Lists logins and their dashboards |
| `node server.js backup` | Writes a backup now |
| `node server.js where` | Shows the data folder, database, settings, API keys and backups paths |
| `node server.js mode local` / `mode host` | Only this computer / other devices too (applies on next start) |

Options you can add to any command: `--data <folder>` (use a different data folder) and `--port <n>`.

### B4. Data folder and settings
- **Default data folder:** `data/` next to `server.js`. Override it, in order of priority, with:
  1. the `DATA_DIR` environment variable, or `--data <folder>`,
  2. `{ "dataDir": "D:/Finance" }` in a `config.json` next to `server.js`.
- **`<data folder>/config.json`** holds `{ "mode": "local" | "host", "port": 8080 }`. It's created when you run `mode` (or by the desktop app). Without it, the server runs in host mode on port 8080.
- The environment variables `PORT` and `HOST` override everything; for example, `HOST=127.0.0.1` makes the server local-only.

---

## C. Using it from phones and other devices

The host must be in **host mode**:
- **Desktop app:** tray → **Allow other devices**.
- **Self-hosted:** host is the default.

### C1. At home (same Wi-Fi)
Open the host's network address in a browser, for example `http://192.168.1.50:8080`.
- **Desktop app:** tray → *Phone & other device addresses* copies it.
- **Self-hosted:** the server prints it when it starts.

To make the address stable, give the host a **DHCP reservation** in your router's settings, usually under LAN, DHCP or "Address reservation".

### C2. The connect screen (desktop and Android apps)
When an app is set to **Connect to another computer**, it shows a connect screen.
1. Type the server address: `192.168.1.50:8080`, a Tailscale name like `my-pc.tail1234.ts.net:8080`, or a full `https://…` address. If you leave out `http://` and `:8080`, they're added.
2. The app checks that the address really is Larenest, then opens its sign-in page.
3. Recent addresses are remembered on that device as one-tap buttons.

If it can't connect, check that the host is on and awake and in host mode, that this device is on the same network (or Tailscale is on), and that the address and port are right.

### C3. Away from home with Tailscale (recommended)
[Tailscale](https://tailscale.com) creates a private network between your devices, with no router ports opened. The free Personal plan covers a household.

**On the host:**
1. Install Tailscale from https://tailscale.com/download and sign in. That creates your private network, the *tailnet*.
2. In the admin console (https://login.tailscale.com/admin), under **DNS**, turn on **MagicDNS** and **HTTPS Certificates**.
3. *(Optional but recommended: gives you HTTPS and an installable phone app.)* In a terminal run:
   ```
   tailscale serve --bg 8080
   ```
   It prints an address like `https://my-pc.tail1234.ts.net`. Only devices on your tailnet can open it, and the setting survives restarts.

**On each phone:**
1. Install **Tailscale** (Play Store or App Store) and sign in to the same tailnet. Invite other household members under **Users → Invite users** in the admin console.
2. Open the `https://…ts.net` address. Without `serve`, use `http://my-pc:8080` instead.
3. Sign in and add the app to your home screen:
   - **Android (Chrome):** ⋮ → **Install app**.
   - **iPhone:** use **Safari**, then Share → **Add to Home Screen**. Only Safari can install web apps on iPhone.

iPhone notes:
- iPhones run one VPN at a time.
- iOS may sign out a home-screen app that goes unused for weeks. Nothing is lost; the data is on the host.

### C4. Using your own WireGuard VPN instead
If you already run WireGuard into your home network, it works too. Nothing in the app changes.
- Each phone's peer needs `AllowedIPs` that include your **home subnet** (for example `10.8.0.0/24, 192.168.1.0/24`), not just the VPN subnet.
- The VPN server must forward to the LAN. That's usually automatic on routers; on a Pi or NAS, enable IP forwarding and NAT.
- Give each person their own peer, so one phone can be revoked without affecting the others.
- Open `http://<host LAN address>:8080`.

Plain `http://` works for everything except installing the dashboard as an app and offline caching. Browsers require HTTPS for those. To get HTTPS over WireGuard, put a reverse proxy like [Caddy](https://caddyserver.com) in front:
```
finance.yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```
For the certificate, either use a domain you own with Caddy's DNS-challenge plugin (the PC doesn't need to be public), or use `tls internal` and trust Caddy's root certificate on each phone. Open port 443 on the Private firewall profile.

**Never forward port 8080 on your router to the internet.**

---

## D. Hosting on an old Android phone (optional)
The server has no dependencies, so it runs under **Termux**. It's fine for a small household, but a PC is steadier, because Android likes to stop background apps.

1. Install **Termux** from F-Droid (https://f-droid.org/packages/com.termux/). The Play Store version is outdated.
2. In Termux:
   ```
   pkg update && pkg install nodejs-lts unzip
   termux-setup-storage
   cd ~ && unzip ~/storage/downloads/household-finance.zip && cd household-finance
   node -e "require('node:sqlite'); console.log('ok')"    # must print ok; if not: pkg install nodejs
   node server.js add-user alex personal,shared
   sh scripts/start-termux.sh
   ```
3. Set Termux's battery use to **Unrestricted**. `start-termux.sh` holds a wake lock. For auto-start after a reboot, install **Termux:Boot** and copy `scripts/start-termux.sh` into `~/.termux/boot/`.
4. **Battery safety:** a phone kept on the charger for months can swell. Use a charge limit (often called "Protect battery", 80%) and keep it somewhere cool.

---

## First steps after installing

A suggested order for a new household:

1. **Sign in** at the host's address, or in the desktop app.
2. **Set up each dashboard:** open **⚙ Settings** (right end of the top bar):
   - **Dashboard type:** Personal or Shared. For Shared, add each person and their **% share** of shared costs (for example 50/50); this feeds *Who paid what*.
   - Pick the tab to open on, the default date range and the first day of the week. Click **Save settings**.
3. **Add your accounts:** go to the **Import** tab.
   - **Import a transactions file** for checking, savings and credit cards. Choose the account (or **+** to add one, with its type), then pick a CSV, PDF, OFX or QFX file from your bank's website. Check the preview (purchases should show as *Out*) and click **Save import**.
   - **Record a statement balance** for investment, retirement and mortgage accounts. Pick the account, then enter the ending balance and date.
4. **Fix categories:** in **Transactions**, tick **Needs a category** and edit each one. To save time, tick *"Do this for every transaction whose description contains…"* to make a **rule** that also applies to past and future imports.
5. **Set budgets:** in **Budget**, use **Set a monthly budget** (category, amount, starting month, optional rollover).
6. **Fill in account details:** in **Accounts → Your accounts → Edit**, set each account's type, interest rate, owner, credit limit or loan payment.
7. **Optional:** add savings goals, your home and vehicles as assets, investment holdings, and API keys for market data.

---

## Basic configuration

All of these are per dashboard, saved on the server, and follow you to every device.

### ⚙ Settings page
| Setting | What it does |
|---|---|
| **Dashboard type** | *Personal* (one person) or *Shared*. Shared adds people and % shares for *Who paid what*. |
| **Open on** | Which tab shows first |
| **Default range** | The starting date range (last 3/6/12/24 months, this year, etc.) |
| **Week starts on** | Sunday or Monday, for the spending calendar |
| **Top-row tiles** | Choose which summary tiles show at the top |
| **Hide cents** | Round money to whole dollars |
| **Sections & details to show** | Untick any section, or a detail inside one, to hide it. Examples: the spending calendar, Markets commodities, the dividend calendar, the budget ring's *today* or *pace* marker. |
| **Reset all chart colors** | Undo all chart color changes |
| **Data sources (API keys)** | Add optional market and economy keys ([details](#optional-data-sources-api-keys)) |
| **Backup & restore** | Download or restore this dashboard's data |
| **Recent changes** | Who added or removed what on this dashboard (statements, manual entries, edits, rules, budgets, accounts, goals, holdings, restores), kept for about a year. Settings, colors and shared balances aren't listed. |
| **Weekly email** | A short weekly summary by email for each of your dashboards: last week's spending and top categories, the month's budget, bills due in the next 7 days, cash on hand, and anything needing a category. Pick the day and time; **Send me one now** to test. The server owner sets the sending account once (Gmail: `smtp.gmail.com`, port 465, with an app password; Outlook: `smtp-mail.outlook.com`, port 587). Server and desktop host only. |

Click **⚙ Settings** again to go back to the tab you were on.

### Chart colors
Every chart and ring has a small **⚙** in its top-right corner. Use it to pick colors for that chart (handy for color-blindness); **Reset to default** undoes it.

### Accounts
In **Accounts → Your accounts**, click **Edit** on an account to set:
- **Type:** checking, savings, high-yield savings, CD, credit card, mortgage, HELOC, auto or student loan, 401(k), IRA, HSA, 529 and more.
- **Rate** (APY or APR), **owner**, **notes**, and a **rate-change date** (a promo ending or a CD maturing).
- **Credit limit** (shows a usage bar), and **loan payment / escrow / extra principal** (shows the payoff date).
- **Active:** untick to hide a closed account but keep its history.
- **Same account as…:** merges two names for one account. The old name becomes an alias, so future imports land in the right place.
- **Share value with:** shares this account's balance with a shared dashboard ([details](#sharing-balances-with-a-shared-dashboard)).

### Rules
In **Transactions → Rules**, click **+ New rule**.
- **IF** Description, Vendor, Category, Counts as or Amount matches. All conditions in a group must match; add an **OR** group for alternatives.
- **SET** Category, Vendor, Counts as, a tag, or *Ignore*.
- A live preview shows what a rule will match before you save. Rules run top to bottom; use ↑/↓ to reorder. If two rules set the same field, the lower one wins.

### Transactions table
- **⚙ Columns** shows, hides and reorders columns. Drag a header edge to resize it.
- **Allow editing** lets you edit vendor, category and type right in the rows.
- **Export CSV** downloads what's currently listed.

### Custom reports
Click **+ Report** in the top bar to make your own tab. Click **Edit**, then **Add a view** to add any section. Size each one S, M, L or F (full width) and reorder with ↑/↓. Reports sync across devices.

---

## Feature guide

### Overview
- **Top tiles:**
  - **Cash flow:** income versus spending, shown as numbers, a ring or bars.
  - **Budget:** a ring with a **today** marker (how much of the month has passed) and a dashed **pace** marker (where spending will land at month end). A single bill that already covers most of its budget, like the mortgage, counts as paid instead of being projected forward.
  - **Where the income went:** kept, everyday spending, mortgage or rent, utilities, subscriptions.
  - **Cash & investments**, and **Mortgage & loans**.
- **Needs attention:** stale accounts, uncategorized transactions, subscription price changes, upcoming rate changes and, with API keys, refinance and savings-rate alerts. Each item has a button that takes you to the fix.
- **Unusual this month:** categories at least 30% (and $50) above their 6-month average.
- **Biggest purchases:** the 10 largest expenses. Toggles hide the mortgage, subscriptions or recurring bills.
- **Upcoming bills & 30-day cash forecast:** bills that land on a weekend or bank holiday are marked.
- **Who paid what** (Shared dashboards): each person's spending versus their share, with a "who owes whom" line.

### Expenses
- Top 5 vendors, income versus spending, spending by category (click one to filter everything below), subscriptions with price-change history, spending by vendor, tags (for trips and events), and a spending calendar by day.

### Budget
- Budget versus actual per category, with rollover, pace bars and the budget ring.
- **Change** edits a category's budget; **Remove** stops budgeting that category from the month you're viewing onward (earlier months keep their history). This works for budgets set in the app and for ones imported from a spreadsheet.

### Accounts
- **Your accounts:** grouped as cash, credit, loans and investments, with balances, estimated interest, *Net cash after cards* and *Net worth*.
- **Net worth over time**, **Checking & savings**, **Investment accounts** charts.
- **Savings goals:** a target, an optional date, and progress from a linked account or an amount you enter.
- **Home, vehicles & other assets:** enter a value; vehicles depreciate a set % per year (15% by default). Link a loan to see equity, and use **Look up** to fill in a vehicle's details from its VIN. These count toward net worth.
- **Mortgage & loans:** balance history, a payoff ring, and a **payoff schedule** with an *extra each month* slider.
- **Holdings** (stocks, ETFs and funds):
  - Add purchases as lots; sales use the oldest shares first.
  - Shows allocation by holding, type, sector and account.
  - Shows dividends (last 12 months, plus a **dividend calendar** for the next 12) and a **watchlist** with price alerts.
  - **Import positions from a brokerage CSV:** download *Positions* as CSV from Fidelity, Vanguard, Schwab, E*TRADE or similar, review the list, pick the account, and import. Each position becomes a holding with one lot at your average cost. Tick *Replace* to overwrite holdings you already have for the same symbol and account. Money-market and cash lines are skipped.
  - **Allocation rings:** by type, by asset class and by account (holdings without a live price count at cost). Hide them under Settings → Sections & details.
  - **ⓘ details** show the 52-week range, earnings date, analysts' ratings, news and what a fund holds.
  - **Update account balances from holdings** records today's value on the linked investment accounts.

### Sharing balances with a shared dashboard
On a **personal** dashboard, edit an account or asset and tick the shared dashboard under **Share value with**. For accounts, you can also share month-end history.
- Only the name, type, owner and balance are shared, never transactions.
- A **⇄** badge marks shared items; hover it to see where they're shared.
- On the shared dashboard, they appear under **Accounts → From personal dashboards**, read-only. Use each item's ⚙ to choose where it counts (cash and investments, investments chart, net worth).
- If the shared dashboard already has its own entry with the same name, you can choose **Remove the copy here** or **Keep both**.

### Transactions
- Search, filter by type, and edit any transaction. In the editor you can:
  - change the vendor or category,
  - mark it **one-time** (left out of everyday spending) or a **transfer** (not counted),
  - **split** it across up to 4 categories,
  - **tag** it,
  - **ignore** it (restore it later under *Ignored transactions*).
- **Transfer matching:** a payment out of checking or savings that arrives on a card or loan for the same amount within 5 days counts as one transfer, not spending.
- **Receipt photos:** in a transaction's **Edit** window, **+ Add a receipt photo** opens the camera on a phone (or a file picker on a computer). Photos are shrunk to a sensible size, shown as thumbnails (tap to open full size), and marked 📎 in the transaction list. They're included in backup files.
- **Manual entries:** the round **+** button (bottom right) adds income or an expense that never appears on a statement.

### Markets and economy (need API keys)
- **Markets:** S&P 500, Nasdaq 100, Dow and Russell 2000 (via the SPY/QQQ/DIA/IWM funds), gold, silver, oil and gas, sector performance, and top gainers and losers.
  - ☆ follows a sector and pins it to the top.
  - **Followed sectors** filters the movers list.
  - Data refreshes at most once an hour while the market is open, plus once after the close.
- **Screener** (Markets, FMP key): find US companies by sector, size, dividend yield and price; **+ Watch** adds one to your watchlist. Results for the same filters are reused for 6 hours. If your FMP plan doesn't include the screener, it says so.
- **Economic calendar** (Rates & economy, FRED key): upcoming inflation (CPI), jobs, GDP, retail sales, Fed rate decisions and similar reports for the next few weeks.
- **Treasury savings options & exchange rates** (Rates & economy, no key): today's I bond rate, average Treasury bill/note/TIPS rates, and a currency converter (European Central Bank rates). A trip tag can show its total in another currency.
- **Rates & economy:** mortgage and Treasury rates, inflation (overall and Midwest categories), gas and electricity prices, and local home prices. Updated daily.

### Planning
- **90-day cash forecast:** checking and savings projected day by day: expected paychecks in (any income that arrived at least twice in the last 4 months, at its real monthly total), recurring bills out (from *Subscriptions & recurring*) and your typical other spending. It shows the lowest point and warns if it falls below your cushion (**Warn me below**, $500 by default). Lists the upcoming paychecks and bills.
- **Debt payoff planner:** every credit card and loan with a balance (tick **Include mortgage** to add it). Compare **minimum payments only**, **avalanche** (highest rate first, least interest) and **snowball** (smallest balance first), and drag **Extra each month** to see the debt-free date and the interest saved. When a debt is paid off, its payment rolls into the next one. Uses each account's rate and payment from Accounts → Edit; cards with no payment set use a typical minimum (marked *est.*).

- **Net worth projection & retirement:** enter your age, retirement age, monthly savings, the yearly spending you plan in retirement, expected return, inflation and withdrawal rate (sensible defaults come from your own history). It charts your investments to age 95 in today's and future dollars, the amount you'd need to retire (spending ÷ withdrawal rate), the age you'd reach it, and how long the money lasts.
- **Tax summary:** pick a year to see spending that often matters at tax time (charity, medical and dental, HSA/FSA, mortgage and property tax, education, childcare, work expenses, energy-efficient home), anything you tag "tax", and income received, with a CSV for you or your tax preparer. It's a starting point, not tax advice.

### Year in review
Pick a year to see income, spending, what you kept, the biggest and lightest months, the top category and vendor, and an **after inflation** comparison. Click a month for its snapshot and calendar.

### Importing statements
| Format | Notes |
|---|---|
| **CSV** | Download it from your bank's website. Columns are detected; adjust them in the preview if needed. |
| **PDF** | Read on your own device. Checking, savings and card PDFs give transactions plus the ending balance; investment and loan PDFs give the balance only. If one PDF holds several accounts, pick one. |
| **OFX / QFX** | Your bank's "Download for Quicken" option. Transactions and balance are filled in automatically. |

Once a month has imported transactions, they replace any older spreadsheet-loaded rows for that month. Every import has a **Remove** button.

---

## Optional data sources (API keys)

None of these are required. Everything except Markets, Rates & economy and live prices works without them. All have free plans.

| Service | Adds | Sign up |
|---|---|---|
| **Finnhub** | Live stock prices, company sectors, news, analysts' ratings, earnings dates | https://finnhub.io |
| **Financial Modeling Prep (FMP)** | Indexes, commodities, sector performance, top movers, dividends, price targets, fund holdings (250 calls/day) | https://site.financialmodelingprep.com/developer/docs |
| **FRED** (St. Louis Fed) | Mortgage and Treasury rates, home price index | https://fred.stlouisfed.org/docs/api/api_key.html |
| **BLS** | Inflation by category | https://data.bls.gov/registrationEngine/ |
| **EIA** | Gasoline and electricity prices | https://www.eia.gov/opendata/register.php |

NHTSA (vehicle VIN look-up and recalls) and the holiday calendar need no key.

**Adding keys:** **⚙ Settings → Data sources**. Hover a name for what it adds, click it to sign up, then paste the key and click **Save keys**. Keys take effect right away. Only the **first login created on the server** can change keys; other logins see which keys are set.

Other ways to add keys:
- Create `api-keys.json` in the data folder:
  ```json
  { "finnhub": "…", "fmp": "…", "fred": "…", "bls": "…", "eia": "…" }
  ```
  Save it as plain text. Windows may add a hidden `.txt` ending; the Data check message warns if it does.
- Set the environment variables `FINNHUB_KEY`, `FMP_KEY`, `FRED_KEY`, `BLS_KEY` or `EIA_KEY`.

Keys are stored only on the host. Calls are cached and paced to stay within the free limits (market data at most hourly, economy data daily), and caches are saved in the data folder so restarts don't use extra calls.

---

## Automatic bank sync (SimpleFIN, optional)

Instead of importing statements you can let the app pull balances and new transactions from your banks. It uses **SimpleFIN Bridge**, a separate read-only service that you subscribe to yourself (about $15 a year, paid to SimpleFIN). Your bank logins go to SimpleFIN, never to this app.

1. Sign up at https://beta-bridge.simplefin.org and connect your banks there.
2. In SimpleFIN Bridge, create a **setup token** and copy it.
3. In the app open **⚙ Settings → Automatic bank sync**, paste the token and press **Connect**. Each dashboard has its own connection.
4. Check each bank account's name and type. Use the same name as an account you already import statements for, so the history lines up. Untick any account you don't want here (for example, your partner's accounts in your personal dashboard).
5. Press **Sync now**. After that it syncs about every 6 hours (on the phone in phone-only mode: when the app is open).

Good to know:
- Only **posted** transactions are added; pending ones wait until they post, so nothing is counted twice.
- Transactions that match a statement you already imported (same date, amount and description) are skipped.
- Credit card, loan and mortgage balances are saved as amounts owed.
- The connection link is stored in `simplefin.json` in the data folder (on the phone: on the phone only). It is **not** included in backups or exports. Treat that file like a password; delete the connection with **Disconnect** or revoke it in SimpleFIN Bridge.
- SimpleFIN allows about 24 checks a day, so **Sync now** can be used once every 15 minutes.

## Maintenance

### Backups
- **Automatic:** a full backup is written to `<data folder>/backups` once a day. The last 30 are kept.
- **On demand:** desktop tray → **Back up now**, or `node server.js backup`.
- **Per dashboard:** **⚙ Settings → Backup & restore → Download backup** saves a JSON file. **Restore from backup…** replaces that dashboard's data; the server saves a safety copy first.
- **Off the machine:** copy the `backups` folder to a USB drive or cloud folder now and then.
- **Full restore:** stop the server, replace `finance.db` in the data folder with a file from `backups`, then start it again.

### Logins and passwords
- **View-only logins** can see a dashboard but not change it: the page shows a *View only* badge and hides editing controls, and the server refuses changes. Command line: `add-user <name> shared:view`. Desktop app: choose *View only* next to the dashboard when creating the login.
- **Desktop app:** tray → **Change setup…** → **Add another login**.
- **Self-hosted:** `node server.js add-user <name> <dashboards>`. Change a password with `node server.js passwd <name>`.
- Sign-ins last 60 days. After 10 wrong passwords, a device must wait 15 minutes.

### Updating
**Desktop app:**
- It checks for updates once a day and from tray (or **Help**) → **Check for updates…**.
- It asks before downloading, and again before restarting.
- Your data folder is never touched by an update.

**Self-hosted server on Windows:**
1. Stop it: `Stop-ScheduledTask -TaskName 'Larenest'` in Terminal (Admin), or close the `start-windows.bat` window.
2. Back up: `node server.js backup`.
3. Unzip the new version **over** the existing folder and choose **Replace the files**. The `data` folder isn't in the zip, so it isn't touched.
4. Start it: `Start-ScheduledTask -TaskName 'Larenest'`, or restart the PC. Open http://localhost:8080 to check.

**Self-hosted server on Linux, macOS or Termux:** stop the server, back up, run `unzip -o` with the new zip over the folder, and start it again.

**Phones** pick up the new version on the next load. If one still looks old, fully close the app and reopen it. On a PC, press **Ctrl+F5**. You don't need to reinstall or sign in again. Tailscale, WireGuard and addresses don't change with an update.

**If an update goes wrong:** stop the server, restore `finance.db` from a backup, and reinstall the previous version.

---

## Moving between the desktop app and the self-hosted server

Both use the same data folder layout (`finance.db`, `backups/`, `api-keys.json`, caches).

**Self-hosted to desktop app (same PC):**
1. Stop the self-hosted server and disable its autostart:
   ```
   Stop-ScheduledTask -TaskName 'Larenest'
   Disable-ScheduledTask -TaskName 'Larenest'
   ```
   Disabling (instead of removing) lets you switch back easily.
2. Back up: copy the self-hosted `data` folder somewhere safe.
3. Install the desktop app. In setup, choose **Keep my finances on this computer**, keep port **8080** (now free), and under **Data folder** choose the self-hosted install's `data` folder (for example `C:\HouseholdFinances\data`). Leave the data where it is; don't move it while you're switching. Or copy its contents into `%APPDATA%\HouseholdFinances` first if you want the default location.
4. Choose the same mode you had before. If phones used to connect, pick *This computer, my phone and other devices*.
5. Existing logins, dashboards, API keys and phone addresses keep working. A Tailscale `serve` setting for port 8080 keeps working too.

**Desktop app to self-hosted:** quit the app (tray → Quit), turn off **Start with Windows**, and start the self-hosted server with `--data` pointing at the app's data folder (or copy that folder's contents into `data/`).

**To another computer:** stop the server, copy the whole data folder to the new machine, and point the new install at it.

---

## Troubleshooting

| Problem | Try |
|---|---|
| "Port 8080 is already in use" | Another copy is running (for example the self-hosted scheduled task alongside the desktop app). Stop one, or choose another port. |
| A phone can't connect | Is the host on and awake, and in host mode? Is the phone on the same Wi-Fi, or Tailscale *Connected*? Is the PC's network set to **Private**? Did Windows block Node.js at the firewall? Allow it on Private networks. |
| The page looks half-updated | Click **⟳ Refresh** (top right, next to your name). It throws away cached files and reloads everything from the server. |
| Markets say "No API keys found" | Add keys under ⚙ Settings → Data sources. The **Data check** link lists what's missing. |
| Markets say "1 item unavailable" | That data isn't included in your free plan, or the service was briefly down. It retries on the next refresh. |
| An investment shows up under Cash | Edit it and set the right type, or **Delete account** and record the balance again with the right type. |
| Duplicate accounts with slightly different names | Edit one → **Same account as…** to merge them. |
| SmartScreen blocks the installer | **More info → Run anyway**. The installer isn't code-signed. |
| Desktop app won't start the server | Check `%APPDATA%\Larenest\server.log`. |
| Forgot a password | On the host: `node server.js passwd <name>`. Desktop app: tray → **Change setup…** and re-create the login with the same name, which replaces its password. |

---

## Security notes
- Designed for your home network and a private VPN (Tailscale or WireGuard). **Don't expose port 8080 to the internet.**
- Passwords are stored hashed (scrypt). Sign-ins expire after 60 days, and repeated wrong passwords are rate-limited.
- API keys stay on the host. Only stock symbols, never your finances, are sent to market data services.
- The data folder holds everything sensitive. Keep backups somewhere private, and don't share or publish that folder.

---

## For developers

**Project layout**

| Path | What it is |
|---|---|
| `server.js` | Web server, logins, SQLite database (`node:sqlite`), API, backups, market/economy data. Node built-ins only. |
| `public/local.js` | Phone-only mode: answers the dashboard's `/api` requests on the device (IndexedDB) using the shared core. Does nothing unless the phone app turned it on. |
| `core/market.js` | Shared market, economy, price and vehicle data with its pacing and caching rules, used by the server and phone-only mode. Data services and storage are passed in. |
| `digest.js` | Weekly email: builds each summary with the dashboard's own calculations (`public/calcs.js`) and sends it with a small built-in SMTP client (TLS on 465, STARTTLS on 587). |
| `core/books.js` | Shared dashboard data rules (validation, load, save, export, restore) used by the server and the phone's on-device mode. No Node or browser APIs; storage is passed in. |
| `public/` | The web app: `page.js` (all views), `calcs.js` (data calculations), `charts.js`, `import.js` (CSV/OFX), `pdfstatement.js`, `runtime.js` (data loading and drawing), `store.js` (single data connector), `app.js`, `login.js`, `sw.js` (offline cache). |
| `seed/` | *Optional*, git-ignored. `books.json` plus spreadsheet exports, loaded the first time a new database is created. Without it, you get two empty dashboards. |
| `scripts/` | Windows setup, start and autostart scripts, and the Termux starter |
| `test/` | `npm test`: calculations (rules, transfer matching, balances, totals), the server's data API end to end (sign-in, access rules, save/load/delete, export/restore), the shared core on its own, and market/economy data with fake services (answers, caching, pacing, persistence) |
| `desktop/` | Electron desktop app ([desktop/README.md](desktop/README.md)) |
| `apps/` | Shared icons and the connect screen for the desktop and Android apps ([apps/README.md](apps/README.md)) |
| `.github/workflows/` | Builds and publishes the desktop installer when `desktop/package.json`'s version changes |

**Using the server from another program:** `require('./server.js')` doesn't start anything on its own. It exports `start({ mode, port, quiet })`, `stop()`, `info()`, `setMode(mode)`, `addUser(name, password, ids)`, `books()` and `backup()`. Running `node server.js` directly works as described above.

**Data connector:** every request from the pages goes through `FDStore.fetch()` in `public/store.js`. A future on-device backend can plug in with `FDStore.use({ fetch })` and answer the same `/api/…` paths.

**Vendor-name clean-up** lives at the top of `public/calcs.js` (the `RULES` list), for example `[/^office chair$/i, 'Amazon']`.

**Licenses:** d3 (ISC, `public/vendor/d3-LICENSE.txt`), pdf.js (Apache-2.0, `public/vendor/pdfjs`). The desktop app bundles Electron and Node.js (MIT).
