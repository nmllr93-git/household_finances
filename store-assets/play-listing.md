# Google Play listing: Larenest

Drafted Nov 23, 2026 from how the app actually handles data (Android 1.6.x). Check again before each release if new data services or permissions are added.

## Store listing

**App name** (30 max): Larenest: Budget & Net Worth

**Short description** (80 max):
Private budgeting and net worth. Your data stays on your phone or your own PC.

**Full description** (4,000 max):

Larenest is a budget, bills and net-worth tracker that keeps your money data with you. There's no Larenest account and no company server. Everything you enter stays on your phone, or on your own computer if you run the free Larenest desktop app.

**See where your money goes**
• Budgets with a pace line, so you know mid-month if you're on track
• Spending by category, vendor and month, with trends and drill-down
• Upcoming bills and subscriptions, found automatically from your transactions
• Year in review, cash-flow forecast and savings goals

**Track everything you own and owe**
• Accounts, investments, home and vehicle values, and your mortgage payoff
• Holdings with live prices, allocation rings, dividends and a 30-day chart
• Markets: indexes, sectors you follow and a watchlist

**Built for households**
• Personal and shared dashboards, with a % split for shared costs
• "Who paid what" for shared spending
• Invite your partner with a one-time QR code (desktop host)

**Home-screen widgets**
• Budget & bills, Investments, Markets, Market movers, and Bills & subscriptions
• Choose which dashboard each widget shows
• "Hide amounts" shows percentages only

**Your data, your way**
• Import bank statements (CSV, OFX, QFX) or connect bank sync through SimpleFIN Bridge (a separate read-only service you subscribe to yourself)
• Phone-only mode: everything stays in the app's private storage
• Or connect to Larenest on your own Windows or Mac computer and use it from every device at home
• Backups are files you save wherever you choose
• No ads, no analytics, no tracking

Optional market and economy data comes straight from free public services (with your own free API keys for some). Those services only ever receive stock symbols or a vehicle VIN, never your financial information.

Questions or ideas: contact@larenest.app

**Category:** Finance
**Tags:** Budgeting, Personal finance, Money management
**Contact email:** contact@larenest.app · **Website:** https://larenest.app · **Privacy policy:** https://larenest.app/privacy

---

## Data safety form

The definition Google uses: data is **collected** if the app sends it off the device, and **shared** if it goes to a third party. Data that stays on the device doesn't need to be disclosed.

### What reaches the developer
Nothing. There is no Larenest server, analytics or crash reporting SDK. Feedback is an email the user chooses to send from their own mail app.

### What leaves the phone, and why
| Flow | Data | When |
|---|---|---|
| Phone ↔ the user's own Larenest PC (connected mode) | Everything they view/enter (financial info) | Only if they connect to their own computer; never in phone-only mode |
| Phone → Finnhub / FMP / Stooq / Yahoo | Stock symbols (+ their own API key) | Only if they add holdings or a watchlist |
| Phone → NHTSA | A VIN or make/model/year they type | Only if they use vehicle lookup |
| Phone → SimpleFIN Bridge | Their SimpleFIN access link (to pull their own data in) | Only if they connect bank sync |
| FRED, BLS, EIA, Treasury, holidays, exchange rates | No personal data (API key only) | Optional economy panel |

### Suggested answers
I'd go with the careful reading: **declare the connected-mode traffic**. The phone sends financial data off the device to a server the user runs. Google's form doesn't have an exception for "the user's own server", so not declaring it is the riskier choice.

1. **Does your app collect or share any of the required user data types?** Yes
2. **Is all of the user data collected by your app encrypted in transit?** No.
   - In connected mode on a home network, the phone talks to the user's PC over plain HTTP. Tailscale or HTTPS encrypt it, but that isn't guaranteed.
   - If you'd rather answer Yes, the app would first need to require HTTPS or Tailscale. That's a code change worth considering.
   - What this means for users (also explained in the app: ⚙ Settings → Where your data lives → How your connection is protected):
     - **Home Wi-Fi:** Wi-Fi encrypts traffic over the air, but other devices on the same network could in principle read it. Fine on a trusted home network.
     - **Tailscale (free):** encrypted from the phone all the way to the PC, at home or away.
     - **WireGuard to the router:** encrypted across the internet, then plain on the home network from the router to the PC.
     - **Phone-only mode or the PC itself:** nothing travels over a network.
3. **Do you provide a way for users to request that their data is deleted?** Yes.
   - Users can delete any dashboard, account or transaction in the app.
   - Phone-only data is removed when they uninstall or clear app data.
   - The developer holds no data, so there's nothing to request from us.

**Data types to declare**
- **Financial info → Other financial info** (transactions, balances, budgets)
  - Collected: Yes. Shared: No.
  - Processed ephemerally: No. It's stored, on the user's own server.
  - Required or optional: Optional. Phone-only mode sends nothing.
  - Purpose: App functionality.
- **Financial info → Other financial info** for stock symbols sent to price services
  - Covered by the same entry; add a note in the policy.
  - Symbols alone aren't tied to an identity.
  - It's a user-initiated lookup, so it isn't "sharing" under Google's exceptions.
- Every other type (location, personal info, contacts, photos, app activity, device IDs, etc.): **not collected**.
  - The camera is used only to scan a QR code on the device, and images never leave it.

**Security practices to tick:** "Data is encrypted in transit" stays unticked for now (see #2). Tick "You can request that data be deleted."

### Permissions and why (for review notes)
- **Internet:** connect to the user's own PC and to optional data services
- **Camera:** scan the QR code shown on the PC to connect (processed on the phone)
- **Notifications:** bill reminders and budget alerts, worked out on the phone
- **Run at startup** (RECEIVE_BOOT_COMPLETED): put the widgets' background refresh back after a restart

### App content answers (other Play Console sections)
- Ads: No ads
- Target audience: 18+ (financial tool)
- Financial features declaration: "Personal finance: budgeting / tracking" only. No loans, payments, crypto trading or banking services
- Government app: No · News app: No · Health: No
- Account deletion: not applicable, because there's no account
