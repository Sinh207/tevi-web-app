import { z } from 'zod'

/**
 * The account's balance, and the vocabulary of a movement in it.
 *
 * ## What this feature owns, and what it does not
 *
 * `features/balance` is **the user's balance and nothing else** — one figure per unit, available
 * everywhere, plus the rule for whether an amount of Star can be spent. It is not a screen and it
 * does not hold anybody else's state.
 *
 * So this file models `billy/v5/billing/balance/` and the *shape* of a ledger entry — because "what
 * a movement in my balance looks like" is this feature's subject. It does **not** model either
 * ledger endpoint, either filter vocabulary, or the exchange service. Those belong to the two screens
 * that read them (`features/my-star`, `features/my-wallet`), which is why they are separate features
 * rather than folders in here.
 *
 * ## Two units, and neither of them is a "coin"
 *
 * | wire code | what it is | spent on |
 * |---|---|---|
 * | `TVS` | **Star** — bought with real money | gifts, memberships, paywalled posts |
 * | `TEVI` | creator **earnings**, `1 TEVI = 1 USD` | withdrawn, not spent |
 *
 * That asymmetry is why only Star has a spend gate (`useRequireStars`): Star is the currency the
 * product is priced in, and earnings are a payout balance.
 *
 * There is no "diamond" or "gem" anywhere in this product. **Tevi Coin** exists but is a *bonus*
 * badge from a different service (`dapp-wallet`) and is not part of either balance.
 *
 * ## Why every field is normalised rather than trusted
 *
 * Same posture as `features/earnings/api/types.ts`: this shows a person **money**, so the failure to
 * design against is not a blank page but a *plausible wrong number*. Hence:
 *
 * 1. **An amount that cannot be read is `0`, never `null`.** A nullable amount pushes `?? 0` onto
 *    every consumer and the one that forgets prints `$NaN`.
 * 2. **Amounts may arrive as strings.** Money over JSON commonly does, to avoid float drift. Legacy
 *    `parseFloat`s the Star balance and passes the `TEVI` one through untouched.
 * 3. **A row with no readable timestamp is dropped.** It cannot be labelled, grouped or linked to.
 * 4. **Currency codes are upper-cased here.** Legacy calls `.toUpperCase()` at *every* comparison
 *    site, which is the evidence the wire value is not guaranteed.
 *
 * See `docs/BACKEND_QUESTIONS.md` B34–B39 for what is still guessed at.
 */

/**
 * A money amount. Accepts a number or a numeric string; anything else is `0`.
 *
 * The same transform `features/earnings` has, deliberately not shared: `shared/` may not hold a
 * feature's parsing rules, and a fourteen-line transform is not worth a shared module.
 */
const amount = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value === 'string') {
            const trimmed = value.trim()
            if (trimmed === '') return 0
            const parsed = Number(trimmed)
            return Number.isFinite(parsed) ? parsed : 0
        }
        return 0
    })
    .catch(0)

/**
 * A currency code, upper-cased — or `''`, which is how a caller can tell it was absent.
 *
 * `''` rather than defaulting to `'USD'`: guessing the unit of a number is the one guess a wallet
 * must not make. A row whose currency is unknown renders without a symbol, which is honest; a row
 * that says `$` about Star is not.
 */
const currencyCode = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim().toUpperCase() : ''))
    .catch('')

/**
 * A timestamp, as epoch **milliseconds** — or `null`, which drops the row.
 *
 * ## Three wire shapes, because legacy never pinned one
 *
 * Legacy hands `created_at` straight to `date-fns`, which accepts an ISO string *or* a `Date` *or* a
 * number, so the wire shape was never forced to be one thing and the client never found out which it
 * is (B37). This accepts all three:
 *
 * - a **number** — promoted from seconds to milliseconds below the year-2001 mark, the same guard
 *   `features/earnings` documents. Without it a seconds feed renders every row as January 1970 while
 *   the amounts stay right — a unit bug that looks like a formatting bug;
 * - a **numeric string** — same treatment;
 * - an **ISO 8601 string** — `Date.parse`, which is what the field most likely is.
 *
 * Anything else is `null`.
 */
const SECONDS_CUTOFF_MS = 1_000_000_000_000

/**
 * Exported because `features/payout` reads the same wire shapes from the same service, and the first
 * version of its schema declared `created_at: z.string()` — so a payload sending epoch **milliseconds
 * as a number** (which `billing/payout-request/` does) failed the parse and every row was dropped.
 * One parser, one answer; the B37 note above is why there is more than one shape to answer for.
 */
export const epochMs = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') {
            if (!Number.isFinite(value) || value <= 0) return null
            return value < SECONDS_CUTOFF_MS ? Math.round(value * 1000) : Math.round(value)
        }
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        // A bare numeric string is an epoch, not a date to parse: `Date.parse('1739923200')` is the
        // *year* 1739923200 in V8, which is not a number anybody meant.
        if (/^\d+$/.test(trimmed)) {
            const numeric = Number(trimmed)
            if (!Number.isFinite(numeric) || numeric <= 0) return null
            return numeric < SECONDS_CUTOFF_MS ? Math.round(numeric * 1000) : Math.round(numeric)
        }
        const parsed = Date.parse(trimmed)
        return Number.isFinite(parsed) ? parsed : null
    })
    .catch(null)

/* ============================== balance ============================== */

/** The wire codes. Compared after `currencyCode` has upper-cased them. */
export const STAR_CURRENCY = 'TVS'
export const EARNINGS_CURRENCY = 'TEVI'

const balanceEntrySchema = z.looseObject({
    amount,
    amount_currency: currencyCode,
})

const balanceSchema = z.looseObject({
    balances: z.array(z.unknown()).catch([]),
})

export interface Balance {
    /** Star (`TVS`). Whole numbers in practice; not rounded here in case it ever is not. */
    star: number
    /**
     * Withdrawable earnings (`TEVI`), **in USD** — `1 TEVI = 1 USD`, which is legacy's arithmetic
     * rather than a documented contract. Convert for display; never store the converted figure.
     */
    usd: number
}

/**
 * Parse `billing/balance/`.
 *
 * ## A missing entry is `0`, and that is a **fix**, not a port
 *
 * Legacy only writes its state when `balances.length > 0` (`providers/balance/index.js`), so a
 * genuinely empty response leaves the *previous* account's figures on screen — and since its balance
 * is one global value rather than one per account, switching into a brand-new account shows the old
 * account's money. Here an absent entry reads as `0`, because that is what an account with no Star
 * has. B35 asks which of the two the backend actually does; either answer gives the same number.
 */
export function normalizeBalance(body: unknown): Balance {
    const parsed = balanceSchema.safeParse(body)
    const rows = parsed.success ? parsed.data.balances : []

    let star = 0
    let usd = 0
    for (const row of rows) {
        const entry = balanceEntrySchema.safeParse(row)
        if (!entry.success) continue
        if (entry.data.amount_currency === STAR_CURRENCY) star = entry.data.amount
        if (entry.data.amount_currency === EARNINGS_CURRENCY) usd = entry.data.amount
    }
    return { star, usd }
}

/* ============================== ledger entries ============================== */

/**
 * The types whose *net* figure is the one to show.
 *
 * Legacy's `EARNING_TYPES` (`containers/myWallet/utils/transactionHelpers.js`): for these two the row
 * carries both a gross `amount` and a post-fee `net_amount`, and a wallet must show the net — it has
 * to match what actually landed. Every other type has no `net_*` at all.
 *
 * Lower-cased for comparison because `type` is not guaranteed to be either case: legacy compares
 * against upper-case constants in one place and lower-case filter slugs in another, so both
 * spellings are on the wire.
 */
const EARNING_TYPES = new Set(['platform_earning', 'commission'])

const entrySchema = z.looseObject({
    id: z.union([z.string(), z.number()]).transform(String).catch(''),
    type: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
        .catch(''),
    description: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim() : ''))
        .catch(''),
    created_at: epochMs,
    /**
     * **Billy's own spelling is `amount_currency`**; `currency` is accepted beside it.
     *
     * This was `currency` alone, and the live payload (2026-08-28) sends `amount_currency` — so every
     * row that is *not* an earning parsed with no unit at all. `formatLedgerAmount` then takes its
     * `!currency` branch and prints a bare number **without converting**: a `reward` of `0.10` TEVI
     * rendered as `0.1` on a wallet displaying VND, where it should read `₫2,540`, and a `-1000.00`
     * payout as `-1000` instead of `-₫25,400,000`. Four orders of magnitude, on a money column, with
     * nothing thrown and no empty state to notice.
     *
     * Earnings hid it: they take `net_amount_currency`, which the payload *does* send under that name,
     * so the rows a test would reach for first were all correct.
     *
     * Both spellings are read because only the currency ledger has been seen live; the Star ledger
     * (`v5/billing/tvs-transactions/`) has not, and a parser that insists on one name is how this
     * happened in the first place.
     */
    amount_currency: currencyCode,
    currency: currencyCode,
    amount,
    net_amount: amount,
    net_amount_currency: currencyCode,
})

/**
 * One movement in the balance.
 *
 * Modelled here rather than in either screen because both ledger endpoints answer with this shape —
 * it is what a change to the user's balance looks like, which is this feature's subject. Which
 * *endpoint* you read it from, and which filters that endpoint accepts, is the screen's business.
 */
export interface LedgerEntry {
    /** List key. The row's own id, else a composite — see `normalizeLedger`. */
    id: string
    /**
     * The **billy transaction id**, or `null` when the payload carried none.
     *
     * Separate from `id` because `id` is a *list key* and therefore has a fallback
     * (`type + timestamp`), which is right for React and wrong for anything that leaves the browser.
     * `/my-wallet` sends these to `dapp-wallet/v1/t/transactions/?billy_tx_id=…` to fetch the Tevi
     * Coin bonus on each row (B83) — and it was sending `id`, so a row billy gave no id for went out
     * as `platform_earning-1739000000000`: a lookup for a transaction that does not exist, in a
     * parameter the other service parses as an id list.
     *
     * Nothing broke visibly, which is the point of splitting the two. The bonus for that row simply
     * never matched, the query key carried a value no server would recognise, and the only way to see
     * it was to ask where the ids came from.
     */
    txId: string | null
    /** Lower-cased slug. Each screen looks it up in its own vocabulary. */
    type: string
    /** The backend's own sentence. Screens fall back to the type's label when empty. */
    description: string
    /** Epoch **milliseconds**. */
    createdAt: number
    /** Upper-cased, or `''` when the payload did not say. */
    currency: string
    /** Signed: negative is money leaving. */
    amount: number
}

/**
 * Parse a page of either ledger.
 *
 * Accepts the array under `results` (billy pages with `?page&page_size`) or bare, for the reason
 * `normalizeEarningsDays` accepts both: cheap now, versus a screen that silently empties the day the
 * shape moves.
 *
 * **Rows are not re-sorted**, unlike the earnings report. That list is one the client owns end to
 * end; this one is *paginated*, so sorting would order only the twenty rows that happened to arrive
 * together and produce a list that is locally ordered and globally not — worse than trusting the
 * server's `ORDER BY`.
 *
 * The `id` fallback is `type + timestamp`, never the array index. Legacy uses the index, and that is
 * the version that breaks: the list grows at the top as pages load, so every index shifts and React
 * reuses the wrong row's state.
 *
 * ⚠ That fallback is for **React only**. Anything that sends an id to a server must read `txId`, which
 * is `null` rather than composed when billy gave none — see the field.
 */
export function normalizeLedger(body: unknown): LedgerEntry[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: LedgerEntry[] = []
    for (const row of rows) {
        const parsed = entrySchema.safeParse(row)
        if (!parsed.success) continue
        const { id, type, description, created_at, amount, net_amount } = parsed.data
        // `amount_currency` first — see the field. `currency` is the fallback, not the source.
        const currency = parsed.data.amount_currency || parsed.data.currency
        // No timestamp, no row — see the note on `LedgerEntry.createdAt`.
        if (created_at === null) continue

        const isEarning = EARNING_TYPES.has(type)
        out.push({
            id: id || `${type}-${created_at}`,
            /*
             * The real id and nothing else — **never the composite**. See `LedgerEntry.txId`: this one
             * goes out over the wire, so a fabricated value here is a request about a transaction that
             * does not exist.
             */
            txId: id || null,
            type,
            description,
            createdAt: created_at,
            currency: isEarning ? parsed.data.net_amount_currency || currency : currency,
            amount: isEarning ? net_amount : amount,
        })
    }
    return out
}
