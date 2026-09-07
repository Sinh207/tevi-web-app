'use client'

import { useAuth } from '@features/auth'
import { checkoutApi, checkoutReturnUrl } from '@features/payment'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import { toast } from 'sonner'
import { PREMIUM_PATH } from '../routes'

export interface UseBillingPortalResult {
    /** Take the reader to Stripe's billing portal, in a new tab. */
    open: () => void
    /** The link is being minted. The button must say so and refuse a second press. */
    isPending: boolean
}

/**
 * "Manage in Stripe" — where a card subscription is cancelled and its invoices read.
 *
 * ## A new tab, opened **before** the URL is known
 *
 * Legacy does `window.open(redirect_url, '_blank')`, and a new tab is right: the portal is somebody
 * else's site, and a reader who came to cancel should not lose the page they were reading to get
 * there — Stripe's own "return to Tevi" link is a round trip they did not ask for.
 *
 * The obstacle is that the URL is only known **after** an await, by which time the user gesture is
 * spent and every current browser blocks the popup. So the tab is opened *inside* the press, blank,
 * while a popup is still allowed, and its location is set once the link arrives. Three things follow
 * from that and each one is a real state:
 *
 * - **the request fails, or the account has no portal** → the blank tab is *closed*, not left on
 *   `about:blank`, and the toast explains. An orphaned blank tab is the reason this pattern is
 *   usually done badly.
 * - **the popup was blocked outright** (an extension, a hard setting) → `window.open` answers
 *   `null`, and the navigation falls back to **this** tab rather than doing nothing. A button that
 *   silently fails is worse than one that navigates.
 * - **a second press while the first is in flight** is dropped, so there is never more than one
 *   blank tab waiting for one link.
 *
 * This screen shipped as a same-tab `location.assign` on the reasoning that a popup after an await
 * is always blocked. That is true of `window.open(url)` *after* the await and not of a tab opened
 * during the gesture — the pattern was the answer, not the trade.
 *
 * ## A call made on a press, not on a mount
 *
 * Legacy fetches this link in `initData`, for **every** visitor to `/premium` including everyone who
 * has never bought anything — and then renders the button only if the response happened to carry a
 * URL. So the common case is a request whose answer is thrown away. Here the request goes out when
 * the button is pressed, and the button is only drawn for an account that has Premium at all.
 *
 * That is also why this is a **mutation** and not a query: the answer is a short-lived, single-use
 * URL carrying a **session secret** in its query string (`?secret=…`, seen in the real response).
 * Caching it under a query key would keep it for the rest of the session and hand it back to a
 * second press after Stripe had expired it — and it is not data the screen renders, it is an
 * action's result.
 *
 * `success_url` is built by `checkoutReturnUrl`, so it is this app's configured origin plus a path
 * this app produced — never `window.location`. It is handed to a third party and comes back as a
 * navigation; that helper's doc is where the open-redirect reasoning lives.
 *
 * ## `null` is an answer, not a failure
 *
 * `getBillingPortal` resolves `null` when the service answered without a URL — an account with no
 * Stripe customer behind it, most likely, because the subscription was bought through an app store
 * or granted by a code. The reader is told rather than sent to `about:blank`, and **the API's own
 * sentence wins** on a real 4xx (`mutationMeta.showErrorToast`, per `docs/API_ERRORS.md`): only the
 * backend knows why *this* account has no portal.
 */
export function useBillingPortal(): UseBillingPortalResult {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    /**
     * The tab opened by the press this request belongs to.
     *
     * A ref rather than a mutation variable because it is not part of the *request* — it is the
     * window the answer is delivered into, and only one press can be in flight (see `open`).
     */
    const tab = useRef<Window | null>(null)

    const release = (navigate?: string) => {
        const pending = tab.current
        tab.current = null
        if (!pending) {
            // The popup was blocked outright. Better this tab than nothing at all.
            if (navigate) window.location.assign(navigate)
            return
        }
        if (navigate) pending.location.href = navigate
        else pending.close()
    }

    const mutation = useMutation({
        /*
         * `activeId` is captured here, at the press, and travels with the request — not read again
         * when it resolves. A portal link is a session into one account's billing, and the account
         * switcher is two taps away: the same rule every write in this app follows.
         */
        mutationFn: () =>
            checkoutApi.getBillingPortal({
                successUrl: checkoutReturnUrl(PREMIUM_PATH),
                accountId: activeId,
            }),
        onSuccess: url => {
            if (!url) {
                release()
                toast.error(t('premium_portal_unavailable'))
                return
            }
            release(url)
        },
        onError: () => {
            // The toast is `query-client.ts`'s, from the meta below; this only tidies the tab.
            release()
        },
        meta: { showErrorToast: t('premium_portal_unavailable') },
    })

    return {
        open: () => {
            if (mutation.isPending) return
            /*
             * Opened **synchronously**, inside the gesture, which is the whole point — and
             * `opener` is dropped while the tab is still `about:blank` and therefore same-origin,
             * so the portal cannot navigate this page. `window.open(url, '_blank', 'noopener')`
             * would do that by itself but answers `null` by specification, leaving no handle to
             * deliver the link into.
             */
            const opened = window.open('', '_blank')
            if (opened) {
                try {
                    opened.opener = null
                } catch {
                    // A browser that refuses is no worse off than legacy, which never tried.
                }
            }
            tab.current = opened
            mutation.mutate()
        },
        isPending: mutation.isPending,
    }
}
