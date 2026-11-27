# Future features

Ideas we've talked about, roughly in the order we'd likely do them. Nothing here is promised or scheduled.

## Receipt inbox: save a receipt without waiting for the transaction (implemented; release prepared)

**The problem.** Previously, saving a receipt photo right away meant attaching it to a manually-typed transaction. When the real bank-sync transaction posts later, the dashboard flags the pair as a possible duplicate (see `Section 5` of `handoff.md` and the 2026-11-27 fix, commit `da9c399`, that moves the receipt onto whichever side survives). That works, but it means every receipt-while-shopping still creates a throwaway transaction and a manual review step. Nobody wants to carry a paper receipt around for three days waiting for it to post — the goal is: snap it, toss it, walk away, and have it find its own transaction later with no extra typing.

**The fix: receipts can exist with no transaction attached yet**, and get matched to one automatically when it posts (or picked manually if nothing matches).

### Data model
- `core/books.js`'s `receipts` doc allows an empty `txKey`; a compare-and-set endpoint safely edits or attaches the same receipt without replacing it.
- Receipt docs store `vendor`, `total`, optional `tip`, `date`, and `tipIncluded` so matching can use the corrected details without counting a tip twice.
- `cleanDoc` in `core/books.js` validates the receipt fields for host and phone-only storage.

### Capture flow (standalone, not inside "add a transaction")
- A new entry point — "Snap a receipt" — separate from the manual-transaction form. Runs the existing OCR (`public/receipt.js` `read()`/`parse()`), same as today.
- **Detect vendor, total, and tip**, not just vendor/date/total like today. `findTotal` already exists in `receipt.js` as a model to copy: add a `findTip` that scans lines for `/\btip\b|\bgratuity\b/i` with a dollar amount nearby, same style as the existing `isTotal` regex (with the same false-positive guards: don't match "tip" appearing in unrelated text). A receipt with a blank tip line (write-it-in-by-hand restaurant receipts) won't have anything to OCR — `findTip` returns `null`, which is fine; the field just starts empty for the user to fill in.
- **Show an editable form right after OCR runs**, not just the current toast ("Filled in the vendor, total from the receipt"). Vendor / total / tip, pre-filled from OCR, each editable before saving. This is the main ask: fixing a misread amount (e.g. OCR reads $14.17 as $41.17) happens in the moment, looking at the actual receipt, not days later hunting through transactions.
- Saving writes a `receipts` doc with `txKey: ''` and the (possibly corrected) `vendor`/`total`/`tip`/`date`, plus the usual `fileId`/`mime`/`name`.

### Matching
- Same shape as the existing `likelyDupes` in `public/calcs.js` (group by amount, pair within a date window), but comparing unattached receipts against live transactions instead of transactions against each other.
- Match amount is `total + tip` only when the user says the tip is not already included in the total. If it is included, match the total itself.
- Match on exact amount + vendor similarity (reuse whatever normalization `likelyDupes`/`word()` in `simplefin.js` already does for description matching) + a date window after the receipt's date (a few days, same reasoning as `OVERLAP_DAYS`/pending-to-posted gap elsewhere).
- **Only auto-attach on a confident, single match.** If two live transactions both match (same vendor, same amount, twice in a week — e.g. two coffee runs at the same price), don't guess: leave it for the waiting list below. Wrong auto-attach is worse than no auto-attach, since it's not obviously wrong to the user.
- Run the matcher whenever new transactions land (after a sync, after an import) and also when a new unattached receipt is saved (it might match something already sitting in the ledger).

### "Waiting for a transaction" panel
- Same UI pattern as the existing `pendingRows`/`dupReview` panels in `public/page.js` — a small reviewable list, not a dead-end.
- Lists unattached receipts, oldest first, each showing vendor/total/tip/date and a thumbnail.
- Manual "attach to a transaction" picker (search by date/vendor/amount) for anything the matcher couldn't resolve confidently.
- Vendor/total/tip stay editable from this list too, in case a mistake is caught after the fact and the transaction still hasn't shown up.
- A way to discard a receipt that was never going to post (return, cash purchase not tracked, duplicate photo).
- Something never posting shouldn't sit there forever unexplained — show a quiet "still waiting after 2 weeks" note rather than silently deleting it.
- Waiting receipts do not expire. The matching window compares transaction and receipt dates, not the date a statement is imported.

### Implemented build order (two slices)
1. **Tip detection + editable capture form + standalone saving.** Useful on its own even before any matching exists — `findTip` in `receipt.js`, the new receipt-doc fields in `core/books.js`, and the "Snap a receipt" entry point with the editable vendor/total/tip form. No dependency on slice 2.
2. **The matcher + the waiting-list panel.** Builds on slice 1's data. This is where the `total + tip` matching amount and the single-confident-match rule live.

### Risks / open questions to settle before or during the build
- Auto-attachment requires the exact amount, a conservative vendor match, and a transaction dated from the receipt date through three days later.
- Whether "Keep both"/dismiss on the existing dupe-review panel should also learn not to re-flag an already-matched receipt+transaction pair later (shouldn't be an issue if matching sets `txKey` directly rather than creating a second transaction, but worth a test case).

## Languages (medium effort)
Keep the focus on US accounts and US dollars, but let the app's wording appear in other languages.
- Move every piece of on-screen text (web app, help pages, desktop Host screens, phone app, server errors) into one English phrase file with a `t('key')` lookup. Ship that first as an English-only release with no visible change.
- Add a language picker for each device. Handle plurals and word order with `Intl.PluralRules`. Re-check tiles and phone menus with longer text.
- Spanish first. A native speaker should review money terms (rollover, sinking fund).
- Estimate: 3–5 sessions to set up, then about 1 session per language.

## Other countries (large effort, staged)
- Groundwork, 4–6 sessions:
  - give each dashboard a country and base currency;
  - convert totals and net worth using the exchange rates the app already pulls;
  - move US account types and limits (401k, IRA, Roth, HSA, 529) out of the code into a "US profile" data file.
- Each country, 3–5 sessions:
  - account types, limits and tax year (UK ISA/SIPP; Canada RRSP/TFSA/FHSA; Australia super);
  - bank CSV/PDF formats (date order, decimal commas) and a bank-sync service (Plaid covers the US, Canada, the UK and the EU; SimpleFIN is US-only);
  - market data, help pages and store listings.
- Start with Canada or the UK.
- Ongoing cost: a tester who lives in each country, and an update of each country's limits every year.

## Pro tier (deciding)
- A one-time license key that can be moved to a new device, for one device or host at a time. No company account, ever.
- Everyone using the app before Pro launches gets a free Pro key.
- Draft split between free and Pro: [PRO-TIERS.md](PRO-TIERS.md).

## Next up (picked up next session)
- Android: turn on R8 code shrinking and resource shrinking for release builds (Play Console "DEX code optimization: Low"). Add keep rules for our plugins (Biometric, Ocr, widgets) and the page bridge (LarenestWidgetNative). Save mapping.txt next to the .aab on each release (Play's "no deobfuscation file" warning) and set ndk debugSymbolLevel 'SYMBOL_TABLE' (Play's "no debug symbols" warning; ML Kit's own native code may still warn). Do it on its own branch (not main): have the Android build check also make a shrunk release-style APK as a download, install that on a phone and test the widget, fingerprint unlock and receipt scanning, then merge into main only once it works.
- iPhone: test Face ID unlock, receipt scanning and the Budget & bills widget on a real phone, including the new receipt inbox.
- Mac: the user requested a build for the receipt-inbox release; check Actions and the public releases page for its status.

## Smaller items
