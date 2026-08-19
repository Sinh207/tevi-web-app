/**
 * Campaign copy arrives from the API in English, and the app has to show it in nine languages.
 *
 * There is no translation on the wire — a campaign carries one `name` and one `description` — so
 * legacy solves it backwards: it walks the loaded English bundle looking for a key whose **value**
 * equals the string the server sent, and if it finds one, renders `t(thatKey)` instead. Campaigns
 * that marketing has pre-translated therefore localise; anything else falls through as English.
 *
 * That trick is `useHelper().handleKey`, and it is worth keeping — the alternative is a Vietnamese
 * reader seeing English promo cards for campaigns we *have* translated. What it is not worth is
 * keeping untested and inline: it is a linear scan over 611 entries, run four times per render
 * across two cards, with a normalisation step that has a bug in it (below).
 *
 * ## Two fixes over legacy
 *
 * - **The index is built once per bundle**, not walked per lookup. `WeakMap`, so a locale switch
 *   that swaps the bundle drops the old index with it.
 * - **All dots are stripped, not the first.** Legacy writes `text?.replace('.', '')`, and
 *   `String.replace` with a string pattern replaces one occurrence — so `"Spin daily. Win big."`
 *   normalises to `"Spin daily Win big."` on one side of the comparison and the key's value keeps
 *   its own stray dot on the other. Any copy with two sentences silently fails to match.
 *
 * The comparison is deliberately loose (case-folded, whitespace-collapsed, dots dropped) because it
 * is matching prose typed into two different systems. A miss costs English, not a crash.
 */

/** English source strings, as `i18next.getResourceBundle('en', 'translation')` returns them. */
export type EnglishBundle = Record<string, unknown>

/** value → key, for one bundle. */
const indexes = new WeakMap<EnglishBundle, Map<string, string>>()

function normalize(text: string): string {
    return text.replaceAll('.', '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function indexOf(bundle: EnglishBundle): Map<string, string> {
    const cached = indexes.get(bundle)
    if (cached) return cached

    const index = new Map<string, string>()
    for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') continue
        const normalized = normalize(value)
        if (!normalized) continue
        // First key wins, so a duplicated English string resolves to the same key every time
        // rather than to whichever one `Object.entries` happened to yield last.
        if (!index.has(normalized)) index.set(normalized, key)
    }
    indexes.set(bundle, index)
    return index
}

/**
 * The translation key whose English value is `text`, or `null`.
 *
 * Exported for the test and for a caller that wants to know *whether* a string is translatable
 * before deciding what to do about it.
 */
export function campaignTextKey(
    bundle: EnglishBundle,
    text: string | null | undefined,
): string | null {
    if (!text) return null
    const normalized = normalize(text)
    if (!normalized) return null
    return indexOf(bundle).get(normalized) ?? null
}

/**
 * `text`, translated if we happen to have a key for it, otherwise verbatim.
 *
 * `translate` is `t` from `useTranslation()`. Passed in rather than imported so this stays a pure
 * function that a node-environment test can exercise without an i18next instance.
 */
export function resolveCampaignText(
    bundle: EnglishBundle,
    text: string | null | undefined,
    translate: (key: string) => string,
): string {
    if (!text) return ''
    const key = campaignTextKey(bundle, text)
    return key ? translate(key) : text
}
