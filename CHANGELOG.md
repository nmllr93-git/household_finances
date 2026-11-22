# Changelog

Each release on the releases page uses its section below as its description. Add a new section (newest first) before releasing.
Headings must be exactly `## Desktop <version>` or `## Android <version>`.

## Desktop 1.0.14

### New
- **Mac app (test version):** downloads for Intel Macs (`mac-x64.dmg`) and Apple Silicon (`mac-arm64.dmg`), with host, connect-to-a-server and this-Mac-only modes. Needs macOS 12 Monterey or newer. It isn't signed yet: the first time, open it from **System Settings → Privacy & Security → Open Anyway**. While hosting for other devices the Mac stays awake; **Check for updates** opens the download page.

### Improvements
- Phones: a solid strip behind the status bar, so the page no longer shows through it while scrolling.

## Android 1.4.3

### Improvements
- A solid strip behind the status bar, so the page no longer shows through it while scrolling.

## Desktop 1.0.13

### Improvements
- Phones: the section tabs fold into menus (**Overview ▾, Spending ▾, Wealth ▾, More ▾** and ⚙), so the bar fits without scrolling sideways. Computers still show every tab.
- Phones: rename, add, remove and regroup those menus in ⚙ Settings → **Phone menus** (saved per phone; **Reset to default** restores them).
- Phones: the budget ring's today/pace markers get a small key under the ring instead of labels that were cut off.
- The section bar stays below the phone's status bar while scrolling.

## Android 1.4.2

Same changes as Desktop 1.0.13 (phone section menus you can customize, budget ring marker key, section bar below the status bar).

## Desktop 1.0.12

### Improvements
- The ⚙ on each tile now sits in the tile's top-right corner, clear of the chart (easier to tap on phones).
- Mortgage payments now count toward budgets, under **Mortgage**. Each month's payment is counted once: from your bank account if it can be found, otherwise from your imported mortgage statement. Turn it off in ⚙ Settings → **Budgets: mortgage payments**.
- Data sources (API keys) on phones: each source is a card; tap **What's this?** to see its description.
- The frozen section menu is now a tab bar (underlined current section; scrolls sideways on phones).

### Fixes
- Sign-in page: removed the large gaps between the username and password boxes.

## Android 1.4.1

Same changes as Desktop 1.0.12 (tile ⚙ placement, mortgage payments in budgets, data sources cards, tab-bar menu, sign-in spacing).

## Desktop 1.0.11

### New
- **Automatic bank sync (SimpleFIN Bridge).** In ⚙ Settings, paste a SimpleFIN setup token, name each bank account and choose its type, then sync. It syncs about every 6 hours. Only posted transactions are added, ones you already imported are skipped, and the connection isn't included in backups. SimpleFIN is a separate service (about $15/year, paid to SimpleFIN).
- **Show/Hide button** on every password box (sign-in, email settings, API keys, desktop setup).

### Fixes
- Data folder protection: setup no longer accepts a data folder inside the app's own folder (updates replace that folder). An existing setup pointing there is moved to `AppData\Roaming\HouseholdFinances` automatically, with a message.
- The built-in server restarts automatically if it stops unexpectedly (for example, ended in Task Manager).

## Android 1.4.0

### New
- Automatic bank sync (SimpleFIN Bridge), also in phone-only mode (syncs when the app is open; the connection stays on the phone).
- Show/Hide button on password boxes.

## Desktop 1.0.10

The desktop updates since 1.0.4 (1.0.5–1.0.9 did not publish correctly), plus release fixes.

### New
- **Planning:** net worth projection and retirement estimate; tax summary with CSV export.
- **Economy:** Treasury savings options (I bonds, bills, notes, TIPS); exchange rates with a converter; economic calendar (FRED release dates).
- **Stock screener** (Financial Modeling Prep) with add-to-watchlist.
- **Weekly email digest:** a short summary per dashboard on your chosen day and time; the server owner sets up the sending account.
- **View-only logins** (can see a dashboard but not change it) and a **Recent changes** activity log.
- **Receipt photos** on transactions (camera capture, thumbnails, included in backups).
- **"Not recurring"** marker for vendors that look like subscriptions but aren't (for example, Venmo).

### Improvements
- Phones: toggles fit their tiles, content stays clear of the status bar, transaction list shows as cards on narrow screens.

### Fixes
- Phones: the keyboard no longer closes right after it opens (for example, when adding a vehicle).
- PDF statement import now works in iPhone Safari.
- In-app updates: the installer and its update files are published together with matching names, fixing "cannot find latest.yml" and the 404 on download.

## Desktop 1.0.9

Replaced by 1.0.10 (this upload's update file pointed to the wrong installer name). Install 1.0.10 or newer.

## Desktop 1.0.8

Incomplete upload. Install 1.0.10 or newer.

## Android 1.3.0

### New
- Built for Android 16 (API 36) as required by Google Play; a signed Play Store bundle (.aab) is built with each release.
- "Not recurring" marker for vendors.

### Fixes
- Toggles fit their tiles; content stays clear of the status bar; transaction list shows as cards on narrow screens.
- The keyboard no longer closes right after it opens.

## Android 1.2.0

### New
- Phone-only mode: first-run walkthrough, create and rename dashboards on the phone, backup reminder, bill reminder notifications.
- Planning: net worth projection, retirement estimate, tax summary.
- Economy: Treasury savings options, exchange rates, economic calendar; stock screener.
- Receipt photos on transactions (camera).

## Android 1.1.0

### New
- **Phone-only mode:** keep your data on the phone with no PC needed (daily on-phone backups, share a backup file).
- Market, economy and live price data in phone-only mode.
- New start screen: connect to a server or keep data on this phone.

## Desktop 1.0.4

### New
- **Planning tab:** 90-day cash forecast and debt payoff planner.
- Import brokerage positions from a CSV.
- Investment allocation rings.

## Desktop 1.0.3

### New
- **⟳ Refresh** button: reloads the newest version of the page and all data (no more Ctrl+F5).

### Fixes
- Any budget category can be removed, including ones from imported budgets.

## Desktop 1.0.2

### New
- **Host options** tab inside the app (everything from the tray menu), for when the tray isn't reachable (remote desktop, virtual displays).

### Fixes
- Update check reads the desktop release directly.

## Desktop 1.0.1

### Fixes
- Repairs a data folder stuck as read-only and explains the cause; setup checks that the chosen folder can be saved to.

## Android 1.0.0

First Android release: connect to your Household Finances server (on your PC or network) from your phone.

## Desktop 1.0.0

First Windows desktop release: runs the finance server and dashboard in one app, with a tray menu, host or this-PC-only mode, and update checks.
