// @vitest-environment jsdom
import { STORAGE_KEYS, storage } from '@shared/lib/storage'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocaleProvider } from './locale-provider'
import { bundles } from './resources'
import { useTranslation } from './use-translation'

/**
 * The two halves of "one locale reaches the browser".
 *
 * The client bundles English alone. The locale the page was served in arrives as a **prop** from
 * the server, and any *third* locale arrives as a **code-split chunk** when someone switches. Both
 * halves are invisible from a screen: get either wrong and the app renders raw keys, or renders
 * fine while quietly downloading nine locales again. Neither is something a comment can hold.
 *
 * A hook test rather than a component one, in the shape `use-update-privacy.test.tsx` established:
 * one `Probe` that assigns the hook's return value out, so the assertions are about `t` and
 * `changeLanguage` rather than about anyone's markup.
 */

/**
 * A key Vietnamese and Korean translate **differently**, so a switch is visible in the output.
 *
 * Derived rather than written down: which keys a partial locale covers changes every time a
 * translation lands, and a hardcoded one silently stops testing the switch the moment it is either
 * dropped or left untranslated — the first version of this file picked `auth_sign_in`, which Korean
 * does not translate, so the assertion was reading the English fallback and would have passed
 * against a switch that did nothing.
 */
const KEY = Object.keys(bundles.ko).find(
    key => key in bundles.vi && bundles.ko[key] !== bundles.vi[key],
) as string

function renderProbe(locale: string, bundle = bundles[locale] ?? null) {
    let api: ReturnType<typeof useTranslation> | null = null
    function Probe() {
        api = useTranslation()
        return null
    }
    render(
        <LocaleProvider locale={locale} bundle={bundle}>
            <Probe />
        </LocaleProvider>,
    )
    return () => api as ReturnType<typeof useTranslation>
}

beforeEach(() => {
    storage.remove(STORAGE_KEYS.locale)
})

describe('the locale the page was served in', () => {
    /**
     * The whole point of passing it as a prop: `initI18nClient` stays synchronous, so the first
     * client render is already translated and matches the server's HTML. An `await` here — a
     * dynamic import for the *initial* locale — would mean a flash of raw keys and a hydration
     * mismatch on every non-English page load.
     */
    it('translates on the first render, with no await', () => {
        expect(KEY).toBeDefined()
        const read = renderProbe('vi')
        expect(read().t(KEY)).toBe(bundles.vi[KEY])
        expect(read().t(KEY)).not.toBe(bundles.en[KEY])
    })

    /**
     * Every locale is fully translated today, so the gap is simulated rather than borrowed from a
     * real bundle: a key the served bundle omits has to reach English, which is the only locale the
     * client ships. Deriving it from `bundles.ko` is what the first version did — that assertion
     * turned into a no-op the moment Korean was completed, which is exactly the silent pass this
     * file exists to prevent.
     */
    it('falls back to English for a key the served bundle omits', () => {
        // `ms` and not `ko`: rendering a partial bundle registers it on the shared i18next
        // instance, so the locale used here must be one no other test in this file switches to.
        expect(bundles.ms[KEY]).not.toBe(bundles.en[KEY])
        const { [KEY]: _omitted, ...partial } = bundles.ms
        const read = renderProbe('ms', partial)
        expect(read().t(KEY)).toBe(bundles.en[KEY])
    })
})

describe('switching to a locale the client was not shipped', () => {
    it('loads its chunk, then applies it', async () => {
        const read = renderProbe('vi')
        expect(read().t(KEY)).toBe(bundles.vi[KEY])

        await read().changeLanguage('ko')

        await waitFor(() => expect(read().currentLanguage).toBe('ko'))
        expect(read().t(KEY)).toBe(bundles.ko[KEY])
    })

    /**
     * Written **after** the switch lands, not before: persisting a language the app is not showing
     * would survive the reload and be wrong on the next visit too.
     */
    it('persists the choice once it has taken effect', async () => {
        const read = renderProbe('vi')
        await read().changeLanguage('ko')
        expect(storage.get(STORAGE_KEYS.locale)).toBe('ko')
        expect(document.documentElement.lang).toBe('ko')
        expect(document.documentElement.dir).toBe('ltr')
    })

    /** `ar` is supported for RTL but not offered in the switcher; a switch to it still flips dir. */
    it('flips direction for an RTL locale', async () => {
        const read = renderProbe('vi')
        await read().changeLanguage('ar')
        expect(document.documentElement.dir).toBe('rtl')
    })

    /** An unsupported code is clamped to English rather than left half-applied. */
    it('clamps an unknown code to English', async () => {
        const read = renderProbe('vi')
        await read().changeLanguage('de')
        await waitFor(() => expect(read().currentLanguage).toBe('en'))
        expect(read().t(KEY)).toBe(bundles.en[KEY])
    })
})
