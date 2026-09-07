'use client'

import { useAuth } from '@features/auth'
import { keepFor } from '@shared/lib/api/query-client'
import { type Currency, DEFAULT_CURRENCY } from '@shared/lib/money'
import { STORAGE_KEYS, storage } from '@shared/lib/storage'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { exchangeApi, exchangeKeys } from '../api/exchange-api'

/**
 * The currency the account's money is *shown* in, and today's rate for it.
 *
 * The account's earnings are held in USD (`1 TEVI = 1 USD`); this is the *display* unit, chosen by the
 * reader and remembered per account. A creator paid out in dong reads `₫157,155,000`, not `$6,289.19`, and
 * legacy has shipped that switcher since long before this rewrite.
 *
 * ## Two readers, and only one of them may ask straight away
 *
 * `/my-wallet` is the screen the figure belongs to, so it calls this with no argument and the two queries
 * go out with the page. The account **drawer** has the same switcher (legacy's `BtnCurrency` sits in
 * exactly that widget) and is mounted by the shell on every route, so it passes `{ enabled: open }` —
 * nothing is requested until somebody opens the menu, which is the same gate `useIdentityStatus` uses
 * there and for the same measured reason.
 *
 * The gate gets the **queries**, never the selection: `selectedCode` is read from storage on the render
 * it is needed, so a disabled hook still reports the right currency and a switch is never a frame late.
 *
 * ## Why the *selection* is Zustand-free, provider-free and query-free
 *
 * It is none of the three communication primitives' business. It is not server state (the server does not
 * know or care which unit a browser renders in), it is not a UI signal, and it is not shared imperatively —
 * it is a **persisted local preference**, which is what `shared/lib/storage.ts` is for.
 *
 * The two things that *are* server state — the currency list and the rate — are queries.
 *
 * Storing only the **code**, never the whole currency record: legacy persists the object, which means a
 * cached `decimal_digits` outlives a change upstream and keeps formatting dong with two decimal places
 * forever. The code is the identity; everything else is looked up.
 */

/** The persisted shape: `accountId -> currencyCode`. */
type StoredCurrencies = Record<string, string>

function readStoredCode(accountId: string | null): string | null {
    if (!accountId) return null
    const map = storage.getJSON<StoredCurrencies>(STORAGE_KEYS.walletCurrency)
    const code = map?.[accountId]
    return typeof code === 'string' && code ? code.toUpperCase() : null
}

function writeStoredCode(accountId: string | null, code: string) {
    if (!accountId) return
    const map = storage.getJSON<StoredCurrencies>(STORAGE_KEYS.walletCurrency) ?? {}
    /*
     * Merged rather than replaced, so one account's choice never clears the other nine's — the same rule
     * `nsfwConfirmed` follows. `storage.setJSON` swallows a quota failure, so a write that cannot land
     * degrades to "the choice does not stick", never to a throw on a click.
     */
    storage.setJSON(STORAGE_KEYS.walletCurrency, { ...map, [accountId]: code.toUpperCase() })
}

export interface UseCurrencyResult {
    /** The currency to format with. Always a real record — `DEFAULT_CURRENCY` until better is known. */
    currency: Currency
    /** Every currency the picker offers, guaranteed to contain `currency`. */
    currencies: Currency[]
    /**
     * Whether the list is in flight — i.e. whether `currencies` is the service's answer or the
     * one-row stand-in this hook builds from the selection.
     *
     * A disabled hook is **not** loading: it is not waiting for anything. That distinction is what
     * lets the drawer's picker show a skeleton on the visit that fetches and nothing on the ones
     * that read the cache.
     */
    isListLoading: boolean
    /** USD → `currency`. `1` while unknown and `1` on failure, so figures degrade to USD. */
    rate: number
    /**
     * Whether `rate` is the real one rather than the standing-in `1`.
     *
     * Exposed because the two readers answer the transient differently, and both answers are right for
     * where they are. `/my-wallet` prints the unconverted figure and lets it convert a moment later — the
     * balance is the screen's whole subject and blanking it is worse. The drawer prints `—`, which is what
     * it already does for a balance it does not have yet: its card is a *summary*, and a summary that
     * briefly labels a USD figure `₫` is off by four orders of magnitude in the reader's favour.
     *
     * `true` immediately for USD, since `getExchangeRate` answers that one without a request.
     */
    isRateKnown: boolean
    /** Pick a currency. Persisted immediately, per account. */
    selectCurrency: (code: string) => void
}

export function useCurrency({
    /** `false` holds both queries back; the selection is still reported. See the note above. */
    enabled = true,
}: {
    enabled?: boolean
} = {}): UseCurrencyResult {
    const { activeId, isAuthenticated } = useAuth()

    /**
     * The selection, held **with the account it belongs to** and re-derived when the two disagree.
     *
     * React's own "adjust state when a prop changes" pattern, and it is here because the naive versions are
     * each wrong in a way that shows:
     *
     * - **state seeded once from storage** goes stale on an account switch: account B keeps account A's
     *   currency, and every figure on the screen is relabelled with the wrong unit while the numbers stay
     *   account B's;
     * - **an effect that re-reads storage on `activeId`** renders one frame with the previous account's
     *   currency before correcting itself — a visible flash of the wrong symbol on the screen whose entire
     *   subject is money;
     * - **a version counter** forces the re-render without holding the value, which works and is a lie to
     *   the dependency array: the memo does not depend on the counter, it depends on a side effect the
     *   counter announces. Biome flags it, correctly.
     *
     * Holding the pair means a switch simply stops matching, storage is read on the same render, and there
     * is no effect and no suppression.
     */
    const [picked, setPicked] = useState<{ accountId: string | null; code: string } | null>(null)
    const storedCode = readStoredCode(activeId) ?? DEFAULT_CURRENCY.code
    const selectedCode = picked?.accountId === activeId ? picked.code : storedCode

    const currenciesQuery = useQuery({
        queryKey: exchangeKeys.currencies(),
        queryFn: ({ signal }) => exchangeApi.getCurrencies({ accountId: activeId, signal }),
        enabled: isAuthenticated && enabled,
        /*
         * The set of world currencies changes on the order of never, and this list is read by a picker most
         * readers open once. An hour keeps it out of the way; the request is not cheap enough to repeat on
         * every visit and not expensive enough to persist.
         */
        ...keepFor(60 * 60_000),
    })

    /**
     * The list the picker renders — the server's, with the current selection guaranteed present.
     *
     * That guarantee belongs here rather than in the parser: this is the only layer that knows what the
     * selection *is*. A picker whose current value is absent from its own list shows nothing selected, which
     * reads as "no currency chosen" on a screen whose figures are visibly in one.
     *
     * Two ways it can be missing: the list has not loaded, or it loaded and does not contain the persisted
     * code (the endpoint dropped a currency, or an older build wrote it). Both are covered by the prepend.
     */
    const currencies = useMemo(() => {
        const list = currenciesQuery.data ?? []
        if (list.some(c => c.code === selectedCode)) return list
        const fallback: Currency =
            selectedCode === DEFAULT_CURRENCY.code
                ? DEFAULT_CURRENCY
                : // A code with no record: show it as itself rather than silently switching the reader to
                  // dollars. `symbol: ''` makes `formatFiatAmount` print the code.
                  { code: selectedCode, name: selectedCode, symbol: '', decimalDigits: 2 }
        return [fallback, ...list]
    }, [currenciesQuery.data, selectedCode])

    const currency = useMemo(
        () => currencies.find(c => c.code === selectedCode) ?? DEFAULT_CURRENCY,
        [currencies, selectedCode],
    )

    const rateQuery = useQuery({
        queryKey: exchangeKeys.rate(selectedCode),
        queryFn: ({ signal }) =>
            exchangeApi.getExchangeRate({ currency: selectedCode, accountId: activeId, signal }),
        enabled: isAuthenticated && enabled,
        /*
         * Five minutes — shorter than the currency list by two orders of magnitude, because this one
         * genuinely moves, and still long enough that scrolling a ledger does not re-ask.
         * `getExchangeRate` short-circuits USD without a request, so the default currency costs nothing.
         */
        ...keepFor(5 * 60_000),
    })

    const selectCurrency = useCallback(
        (code: string) => {
            const next = code.trim().toUpperCase()
            if (!next || next === selectedCode) return
            /*
             * Storage first, then state. Both are written because they answer different questions: storage
             * is what the *next* visit reads, state is what *this* render reads. They cannot disagree — a
             * switch away and back re-reads storage, which now holds the same value — so this is not a
             * mirror to keep in step, it is one write and one re-render.
             */
            writeStoredCode(activeId, next)
            setPicked({ accountId: activeId, code: next })
        },
        [activeId, selectedCode],
    )

    return {
        currency,
        currencies,
        isListLoading: currenciesQuery.isLoading,
        /*
         * `1` while the rate is in flight, so the figures show USD for a moment and then convert. The
         * alternative — hiding the balance until the rate lands — trades a correct-but-unconverted number
         * for no number at all, on the one element the screen exists to show. `normalizeExchangeRate` makes
         * `1` the failure value too, so the transient and the broken state look the same and both are
         * honest.
         */
        rate: rateQuery.data ?? 1,
        /*
         * `isSuccess`, not `!isLoading`: a disabled query is neither loading nor successful, and a failed
         * one has settled on the fallback rather than on the rate. USD is known without asking.
         */
        isRateKnown: selectedCode === DEFAULT_CURRENCY.code || rateQuery.isSuccess,
        selectCurrency,
    }
}
