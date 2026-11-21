# Household Finances (self-hosted)

Your budget dashboard, running on your own computer. It has the same views as the Claude version:
- top-5 vendors
- income vs spending
- investments, checking & savings, and mortgage
- subscriptions
- budget vs actual
- a vendor search
- CSV statement import, statement balances and manual entries

Each login sees only its own budgets:

| Login | Budgets |
|---|---|
| `nate` | Nate – Personal, Shared household |
| `mckenna` | McKenna – Personal, Shared household |

On first start it loads the June–November 2026 history from your Google Sheets (Nate's personal and shared). McKenna's budget starts empty.

**Quick start (about 20 minutes):**
1. Install Node.js on the PC, unzip this folder, run `scripts\setup-windows.bat` (section 1).
2. Run `scripts\install-autostart.ps1` as Administrator so it starts with Windows (section 1).
3. Install Tailscale on the PC and run `tailscale serve --bg 8080` (section 2).
4. Install Tailscale on both phones and add the app to each home screen (section 2).

Already run your own WireGuard VPN? Use it instead of Tailscale for steps 3–4 (section 3).

It needs **no npm packages**: only Node.js 22.13 or newer. The data is one SQLite file, `data/finance.db`. A backup copy is written to `data/backups/` once a day, and the last 30 are kept.

---

## 1. Set it up on the Windows 11 PC

1. **Install Node.js.** Get the current **LTS** version from https://nodejs.org and accept the defaults.
2. **Put this folder somewhere permanent,** for example `C:\HouseholdFinances`. Keep it out of OneDrive or Dropbox folders, because cloud syncing a live database can corrupt it.
3. **Create the logins.** Double-click `scripts\setup-windows.bat` and type a password for Nate, then one for McKenna. Passwords don't show as you type.
4. **Start it.** Pick one:
   - **To try it out:** double-click `scripts\start-windows.bat`. Closing that window stops the server.
   - **To keep it running:** open **Terminal (Admin)** in the folder and run:
     ```
     powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
     ```
     This starts it in the background every time the PC boots, with no window. It also opens port 8080 on your home network only.
5. **Open it.** On the PC, go to http://localhost:8080. On a phone on the same Wi-Fi, use the "on your network" address the server prints, for example `http://192.168.1.50:8080`.

Make sure Windows treats your home Wi-Fi as a **Private** network: Settings → Network & internet → Wi-Fi → your network → Private. Also keep the PC from sleeping (Settings → System → Power) or the app can't be reached.

## 2. Use it from your phones, at home or away (recommended)

[Tailscale](https://tailscale.com) is free for personal use. It gives your devices a private network with real HTTPS, so you never open ports on your router. HTTPS also lets Android **install it like an app**.

The free Personal plan covers this: up to 6 users and unlimited devices, for non-commercial use.

**On the PC (do this first)**
1. Download Tailscale for Windows from https://tailscale.com/download and install it.
2. Click the Tailscale icon in the system tray and choose **Log in**. Sign in with your Google, Microsoft or Apple account; this creates your private network (your "tailnet").
3. Open the admin console at https://login.tailscale.com/admin. Under **DNS**, turn on **MagicDNS**, then turn on **HTTPS Certificates**.
4. Open a terminal (Start → Terminal) and run:
   ```
   tailscale serve --bg 8080
   ```
   It prints an address like `https://your-pc.tail1234.ts.net`. Write it down. Only devices on your tailnet can open it. The setting survives restarts, so you only run this once.

**Your Android phone**
1. Install **Tailscale** from the Play Store, open it and sign in with the **same account** you used on the PC. Leave it switched on.
2. In Chrome, open the `https://…ts.net` address and sign in to Household Finances as `nate`.
3. Tap **⋮ → Install app** (or **Add to Home screen**). It opens full-screen with its own icon, like a normal app.

**McKenna's iPhone**
1. In the Tailscale admin console go to **Users → Invite users** and enter her email. Or she can simply sign in to the Tailscale app with your account, if you're fine sharing that login.
2. She installs **Tailscale** from the App Store, accepts the invite (or signs in) and lets it add the VPN configuration. Leave it switched on.
3. In **Safari** (not Chrome; only Safari can install web apps on iPhone), she opens the `https://…ts.net` address and signs in as `mckenna`.
4. She taps **Share → Add to Home Screen → Add**. It opens full-screen from its own icon.

Two iPhone notes:
- An iPhone runs only one VPN at a time. If she uses another VPN (work, NordVPN, etc.), she switches between them.
- If the home-screen app goes unused for several weeks, iOS may sign her out. Nothing is lost; all data lives on the PC.

**If a phone can't connect:** check that the Tailscale app shows **Connected** on that phone and that the PC is on and awake. In the admin console's **Machines** list, both devices should appear.

You don't need to sideload an APK. If you ever want one anyway, the same web app can be wrapped with Capacitor; ask Claude to do it.

## 3. Or use your own WireGuard VPN instead of Tailscale

If you already run a WireGuard VPN into your home network, you can use it instead of Tailscale. Nothing in the app changes. It listens on port 8080 on the PC, and any device that can reach the PC's home address can open it, including a phone connected through WireGuard. The firewall rule from `install-autostart.ps1` allows connections from your VPN's addresses too, as long as the PC's network is set to **Private**.

**What you give up: HTTPS.** Tailscale's `serve` command is what gives the app a real `https://` address. Over WireGuard you'll use plain `http://192.168.x.x:8080`:
- **Everything still works.** Login, dashboards, imports and edits behave the same.
  - Away from home, traffic is encrypted inside the WireGuard tunnel.
  - At home, it crosses your own Wi-Fi unencrypted, which is normally fine.
- **The "installable app" part mostly goes away.** Browsers only allow app install and offline caching on HTTPS pages.
  - **Android:** Chrome offers **Add to Home screen** (a shortcut that opens in the browser) instead of **Install app**.
  - **iPhone:** Safari → Add to Home Screen still works, but it acts more like a bookmark.

**On the PC and router (do this first)**
1. **Give the PC a fixed address.**
   - In your router's settings, create a DHCP reservation for the PC, for example `192.168.1.50`.
   - Look under LAN, DHCP or "Address reservation".
   - Restart the PC (or run `ipconfig /renew`) and confirm the address with `ipconfig`.
2. **Set the PC's network to Private.** Go to Settings → Network & internet → Wi-Fi (or Ethernet) → your network → **Private**. The firewall rule only applies on Private networks.
3. **Check it locally first.** From a phone on your home Wi-Fi (VPN off), open `http://192.168.1.50:8080` and sign in. If this doesn't work, fix it before involving the VPN.

**WireGuard peer settings (each phone)**
1. **AllowedIPs:** each phone's profile must route your **home network**, not just the VPN's own subnet.
   - Example: `AllowedIPs = 10.8.0.0/24, 192.168.1.0/24`, using your own subnets.
   - If only the VPN subnet is listed, the phone can reach the VPN server but not the PC.
   - `0.0.0.0/0` (send all traffic home) also works.
2. **Make sure the VPN server forwards to the LAN.**
   - If WireGuard runs on your router, this is usually automatic.
   - If it runs on another machine at home (a Pi, a NAS), that machine needs IP forwarding turned on. It also needs either NAT/masquerade to the LAN or a route on the router back to the VPN subnet.
3. **Give McKenna her own peer.**
   - Create a separate peer with its own keys and VPN address for her iPhone.
   - Don't share yours, so either phone can be revoked on its own.

**Your Android phone**
1. Install the official **WireGuard** app from the Play Store and import your config (file or QR code). Turn the tunnel on.
2. In Chrome, open `http://192.168.1.50:8080` (your PC's address) and sign in as `nate`.
3. Tap **⋮ → Add to Home screen**.

**McKenna's iPhone**
1. She installs **WireGuard** from the App Store.
2. In the app, she taps **+ → Create from QR code**, scans the QR code for her peer, and allows the VPN configuration.
3. **Optional: connect automatically when away.** In the tunnel's settings, turn on **On-Demand** for cellular and for Wi-Fi networks other than your home Wi-Fi, so it connects whenever she leaves the house.
4. In **Safari**, she opens `http://192.168.1.50:8080` and signs in as `mckenna`.
5. She taps **Share → Add to Home Screen → Add**.

The same iPhone notes apply as with Tailscale:
- An iPhone runs one VPN at a time.
- iOS may clear a long-unused sign-in. No data is lost; it all lives on the PC.

**If a phone can't connect over WireGuard:**
- **The tunnel shows no handshake:** check the WireGuard server and the router's port forward for its UDP port.
- **It connects, but the page won't load:** check that AllowedIPs includes the home subnet, that the VPN server forwards to the LAN, that the PC's network is Private, and that the PC is awake.
- **Test the path from the phone with the tunnel on:** open `http://192.168.1.50:8080`. You can also ping the PC from the phone's terminal app, if it has one.

**Optional: get HTTPS back with a reverse proxy**

If you want the full app install over WireGuard, put a reverse proxy such as [Caddy](https://caddyserver.com) in front of the app on the PC, with a certificate. There are two ways to get one:
- **Use a domain you own (cleanest).**
  - Create a DNS record such as `finance.yourdomain.com` pointing to the PC's private address (`192.168.1.50`).
  - Have Caddy get a free Let's Encrypt certificate using the **DNS challenge** through your DNS provider's plugin. The PC doesn't need to be reachable from the internet.
- **Caddy's own internal certificate.**
  - Use `tls internal` in the Caddyfile.
  - Then install and trust Caddy's root certificate on every phone.
  - On iPhone, after installing the profile, turn it on under Settings → General → About → **Certificate Trust Settings**. This is fiddly.

A minimal Caddyfile (domain option):
```
finance.yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```
- Caddy sends the `X-Forwarded-Proto: https` header by default. The app needs it to mark the login cookie Secure.
- Open port 443 in Windows Firewall (Private profile) for Caddy.
- Phones then use `https://finance.yourdomain.com`. **Install app** on Android and full home-screen apps on iPhone work as they do with Tailscale.

## 4. Hosting on an old Android phone instead (optional)

It works: the server has no dependencies, so it runs under **Termux**. It's fine for a two-person household. A PC is still the steadier choice, because Android likes to kill background apps.

1. Install **Termux** from F-Droid (https://f-droid.org/packages/com.termux/). The Play Store version is outdated.
2. In Termux:
   ```
   pkg update && pkg install nodejs-lts unzip
   termux-setup-storage            # lets Termux read your Downloads folder
   cd ~ && unzip ~/storage/downloads/household-finance.zip
   cd household-finance
   node -e "require('node:sqlite'); console.log('ok')"   # must print ok
   node server.js add-user nate nate,shared
   node server.js add-user mckenna mckenna,shared
   sh scripts/start-termux.sh
   ```
   If the `node:sqlite` check fails, `pkg install nodejs` (the newest version) usually fixes it.
3. **Keep it alive:**
   - In Android settings, set Termux's battery use to **Unrestricted**.
   - `start-termux.sh` holds a wake lock so the phone doesn't sleep the server.
   - To start it automatically after a reboot, install the **Termux:Boot** add-on and copy `scripts/start-termux.sh` into `~/.termux/boot/`.
4. **Battery safety:** a phone left on the charger for months can swell. Use a phone that has a charge limit (often "Protect battery" or "Adaptive charging" set to 80%), keep it somewhere cool, and check it now and then.
5. Install the Tailscale app on that phone too. In Termux, Tailscale's `serve` command isn't available, so open `http://<phone's Tailscale name>:8080`. HTTPS app install from other phones won't be offered over plain http, but **Add to Home screen** still works.

## 5. Everyday use

- **Find your way around:** the bar at the top shows one group at a time: **Overview**, **Accounts**, **Expenses**, **Budget**, **Transactions**, **Import**, or **Everything**. Click any section heading (▾/▸) to fold it. Both are remembered in that browser.
- **Account details:** click the *Checking & savings*, *Investments* or *Subscriptions* card at the top to see each account (or subscription) with its balance and totals.
- **Switch budgets** with the tabs under the summary sentence.
- **Overview extras:** *Unusual this month* flags categories running 30%+ above their 6-month average; *Biggest purchases* lists the 10 largest expenses; the Income card shows how much of your income you kept. Clicking a row in any of these jumps to the matching transactions (clearing any old search text).
- **Your accounts** (Accounts view): every account grouped as Cash, Credit, Mortgage, Loans and Investments, with type, rate, latest balance, estimated monthly interest, totals, *Net cash after cards* and *Net worth*. **Edit** an account to set its type (checking, savings, money market, CD, credit card, mortgage, HELOC, 401(k), Roth IRA, HSA…), rate (APY/APR), owner, notes, credit limit (shows a usage bar), or loan payment + escrow + extra principal (shows payoff date and interest left). Untick **Active** to hide a closed account but keep its history.
- **Rules:** *+ New rule* → IF Description / Vendor / Category / Counts as / Amount (all must match) → SET Category, Vendor, Counts as, a tag, or Ignore. A live preview shows what a rule will match before you save; ↑/↓ sets which rule wins.
- **Tags** (e.g. "Colorado trip"): add them in a transaction's Edit window, the Tags column, or with a rule; *Tags* under Expenses totals each one across all time.
- **Net worth over time** (Accounts) charts cash + investments − debts by month. **Upcoming bills & 30-day cash forecast** (Overview) lists recurring charges due in the next 30 days and a rough end-of-month cash estimate.
- **Export CSV** under the transaction list downloads every transaction currently listed (respecting your filters and search).
- **Phones:** a round **+** button (bottom right) jumps straight to *Add income or an expense by hand*.
- **Accounts:** adding an account with a name that already exists updates that account instead of making a copy; names match regardless of capitals or an "Owner – " prefix, and the owner always shows as "(Nate)" after the name. If two entries are really the same account under different names, open one with **Edit** and choose **Same account as…** to merge them (its name becomes an alias, so future imports under either name land there). **Delete account** removes one created by mistake, along with its imported statements and balances.
- **Big monitors:** the page uses the full width and puts more sections side by side.
- **Needs attention** (top of Overview) lists things to fix so the numbers stay right: accounts with no new transactions in 35+ days, investment or loan balances 2+ months old, transactions needing a category, subscription price changes, and promo/rate dates coming up. Each has a button that takes you to the fix.
- **Price changes** for subscriptions and recurring bills show at the top of that section (e.g. "Netflix: $15.49 → $17.99").
- **Rate changes on:** set a date on an account (promo APR ending, CD maturing, savings rate review); it shows under the rate and in *Needs attention* from 60 days out.
- **Savings goals** (Accounts view): a target, an optional date, and either an account to track or an amount you enter. Shows progress and how much to save per month.
- **Spending by day of week** (Expenses view).
- **Year in review** (top bar): pick a year to see income, spending, what you kept, biggest and lightest months, top category and vendor, and a category table compared with last year. Click any month card for its snapshot (income, spending, kept %, biggest purchase, month-end cash, top categories and vendors vs the month before) and jump to that month's transactions.
- **Custom reports** (top bar, **+ Report**): make your own tab. Click **Edit**, use **Add a view** to pick any section, then size each one S (third), M (half), L (two-thirds) or F (full width) and move it with ↑/↓. Views sit side by side on a computer and stack on a phone. Reports are saved in each browser, so set them up separately on your phone and PC.
- **Holdings** (Accounts tab): add each stock, ETF or fund with its purchases (date, shares, price). Use **+ Buy more** for new purchases and **+ Sell shares** for sales; sales use the oldest shares first, so realized and unrealized gains are split correctly. Link a holding to an investment account, then press **Update account balances from holdings** to record today's value as that account's balance. Allocation by holding, type, sector and account is shown below the table, with a warning when one holding is over 20%.

- **Markets** (top bar, self-hosted app only): S&P 500, Nasdaq 100, Dow and Russell 2000 (through the SPY, QQQ, DIA and IWM funds) with today, 1-month and year-to-date change and a 3-month sparkline; gold, silver, oil and natural gas; sector performance (☆ to follow a sector and pin it to the top); and today's top gainers and losers. Data refreshes at most once an hour while the market is open, plus once after the close, and is saved in `data/market-cache.json` so restarts don't use extra calls. A manual Refresh is limited to once every 10 minutes. "Data check" at the bottom lists anything your API plan didn't return.

- **Settings** (⚙ Settings, right end of the top bar): per dashboard, choose Personal or Shared, the people and their % split (Shared), which tab to open on, the default date range, and the first day of the week. Settings, chart colors and custom reports are saved on the server, so they follow you to every device.
- **Chart colors:** every chart and ring has a small ⚙ in its top-right corner. Click it to pick colors for that chart; "Reset to default" undoes it. Settings → "Reset all chart colors" resets everything.
- **Who paid what** (Shared dashboards, Overview and Budget tabs): shared spending is credited to whoever owns the account it was paid from (set Owner on each account), compared with each person's share, with a "who owes whom" line.
- **Home, vehicles & other assets** (Accounts tab): enter a value and date; vehicles lose a set % per year (15% by default) and you're reminded to update values. Link a mortgage or auto loan to see equity. These count toward net worth in the top tile and the net worth ring.
- **More rings:** net worth (what you own vs. owe), subscriptions by yearly cost, and credit-card usage gauges on the Accounts tab.

- **Payoff schedule** (Mortgage & loans, needs the rate and payment on the account): payoff date, interest left, and a year-by-year table (tap a year for its months). Drag "Extra each month" to see how extra principal changes the payoff date and interest.
- **Dividends** (Holdings): with an FMP key, dividends for the last 12 months are estimated from FMP's dividend history and your shares on each ex-dividend date. Or enter dividends yourself on a holding (entered ones take priority). Shown per holding with yield, and as a total tile.
- **Watchlist** (Holdings): follow symbols you don't own, with an optional "alert below $" price; it's flagged ⚑ when the price drops under it.

- **Sharing balances with a shared dashboard** (self-hosted only): on a personal dashboard, edit an account (Accounts › Edit) or an asset and tick the shared dashboard under **Share value with**. For accounts you can also tick **Include month-end balance history**. Only the name, type, owner and balance (plus history, if ticked) are shared — never transactions. On the shared dashboard they appear under **Accounts › From personal dashboards**, read-only, updated whenever the owner opens their dashboard. Each has a ⚙ to choose where it counts: Cash & investments tile, Investments chart, Net worth (all on by default). If the shared dashboard already has its own entry with the same name, you'll be offered **Remove the copy here** or **Keep both**.

- **OFX / QFX import:** besides CSV and PDF, the Import form reads OFX and QFX files (most banks' "Download for Quicken" option). Transactions and the ledger balance are filled in automatically.
- **Transfer matching:** a payment out of checking/savings and the same amount arriving on a credit card or loan within 5 days are marked as one transfer, so they don't count as spending or income. The transaction editor shows "↔ Matched transfer with …"; change "Counts as" to override.
- **Backup & restore** (⚙ Settings): **Download backup** saves everything in the current dashboard to a JSON file. **Restore from backup…** replaces the dashboard's data with a backup file (two clicks to confirm); the server saves a full safety copy first. The server also keeps a daily full backup in `data/backups` (last 30).

- **Rates & economy** (Markets tab, self-hosted): mortgage and Treasury rates (FRED), inflation overall and for Midwest groceries, restaurants, energy, gasoline and shelter (BLS), Midwest gas and Iowa electricity prices (EIA) and Iowa City home prices (FHFA via FRED). Refreshed once a day and saved to `data/econ-cache.json`; a Data check lists anything unavailable.
- **Alerts in Needs attention:** your mortgage rate vs today's average (refinance check), savings rates far below Treasury bills, NHTSA recalls for vehicles with a VIN, and Iowa City home-price changes since you last valued your home. Bills due on a bank holiday or weekend are marked in Upcoming bills.
- **Vehicle VIN lookup:** in a vehicle asset, enter the VIN and press **Look up** to fill in year, make, model and trim (NHTSA, no key needed).
- **Year in review → After inflation:** your spending change for the year compared with Midwest price changes.

Keys for FRED, BLS and EIA go in the same `api-keys.json` (see below). NHTSA and the holiday calendar need no key.

- **Data sources (API keys)** in ⚙ Settings: lists each data service with what it adds (hover) and a link to sign up (click). Paste a key and press **Save keys**; it's written to `data/api-keys.json` and used right away. Only the first account created on the server can change keys; others see which are set.
- **Sections & details to show** in ⚙ Settings: untick any section or detail (for example Markets commodities, Economy inflation, Holdings watchlist) to hide it on that dashboard.
- **Holding details** (Holdings, ⓘ next to a symbol): 52-week range, next earnings date, analyst ratings and price target, recent news, and for ETFs/funds what they hold by sector. Fund sector weights are also used in the allocation "By sector".

### Live stock prices (optional API keys)

With no keys, the app tries Stooq's free delayed quotes. For better data, create free accounts at Finnhub (finnhub.io) and Financial Modeling Prep (financialmodelingprep.com), then create a file named `api-keys.json` in the app's `data` folder:

```json
{ "finnhub": "…", "fmp": "…", "fred": "…", "bls": "…", "eia": "…" }
```

Restart the app. Prices come from Finnhub first, then FMP, then Stooq; company names and sectors come from FMP (or Finnhub). Prices are cached for 15 minutes. Keep this file private: it's in the `data` folder, so don't share that folder or post it online. You can use the `FINNHUB_KEY` and `FMP_KEY` environment variables instead of the file.
- **Small screens:** sections reflow to fit without sideways scrolling; minor columns hide on narrow screens and come back when there's room.
- **Pick the time range** with "Show" at the top: last 3/6/12/24 months, this year, last year, all time or custom dates. Every chart and table follows it. Tick **Compare with the previous period** to see changes against the same number of months before.
- **Spending by category:** click a category in the chart, legend or table. The vendor list and transactions below narrow to it; "Show all categories" undoes it.
- **Quick fixes:** each row has an **Ignore** button (**Delete** for manual entries). Tick **Allow editing** above the table to change vendor, category and "counts as" right in the rows; each change saves as soon as you leave the field.
- **Fix a transaction:** in *Transactions*, press **Edit**. You can:
  - change the vendor or category
  - mark it one-time (left out of everyday spending) or a transfer (not counted)
  - split it across up to 4 categories
  - **Ignore transaction** to leave it out of every total (like deleting it). For a manual entry this button reads **Delete entry** and removes it for good.
  - tick "Do this for every transaction whose description contains…" to save a **rule** that also applies to past and future imports

  "Needs a category" shows anything an import couldn't place. Rules are listed under the table, each with a Remove button.

  Ignored transactions are listed under *Ignored transactions* (click to open), each with **Restore**. Tick the "every transaction whose description contains…" box before pressing Ignore to ignore all matching transactions with a rule. Remove that rule to bring them back.
- **Budgets:** in *Budget vs actual*, use **Set a monthly budget**: category, amount, starting month, and optional rollover. These replace the spreadsheet's plan for that category from that month on. For the current month, the faint bar and the Budget card show where you're headed at the current pace.
- **Statements:** under *Add statements*, choose the **Account** from the dropdown (or press **+** to add a new one with its type and name), then pick a CSV downloaded from your bank or card.
  - **PDF statements work too** (pick a .pdf in the same box; the app tells CSV and PDF apart). The PDF is read on your device, nothing is uploaded anywhere but your own server.
    - Checking, savings and credit card PDFs: the transaction table is read into the same preview as a CSV, and the ending balance is filled in.
    - Investment, retirement, loan and mortgage PDFs: only the ending balance is recorded. The app lists every balance it found; tick the one for this account.
    - If one PDF holds several accounts (e.g. SoFi checking, savings and vaults), choose which one you're importing from the list that appears.
    - Always glance at the preview and balance before saving; statement layouts vary by bank. Check the preview (purchases should show as "Out"), then press **Save import**.
  - Card payments and transfers between your own accounts are left out so nothing is counted twice.
  - Once a month has imported transactions for a budget, they replace that month's spreadsheet rows.
- **Account balances:** in *Record a statement balance*, choose the **Account** from the dropdown (its type and owner fill in automatically; press **+** for a new account), then enter the balance and its date ("Balance as of").
  - **Checking, savings and credit cards** then update themselves from the transactions you import. Use the **same account name** as on your imports.
  - Record each card as **Credit card (amount owed)**. That fills the *Credit cards* section and the "Net after cards" figure.
  - If a calculated balance ever drifts from the bank's figure, record a new balance with today's date.
  - **Investments, retirement and mortgage:** record the balance from each statement, since their values change without transactions.
- **Transactions table:** use **Columns** to show, hide or reorder columns (Description and Counts as are available). Drag a header's corner to resize it. **Ignore** hides a transaction from all totals; it can be restored under *Ignored transactions*. **Allow editing** lets you change vendor, category and type right in the rows. After changing a category there, **Apply to all** turns it into a rule. Rules can be edited.
- **Money that never shows on a statement** (like your brother paying for his phone line): use *Add income or an expense by hand*.
- **Mistakes:** each import and manual entry has a **Remove** button.
- **Download backup** (top right) saves the current budget's data as a JSON file.

## 6. Looking after it

| What | How |
|---|---|
| Change a password | `node server.js passwd nate`. This also signs that login out everywhere. |
| See logins | `node server.js users` |
| Back up now | `node server.js backup`. Copy `data/backups/` somewhere off the PC now and then (USB drive, cloud folder). |
| Restore a backup | Stop the server, replace `data/finance.db` with a file from `data/backups/`, start it again. |
| Move to another computer | Copy the whole folder, including `data/`. |
| PDF reading | Uses pdf.js (in `public/vendor/pdfjs`, Apache-2.0 license). |
| Change the port | Set the `PORT` environment variable, for example `set PORT=9000` before starting. |

**Security notes:**
- The app is meant for your home network and Tailscale only. Don't forward port 8080 on your router.
- Passwords are stored hashed (scrypt).
- Sign-ins expire after 60 days.
- After 10 wrong passwords from one device, that device has to wait 15 minutes.

## Checking the calculations (automatic tests)

From the app folder run `npm test`. It checks the core math behind the numbers — rules (AND and OR), ignore rules, edits beating rules, transfer matching, balance roll-forward and totals — and should end with `# fail 0`. Worth running after every update.

## 7. Updating to a new version

Your data lives only in the `data/` folder (`finance.db` plus `backups/`). A new zip never contains a `data/` folder, so updating means replacing the app files and leaving `data/` alone. The June–November sheet history is only loaded the first time the app starts, so updating won't duplicate it or undo your edits.

**Windows PC (same steps whether you use Tailscale or WireGuard)**
1. Open **Terminal (Admin)** in the app folder and stop the app:
   ```
   Stop-ScheduledTask -TaskName 'Household Finances'
   ```
   (If you start it with `start-windows.bat` instead, just close that window.)
2. Back up first: `node server.js backup`, or copy the `data` folder somewhere safe.
3. Unzip the new version **over** the existing folder (e.g. `C:\HouseholdFinances`) and choose **Replace the files** when Windows asks. Your `data` folder isn't touched.
4. Start it again:
   ```
   Start-ScheduledTask -TaskName 'Household Finances'
   ```
   or restart the PC. Then open http://localhost:8080 to check it.

**Network side: nothing to redo**
- **Tailscale:** the `tailscale serve --bg 8080` setting survives updates and restarts. The `https://…ts.net` address stays the same.
- **WireGuard:** the PC's address and port don't change, so phone configs stay as they are.

**Phones**
- The app caches itself for speed and picks up the new version on the next load. If a phone still shows the old layout, close the app fully (swipe it away) and reopen it, or pull down to refresh in the browser.
- **iPhone home-screen app:** close and reopen it; occasionally it needs a second reopen. If it still looks old, open the address in Safari once, then reopen the home-screen app.
- You don't need to reinstall the home-screen app or sign in again.

**Android phone hosting (Termux)**
1. In Termux, stop the server with **Ctrl+C** (or `pkill node`).
2. Back up: `cd ~/household-finance && node server.js backup`
3. Copy the new zip to the phone's Downloads, then:
   ```
   cd ~ && unzip -o ~/storage/downloads/household-finance.zip
   ```
   (`-o` overwrites the app files; `data/` isn't in the zip, so it's kept.)
4. Start it again: `cd household-finance && sh scripts/start-termux.sh`

**After updating to the Nov 20 (evening) version:** an earlier bug could save an investment balance as a checking/savings account. Open **Accounts → Cash**; if an investment name (e.g. "Empower 401k") is listed there, use **Edit → Delete account** on it and record that balance again with the account dropdown. Merge any remaining duplicate names with **Edit → Same account as…**.

**If a page looks half-updated** (a missing dropdown or button) right after updating, press **Ctrl+F5** on the PC, or fully close and reopen the app on a phone. From the Nov 20 version on, the server tells browsers to always check for newer files, so this shouldn't happen again.

**If something goes wrong after an update:** stop the app, put your backup back as `data/finance.db` (see *Restore a backup* above), and unzip the previous version.

## How it's built

| File | What it does |
|---|---|
| `server.js` | The web server, logins, the database, the API and the daily backups (Node built-ins only). |
| `public/` | The app itself. `charts.js`, `calcs.js`, `page.js` and `import.js` are the same code as the Claude dashboard. `runtime.js` stands in for the Claude dashboard features they used; `app.js` handles signing in and switching budgets. |
| `seed/` | The spreadsheet history loaded on first start. |
| `public/vendor/d3.min.js` | The d3 charting library (ISC license, see `d3-LICENSE.txt`). |

Vendor-name rules live at the top of `public/calcs.js` (the `RULES` list), for example `[/^office chair$/i, 'Amazon']`. Add a line there to group another description under a store.

### Dividend calendar & sector movers
- **Holdings → Dividend calendar:** the next 12 months of expected dividends, projected from each holding's recent payment pattern (monthly, quarterly, semiannual, annual) times your current shares. Hover a month for the breakdown. Hide it under Settings → Sections & details.
- **Markets → Top movers:** each mover shows its sector. Once you follow (★) a sector, an **All sectors / Followed sectors** button filters the list. Sectors come from Finnhub and are cached on disk (`data/sector-cache.json`), with at most 20 new lookups per refresh.

### Where your data lives
`node server.js where` prints the data folder, database, settings, API keys and backups locations.
- Default: `./data` next to `server.js` (unchanged for existing installs). Override with `DATA_DIR=...` or `--data <folder>`, or put `{ "dataDir": "D:/Finance" }` in a `config.json` next to `server.js`.
- The desktop and phone apps set `FD_APPMODE`, which uses your per-user folder (Windows `%APPDATA%\HouseholdFinances`).
- `<data>/config.json` holds `{ "mode": "local" | "host", "port": 8080 }`. **local** = only this computer can open it; **host** = other devices (home network or Tailscale) can too. Change it with `node server.js mode local` / `mode host`. The `PORT` and `HOST` environment variables still win.

### Budget ring markers
The budget ring shows **today** (how much of the month has passed) and a dashed **pace** marker (where spending will land at month end). Pace extrapolates everyday categories, and counts a single bill that already covers most of its budget (mortgage, utilities) as paid instead of multiplying it. Turn either marker off under Settings → Sections & details.

### Running the server from another program (desktop app)
`require('./server.js')` doesn't start anything by itself. It gives you:
- `start({ mode, port, quiet })` → resolves with `info()`; rejects with a clear message if the port is in use
- `stop()` → frees the port immediately ("Stop hosting")
- `info()` → `{ running, mode, port, url, lan: [addresses], dataDir, users }`
- `setMode('local' | 'host')` → saves and restarts on the same port if running
- `addUser(name, password, [budgetIds])`, `books()`, `backup()` for a first-run setup screen

`node server.js` works exactly as before and now shuts down cleanly on Ctrl+C.
