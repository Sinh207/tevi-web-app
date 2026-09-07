'use client'

import { membershipApi } from '@features/membership/dev'
import { checkoutApi, paymentMethodsApi } from '@features/payment'
import { NATIVE_ACTIONS } from '@shared/lib/native-bridge'

/**
 * A **stand-in for the native host**, backed by the real backend.
 *
 * `/app/[channelSlug]/membership/[packageId]` only works where a host is listening: the intent, the
 * saved cards and the settle are all asked of the app over the JS bridge, and a desktop browser has no
 * app. So the screen's honest answer there is `unsupported`, which is correct and completely
 * untestable.
 *
 * This installs a `TeviJSInterface` that answers those messages by making **the same requests the
 * native app would**, as the account this browser is signed in as. Real tier, real cards, a real
 * PaymentIntent from billy, a real settle from paymee, real Stripe Elements. What it is *not* is a
 * test of the app's own envelope — see the caveat at the bottom.
 *
 * Dev-only by construction: it lives under `/dev/*`, which `proxy.ts` 404s in production.
 *
 * ## Why the Android shape
 *
 * `TeviJSInterface.jsCall(action, optionsJson)` is one function to implement, where the iOS side is a
 * `webkit.messageHandlers` tree. The bridge tries iOS first and falls through, so a stub of either is
 * enough — and the reply path (`TeviJS.onJSCall`) is shared, which is the half worth exercising.
 *
 * ## ⚠ What this cannot tell you
 *
 * The **envelope**. A real host's reply may differ in the ways `docs/BACKEND_QUESTIONS.md` **B85**
 * asks about — whether `data` arrives as a JSON string, whether `priceInfo.amount` may be a number,
 * what a refusal's `code` looks like. This stub answers in the shape *this client expects*, so it
 * proves the screen and the flow, never the contract. The bridge's own unit tests cover both
 * envelopes; only a device covers the real one.
 */

type Reply = { success: boolean; code?: string | null; message?: string | null; data?: unknown }

/** Hand a reply back the way the host does: into the global this app installs. */
function answer(action: string, reply: Reply) {
    const host = window as unknown as { TeviJS?: { onJSCall?: (payload: unknown) => void } }
    host.TeviJS?.onJSCall?.({ action, data: reply })
}

/** The host's own failure shape, for anything that throws on our side. */
function failure(error: unknown): Reply {
    const message =
        error && typeof error === 'object' && 'message' in error
            ? String((error as { message: unknown }).message)
            : 'stub failed'
    return { success: false, code: null, message, data: null }
}

async function handle(action: string, options: Record<string, unknown>): Promise<Reply> {
    switch (action) {
        /*
         * The host mints the intent by calling `subscribe/` with the USD price id — the same POST the
         * website's join flow makes, and the reason `membershipApi` is exposed through `dev.ts` rather
         * than the barrel.
         */
        case NATIVE_ACTIONS.membershipCheckout: {
            const priceInfo = options.priceInfo as { id?: string } | undefined
            const result = await membershipApi.subscribe({
                slug: String(options.slug ?? ''),
                packageId: String(options.packageId ?? ''),
                priceId: String(priceInfo?.id ?? ''),
            })
            /*
             * `subscribe` has already parsed the envelope, and the screen is going to parse it again —
             * so it is put back into the wire shape rather than short-circuited. That keeps
             * `parseCheckoutAction` **and** `parseChargedAmount` on the path being tested, including
             * the `payment.amount` the order card now prints.
             */
            if (!result) return { success: false, message: 'Star path — no card to take' }
            const payment = result.charge
                ? { amount: String(result.charge.amount), amount_currency: result.charge.currency }
                : undefined
            return {
                success: true,
                data:
                    result.action.kind === 'card'
                        ? {
                              action: 'STRIPE',
                              action_data: { clientSecret: result.action.clientSecret },
                              ...(payment ? { payment } : {}),
                          }
                        : { action: 'UNSUPPORTED', action_data: {} },
            }
        }

        case NATIVE_ACTIONS.myPaymentMethods:
            return { success: true, data: await paymentMethodsApi.list() }

        /*
         * `checkoutApi.settle` returns a `SettleOutcome`, i.e. the HTTP mapping already applied. It is
         * turned back into the bridge's envelope so the screen's own `settleOutcomeFromReply` runs —
         * including the `PM0003` branch, which is the one worth watching.
         */
        case NATIVE_ACTIONS.stripeCallback: {
            const outcome = await checkoutApi.settle({ clientSecret: String(options.clientSecret) })
            if (outcome.status === 'settled') {
                return { success: true, data: { type: outcome.purchaseType } }
            }
            if (outcome.status === 'pending') return { success: false, code: 'PM0003' }
            return { success: false, code: outcome.code ?? null, message: outcome.text ?? null }
        }

        default:
            return { success: false, message: `stub has no handler for ${action}` }
    }
}

/**
 * Install the stub, and report what the last exchange was so the harness can show it.
 *
 * `slug` is threaded in because the real host knows which space it opened the webview for and the
 * bridge message does not carry it — legacy's own `membershipCheckout` sends only `packageId` and
 * `priceInfo`, which means the app is holding the slug itself. **B85** should probably ask about that
 * too; here the harness supplies it.
 */
export function installBridgeStub({
    slug,
    onExchange,
}: {
    slug: string
    onExchange: (line: string) => void
}) {
    const host = window as unknown as { TeviJSInterface?: unknown }

    host.TeviJSInterface = {
        jsCall(action: string, optionsJson: string) {
            let options: Record<string, unknown> = {}
            try {
                options = JSON.parse(optionsJson) as Record<string, unknown>
            } catch {
                // Leave it empty; the handler will refuse and the log will show it.
            }
            onExchange(`→ ${action} ${optionsJson}`)

            /*
             * `membershipResult` ends the flow by dismissing the webview, which a browser cannot do.
             * Logged rather than answered — seeing the line is the whole point of testing it here.
             */
            if (action === NATIVE_ACTIONS.membershipResult) {
                onExchange(`✓ app would close the webview: ${optionsJson}`)
                return
            }

            void handle(action, { ...options, slug })
                .catch(failure)
                .then(reply => {
                    onExchange(`← ${action} ${JSON.stringify(reply)}`)
                    answer(action, reply)
                })
        },
    }
}

/** Take the stub away again, so a reload behaves like a browser with no app. */
export function removeBridgeStub() {
    ;(window as unknown as { TeviJSInterface?: unknown }).TeviJSInterface = undefined
}
