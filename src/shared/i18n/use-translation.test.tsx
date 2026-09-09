// @vitest-environment jsdom
import { STORAGE_KEYS, storage } from '@shared/lib/storage'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
/**
 * The server's half of the switch.
 *
 * `LocaleProvider` re-requests the route's RSC payload whenever the language moves away from the
 * one the server rendered, because `getServerT()` resolved every server-rendered string from the
 * `tevi.locale` cookie during a request that is already over. Mocked here rather than provided, so
 * the call itself is the assertion — without it a screen whose text is entirely server-rendered
 * ignores the picker.
 */
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

/**
 * A one-shot switch that makes the *next* chunk fetch fail, with the real loader behind it — the
 * other tests in this file need the genuine dynamic import, so the module is wrapped rather than
 * replaced.
 */
const failNextLoad = vi.hoisted(() => ({ value: false }))
vi.mock('./locale-bundles', async importOriginal => {
    const actual = await importOriginal<typeof import('./locale-bundles')>()
    return {
        ...actual,
        loadLocaleBundle: async (lng: string) => {
            if (failNextLoad.value) {
                failNextLoad.value = false
                return null
            }
            return actual.loadLocaleBundle(lng)
        },
    }
})

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
    refresh.mockClear()
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

    /**
     * The half `i18n.changeLanguage` cannot reach: 80 files render their strings with
     * `getServerT()`, from the cookie, on the server.
     *
     * The cookie assertion is the ordering one, and it is the whole reason `changeLanguage` writes
     * it before the switch: the refresh is triggered *by* `languageChanged`, so a cookie written
     * afterwards would have the server re-render in the language being left behind — a bug that
     * looks exactly like no fix at all.
     */
    it('re-requests the server-rendered half, with the new cookie already written', async () => {
        const read = renderProbe('vi')
        await read().changeLanguage('ko')
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(document.cookie).toContain('tevi.locale=ko')
    })

    /** Switching back to the locale the server rendered needs no second round trip. */
    it('does not refresh when the client agrees with the server again', async () => {
        const read = renderProbe('vi')
        await read().changeLanguage('ko')
        refresh.mockClear()
        await read().changeLanguage('vi')
        expect(refresh).not.toHaveBeenCalled()
    })

    /**
     * A chunk that never arrives leaves the language alone, so there is nothing for the server to
     * re-render either — and a refresh there would replace the screen with one in the *old*
     * language while the reader is still looking at their own choice failing.
     */
    it('does not refresh when the bundle could not be loaded', async () => {
        const read = renderProbe('vi')
        failNextLoad.value = true
        // `id`, and not one of the locales the tests above switch to: a bundle already registered
        // on the shared i18next instance is never fetched, so the failure would not be reached.
        await read().changeLanguage('id')
        expect(refresh).not.toHaveBeenCalled()
        expect(read().currentLanguage).toBe('vi')
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
