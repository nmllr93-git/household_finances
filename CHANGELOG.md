# Changelog

Each release on the releases page uses its section below as its description. Add a new section (newest first) before releasing.
Headings must be exactly `## Desktop <version>` or `## Android <version>`.

## Unreleased
- Getting started: "Connect your phone" only shows on a computer, and ticks itself off once a phone opens the dashboard. **Dismiss** removes the list from that dashboard on every device (⚙ Settings can bring it back); Hide folds it to one line on this device
- Needs attention: **Dismiss** any alert, on every device. It comes back only if what it's about changes (for example, a newer statement that also goes stale). "Show them again" restores them

## Desktop 1.0.29
- Tiles for each tab: Accounts, Expenses, Budget, Planning and Transactions each get their own row of tiles at the top; click one to jump to the section behind it
- ✎ Arrange: move, resize, add and remove tiles and sections on any tab. Saved per dashboard and synced across devices; phones use arrows. Tabs you never arrange keep the built-in layout
- Your own reports: spending, income, income minus spending, number or average of purchases, or account balances, grouped by category, vendor, account, tag, month or weekday, with filters, as bars, a line, a table or one number. Place them on any tab or add one as a tile
- Cash forecast: look ahead 90 days, 6 months, 1 year or 2 years
- Wide screens: Accounts, Budget and Overview fill the width. Personal dashboards no longer show Who paid what
- Currency converter in its own box; charts resize to fit their space
- Fixed: deleted accounts stay deleted, whichever way the name is written (owner in front or in brackets, punctuation). If one came back, delete it once more after updating
- Fixed: the economic calendar no longer lists the Fed every day

## Android 1.6.9
- Tiles for each tab, ✎ Arrange (with arrows on phones) and your own reports (see Desktop 1.0.29)
- Cash forecast up to 2 years ahead
- Fixed: deleted accounts stay deleted; the economic calendar no longer lists the Fed every day

## Desktop 1.0.28
- Check a statement adds up: type its opening balance while importing and Larenest compares opening + transactions with the ending balance, to the cent, and points at a missing or sign-flipped row. It never changes anything for you
- Import history: source, rows added and skipped, and whether the statement added up. Undo shows what it removes first; changes and receipts on those transactions go only if you tick them
- Column choices are remembered per account and reused when the same bank's file comes back
- Backup health in ⚙ Settings → Backup & privacy: server copies, cloud folder, a read-only check of the newest copy, and checking a backup file without restoring it
- Settling up on shared dashboards: close a period to save who owes whom; record payments between you (never counted as spending)
- Cash forecast: add confirmed bills and paydays (exact amount and date) that replace their estimates; skip or move one occurrence
- Restoring a backup keeps edits, splits, ignores and receipts attached, and either completes fully or changes nothing; a safety copy (with photos on phones) is required first
- Duplicates are judged per account: identical purchases in different accounts, or genuine repeats on one statement, now both count. OFX/QFX and bank sync use the bank's own transaction IDs. A few totals may go up slightly; that's the correct number
- Statements over 5,000 transactions are refused with the count instead of being cut short
- Other devices must use the encrypted (https) address; Host options has a switch to allow http:// for an old device

## Android 1.6.8
- Statement check, import history with undo, backup health, settling up and confirmed bills in the forecast (see Desktop 1.0.28)
- Phone-only mode: undo and restore are all or nothing; the safety copy before a restore keeps receipt photos
- Switching dashboards quickly no longer shows the wrong dashboard's numbers

## Desktop 1.0.27
- Linux: desktop app as AppImage (updates itself) and .deb, for x86-64 and ARM64
- Linux servers: Docker image (x86-64 and ARM64, including Raspberry Pi 4/5) and a one-line installer that sets Larenest up as a service; see larenest.app/linux
- Forgot a password? Set a new one from Host options on the computer running Larenest
- A backup is made automatically the first time each update starts; restore steps are in Host options
- Copy diagnostic info (⚙ Settings → Help & feedback), also added to feedback emails; never includes financial data
- Sign-in cookie is now marked secure on the app's own HTTPS connections

## Android 1.6.7
- Send feedback now includes diagnostic info (app version, connection, recent errors; never financial data)
- Works with Larenest servers on Linux and Docker

## Desktop 1.0.26
- Vehicle values follow an age curve (steep early, a few % a year after about 7) instead of a flat %; choose Typical, Holds value well or Loses value fast, or keep a fixed %
- Odometer readings: your own miles per month worked out from them, estimated mileage between readings (≈), and a small capped mileage adjustment to the value
- Free value checks: links to Kelley Blue Book, Edmunds and VinAudit; the estimate continues from the value you enter; reminder every 3 months
- Budget tile: the today/pace key shows under the ring whenever the tile is narrow, so nothing spills out
- Tour mentions PDF statements
- Teller removed (its service closed to new sign-ups); bank sync is SimpleFIN or your own Plaid keys

## Android 1.6.6
- Market movers widget hides penny stocks and leveraged/inverse ETFs by default; change it in Settings → Market movers widget
- Stock prices stay visible on the Markets and Market movers widgets with "hide amounts" (your own figures stay hidden)
- Plus the vehicle, budget tile, tour and bank sync changes from Desktop 1.0.26

## Desktop 1.0.25
- Encrypted connections on your home network: your PC makes its own HTTPS certificate (free), and the Larenest apps trust exactly that one via the QR code
- Warns you if a computer's certificate ever changes; the certificate is kept in backups, so restores keep phones paired
- Tailscale HTTPS: a no-warning browser address when Tailscale's free certificates are turned on; status in Host options
- Larenest look for the host window and setup screens
- First-run tour, ending with getting your bank data in (imports and SimpleFIN), plus optional advanced options
- Send feedback (⚙ Settings and the phone ☰ menu)
- "Where your data lives" picture, and how each kind of connection is protected
- SimpleFIN: new accounts wait until you choose them and press Save; clearer six-step guide with cropped pictures
- Investment chart and 7/30-day changes fill in again (second free price-history source)
- "By sector" allocation ring in Holdings
- Phone header: just ⟳ and a ☰ menu (Backup, Sign out, Switch server, Send feedback)

## Android 1.6.5
- Encrypted connection to your PC (HTTPS, trusting only your PC's certificate); phones paired before switch over on their own
- New Market movers widget: today's top gainers and losers, your followed sectors first (★)
- Choose which dashboard each widget shows; tap a widget to open its section
- Phone alerts: a bill due tomorrow, a dashboard passing 90% (and 100%) of its budget
- Investments widget shows its 30-day chart again
- Plus the tour, Send feedback and the other Desktop 1.0.25 changes
- After updating, this device's settings (Larenest look, followed sectors, widget and alert options) reset once, because the encrypted address counts as a new one. Your data isn't affected.

## Desktop 1.0.24
- New Larenest look (logo and warm colors), with an off switch in Settings
- Pull down to refresh on phones
- Accounts from a Google Sheet can now be deleted, including retirement accounts
- Settings no longer shows the date range and summary tiles
- Negative amounts no longer wrap onto two lines
- Supplies the data for the new phone widgets

## Android 1.6.4
- Four home-screen widgets: Budget & bills, Investments (with a 30-day chart), Markets, and Bills & subscriptions
- A refresh button on each widget, plus an optional background refresh (every 1, 2 or 4 hours)
- "Hide amounts" also applies to the widgets
- Larenest look, pull to refresh, and the other fixes from Desktop 1.0.24

## Desktop 1.0.23

### Changes
- **Accounts shared into a dashboard now appear in its Accounts list**, marked ⇄ “Shared from …”, and count in its totals, so duplicates are easy to spot.
- **Old account names can be removed:** Edit an account → *Other names for this account* → Remove (the account itself stays).
- First-time defaults: the top tiles open as **Ring**; Spending by category opens as **Share** on phones and **Trend** on computers.
- Host options: the cloud backup dropdown matches the rest of the page.

### Fixes
- Switching dashboards closes an open account editor.
- Category boxes show the full list when you tap them, without deleting the current category first.
- No blank space above Settings.

## Android 1.6.3

### Fixes
- Same changes as Desktop 1.0.23.

## Desktop 1.0.22

### Fixes
- **Updates install reliably on Windows:** the app now stops its server before the installer starts, so the installer no longer gives up after the “allow changes” prompt. The installer shows its window (so any problem is visible) and reopens Larenest when it’s done. If you’re on 1.0.21 or earlier, install this version once from [larenest.app/download](https://larenest.app/download/); updates after that install on their own.

## Desktop 1.0.21

### Changes
- **Settings are organized into sections:** This dashboard, Bank & data connections, People & devices, Notifications, Backup & privacy, and a folded **Advanced** section (your own bank keys, phone menus, sections to show, recent changes). The email sending account folds away once it’s set up.
- The dashboard tiles are hidden on the Settings tab; Download backup is a normal button.

### Fixes
- Home-screen widget: pages from your computer can now update it (needs Android 1.6.2), and ⚙ Settings → Phone widget appears on the phone.

## Android 1.6.2

### Fixes
- The widget now works when the app shows your computer’s dashboards; plus the Settings changes from Desktop 1.0.21.

## Desktop 1.0.20

### Phone layout
- Bank sync accounts show as cards; the weekly email has the address on its own row with day and time side by side.
- Saved imports show as cards; the account picker’s + button stays beside the dropdown.
- Dashboard tile view buttons (Numbers / Ring / Bars) always fit on one line.
- Subscriptions: tap a row to show its “Not recurring” button.
- Settings has bigger buttons, boxes and checkboxes on phones; the watchlist alert box matches the symbol box.
- The page can no longer be dragged sideways past its right edge.

### Fixes
- Home-screen widget: dashboards opened from your computer now update it. ⚙ Settings → Phone widget has **Update widget now** and shows whether it worked.

## Android 1.6.1

### Fixes
- Same phone layout and widget fixes as Desktop 1.0.20.

## Desktop 1.0.19

### New
- **Bank sync with your own Teller or Plaid keys:** ⚙ Settings → *Your own bank-sync keys* (server owner only; kept in a private file outside backups). Connect each bank in Teller’s or Plaid’s own window; mapping, duplicate checks and syncing work like SimpleFIN. **Flip ±** per account if spending shows up as income.
- **Simple / Full view** (⚙ Settings → View, per device): Simple hides Markets, Planning, Year in review and the deeper spending and investment sections.
- **Where your data lives** (⚙ Settings): what’s stored where, and which outside services are turned on here.
- **Connection help:** when a phone or PC can’t reach the host, it lists the likely causes and fixes; if the host drops off while a dashboard is open, a banner says so and keeps retrying.
- **Clearer empty sections:** a new dashboard says what to do; otherwise empty sections point at the date range.
- **Shared accounts can have their own name** on the receiving dashboard (⚙ on the shared row).

### Fixes
- Renaming an account now sticks, including shared accounts and names changed in bank sync.
- Broker position files without a cost basis (e.g. Vanguard) use today’s price instead of $0.
- View toggle labels (Numbers / Ring / Bars) no longer get squeezed on narrow screens.

## Android 1.6.0

### New
- **Home-screen widget:** long-press the home screen → Widgets → Larenest. Shows this month’s budget left, a progress bar and the next bill; tap to open. ⚙ Settings → *Phone widget* can hide dollar amounts (percentages instead).
- **Phone-only mode can share between dashboards** (e.g. an account from your personal dashboard into the shared one).
- Everything new in Desktop 1.0.19 (Teller/Plaid keys are set on the computer that hosts).

## Desktop 1.0.18

### New
- **Sync now feedback:** the button shows "Syncing…" while it works, then "✓ Synced" with the finish time and how many transactions were added (or why it failed).
- **Net worth shows its math:** the dashboard card reads "owned − owed", and the Accounts table breaks it down (accounts, home and vehicles, shared values). It warns if a home is counted but no mortgage is on that dashboard.

### Fixes
- Net worth now matches everywhere: the Accounts table and the net worth chart include home, vehicles and shared values like the dashboard card.
- Possible duplicates: removing the copy on this dashboard no longer brings the warning right back (its transactions are kept), and pairs marked "Keep both" are no longer counted.

## Android 1.5.1

### Fixes
- Same sync feedback, net worth and duplicate-warning fixes as Desktop 1.0.18.

## Desktop 1.0.17

### New
- **The app is now called Larenest**, with a new icon. Your settings, logins and data carry over; nothing to move. Website: [larenest.app](https://larenest.app).
- **Bank sync guide:** ⚙ Settings → Automatic bank sync now has a step-by-step guide with pictures, from signing up at SimpleFIN Bridge to linking your bank and connecting.
- **Cloud backups:** Host options can also keep the daily backups in OneDrive, iCloud Drive, Google Drive or Dropbox (found automatically), or any folder you choose; the newest 14 are kept there.
- **Download page:** [larenest.app/download](https://larenest.app/download/) picks the right installer for your device.

### Fixes
- Updates no longer fail on Windows: the app stops its built-in server and waits for it to close before installing.
- SimpleFIN: the connection is kept as soon as the setup token is accepted, so a problem fetching accounts no longer wastes the one-time token; SimpleFIN's own error message is shown; broken symbols in bank account names (like "VISA��") are removed.
- Host options are more compact, with App and updates first.

## Android 1.5.0

### New
- **The app is now called Larenest**, with a new icon. This is a new app ID: uninstall the old "Household Finances" app and install this one, then connect again (scan the QR code in Host options). Your data lives on your computer, so nothing is lost.
- The bank sync picture guide and SimpleFIN fixes from Desktop 1.0.17.

## Desktop 1.0.16

### Fixes
- Host options: each address is labelled (home network or Tailscale), the Tailscale number no longer shows twice, and the QR code opens right under the address it belongs to.

## Desktop 1.0.15

### New
- **Easier first run:** setup asks "Who will use this?": just you on this computer, just you on this computer and your own phone or other devices, you and others in your household, or connecting to a computer someone already set up. Port and data folder are under **Advanced**.
- **Connect a phone with a QR code:** shown in Host options and in ⚙ Settings → **Connect a phone**. In the Android app, tap **Scan QR code**; on an iPhone, scan it with the camera to open the dashboard in the browser.
- **Invite someone:** ⚙ Settings → **Invite someone** makes a one-time link and QR code (good for 7 days). They choose their own login and password and get the dashboards you picked, can-edit or view-only, plus an optional new dashboard of their own.
- **Find my PC again:** if the host computer gets a new address on your home network, the phone and desktop apps look for it and reconnect on their own.
- **Use it away from home:** Host options has a step-by-step Tailscale checklist whose steps turn green as you finish them, including when your phone first connects through Tailscale.
- **Sleep check:** Host options shows the computer's sleep setting with a button to open it, and can keep the computer awake while hosting.
- **Try it with sample data:** explore a made-up household before importing anything (view only, never saved).
- **Getting-started checklist** on new dashboards: add your money, set budgets, connect your phone, turn on free data, make a backup.
- **Free data setup:** each data source has a **Test** button that checks the key and saves it if it works. FRED is listed first, and the app works fully without any keys.
- **Import several statements at once:** pick or drag in several files; each is shown in turn with its account guessed from the file.
- **"Where do I find my statement?"** help on the Import page for common banks, card issuers, brokerages and loans.
- **Budget starter:** suggested monthly budgets from your last 3 months of spending; adjust and add them in one step.

## Android 1.4.4

### New
- **Scan QR code** on the connect screen to connect to your computer.
- **Find my PC again:** if your computer's address changes, the app looks for it on your Wi-Fi and reconnects. It also no longer opens to an error page when the computer is off.
- Everything new in Desktop 1.0.15: invites, sample data, getting-started checklist, key Test button, multi-file import, statement help and budget starter.

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
