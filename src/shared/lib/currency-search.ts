import type { Currency } from '@shared/lib/money'

/**
 * Filter a currency list by what somebody typed, best matches first.
 *
 * The exchange service answers with the world's currencies — around 150 rows — and both switchers
 * (`/my-wallet`'s dialog and the account drawer's screen) list all of them. A reader looking for `VND`
 * should not be scrolling past `BWP`, so the field is not a nicety: it is what makes the control usable
 * at that length.
 *
 * Here rather than in `features/balance`, which owns the currency *data*, because the one component
 * that runs it is `shared/components/currency-list.tsx` — both switchers render it, and `shared/` may
 * not import a feature. It belongs next to `money.ts`, whose `Currency` it sorts.
 *
 * ## Rank, not just filter, and the ranking is the whole point
 *
 * A plain `includes` filter puts the row you meant wherever the service happened to list it. Typing
 * `vu` hits `VUV` by its code, "Vulture Coin" by its name and `XVU` by a substring, and only one of
 * those is what anybody wanted. Four tiers, in the order a reader means them:
 *
 * | tier | match |
 * |---|---|
 * | 0 | the **code** starts with the term — `VN` → `VND` |
 * | 1 | the **name** starts with it — `viet` → Vietnamese Dong |
 * | 2 | the code contains it |
 * | 3 | the name contains it — `dong` → Vietnamese Dong |
 *
 * Within a tier the service's own order is kept, which is why the sort must be **stable** (it is, in
 * every engine since ES2019) and why the tier is computed once per row rather than inside the
 * comparator.
 *
 * ## Case and space only — no diacritic folding
 *
 * The codes are ASCII by definition (ISO 4217) and the names arrive in English from the endpoint, so
 * there is nothing to fold. If the backend ever localises `name`, this is the function that grows a
 * normaliser — and it will need one, because "Đồng" cannot be found by typing `dong` without it.
 *
 * An empty or whitespace-only term returns the list **unchanged and unsorted**: the server's order is
 * the default view, and re-sorting a list nobody has filtered would silently reorder the picker.
 */
export function searchCurrencies(currencies: Currency[], term: string): Currency[] {
    const needle = term.trim().toLowerCase()
    if (!needle) return currencies

    const ranked: { currency: Currency; tier: number }[] = []
    for (const currency of currencies) {
        const code = currency.code.toLowerCase()
        const name = currency.name.toLowerCase()
        const tier = code.startsWith(needle)
            ? 0
            : name.startsWith(needle)
              ? 1
              : code.includes(needle)
                ? 2
                : name.includes(needle)
                  ? 3
                  : -1
        if (tier !== -1) ranked.push({ currency, tier })
    }

    return ranked.sort((a, b) => a.tier - b.tier).map(entry => entry.currency)
}
