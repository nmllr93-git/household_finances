# Larenest handoff

Updated 2026-11-27 for the receipt-inbox release. Read this first in a new session, then read `docs/ARCHITECTURE.md` when you need to touch code. Nothing here is a secret. Never add credentials, keys, tokens, passwords or personal ID numbers to this file, the repo, memory or a message.

## 1. What Larenest is

A budgeting, bills and net-worth app that people run themselves. There is no company server and no account with us. Data lives on the user's PC (SQLite) or entirely on their phone. One web app (`public/`) runs three ways: PC host, remote client (phone or another PC loading the host's pages), and phone-only mode (`public/local.js` answers the same `/api/...` paths on the phone).

- Owner: Nathan Miller, solo developer, Iowa City area. Self-employed, so business (Schedule C) features are planned.
- Source repo: `nmllr93-git/household_finances` (default branch `main`, working copy `/home/claude/household-finance` in cloud sessions).
- Public repo and website: `nmllr93-git/household_finances-releases` (installers, README, `docs/` served as larenest.app, including /privacy, /testers, /linux, /download).
- Latest release: Desktop **1.0.42**, Android **1.6.25**, iPhone TestFlight **1.6.14** build 36 (see Apple rules below). Windows, Linux, Mac, Android APK and Docker builds completed; iOS uploaded successfully, but Apple processing and tester availability were not checked. Previous releases were Desktop 1.0.41 and Android 1.6.24.
- Unreleased: the receipt picker previews a selected file before saving. Receipt capture and waiting receipts also support optional category and business choices; differing classifications are flagged for review, and existing transaction splits are preserved.
- Changelog: `CHANGELOG.md` uses `## Unreleased` for pending work, then `## Android x` / `## Desktop y` headings.

## 2. Standing rules (the user's own words, keep verbatim in spirit)

1. "Do not remember any credentials or personal ID information such as SSN, bank accounts, credit cards etc." Also: "There might be personal information in these statements please ignore and don't remember any of those values."
2. **Push code as we work; release only when the user says to.** If the user says to hold a push, hold it.
3. `seed/` holds the user's real data and must never be committed, screenshotted or quoted. Also never touch `data/`.
4. **Show screenshots of styling changes before pushing.** Use `/tmp/hfcopy` (a tar copy of the repo without seed, data, node_modules, .git, desktop, mobile) and redact with `tools/screenshot-redact.js`. Load demo data with `tools/demo-data.js`.
5. **Public site changes** (`household_finances-releases/docs`) need the user's approval before publishing.
6. **Apple:** at every release, ask whether to include the Apple builds, even if the release message says not to. Keep the iPhone TestFlight version at **1.6.14** (workflow input `version=1.6.14`) so builds don't need another beta review. The user has no Mac, so every Apple step has to work from Windows or CI.
7. **Marketing must never imply Larenest does or handles taxes.** Say it tracks side-business records and organizes totals for a tax professional.
8. **Verify a feature isn't already in the app before suggesting it** (grep `public/`, README, CHANGELOG). Suggesting existing features twice cost trust.
9. Never paste or store secrets. Pace API calls.
10. The user wants a reminder, whenever a chat gets long, that starting a fresh chat is cheaper. A long thread re-reads its whole history on every message. Prefer one chat per task or release, and use this file to start it.

## 3. Release runbook

Do this only when the user says to release. Read the Unreleased changelog first and ask the Apple question.

1. Bump versions: `package.json` and `desktop/package.json` (Desktop), `mobile/package.json` (Android). Rename `## Unreleased` to `## Android x.y.z` and/or `## Desktop x.y.z` with the same bullets under each.
2. Bump `CACHE` in `public/sw.js` whenever `public/` assets changed. Receipt inbox bumped it to `hf-v153`.
3. Run `npm test` (must show `# fail 0`).
4. Commit, `git push origin main`, then **`git push origin main:release`**. That starts the Android, Desktop (Windows/Linux), Docker and release-notes workflows and publishes to the public releases repo.
5. Mac: `gh workflow run "Desktop release" --ref main -f mac_publish=true`. Run it after the release exists to avoid a collision.
6. iPhone: `gh workflow run "iOS release" --ref main -f version=1.6.14`.
7. Watch with `gh run list --limit 8 --json name,status,conclusion`. Mac and iPhone runs often sit queued for runners or get cancelled; rerun with `gh run rerun <id>` (add `--failed` if only some jobs failed). That is normal.
8. Verify assets: `gh api "repos/nmllr93-git/household_finances-releases/releases?per_page=2" -q '.[]|.tag_name+": "+(.assets|map(.name)|join(", "))'`.
9. Give the user: Play Store "What's new" text and TestFlight "What to Test" text. Keep them short, plain, no tax claims.
10. Android compile check without releasing: push to branch `android-check` (a normal push; force push is denied).

Workflows live in `.github/workflows/` (android-release, android-check, desktop-release, docker-release, ios-release, release-notes, release-cleanup). Signing and store credentials are GitHub Actions secrets. Never print them.

## 4. Environment gotchas

- Bash network is an allowlist: npm and pip installs and most downloads fail. Work with what is installed.
- `gh repo view` fails (GraphQL blocked). Use `gh api repos/...` REST calls. Pull requests go through `gh api repos/<o>/<r>/pulls`.
- Force push is denied.
- `/tmp` does not survive between sessions. Recreate `/tmp/hfcopy` each time (tar copy with the exclusions above). Scripts that must persist belong in `tools/`.
- Playwright (Python) works for screenshots. Start the server with `DATA_DIR=/tmp/xxx PORT=88xx LARENEST_ADMIN_USER=demo LARENEST_ADMIN_PASSWORD=password123 node server.js` from the copy, never against `data/`.
- A downloaded Android bundle is a zip with one `.aab`. Windows Defender sometimes flags it with a generic name; see open items.

## 5. Where things are (short map; full detail in docs/ARCHITECTURE.md)

| Area | Files |
|---|---|
| Server | `server.js` (HTTP+HTTPS on one port, auth, API, SQLite, backups) |
| Shared data rules | `core/books.js` (collections, whitelisting, validation; every write goes through it, host and phone-only) |
| Bank sync | `core/simplefin.js` (pending=1, `st.pending` replaced each sync, `st.flags` for charges that posted above the pending amount, dismiss via POST `{dismiss: key}`), `core/banklinks.js` (Plaid) |
| Markets, widgets, TLS | `core/market.js`, `core/widgetdata.js`, `core/tlscert.js` |
| Web app | `public/index.html`, `page.js` (most UI), `calcs.js` (pure calculations), `import.js` (CSV/OFX/PDF and app exports), `receipt.js`, `applock.js`, `a11y.js`, `app.css`, `i18n/es.js` (Spanish strings), `sw.js` |
| Phone start screen | `apps/connect.html` (source). `mobile/www` is generated by `mobile/scripts/prepare.js`; never edit it |
| Android native | `mobile/native/android/...` (Biometric, Ocr via ML Kit, QrScan via GMS scanner, widgets); `mobile/scripts/android-setup.js` patches the generated project |
| iPhone native | `LarenestPlugins.swift` (Biometric, Ocr with `read` and `readQr`, LarenestWidget). The page reaches these through `Capacitor.registerPlugin('<Name>')` on iOS |
| Desktop | `desktop/` (Electron: main.js, runner.js, preload.js, ui/) |
| Tests | `test/*.test.mjs`, run with `npm test` |
| Docs | `docs/` (ARCHITECTURE, BUSINESS, FUTURE, LINUX, PRO-TIERS, REVIEW-HANDOFF), `store-assets/` (cleaned screenshots and store listings) |

Data conventions worth remembering:
- Per-book prefs live in `data/household/prefs`. The `settings` object includes `hidePending`, `tipCheck{pct,min,off}`, `paceAlert{pct,off}`, `catMerge`, and `invContrib` (monthly investment contributions by `book|account`).
- Edits go to `data/household/edits` keyed by `txKey`. `quickSave(t, extra, btn)` saves a full edit.
- The `all_txns` calc takes a `prefs` input and applies `catMerges(prefRows)`.
- Receipt inbox: `receipts` documents with an empty `txKey` are waiting. They store editable vendor, date, total, tip and whether the tip is already included. Auto-attachment requires one unambiguous expense match with exact cents, a conservative vendor match, and a transaction dated from the receipt date through three days later. The date window is not an import deadline: receipts remain available indefinitely, including for manual attachment after a later statement import. A two-week reminder does not delete them.
- Matching runs when the dashboard loads, after imports or manual sync, and on a 60-second refresh while the dashboard is open with waiting receipts; it is not a headless background job. Receipt edits and attachment use compare-and-set; discard removes a file only if no other receipt references it. Host SQLite and phone-only IndexedDB both implement these operations.
- Needs-attention items are `{id, sig, lvl, text, go}`; `goTo` handles `'tx'`, `'feedback'`, `'budgetcat:'`.
- App-export imports (Mint, Monarch, YNAB, Empower) are detected in `import.js` (`detectApp`), saved per account with `source: 'app:<id>'`, and keep each row's category, tags and note (whitelisted in `core/books.js`).
- Types for transactions are only Expense, Income and Transfer. Donations is a category, auto-guessed in `calcs.js`.

## 6. Done recently (all on main; released unless noted)

**Unreleased:** the receipt capture form immediately shows a selected photo or PDF and its filename, marked as not saved yet. The receipt-saved confirmation also has clearer spacing below the file button. Preview, replacement, error and phone-width behavior were checked in an isolated browser demo; still needs physical-phone validation.

Released as Desktop 1.0.40 / Android 1.6.21 / 1.6.22: bulk edit in Transactions, import from Mint/Monarch/YNAB/Empower, investment returns net of contributions (with a monthly-amount box for paycheck 401(k)), Donations category, iPhone plugin lookup fix (Scan QR code button, receipt reading, Face ID), "Opening…" screen with a Back button plus an error page instead of a blank screen when the server load fails, safe-area padding and a working Switch server on iPhone, large-phone menu and table overflow fixes. Earlier this session: pending transactions with tip check, spending pace alerts, merge categories, CSV import improvements, accessibility pass, QR scanning on Android (confirmed working), privacy policy and Play Data safety updated.

**Receipt inbox, committed as `c8bd380` and released from `4b67b83`:** standalone photo/PDF capture with OCR and editable details; explicit tip-in-total choice; conservative auto-matching; and a waiting panel with editing, search/manual attachment and discard. Includes Spanish strings, responsive styling and tests. The earlier duplicate-resolution fix moves receipt photos and metadata to the retained transaction.

The full regression suite passed 132 tests before release preparation. Browser checks covered capture, validation, matching, manual attachment, discard, refresh and phone-only storage. Screenshots were shown and approved before pushing. Camera and native OCR have not been tested on a physical Android or iPhone; verify them after installing the new builds.

Desktop 1.0.41 / Android 1.6.24 included last-known investment balances and directional sharing badges. Desktop 1.0.41 also brought the full-width phone navigation fix to phones connected to a PC host.

## 7. Open items and things not verified

- **Real-device checks still owed:** test the new receipt capture, OCR and matching on Android and iPhone. The iPhone Scan QR code button, Opening screen, Switch server and large-iPhone layout also need confirmation; a tester reported layout overflow and a screenshot was pending.
- **Phone-switching-networks hang** (user's iPhone froze on a blank screen after the phone likely switched between two ISPs): fixed by the Opening screen and error page, but not reproduced on a device.
- **Windows flagged the Play Store bundle zip** as malware. Most likely a false positive. Waiting for the user's Defender threat name and `Get-FileHash` result; GitHub's recorded SHA-256 for that artifact was `ECB2003C7D05F77FD82886257788DA61EC268FFC501B5709A1D91CE5A3DA0425` (Android 1.6.21 bundle).
- **Site comparison table:** add an "Import from other apps" row only after checking which of Monarch, YNAB, Copilot, Rocket Money and Actual import other apps' exports (a dash would read as "No"). Left out on purpose for now.
- **Android R8** code shrinking on its own branch (Play Console "DEX code optimization: Low"); add keep rules for Biometric, Ocr, QrScan, widgets and the `LarenestWidgetNative` page bridge, and save `mapping.txt`.
- **One-week timeline report:** a scheduled reminder fires Nov 28, 10am (America/Chicago). Check the user's scheduled tasks for its exact text.
- **Windows code signing:** user was setting up Azure Artifact Signing under a "Larenest" Azure subscription (as of Nov 25). Status unknown; ask.
- **Google Play:** closed testing was active as of Nov 27. Testers need the dedicated opt-in link; the public listing alone does not enroll them. The Android workflow keeps the signed Play bundle as an Actions artifact; it does not upload it to Play automatically.
- **Apple:** Apple builds are expensive; always ask at each release. The user confirmed Mac and iPhone for this receipt release; iOS 1.6.14 build 36 uploaded successfully. Confirm Apple processing and tester availability rather than assuming they are complete.
- Longer backlog: `docs/FUTURE.md` (languages, other countries, Pro tier, smaller items), `docs/PRO-TIERS.md` (draft free vs Pro; one-time license key movable between devices, no company account, free Pro key for early users), `docs/REVIEW-HANDOFF.md` (review findings R1–R6 done; performance items E1–E4 open).

## 8. How to work with this user

- They are technical but want plain-language summaries: what changed, where to see it, what you could not verify.
- Lead with the result. Include screenshots for anything visual; ask before pushing styling changes.
- Say plainly what was not tested on a real device. Do not claim a phone fix works without a device check.
- Updates are not "things all device types are missing": say which platforms get which change.
- Patch notes and store text: short bullets, no tax language.
- Offer the fresh-chat reminder when a thread gets long.

## 9. Skills that go with this project

Saved skills (the user reviews and saves them from the cards): `larenest-release` (section 3), `larenest-screenshots` (rule 4 and section 4), `larenest-dev-rules` (rules 2, 5, 7, 8 and the changelog conventions).
