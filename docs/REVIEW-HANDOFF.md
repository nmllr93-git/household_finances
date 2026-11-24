# Larenest review: implementation handoff

**Start here:** Read [ARCHITECTURE.md](./ARCHITECTURE.md), then pick one work item below. Start with **R1 + R2** as one restore-integrity change; handle the import issues separately. This is a prioritized backlog, not a request to implement everything in one pass.

**Review baseline (2026-11-23):** All 68 existing tests passed on Node 22.23.5. The findings below came from source inspection, not browser or native-app testing. Performance improvements are hypotheses until measured. Recheck each finding against the current branch before changing code.

**Severity:** High = can silently lose, hide, or misrepresent financial data or its attachments. Medium = affects reliability or privacy under particular conditions. Feature and engineering priorities indicate sequencing, not bug severity.

## Status (updated 2026-11-24, after Desktop 1.0.27; R1–R6 and the feature backlog are on main, not yet released)

| Item | Status | Tests |
|---|---|---|
| R1 restore references | **Done**. IDs remapped (`txKey`, `fileId`); same-dashboard and cross-dashboard restore | `test/api.test.mjs` (restore keeps edits…), checked in phone-only mode with a browser test |
| R2 atomic restore | **Done**. `store.replaceBook` runs one transaction on the host and in IndexedDB; the safety copy is required and includes photos on phones; legacy backups keep current photos | `test/api.test.mjs` (forced failure, legacy backup), checked in phone-only mode |
| R3 duplicates | **Done**. Account-scoped; bank IDs (OFX FITID, sync) respected; per-statement multiset; preview, save, sync and totals share `makeDupeChecker`. Legacy policy: no stored data is rewritten. Identical rows that were hidden before (in different accounts, or genuine repeats in one statement) now count | `test/calcs.test.mjs` (5 new) |
| R4 oversized imports | **Done** (guard). 5,000 rows per import, refused with the count in both the UI and the shared writer; never trimmed. Chunking is not needed yet | `test/api.test.mjs` (boundary and one over) |
| R5 stale loads | **Done**. Load sequence numbers; writes bound to their dashboard | `test/runtime.test.mjs` |
| R6 plain HTTP | **Done** as a host setting. HTTPS-only for other devices by default; loopback HTTP allowed; toggle in Host options or `LARENEST_ALLOW_HTTP`; proxy trust is opt-in | `test/https-only.test.mjs` |

| Statement reconciliation | **Done**. Optional opening balance and period in the import review; cents; deposit and credit sign rules; gap and candidate rows (missing or sign-flipped); saved with the import; never adjusts the ledger | `test/calcs.test.mjs` (balanced, omitted row, sign flip, credit card with period, 1,000 × $0.10) |
| Import history, saved mappings, undo | **Done**. Imports record source, file rows, skipped and the statement check. Column choices are saved per account on the device. Undo previews dependents; only ticked edits and receipts are removed; one transaction per backend; a stale list is refused; reimport works after undo | `test/api.test.mjs` (history fields, confirmed dependents, forced failure, stale list, view-only), checked in phone-only mode in a browser |
| Backup health | **Done**. Server copies, cloud folder (a file copy is not proof of upload), owner-only read-only integrity check of the newest SQLite copy, JSON backup check without restoring, last check stored on the device. Phone-only mode shows snapshots and the last downloaded file | `test/api.test.mjs` (verify-backup: complete, missing photos, not a backup, nothing changed) |
| Household settlements | **Done**. Close a period (totals only, kept if shares change later); payments recorded separately and never counted as spending | `test/calcs.test.mjs` (payment reduces what's owed, uneven shares and cents, three people, closed split kept) |
| Confirmed bills and paydays | **Done**. Weekly, every 2 weeks, monthly, yearly or once; skip or move one occurrence; confirmed replaces its estimate; labelled estimate or confirmed; never in actual totals | `test/calcs.test.mjs` (occurrences, month end, skip/move, replace not add, not transactions) |

Not verified on real devices:
- Android WebView behavior after the HTTPS-only redirect for phones still on an old `http://` link. Phones on 1.6.5 and later upgrade on their own.
- Phone-only undo, backup check and backup health were checked in a desktop browser using the IndexedDB backend, not yet on an Android phone.

## 1. Findings and recommended fixes

### R1. Restored transaction references break | High

**Finding:** [Restore](../core/books.js#L98) generates new IDs for imported batches and manual documents, while edits and receipt metadata keep their original `txKey`. The [calculation engine](../public/calcs.js#L66) derives imported keys from the batch ID and row index, and manual keys from the document ID. A successful JSON restore can therefore make recategorization, splits, ignored states, and receipts disappear from the transaction UI.

**Implement:** Stage the restore in two passes. Allocate destination IDs and build an old-to-new map first; then rewrite known document references and `txKey` values before commit. Preserve imported row order and indexes. Remap receipt `fileId` when allocating new file IDs, particularly when restoring into another dashboard on the same host. Leave unrelated key formats alone; surface unresolved references in the restore summary rather than silently discarding them. Keep existing exports readable.

**Accept when:** A fixture containing an imported transaction and a manual transaction, with edits/splits and a receipt, restores into both the original and a different dashboard without losing behavior or altering the source dashboard. Assert the calculated transactions and receipt retrieval, not just the restored document count.

### R2. Restore is not atomic; phone safety snapshots omit photos | High

**Finding:** [The shared restore path](../core/books.js#L109) replaces documents and receipt files in separate operations. If the second fails, it reports that nothing changed even though documents have been committed. [Phone-only snapshots](../public/local.js#L51) omit photos, including those taken before a restore.

**Implement:** Validate and stage the full payload before any replacement. Use one shared storage contract for atomic document and file replacement: one SQLite transaction on the [host](../server.js#L196), and one IndexedDB transaction spanning both stores [on-device](../public/local.js#L37). Require a complete safety copy before starting a destructive restore; ordinary daily phone snapshots may remain lightweight if their exclusions are clearly labeled. Define compatibility explicitly: an older backup with `files` absent is not the same as a complete backup with `files: []`. For a legacy backup, preserve matching existing attachments where possible and report missing ones.

**Accept when:** A forced failure during file replacement leaves both documents and files unchanged in each backend. Validate successful replacement, legacy backups, and a pre-restore safety copy that can recover photos. A failed safety copy must prevent the destructive write.

### R3. Duplicate detection hides legitimate transactions | High

**Finding:** The [calculation engine](../public/calcs.js#L50) collapses matching date, amount, and description values across accounts in one dashboard. [Import preview](../public/import.js#L170) uses a similar broad match, and the [OFX parser](../public/import.js#L330) does not retain `FITID`. The [bank-sync path](../core/simplefin.js#L112) already uses some account and provider identity, but also falls back to matching transaction text.

**Implement:** Separate transaction identity from a possible-duplicate fingerprint. Persist a stable account ID and source transaction ID where available; scope provider IDs to their source/account. For files without stable IDs, detect reimport of the same file for the same account and flag ambiguous overlaps for review instead of unconditionally collapsing identical rows. Align preview, import, bank sync, and calculated totals. Do not blanket-delete or rewrite historical batches: older data may contain duplicates previously hidden by the calculation layer. Coordinate any key migration with R1.

**Accept when:** Identical purchases in two accounts count twice; two genuine same-day purchases in one account count twice; reimporting the same file adds nothing; overlapping OFX exports with the same account and `FITID` add each transaction once. Verify preview counts against what is actually persisted and counted.

### R4. Large statements silently lose trailing rows | High

**Finding:** The [save handler](../public/import.js#L368) slices the previewed transactions to 2,500 and can report success. The [shared backend](../core/books.js#L76) also silently caps the array. There are separate row and payload-size limits.

**Implement:** First, ship a small guard in both UI and shared writer: reject oversized input before any write, explain the limit, and show how many rows would have been imported. Then, if large imports are common, split by row count and serialized size and commit the chunks as one logical import. Use a single import ID, carry the closing balance only once, and check the committed count before showing success. Do not make a chunked import a series of independent browser writes.

**Accept when:** Test the supported boundary and one row over it, plus an oversized serialized payload. The operation must either save every intended row or report failure without saving a partial statement. Verify host and phone-only behavior.

### R5. Stale refreshes can update the wrong dashboard state | Medium

**Finding:** [The loader](../public/runtime.js#L68) checks the selected book on success but cannot distinguish two requests for that same book. Its failure path does not check the book at all.

**Implement:** Give every load a monotonically increasing request ID. Check it before applying results, changing errors, toggling connection banners, or scheduling redraws. Cancel superseded reads if supported by [the data adapter](../public/store.js), but keep the ID check as the correctness guarantee. Bind writes and their follow-up refreshes to the book targeted when the action began.

**Accept when:** With controlled responses, a late success for an older request cannot replace newer data, a late failure after switching books cannot damage the current book, and a failure on the current request still shows normal retry behavior.

### R6. Plain HTTP is still available for remote sign-in | Medium

**Finding:** [The host listener](../server.js#L577) intentionally supports plain HTTP alongside HTTPS. A household member using an old LAN link can sign in without transport encryption.

**Implement:** Make remote access HTTPS-only by default; keep loopback HTTP where needed for local compatibility. Secure the session cookie on HTTPS and generate HTTPS pairing and invite links. Preserve TLS-terminating reverse proxies via an explicit trusted-proxy configuration. If remote plain HTTP remains available, give it an explicit opt-in and document the limitation. Coordinate the rollout with Docker, Tailscale, and desktop/mobile pairing so the change does not strand existing users.

**Accept when:** Local access still works, remote insecure login and authenticated API requests are refused by default, supported HTTPS and configured proxy setups work, and pairing still succeeds. Use disposable fixtures, not a live house account.

## 2. Feature backlog

| Priority | Feature | Implementation and acceptance |
|---|---|---|
| Next | **Statement reconciliation** | Add optional statement period, opening balance, and closing balance to the import review. Compute the expected closing balance from account-scoped activity in cents, respecting asset/liability sign conventions. Show the difference and link to candidate transactions; never auto-adjust the ledger. Start with deposit and credit accounts. A fixture with an omitted or sign-flipped row must show a discrepancy. Depends on R3 and R4. |
| Next | **Import history, saved mappings, and undo** | Extend existing import batches with a logical import ID, source/account, timestamp, and committed counts. Store local, per-account mapping presets for date format, columns, and sign convention. Before undo, preview affected transactions, edits, and receipts; remove the batch and its explicitly confirmed dependent records in one transaction. Reimporting after undo should work. Depends on R1, R3, and R4. |
| Next | **Backup health screen** | Extend **Backup & privacy** with backup type, date, location, receipt inclusion, and last verification status. Validate a JSON backup in staging without replacing the live book; check a SQLite copy separately. Distinguish on-device snapshots, files written elsewhere, and cloud-sync status: a file copy does not prove a provider uploaded it. Depends on R2. |
| Later | **Household settlements** | Build on [the spending split view](../public/page.js#L3355). Save a statement of what each person owes for a period and record settlements separately from actual expenses, so payments do not inflate spending. A closed period should retain its recorded split even if later rules change; do not pull private transaction detail into shared views. Verify that a settlement reduces what is owed without changing spending totals. |
| Later | **Confirmed bills and paydays in forecasts** | Extend [the forecast view](../public/page.js#L1946) with optional scheduled amounts/dates, including skip or reschedule for one occurrence. Label confirmed inputs separately from estimates; use the confirmed occurrence in place of its corresponding estimate, not alongside it. Keep schedules out of actual ledger totals until a transaction exists. |

## 3. Performance and maintainability

### E1. Batch multi-record writes before changing the read API | First optimization

[The runtime write adapter](../public/runtime.js#L101) reloads `/data` after each write. Add a validated, book-scoped batch operation in [the shared router](../core/books.js), enforce the same role checks as single writes on the host, and implement one transaction per backend. Start by converting one existing multi-write action, such as applying starter budgets. Refresh once after commit. A test should assert one mutation request, one follow-up read, and rollback on invalid input. Keep `/data` intact until measurements show a need for finer-grained fetching.

### E2. Recalculate and render only what changed | Measure first

[The runtime](../public/runtime.js#L11) uses a global version for computed values and redraws all registered views. Track revisions per input and parameter dependency, and keep hidden panels dirty until shown. Preserve nonvisual data hooks and any notifications that depend on them. Instrument with synthetic multi-year books on a lower-end phone or a throttled browser. Record initial load, `/data` bytes and request count, edit-to-visible latency, and calculation/render time. Compare the same fixture/device before and after; check that newly opened panels always show fresh values.

### E3. Index transfer-match candidates | If profiling warrants it

[Transfer matching](../public/calcs.js#L119) scans deposit outflows for each candidate payment. Group candidates by book and amount in cents, then search the date window within each group. Preserve closest-date, tie-break, and one-to-one behavior. Compare outputs on fixed fixtures (including same-amount ambiguous payments) before benchmarking a large history. Land independently of duplicate detection so any changes to totals are attributable.

### E4. Extract UI workflows incrementally and add parity tests | Alongside fixes

Keep the shared calculations, storage contract, and existing front-end stack. Split [page.js](../public/page.js) by workflow, starting with the next area being changed (for example, transaction editing or backup settings), rather than moving the whole file at once. Put parser and reconciliation logic in testable functions independent of the DOM. Extend the existing [core](../test/core.test.mjs), [API](../test/api.test.mjs), and [calculations](../test/calcs.test.mjs) suites; use a browser test for IndexedDB parity and an end-to-end import → edit → export → restore workflow. Preserve desktop/mobile asset loading and follow the [service-worker cache version convention](./ARCHITECTURE.md) for changes to cached assets.

## 4. Suggested delivery sequence

1. **Restore integrity:** R1 + R2 with legacy and cross-dashboard fixtures and rollback coverage.
2. **Import correctness:** ship the R4 rejection guard promptly; implement R3 with a documented legacy-data policy. Add chunked support only if needed.
3. **Reliability and hosting:** R5 and R6 as independent changes. Start E1 with one measured workflow.
4. **Product:** ship reconciliation first, then import history/undo and backup health. Use profiling to decide whether E2/E3 are worth doing; take on E4 as part of the relevant fixes rather than as a rewrite.

For each change, report the behavior changed, regression tests added, remaining compatibility risks, and any host or phone-only paths not verified. Use synthetic data for all fixtures. Run focused tests during implementation and `npm test` before merging behavior changes.
