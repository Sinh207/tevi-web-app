import type { TranslationKey } from '@shared/i18n/settings'
/**
 * The payment-method vocabulary — the filter's values, and how a row prints one.
 *
 * ## One place that knows the wire spelling
 *
 * `payment_method` is an **open set**: `star`, `card` and `vip_pass` are what ship today, and the
 * cash/Stripe pass will add its own. So the screen filters on the three the design draws and the
 * row prints whatever arrives, which is why there are two functions here rather than one map: a
 * *filter* value has to be a value the backend accepts, and a *label* has to survive a value this
 * client has never seen.
 *
 * Same shape, and the same reason, as `features/permission/lib/capabilities.ts`: the spelling lives
 * once, and everything above it works in product terms.
 */

/**
 * The filter's values, in the order the control draws them. `''` is "All" — the absence of the
 * parameter, not a magic string the backend has to know (see `membershipApi.getMyMemberships`).
 *
 * **`vip_pass` is deliberately absent.** Legacy has the tab and it is commented out
 * (`tabPaymentMethod/index.js`), so the design has never shipped it; a fourth segment that filters
 * to a payment method most accounts cannot have would be a dead control on a three-way switch.
 */
export const PAYMENT_METHOD_FILTERS = ['', 'star', 'card'] as const
export type PaymentMethodFilter = (typeof PAYMENT_METHOD_FILTERS)[number]

/** Label keys for the filter, index-matched to `PAYMENT_METHOD_FILTERS`. */
export const PAYMENT_METHOD_FILTER_LABELS: Record<PaymentMethodFilter, string> = {
    '': 'my_membership_filter_all',
    star: 'my_membership_filter_star',
    card: 'my_membership_filter_card',
}

/**
 * Guard for anything that reaches `setPaymentMethod` — a `<button>`'s own value today, a URL
 * parameter the moment this screen becomes linkable. Sanitising at the setter rather than at each
 * call site is what keeps an unknown value from becoming a request that returns nothing and an
 * empty state that blames the reader.
 */
export function isPaymentMethodFilter(value: string): value is PaymentMethodFilter {
    return (PAYMENT_METHOD_FILTERS as readonly string[]).includes(value)
}

/**
 * The three methods this client has copy for. Anything else falls through to `prettifyPaymentMethod`.
 *
 * `vip_pass` is here even though it is not a filter: an account **can** hold a VIP-pass membership
 * (legacy grants them), and the row has to say so. That asymmetry is the point of splitting the two
 * lists.
 */
const PAYMENT_METHOD_LABELS: Record<string, TranslationKey> = {
    star: 'my_membership_payment_star',
    card: 'my_membership_payment_card',
    vip_pass: 'my_membership_payment_vip_pass',
}

/** The translation key for a method, or `null` when this client has no copy for it. */
export function paymentMethodLabelKey(method: string | null | undefined): TranslationKey | null {
    if (!method) return null
    return PAYMENT_METHOD_LABELS[method.trim().toLowerCase()] ?? null
}

/**
 * `apple_pay` → `Apple Pay`. Legacy's own fallback, and the reason it is kept: a method that ships
 * after this client should print as itself rather than as a blank line or a raw `apple_pay`.
 *
 * **Untranslated by nature** — there is no key for a value nobody has seen yet. That is the same
 * narrow exception `signInErrorText` and `DirectDonate.button_text` both document: the alternative
 * is showing nothing, which is less true.
 */
export function prettifyPaymentMethod(method: string | null | undefined): string {
    if (!method) return ''
    return method
        .trim()
        .split('_')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
}
