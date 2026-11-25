# Future features

Ideas we've talked about, roughly in the order we'd likely do them. Nothing here is promised or scheduled.

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

## Smaller items
