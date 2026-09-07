import { FALLBACK_LNG, type Locale } from '@shared/i18n/settings'
import type { StripeElementLocale } from '@stripe/stripe-js'

/**
 * The app's locale as Stripe spells it.
 *
 * Stripe Elements renders its own copy — card labels, validation messages, wallet buttons — inside an
 * iframe this app cannot translate. So the locale has to be handed over, and it has to be handed over
 * as one of *Stripe's* codes: `zh` for Simplified Chinese, `zh-TW` for Traditional.
 *
 * ## Never `'auto'`
 *
 * Stripe's `auto` reads the **browser's** language. This app's locale is a deliberate choice (a
 * cookie, a switcher, or a `?lang=` on a webview URL) and it routinely disagrees with the browser —
 * a Vietnamese reader on an English-configured phone would get an English card form inside a
 * Vietnamese screen. Passing the resolved locale explicitly is what keeps one page in one language.
 *
 * All nine `SUPPORTED_LOCALES` happen to be supported by Stripe today, so the map is total; it is
 * still written as a map with a fallback because a tenth locale must not silently become English
 * without anyone noticing that this file is where to add it.
 */

/**
 * Stripe's own locale codes, for the nine this app ships.
 *
 * Typed as `StripeElementLocale`, which is Stripe's own union — so a typo (`zh-tw` for `zh-TW`) is a
 * compile error here rather than a card form that silently falls back to English.
 */
const STRIPE_LOCALES: Record<Locale, StripeElementLocale> = {
    en: 'en',
    vi: 'vi',
    id: 'id',
    ms: 'ms',
    fil: 'fil',
    'zh-TW': 'zh-TW',
    'zh-CN': 'zh',
    ko: 'ko',
    ar: 'ar',
}

/** The Elements `locale` option. Falls back to English, never to `auto`. */
export function stripeLocale(locale: string | null | undefined): StripeElementLocale {
    if (!locale) return FALLBACK_LNG
    return STRIPE_LOCALES[locale as Locale] ?? FALLBACK_LNG
}
