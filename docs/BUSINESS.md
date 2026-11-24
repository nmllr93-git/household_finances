# Business features (self-employed and side businesses)

For people who freelance or run a business on their own, without an LLC or separate company, and file a
**Schedule C** with their personal tax return. Everything here is optional and stays hidden until you add a business.

> Larenest gives you organized totals to take to your tax preparer or tax software. It isn't tax advice, and it doesn't
> file anything. Check unusual items with a tax professional.

## Turn it on
⚙ Settings → **This dashboard** → **Business** → type a name (for example "Miller Photography") → **+ Add a business**.
You can add more than one (an Etsy shop and a photography business, say). Each dashboard has its own businesses.

Once a business is added you get:
- a **Business** tab (in the **More ▾** menu on phones),
- a business section in the transaction editor,
- business tiles you can put on any tab (✎ Arrange → Add a tile),
- business reminders under **Needs attention**.

Remove the last business and all of it hides again. Transactions keep their marks, so adding a business with the same
name brings everything back.

## Marking transactions
- **One at a time:** open any transaction (Edit) → **Business** → choose the business. Optionally:
  - **Business share %**: for mixed personal and business costs, such as 30% of a phone bill or 15% of home internet.
    Only that share counts.
  - **Tax line (Schedule C)**: leave it on *Automatic* and Larenest picks the line from the category (Supplies → line 22,
    Dining → 24b Meals, Phone or Internet → 25 Utilities, and so on). Pick a line yourself to override it.
- **Many at once:** Business tab → **Mark business transactions**:
  1. Type text from the description (for example `ADOBE`), pick an account (for example your business card), or both.
  2. Choose expenses or income and the business, share and line.
  3. **Mark these** marks every match in the selected year.
  4. **Also mark future ones (make a rule)** saves a rule, so new transactions containing that text are marked
     automatically. Rules show in the Rules list with "business …".
- **Income:** mark payments you receive (Stripe, Etsy, Square, client checks) the same way, choosing *Income*.

## Business tab
- **Business:** the year's income, expenses, mileage deduction, home office deduction, net profit, and an amount to set
  aside for taxes. Expenses are grouped by Schedule C line. Pick a business (or all) and a tax year at the top.
  - **Download transactions (CSV):** every business transaction with its line, business share and receipt status.
  - **Download summary (CSV):** totals by line, ready to type into a tax form or hand to a preparer.
  - **Print or save as PDF:** a clean printable summary plus the transaction list.
- **Business transactions:** everything marked this year. ⚠ shows expenses that still need a receipt photo; Edit opens
  the transaction so you can add one with your phone's camera.
- **Mark business transactions:** see above.
- **Quarterly estimated taxes:** the four payment periods (Jan–Mar, Apr–May, Jun–Aug, Sep–Dec), their due dates (moved
  past weekends), each period's profit, and a rough amount to set aside. A **Needs attention** reminder appears two weeks
  before each due date. Pay through IRS Direct Pay or EFTPS (Form 1040-ES); many states have their own payments too.
- **Mileage log:** add each business trip (date, miles, purpose, business). The deduction uses the IRS standard mileage
  rate for the trip's date:

  | Trips on or after | Rate |
  |---|---|
  | 2024-01-01 | 67¢ a mile |
  | 2025-01-01 | 70¢ |
  | 2026-01-01 | 72.5¢ |
  | 2026-07-01 | 76¢ (mid-year increase) |

  Use **either** the mileage log **or** actual car costs (line 9), not both. Download the log as CSV.

## How the numbers work
- **Business share:** amount × share %.
- **Meals (line 24b):** the full amount is shown, and 50% counts toward the deduction.
- **Home office:** the IRS simplified method, $5 a square foot up to 300 sq ft ($1,500 max). Set the square feet for each
  business in ⚙ Settings → Business.
- **Net profit:** income − expenses (with meals at 50%) − mileage − home office.
- **Set aside:** net profit × your set-aside % (default 25%, change it in Settings). Self-employment tax alone is about
  15.3% of most profit, plus income tax, so 25–30% is a common rule of thumb; your real amount depends on your whole
  return.
- **Receipts:** business expenses at or above your reminder amount (default $75, the IRS's general receipt threshold)
  without a receipt photo are flagged.
- Transfers never count. Splits count per part.

## Settings (⚙ Settings → This dashboard → Business)
- Add or remove businesses.
- Home office square feet for each business.
- Set-aside % for quarterly estimates.
- The receipt reminder amount.

## Yearly upkeep (for developers)
Rates that change each year live in `public/calcs.js`:
- `MILEAGE` holds the standard mileage rates by start date; add the new year's rate when the IRS announces it, usually
  in December.
- `SCHED_C` holds the expense lines and `SCHED_GUESS` the category guesses.
- The home office rate ($5, 300 sq ft) and quarterly due dates are fixed rules in `businessSummary` and `quarterDue`.

Data: businesses are stored in the dashboard pref `business`, trips in `mileage-YYYY`, and transaction marks as `biz`,
`bizPct` and `schedC` on edits and rules (cleaned in `core/books.js`).

## Pro
Business features are planned for the Pro tier (see [PRO-TIERS.md](PRO-TIERS.md)). For now every dashboard gets
everything for free.
