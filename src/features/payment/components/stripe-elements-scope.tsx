'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Elements } from '@stripe/react-stripe-js'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStripeConfig } from '../hooks/use-stripe-config'
import { stripeAppearance } from '../lib/stripe-appearance'
import { getStripe } from '../lib/stripe-loader'
import { stripeLocale } from '../lib/stripe-locale'

/**
 * `<Elements>`, wired to this app: the fetched publishable key, the DS appearance, the reader's
 * locale — and remounted only when it has to be.
 *
 * Every screen that shows a card field goes through this. It exists so that four decisions are made
 * once rather than per screen:
 *
 * - **The key comes from the backend** (`useStripeConfig`), so there is nothing to configure at a
 *   call site and no `NEXT_PUBLIC_STRIPE_*` to get wrong per environment.
 * - **The Stripe instance is memoised** by `getStripe`. Legacy calls `loadStripe` inside render,
 *   which remounts the card iframes on every parent render and loses what was typed.
 * - **`key={clientSecret}`.** Elements cannot be handed a different secret; that genuinely needs a
 *   fresh instance. Everything else — a theme flip, a language change — is an option update, so a
 *   half-filled form survives both.
 * - **Nothing renders without a secret.** `fallback` is what the screen shows meanwhile, and the
 *   caller decides whether that is a skeleton or an error, because only the caller knows which of
 *   the two it is waiting on.
 * - **A script that never loads is reported.** `getStripe` resolves **`null`** when `js.stripe.com`
 *   is blocked — an ad-blocker, an enterprise proxy, a CSP mistake — and that is Stripe's contract,
 *   not an exception. Testing the *promise* for truthiness (which is what this did) can never see it:
 *   `<Elements>` mounted with a permanently null context, so the card fields never appeared and the
 *   Save button sat there enabled and inert with nothing on screen explaining why. `onUnavailable`
 *   is how the caller turns that into its own error state.
 */
export function StripeElementsScope({
    clientSecret,
    children,
    fallback = null,
    onUnavailable,
}: {
    /** A PaymentIntent or SetupIntent secret. Its prefix is what puts Elements in the right mode. */
    clientSecret: string | null
    children: React.ReactNode
    fallback?: React.ReactNode
    /** Called once when the Stripe script cannot be used at all. See the note above. */
    onUnavailable?: () => void
}) {
    const { publishableKey } = useStripeConfig()
    const { resolvedTheme } = useTheme()
    const { currentLanguage } = useTranslation()

    /*
     * A ref, so a caller passing an inline arrow does not re-run the resolve effect on every render —
     * which for a *failed* load would mean calling `onUnavailable` again and again.
     */
    const onUnavailableRef = useRef(onUnavailable)
    onUnavailableRef.current = onUnavailable

    const stripe = useMemo(
        () => (publishableKey ? getStripe(publishableKey) : null),
        [publishableKey],
    )

    const [blocked, setBlocked] = useState(false)

    /*
     * Resolve the promise purely to find out whether there is anything in it. `<Elements>` takes the
     * promise itself, so this does not gate the mount on a second round trip — it only turns a `null`
     * into a state the caller can render.
     */
    useEffect(() => {
        if (!stripe) return
        let live = true
        setBlocked(false)
        stripe
            .then(instance => {
                if (live && instance === null) {
                    setBlocked(true)
                    onUnavailableRef.current?.()
                }
            })
            .catch(() => {
                if (!live) return
                setBlocked(true)
                onUnavailableRef.current?.()
            })
        return () => {
            live = false
        }
    }, [stripe])

    /*
     * Read from the live document, so the values are whatever the cascade actually resolved — the
     * tokens invert between modes and a hard-coded palette here would be a second source of truth
     * for the design system.
     */
    const appearance = useMemo(
        () =>
            stripeAppearance({
                isDark: resolvedTheme === 'dark',
                root: typeof document === 'undefined' ? null : document.documentElement,
            }),
        [resolvedTheme],
    )

    if (!stripe || !clientSecret || blocked) return fallback

    return (
        <Elements
            key={clientSecret}
            stripe={stripe}
            options={{ clientSecret, appearance, locale: stripeLocale(currentLanguage) }}
        >
            {children}
        </Elements>
    )
}
