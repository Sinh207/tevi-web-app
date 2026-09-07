'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback } from 'react'
import { apiCopyIndex, apiCopyKey, isTranslatableCopy } from '../lib/benefit-copy'

/**
 * Strings already reported, so one unmatched benefit is one line and not one per render. Module
 * scope: the point is a warning per *string*, not per mount, and the set is dropped with the page.
 */
const warned = new Set<string>()

/**
 * Translate a string the **server** wrote — a benefit's name, description or comparison value.
 *
 * The mechanism, its two divergences from legacy's `handleKey` and the way it fails are all in
 * `lib/benefit-copy.ts`. What this hook adds is the two pieces of wiring:
 *
 * - **the English bundle**, read off the live i18next instance. English is the one locale
 *   `i18n/client.ts` always carries (it is `FALLBACK_LNG`), so it is there whatever the reader's
 *   language — which is what makes the reverse lookup possible on a page served in Korean.
 * - **the fallback**, which is the server's own string. A benefit the bundle has never seen reads in
 *   English rather than disappearing; a `null` or blank reads as nothing at all.
 *
 * `getResourceBundle` is called per render rather than memoised: it is a property read on the
 * instance's store, and the index behind it is built once per bundle object (a `WeakMap`), so the
 * work is a `Map.get` on every call after the first.
 *
 * ## A miss warns in development, because the failure is otherwise invisible
 *
 * The fallback is the server's English, which is the right behaviour and *reads correctly* — so a
 * sentence the backoffice edited after Crowdin drops eight locales silently, and is found in a
 * screenshot months later. It has happened three times on this screen already
 * (`benefit-copy.test.ts` names them). So a miss logs once per string in development: it costs
 * nothing in production, and the fix is one Crowdin string whose English equals what the API sends —
 * no code change, because the index is keyed by value.
 *
 * A miss on a string with **no letters in it** is not reported, because that advice would be wrong
 * for it: `isTranslatableCopy` in `lib/benefit-copy.ts` carries the reasoning.
 */
export function useBenefitCopy(): (text: string | null | undefined) => string {
    const { t, i18n } = useTranslation()

    return useCallback(
        (text: string | null | undefined) => {
            if (!text) return ''
            const bundle = i18n.getResourceBundle('en', 'translation') as
                | Record<string, unknown>
                | undefined
            if (!bundle) return text
            const key = apiCopyKey(apiCopyIndex(bundle), text)
            /*
             * `isTranslatableCopy` is the gate and not just a nicety: a comparison value is often a
             * bare figure (`"+5"` is the one that flushed this out), and for those the sentence
             * below asks for the one thing nobody should do — a Crowdin string keyed by the value
             * `+5`, which reads `+5` in every locale and then claims every other `+5`. See the
             * predicate for where the line is drawn and what it deliberately still warns about.
             */
            if (
                !key &&
                isTranslatableCopy(text) &&
                process.env.NODE_ENV !== 'production' &&
                !warned.has(text)
            ) {
                warned.add(text)
                console.warn(
                    `[premium] no translation key matches this server copy, so it will read in English for every locale: ${JSON.stringify(text)}. Add a Crowdin string whose English value is exactly this — the lookup is keyed by value, so no code change is needed.`,
                )
            }
            /*
             * `t(key)` with a variable key is invisible to `keys.test.ts`, which only sees literals
             * — and it is invisible on purpose: the key was *found* in the bundle a line ago, so it
             * exists by construction. The strings themselves are pinned by `benefit-copy.test.ts`.
             */
            return key ? t(key) : text
        },
        [t, i18n],
    )
}
