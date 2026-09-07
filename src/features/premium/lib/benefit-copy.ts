/**
 * Localising copy the **server** wrote — the one place in this app where a translation key is
 * discovered rather than typed.
 *
 * ## The problem, and why it is not solvable the ordinary way
 *
 * A benefit's `name` and `description` come from `premium/v1/benefits/`, in English, written in the
 * backoffice. The app ships in nine languages. There is no `name_vi` on the wire and no locale
 * parameter on the endpoint, so the only material a client has to work with is the English
 * sentence itself.
 *
 * Legacy's answer (`hooks/useHelper.js` → `handleKey`) is to run the bundle **backwards**: find the
 * translation key whose English value equals the server's string, then translate that key. It
 * works because the same copy exists twice — once in the payload and once in Crowdin — and it is
 * the reason this repo carries a `premium_copy_*` block whose English values are *exactly* the
 * strings the API returns. Those keys are never typed at a call site; they exist to be found by
 * their own value.
 *
 * This is a port, not an improvement. Two things about it are worth stating plainly:
 *
 * - **It fails soft, and that is the whole design.** An unmatched string is shown as it arrived, in
 *   English. A benefit launched this morning reads in English until its copy is added here — which
 *   is strictly better than an empty row, and is what legacy does.
 * - **It fails silently, and that is the trap.** Edit a `premium_copy_*` English value and the
 *   benefit it was matching stops being localised in eight languages, with nothing to show for it:
 *   the screen still reads correctly in English. `benefit-copy.test.ts` pins the shape of the
 *   matching; the English values themselves are pinned by being *the API's own strings*, which is
 *   why they must be copied verbatim and never "tidied".
 *
 * ## Two deliberate divergences from `handleKey`
 *
 * 1. **An index, not a scan.** Legacy runs `Object.keys(bundle).find(…)` per string per render —
 *    1,600 comparisons for one benefit name, ×2 fields ×N rows, on every render of the list. This
 *    builds the reverse map once per bundle and looks up. Same answer, and the answer is
 *    deterministic in the same way: **first key wins**, in bundle order, so a duplicated English
 *    value resolves to the earliest key exactly as `find` would.
 * 2. **A wider normalisation.** Legacy compares after deleting the *first* period from each side
 *    (`text.replace('.', '')`), which is enough for a trailing full stop and nothing else. Here
 *    both sides are trimmed, inner whitespace is collapsed, all periods are dropped and the
 *    comparison is case-insensitive — a strict superset, so nothing legacy matches stops matching.
 *    It is what lets `"experiences,  all for just"` (two spaces on the wire) and a capitalisation
 *    change in the backoffice keep resolving. The cost is that two strings differing *only* in
 *    punctuation or case would collide; both would be the same sentence.
 */

/** The comparison form of a string. See divergence 2 above. */
export function normalizeCopy(text: string): string {
    return text.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * `normalizeCopy(englishValue) → key`, built once per bundle.
 *
 * A `WeakMap` on the bundle object, so the index is rebuilt when — and only when — the bundle
 * identity changes (a fresh i18next instance in a test, a hot reload). The English bundle is a
 * module-level import in `i18n/client.ts` and never mutated, so in the browser this is built once
 * per page.
 */
const indexes = new WeakMap<object, Map<string, string>>()

export function apiCopyIndex(bundle: Record<string, unknown>): Map<string, string> {
    const cached = indexes.get(bundle)
    if (cached) return cached

    const index = new Map<string, string>()
    for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') continue
        const normalized = normalizeCopy(value)
        // First key wins — see divergence 1. `Map.set` would overwrite, so the guard is the rule.
        if (normalized !== '' && !index.has(normalized)) index.set(normalized, key)
    }
    indexes.set(bundle, index)
    return index
}

/**
 * The translation key for a string the server sent, or `null` when the bundle has no copy of it.
 *
 * `null` means "show it as it arrived". It is not an error and it is not rare: only the perks
 * legacy shipped copy for are in the bundle, and any figure the backoffice writes into a value
 * (`"5 minutes"`, `"2 GB"`) is deliberately absent — those keys carry a `[%s]` in Crowdin, so they
 * never match a rendered number and never should.
 */
export function apiCopyKey(index: Map<string, string>, text: string): string | null {
    return index.get(normalizeCopy(text)) ?? null
}

/**
 * Whether a miss on this string is worth telling a developer about.
 *
 * A comparison value is frequently not prose at all — `"+5"`, `"5"`, `"∞"`, `"—"`. There is nothing
 * in those to translate, and the warning's own advice is wrong for them: a Crowdin string whose
 * English value is `+5` reads `+5` in all nine locales, and — the index being keyed *by value* —
 * would then claim every other `+5` the backoffice ever writes. So a string carrying no letter in
 * any script is not an unlocalised sentence, it is a figure. `apiCopyKey`'s paragraph above already
 * says such values are absent on purpose; this is where that stops being a note and starts being
 * enforced.
 *
 * The line is **letters, not digits**, deliberately. `"0% bonus"` and `"10% bonus"` are real
 * `premium_copy_*` keys on the wire today (`benefit-copy.test.ts` pins both), so suppressing
 * everything that carries a figure would hide exactly the misses that matter. The cost of drawing it
 * here is that `"60 minutes"` — a figure the backoffice wrote into words, which by design can never
 * match — still warns. Nothing in the string tells it apart from `"10% bonus"`, and warning about a
 * string nobody needs to act on is the cheaper of the two mistakes.
 *
 * `\p{L}` and not `[a-z]`: the backoffice writes English today, but a value that arrived in
 * Japanese is still a sentence somebody failed to key.
 */
export function isTranslatableCopy(text: string): boolean {
    return /\p{L}/u.test(text)
}
