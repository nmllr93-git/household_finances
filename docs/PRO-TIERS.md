# Free vs Pro (draft)

This is a working draft. Before Pro launches, we'll ask current users to vote on the features and the price.

## Principles
1. **Free is a complete budgeting app.** A single person or a couple can track spending, budget and share costs without paying.
2. **Pro saves time and adds depth.** It's for households with many accounts that want automation, planning and investment tracking.
3. **Safety and data ownership are never paid.** Encryption, backups, export and restore stay free forever.
4. **Downgrading never deletes data.** Pro-only features become read-only. Everything can still be viewed and exported.
5. **No accounts, no subscription.** It's a one-time license key that works on one host or device at a time. The key can be moved to a new device, and there's no company account.
6. **Thank-you keys.** Everyone using Larenest before Pro launches gets a free Pro key.

## Tier table

| Area | Free | Pro |
|---|---|---|
| Importing (CSV, PDF statements, Google Sheets) | ✓ | ✓ |
| Automatic bank sync (SimpleFIN / Plaid) | 1 connection | Unlimited |
| Dashboards | Up to 3 | Unlimited |
| Logins | Up to 2 | Unlimited |
| Shared household split ("who paid what") | ✓ | ✓ |
| Budget, categories, rules | ✓ | ✓ |
| Bills, subscriptions, unusual / biggest purchases | ✓ | ✓ |
| Standard reports and tabs | ✓ | ✓ |
| Custom report builder | — | ✓ |
| Arrange tabs, custom top tiles | — | ✓ |
| Forecast | 90 days | Up to 2 years, plus scheduled items |
| Account balances and net worth today | ✓ | ✓ |
| Net worth history | Last 12 months | Full history |
| Investments: holdings, lots, dividends, market calendar | — | ✓ |
| Mortgage and vehicle tracking | — | ✓ |
| Statement reconciliation, settle-up statements | — | ✓ |
| Year in review | — | ✓ |
| Weekly email summaries | — | ✓ |
| Phone widgets | — | ✓ |
| Business features: mark transactions as business, Schedule C totals, business tab and tiles, mileage log, home office, quarterly tax estimates, receipt reminders | — | ✓ |
| Phone app (connected to host) and phone-only mode | ✓ | ✓ |
| Data encryption, HTTPS, login security | ✓ | ✓ |
| Backups, export, restore | ✓ | ✓ |
| Getting started, Needs attention checks | ✓ | ✓ |

## Notes
- Business features (docs/BUSINESS.md) are planned for Pro. Until Pro launches every dashboard gets them free.

## Open questions (to poll users on)
- Bank sync: is 1 free connection right, or should it be 0, or unlimited?
- Should holdings be free and only dividends, lots and the calendar be Pro?
- Are widgets and email summaries enough of a draw, or should they stay free?
- Price: one-time ${TBD}. Draft range $39–$49; check competitor pricing at launch.
- Major upgrades: does a key cover all future versions, or one major version with a discounted upgrade?
- Discounts for households or students?

## Technical notes (for later)
- The key is checked offline with a signature (the public key is built into the app). There's no activation server and no account.
- "One host at a time" is a soft limit: the key is tied to the host's server ID, and moving it means deactivating it on the old host first. Avoid strict DRM, which only punishes paying users.
- Phone apps connected to a Pro host get Pro features. Phone-only mode needs its own key, or that device counts as the key's one device.
- Free limits are enforced in the server and in phone-only mode. Data over a limit stays, read-only.
