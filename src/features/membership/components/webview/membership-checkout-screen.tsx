'use client'

import {
    CheckoutStatusTile,
    checkoutStatusKind,
    PayWithCardPanel,
    StripeElementsScope,
} from '@features/payment'
import { useTranslation } from '@shared/i18n/use-translation'
import { nativeBridge } from '@shared/lib/native-bridge'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { useMembershipCheckout } from '../../hooks/webview/use-membership-checkout'
import { MY_MEMBERSHIP_ART } from '../../lib/illustrations'
import { OrderCard } from './order-card'

/**
 * `/app/[channelSlug]/membership/[packageId]` — the app's membership card checkout.
 *
 * Legacy: `../tevi-web-app/src/containers/app/membershipDetails`. Same screen, same URL, same place
 * in the native flow — the app has shown its tier picker, the reader chose to pay by card, and this
 * collects one and reports back.
 *
 * ── the shape, and why it is this shape ────────────────────────────────────────────────────────
 *
 * ```
 * ┌──────────────────────────────┐
 * │ [av] Creator ✓               │   the order card: who, what, how much, on what terms.
 * │      Gold                    │   Fixed — it is the thing being agreed to and must not
 * │ ──────────────────────────── │   scroll out from under the button that agrees to it.
 * │ Price                 $5.00  │
 * │ Transaction fee       $0.63  │
 * │ ──────────────────────────── │
 * │ Total                 $5.63  │
 * │ Charged every 30 days…       │
 * ├──────────────────────────────┤
 * │ ● VISA ···· 4242    Default  │   the card panel, filling what is left and scrolling
 * │ ○ Use a new payment method   │   inside itself
 * │   [ card fields ]            │
 * ├──────────────────────────────┤
 * │ [ Pay $5.63 ]                │   pinned. The panel's own footer, held there by giving it
 * │ 🔒 Handled by Stripe         │   a real height to be `flex-1` inside.
 * └──────────────────────────────┘
 * ```
 *
 * The first pass was one page-level scroll with the pay button at the bottom of it — so on a phone
 * with the card form open, the control that takes the money was below the fold and the total had
 * scrolled away above it. This is a **column with three regions**, which is what `PayWithCardPanel`
 * was built for (it is `min-h-0 flex-1` with its own overflow and a `border-t` footer; the dialog
 * gives it a `max-h`, and here the shell does).
 *
 * ── what is deliberately different from legacy ─────────────────────────────────────────────────
 *
 * **The bridge is the transport, and this screen has no account of its own.** The host owns the
 * session, so the intent, the saved cards and the settle are asked of it
 * (`shared/lib/native-bridge.ts`) — no `AuthProvider` over this route, no `useAuth` below it. What
 * changed is not *that* it uses the bridge but *how*: every call has a deadline, replies are parsed
 * by shape rather than by guessing the platform, and the settle runs on the app's one shared
 * schedule (`runSettlePoll`) instead of a `setInterval` that never stops.
 *
 * **It has a theme and a language.** Legacy paints `#501BC0`, `#f4f4f4`, `#1a1a1a` and `#2fc062` by
 * hand and hard-codes every string in English, on a screen the app opens with `?theme=dark&lang=vi`.
 *
 * **It is sized by the shell.** Legacy writes `width: ${window.innerWidth}px; height:
 * ${window.innerHeight}px` into its container — which is why its page is `ssr: false`, and which is
 * stale the moment the device rotates or the keyboard opens.
 *
 * **The outcome wears the design team's own artwork**, the same marks the website's status dialog
 * uses (`CheckoutStatusTile`), rather than a glyph standing in for them.
 *
 * **Six states, and only ever one.** Legacy's provider tests `errorMsg`, then loading, then three
 * independent result booleans — so a late error blanks a success and "processing" can sit behind
 * "failed". Here `step` is one value, and the machine's states outrank everything else in it.
 */
export function MembershipCheckoutScreen({ slug, packageId }: { slug: string; packageId: string }) {
    const { t } = useTranslation()
    const checkout = useMembershipCheckout({ slug, packageId })
    const { step, offer, state } = checkout

    if (step === 'paying' && offer && checkout.charge) {
        return (
            <Shell>
                <div className="flex-none p-4 pb-3">
                    <OrderCard
                        offer={offer}
                        charge={checkout.charge}
                        channel={checkout.channel}
                        slug={checkout.slug}
                    />
                </div>
                {/*
                 * `state.kind` is `card` or `confirming` — that is what `paying` means — so the secret
                 * is read off the state rather than threaded through the controller. The narrowing is
                 * the proof it exists.
                 */}
                <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
                    <StripeElementsScope
                        clientSecret={
                            state.kind === 'card' || state.kind === 'confirming'
                                ? state.clientSecret
                                : null
                        }
                        fallback={<PanelSkeleton />}
                    >
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-(--radius-xl) bg-(--background-surface) shadow-xs">
                            <PayWithCardPanel
                                cards={checkout.cards}
                                amountLabel={checkout.amountLabel}
                                isBusy={checkout.isBusy}
                                onPay={checkout.pay}
                            />
                        </div>
                    </StripeElementsScope>
                </div>
            </Shell>
        )
    }

    if (step === 'loading') {
        return (
            <Shell>
                <div className="flex flex-1 flex-col gap-3 p-4">
                    <Skeleton className="h-[232px] w-full rounded-(--radius-xl)" />
                    <Skeleton className="min-h-[200px] w-full flex-1 rounded-(--radius-xl)" />
                </div>
            </Shell>
        )
    }

    if (step === 'status') return <StatusScreen checkout={checkout} />

    /*
     * `unsupported` — no native host is listening, so nothing on this screen can work. Legacy renders
     * the whole checkout anyway: an empty container that never resolves, because its only
     * `setIsLoading(false)` lives inside a reply that is never coming.
     *
     * `unavailable` — the tier has no card price. `error` — the tier could not be read.
     */
    const unsupported = step === 'unsupported'
    return (
        <Outcome
            mark={<TheoMark />}
            title={t(
                unsupported
                    ? 'membership_checkout_unsupported_title'
                    : step === 'unavailable'
                      ? 'membership_checkout_unavailable_title'
                      : 'membership_checkout_error_title',
            )}
            body={t(
                unsupported
                    ? 'membership_checkout_unsupported_body'
                    : step === 'unavailable'
                      ? 'membership_checkout_unavailable_body'
                      : 'membership_checkout_error_body',
            )}
            actions={
                step === 'error' ? (
                    <Button
                        data-testid="membership-checkout-retry"
                        variant="accent"
                        size="large"
                        onClick={checkout.retry}
                    >
                        {t('common_retry')}
                    </Button>
                ) : null
            }
        />
    )
}

/**
 * The verdict, or the wait for one — **in place**, not in a dialog.
 *
 * `CheckoutStatusDialog` says all of this on the website and is deliberately not used: it is a modal
 * over the page somebody was paying from, and here there is no such page. A webview screen *is* the
 * checkout, so the outcome replaces it. What the two do share is the mark and the copy
 * (`CheckoutStatusTile`, `payment_status_*`), so one payment cannot be described two ways.
 *
 * What is this screen's own is the **way out**: every terminal state ends in a control that hands the
 * verdict to the native app, because a webview has no back button of its own and nothing else can
 * dismiss it.
 */
function StatusScreen({ checkout }: { checkout: ReturnType<typeof useMembershipCheckout> }) {
    const { t } = useTranslation()
    const { state } = checkout
    const kind = checkoutStatusKind(state)
    if (!kind) return null

    const mark = <CheckoutStatusTile kind={kind} />

    if (kind === 'settling' || kind === 'confirming') {
        return (
            <Outcome
                mark={mark}
                title={t('payment_status_settling_title')}
                body={t('payment_status_settling_body')}
            />
        )
    }

    if (kind === 'slow') {
        return (
            <Outcome
                mark={mark}
                title={t('payment_status_slow_title')}
                body={t('payment_status_slow_body')}
                /*
                 * `slow` gets a way out and `settling` does not. The money has left in both, but
                 * `settling` is seconds from an answer while `slow` has run the whole schedule and has
                 * none coming — leaving somebody on a spinner there is legacy's behaviour and legacy's
                 * bug (it polls forever). Reported as `failed`, which is what the app should re-check;
                 * `succeeded` is not an option, because nothing here knows that.
                 */
                actions={
                    <Button
                        data-testid="membership-checkout-dismiss"
                        variant="secondary"
                        size="large"
                        onClick={() => nativeBridge.membershipResult('failed')}
                    >
                        {t('common_close')}
                    </Button>
                }
            />
        )
    }

    if (kind === 'succeeded') {
        return (
            <Outcome
                mark={mark}
                title={t('payment_status_membership_title')}
                body={t('payment_status_membership_body')}
                actions={
                    <Button
                        data-testid="membership-checkout-done"
                        variant="accent"
                        size="large"
                        onClick={() => nativeBridge.membershipResult('succeeded')}
                    >
                        {t('payment_action_done')}
                    </Button>
                }
            />
        )
    }

    return (
        <Outcome
            mark={mark}
            title={t('payment_status_failed_title')}
            /* The backend's or Stripe's own sentence when there is one — the filtering already
               happened in the machine (4xx bodies and card errors only), so this only chooses. */
            body={state.kind === 'failed' ? (state.text ?? t(state.messageKey)) : ''}
            actions={
                <>
                    <Button
                        data-testid="membership-checkout-failure-retry"
                        variant="accent"
                        size="large"
                        onClick={checkout.retry}
                    >
                        {t('common_retry')}
                    </Button>
                    <Button
                        data-testid="membership-checkout-failure-dismiss"
                        variant="secondary"
                        size="large"
                        onClick={() => nativeBridge.membershipResult('failed')}
                    >
                        {t('common_close')}
                    </Button>
                </>
            }
        />
    )
}

/**
 * The page frame.
 *
 * `flex-1` inside the `/app/*` shell, never a viewport height — the shell already reserves the
 * safe-area insets and a second full-viewport box inside them overflows by exactly that much (the
 * trap `app/app/privacy/page.tsx` documents). `min-h-0` is what lets a child actually scroll rather
 * than push the column taller, and it is the whole reason the pay button can be pinned.
 *
 * `max-w-(--breakpoint-sm)` because the app frames this on tablets too. The `h1` is `sr-only`: the
 * native app draws its own header with this screen's name in it, so a visible title would be the same
 * words twice. Same call as `/app/privacy-settings`.
 */
function Shell({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    return (
        <main className="mx-auto flex min-h-0 w-full max-w-(--breakpoint-sm) flex-1 flex-col">
            <h1 className="sr-only">{t('payment_checkout_title')}</h1>
            {children}
        </main>
    )
}

/**
 * A centred mark, a title, a sentence — and the way out **pinned to the bottom**.
 *
 * The action is not centred under the copy: on a phone this screen is the whole surface, and a button
 * floating in the middle of it reads as part of the message rather than as the thing to press. Every
 * other full-screen state in this app puts its primary action on the bottom edge, and so does the app
 * around it.
 */
function Outcome({
    mark,
    title,
    body,
    actions,
}: {
    mark: ReactNode
    title: string
    body: string
    actions?: ReactNode
}) {
    return (
        <Shell>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                {mark}
                <div className="flex flex-col gap-1">
                    <p className="type-title-t2-semibold m-0 text-balance text-(--text-title)">
                        {title}
                    </p>
                    {body && (
                        <p className="type-body-default m-0 text-pretty text-(--text-subtitle)">
                            {body}
                        </p>
                    )}
                </div>
            </div>
            {actions && (
                <div className="flex flex-none flex-col gap-2 p-4 [&>button]:w-full">{actions}</div>
            )}
        </Shell>
    )
}

/**
 * The feature's own empty-state mark, for the two states that are **not** payment outcomes: no host,
 * and a tier that cannot be charged.
 *
 * Deliberately not one of `CheckoutStatusTile`'s marks — those mean a payment happened and went one
 * way or the other, and neither of these is a payment at all. A failure mark over "open this from the
 * Tevi app" would say money was involved.
 */
function TheoMark() {
    return (
        <Image
            src={MY_MEMBERSHIP_ART.empty.src}
            alt=""
            aria-hidden
            width={MY_MEMBERSHIP_ART.empty.width}
            height={MY_MEMBERSHIP_ART.empty.height}
            className="h-24 w-auto"
        />
    )
}

function PanelSkeleton() {
    return <Skeleton className="min-h-[200px] w-full flex-1 rounded-(--radius-xl)" />
}
