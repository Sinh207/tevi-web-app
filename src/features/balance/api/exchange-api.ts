import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import type { Currency } from '@shared/lib/money'
import { z } from 'zod'

/**
 * The **exchange** service: `${W_API}/exchange`, `v1`.
 *
 * Two endpoints and one job: turn the account's USD earnings into the unit the reader wants to see them
 * in. A creator in Vietnam reads `₫157,155,000`, not `$6,289.19`, and legacy has shipped that switcher
 * since long before this rewrite.
 *
 * ## Why this lives here and not in `features/my-wallet`
 *
 * It used to live there, when `/my-wallet` was the only screen with a switcher. The account drawer now
 * has one too (`menu-drawer.tsx`, matching legacy's `BtnCurrency`), and the drawer is mounted by the
 * shell — which must not import a screen feature's barrel, and could not: `features/my-wallet` states
 * the constraint on its own barrel, because the drawer's ASSETS row already points the other way and
 * one more edge would close a module cycle.
 *
 * So the display unit sits with the figure it relabels, one level below both readers. What that
 * costs is bounded by the caller, not by this file: `useCurrency({ enabled })` lets the drawer wait
 * for `open`, so the shell issues neither request until somebody actually opens the menu, and
 * `/my-wallet` — where the figure is the screen's subject — asks immediately. The two share the query
 * keys below, so opening the drawer on the wallet screen costs nothing.
 *
 * ## Neither call is account-specific
 *
 * The list of world currencies and today's USD→VND rate are the same for everybody, so these are the only
 * two requests in the wallet whose query keys carry no account id — and the only two that are safe to
 * keep across an account switch. `accountId` is still passed so the request goes out with *a* valid
 * bearer, but nothing about the answer depends on which.
 *
 * ## What is deliberately not modelled
 *
 * `Currency` keeps four of the seven fields the endpoint sends. `name_plural`, `symbol_native` and
 * `rounding` are dropped, not forgotten: nothing renders a plural currency name, `symbol_native` would
 * put a locale's own glyph on a figure the rest of the app writes with the international one, and
 * `rounding` is a cash-denomination rule (the smallest coin that exists), which is a payout concern
 * rather than a display one.
 *
 * The **payout** exchange rate is a different number from a different place — it rides on
 * `payout_option.exchange_rate` off the billing service and is the rate a withdrawal is actually settled
 * at. It is not this rate and must never be substituted for it. Nothing in this pass reads it (there is
 * no withdraw flow yet); the note is here so the next person does not wire the display rate into a quote.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/exchange` })

/**
 * Query keys.
 *
 * Both under `['exchange']`, so a single `invalidateQueries` drops the pair. They are **not** under
 * `balanceKeys.all`: a spend changes the balance, not the world's exchange rates, and nesting them there
 * would throw away a currency list on every gift.
 *
 * The differing freshness is set on each `useQuery` rather than encoded in the key — see
 * `hooks/use-currency.ts`.
 */
export const exchangeKeys = {
    all: ['exchange'] as const,
    currencies: () => ['exchange', 'currencies'] as const,
    rate: (code: string) => ['exchange', 'rate', code.toUpperCase()] as const,
}

const currencySchema = z.looseObject({
    code: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toUpperCase() : ''))
        .catch(''),
    name: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim() : ''))
        .catch(''),
    symbol: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim() : ''))
        .catch(''),
    /**
     * How many decimal places this currency is written with — 2 for USD, **0 for VND**. The difference is
     * visible: `₫157,155,000.00` is not how anybody writes dong.
     *
     * Clamped to 0–4 rather than trusted, because it goes into `Intl.NumberFormat`, which throws outside
     * 0–100 and would take the whole card down with it. `formatFiatAmount` clamps again, on the principle
     * that the function behind every figure should not depend on its caller having done so.
     */
    decimal_digits: z
        .unknown()
        .transform(v => {
            const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
            if (!Number.isFinite(n)) return 2
            return Math.min(4, Math.max(0, Math.trunc(n)))
        })
        .catch(2),
})

/**
 * Parse `exchange/v1/currencies/`.
 *
 * A row with no `code` is dropped: the code is the identity, the persistence key and the `Intl` argument,
 * so a currency without one could only be a radio nobody can select twice. Duplicates are dropped too,
 * first spelling wins — two rows with the same code would be two radios both claiming to be current.
 *
 * **The server's order is kept and USD is not injected here.** An earlier version guaranteed USD by
 * unshifting it, and that was the wrong layer twice over: it makes a *display* decision (what order a
 * picker lists things in) inside a parser, and it silently shifts every index of a list the caller thinks
 * it is reading verbatim. The guarantee that the picker always contains its own current value belongs to
 * the picker's data — see `useCurrency`, which holds the selection and is therefore the only place that
 * can know what has to be in the list.
 */
export function normalizeCurrencies(body: unknown): Currency[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: Currency[] = []
    const seen = new Set<string>()
    for (const row of rows) {
        const parsed = currencySchema.safeParse(row)
        if (!parsed.success || !parsed.data.code || seen.has(parsed.data.code)) continue
        seen.add(parsed.data.code)
        out.push({
            code: parsed.data.code,
            name: parsed.data.name,
            symbol: parsed.data.symbol,
            decimalDigits: parsed.data.decimal_digits,
        })
    }
    return out
}

/**
 * Parse `exchange/v1/exchange-rate/`.
 *
 * The endpoint answers with a **bare value**, and legacy reads it as `parseFloat(res.data.data)` — i.e. it
 * may be a string. It may also plausibly be wrapped (`{ rate }`), so both are accepted.
 *
 * **`1` for anything unreadable, and that is the right fallback rather than a lazy one**: a rate of 1 shows
 * the underlying USD figure, which is a true statement about the account. A `0` would show every balance
 * as empty, and a `null` would push a `?? 1` onto each call site. A non-positive or non-finite rate is
 * treated as unreadable for the same reason.
 */
export function normalizeExchangeRate(body: unknown): number {
    const raw =
        body !== null && typeof body === 'object' && 'rate' in body
            ? (body as { rate: unknown }).rate
            : body
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
    return Number.isFinite(value) && value > 0 ? value : 1
}

export const exchangeApi = {
    /** Every currency the wallet can be displayed in, in the server's own order. */
    async getCurrencies({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<Currency[]> {
        const body = await api.get<unknown>('v1/currencies/', undefined, {
            signal,
            ...(accountId ? { accountId } : {}),
            // The same list for everybody; `accountId` only namespaces the cache.
            cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
        })
        return normalizeCurrencies(body)
    },

    /**
     * How many units of `currency` one USD buys.
     *
     * `1` for USD without asking: the request would be a round trip to be told a number we already know,
     * on the default currency, i.e. on most loads. Anything unreadable is also `1`, so this never rejects
     * into a screen — a failed rate degrades to showing USD, not to an error.
     */
    async getExchangeRate({
        currency,
        accountId,
        signal,
    }: {
        currency: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<number> {
        const code = currency.trim().toUpperCase()
        if (!code || code === 'USD') return 1
        const body = await api.get<unknown>(
            'v1/exchange-rate/',
            { currency: code },
            // An hour, not a day: a rate that is a day old is wrong, and this one is
            // multiplied against balances.
            {
                signal,
                ...(accountId ? { accountId } : {}),
                cache: { persist: true, shared: true, ttlMs: CACHE_TTL.hour },
            },
        )
        return normalizeExchangeRate(body)
    },
}
