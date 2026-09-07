'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useBalanceDisplay } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { useCapability } from '@features/permission'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useMultiTransfer } from '../hooks/use-multi-transfer'
import { useSingleTransfer } from '../hooks/use-single-transfer'
import { STAR_TRANSFER_CONTAINER } from '../lib/container'
import { STAR_TRANSFER_ART } from '../lib/illustrations'
import { MultiTransferDialog } from './multi-transfer-dialog'
import { SingleTransferDialog } from './single-transfer-dialog'
import { StarTransferSkeleton } from './star-transfer-skeleton'
import { TransferBalanceCard } from './transfer-balance-card'
import { TransferHistoryPanel } from './transfer-history-panel'
import { TransferModeTiles } from './transfer-mode-tiles'
import { TransferReceiptScreen } from './transfer-receipt-screen'

/**
 * `/star-transfer` — **one URL, three screens**, as `web-app` has it.
 *
 * | screen | title | Back goes to |
 * |---|---|---|
 * | transfer | Star transfer | out of the route |
 * | history | Transfer history | transfer |
 * | receipt | Transfer details | transfer, resetting the flow |
 *
 * That is legacy's `STAR_TRANSFER_STATE` and legacy's `IconBtnBack`, which switches on the state and only
 * calls `router.back()` from the first one. The bar therefore lives **here**, not in `page.tsx`: its title
 * and its back behaviour are state, and state is the client's. Being a client component costs nothing at
 * the first paint — App Router renders these on the server too.
 *
 * ## The gate is the first thing on the screen, and it has four answers
 *
 * This is the feature `features/permission` was built ahead of, and the reason its `useCapability` has
 * four states rather than a boolean is *this screen in legacy*: `containers/starTransfer` asks
 * `Boolean(channelPermission?.transfer_star?.allowed)` and renders **Access Denied** for every other
 * answer — so an agency whose permission request hit a 502, or who was offline for a second, is told they
 * do not have access to a feature they pay for, with no retry, until they reload.
 *
 * `loading` shows the screen's own shape; `error` shows a retry; `denied` shows legacy's denial panel — or
 * a **sign-in prompt**, because a guest is `denied` by construction (no session, no grants) and "access
 * denied" is the wrong sentence for somebody who has not signed in yet.
 *
 * ## The surface is one card, not three
 *
 * Legacy stacks the balance block (radius 12 on top), then a **purple** box, and inside it the white panel
 * that holds Features and the history. The purple only shows where the two radii disagree — a thin arc
 * under the balance — and that seam is the screen's signature. Reproduced with `--primary-500`, which *is*
 * legacy's `#501BC0`.
 *
 * Below `md` the whole thing is **full-bleed and square**, which is legacy's `{xs: 0, md: 16}` — so the
 * seam is a `md:` effect too. See `STAR_TRANSFER_CONTAINER` for why the padding and the radii are one
 * decision.
 *
 * Below `md` the whole thing is **full-bleed and square**, which is legacy's `{xs: 0, md: 16}` — so the
 * seam is a `md:` effect too. See `STAR_TRANSFER_CONTAINER` for why the padding and the radii are one
 * decision.
 *
 * ## Both flows are mounted here, once
 *
 * `useSingleTransfer` and `useMultiTransfer` each own a dialog stack, so exactly one component may mount
 * them — the same constraint `features/donation` states about `useDonateFlow`. This is that component,
 * which is also what lets a history row's **Retransfer** open the single flow with an ID in it.
 */
/**
 * The column's own box: **flush below `md`, with air around the card from `md` up**.
 *
 * Legacy's surface is `minHeight: calc(var(--window-height) - 60px)` — the white starts under the bar and
 * runs to the bottom of the screen, so a short history does not leave a band of page background under it.
 * Flexbox says the same thing without a measured viewport variable: this column is `flex-1`, and every
 * surface inside it is too.
 *
 * The bottom padding is `md:` only, for the same reason the side padding is gone entirely
 * (`STAR_TRANSFER_CONTAINER`): on a phone the screen *is* the card, and a band of page background
 * under it is a seam legacy does not have. From `md` the card is a card again and wants the room.
 *
 * There is no top padding at either breakpoint — the bar above already carries 8px under its
 * controls, and that gap is the bar's to give on every sub-page (see `PageBackBar`).
 */
const CONTENT_INSET = 'flex flex-1 flex-col md:pb-6'

export function StarTransferView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const requireAuth = useRequireAuth()
    const { state, refresh } = useCapability('star-transfer')
    const { star } = useBalanceDisplay()
    const single = useSingleTransfer()
    const multi = useMultiTransfer()
    const [showHistory, setShowHistory] = useState(false)

    /*
     * Whichever flow has just written. Derived rather than held: each flow already has a `receipt` step,
     * and a fourth piece of state saying the same thing is a fourth thing to keep in step.
     */
    const receipt =
        single.step === 'receipt' ? single.receipt : multi.step === 'receipt' ? multi.receipt : null

    /*
     * Both, because either flow can have produced the receipt and closing the wrong one leaves the screen
     * on it. Not a `useCallback`: its dependencies are the flow objects, which are new every render, so
     * memoising it only bought an illusion of stability.
     */
    const closeReceipt = () => {
        single.close()
        multi.close()
    }

    const screen = receipt ? 'receipt' : showHistory ? 'history' : 'transfer'
    const title =
        screen === 'receipt'
            ? t('star_transfer_details_title')
            : screen === 'history'
              ? t('star_transfer_history_title')
              : t('star_transfer_title')

    const bar = (
        <div className="sticky top-0 z-20 bg-(--background)">
            <PageBackBar
                title={title}
                className={STAR_TRANSFER_CONTAINER}
                /*
                 * Legacy's switch: up one state while there is one, out of the route only from the
                 * transfer screen. `undefined` hands the decision back to the bar's own default.
                 */
                onBack={
                    screen === 'transfer'
                        ? undefined
                        : screen === 'history'
                          ? () => setShowHistory(false)
                          : closeReceipt
                }
            />
        </div>
    )

    if (state === 'loading') {
        return (
            <>
                {bar}
                <div className={cn(STAR_TRANSFER_CONTAINER, CONTENT_INSET)}>
                    <StarTransferSkeleton className={className} />
                </div>
            </>
        )
    }

    if (state === 'error' || state === 'denied') {
        return (
            <>
                {bar}
                <div className={cn(STAR_TRANSFER_CONTAINER, CONTENT_INSET, className)}>
                    {state === 'error' ? (
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="exclamation-diamond"
                            tone="error"
                            title={t('star_transfer_gate_error')}
                            action={
                                <Button
                                    data-testid="star-transfer-refresh"
                                    variant="secondary"
                                    size="large"
                                    onClick={() => void refresh()}
                                >
                                    {t('common_retry')}
                                </Button>
                            }
                        />
                    ) : isAuthenticated ? (
                        <AccessDenied />
                    ) : (
                        <SignInPrompt onSignIn={requireAuth} />
                    )}
                </div>
            </>
        )
    }

    return (
        <>
            {bar}
            <div className={cn(STAR_TRANSFER_CONTAINER, CONTENT_INSET, className)}>
                {screen === 'receipt' && receipt ? (
                    <TransferReceiptScreen
                        transfers={receipt}
                        onSendMore={() =>
                            single.step === 'receipt' ? single.sendMore() : multi.sendMore()
                        }
                    />
                ) : screen === 'history' ? (
                    /* The full history, alone on the screen — the bar above it is its title. */
                    <div className="flex flex-1 flex-col bg-(--background-surface) p-3 md:rounded-lg">
                        <TransferHistoryPanel
                            mode="full"
                            onViewAll={() => setShowHistory(true)}
                            onRetransfer={id => single.open(id)}
                        />
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col">
                        <TransferBalanceCard
                            label={t('balance_star_label')}
                            /* Already `—` when the figure is unknown — that decision belongs to the
                               provider, not to this screen. See `useBalanceDisplay`. */
                            value={star}
                        />
                        {/* The purple seam. See the note above — it is legacy's, and it is the only
                            thing this box is for. */}
                        <div className="flex flex-1 flex-col bg-(--primary-500) md:rounded-b-lg">
                            <div className="flex flex-1 flex-col bg-(--background-surface) p-3 md:rounded-lg">
                                <TransferModeTiles
                                    onSingle={() => single.open()}
                                    onMulti={multi.open}
                                />
                                <TransferHistoryPanel
                                    mode="inline"
                                    onViewAll={() => setShowHistory(true)}
                                    onRetransfer={id => single.open(id)}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <SingleTransferDialog flow={single} />
            <MultiTransferDialog flow={multi} />
        </>
    )
}

/**
 * The denial — for an account that really does not have the grant.
 *
 * Legacy's three text levels, in its order: **Access Denied** large, then the artwork, then the sentence,
 * then the paragraph, then a full-width button capped at 400. It used `ChannelEmptyState` (title + body)
 * for a while, which dropped the first line; this screen is specified by `web-app`, so the line comes
 * back.
 *
 * "Back to Home" is the one useful thing to offer: there is no upgrade path to point at, because these
 * grants come from the backoffice rather than from a purchase (`useRequireCapability` says the same about
 * its toast). A `Link`, not a `router.push`, so it is a real navigation somebody can middle-click.
 */
function AccessDenied() {
    const { t } = useTranslation()

    return (
        /*
         * `px-4` here and not on the column: this block is centred text on the page background, not one of
         * the screen's full-bleed surfaces, so it needs the inset the column no longer has.
         */
        <div
            className={cn(
                'flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12',
                RISE,
            )}
        >
            <h2 className="type-title-t1-semibold text-center text-(--text-title)">
                {t('star_transfer_denied_title')}
            </h2>
            <Image
                src={STAR_TRANSFER_ART.denied.src}
                alt=""
                aria-hidden
                width={STAR_TRANSFER_ART.denied.width}
                height={STAR_TRANSFER_ART.denied.height}
                className="h-auto max-w-full"
                priority
            />
            <p className="type-body-strong text-center text-(--text-title)">
                {t('star_transfer_denied_heading')}
            </p>
            <p className="type-body-default max-w-[400px] text-center text-(--text-body)">
                {t('star_transfer_denied_body')}
            </p>
            <Button
                data-testid="star-transfer-get-star"
                variant="primary"
                size="large"
                fullWidth
                className="mt-2 max-w-[400px]"
                render={<Link href="/" />}
            >
                {t('common_back_home')}
            </Button>
        </div>
    )
}

/**
 * The guest state.
 *
 * `capabilityState` answers `denied` for a visitor with no session, correctly — there is nothing to retry
 * — but the *sentence* has to be different: what they are missing is an account, not a permission. The
 * copy is `/my-star`'s, because the first thing this screen shows is a Star balance and that is exactly
 * what it says.
 *
 * The action **is** the gate: `useRequireAuth` raises the login dialog, and by the time its callback could
 * run this branch has unmounted. Same shape as `MyStarView`'s — and the URL stays put, per
 * `docs/DEFINITION_OF_DONE.md` §3.
 */
function SignInPrompt({ onSignIn }: { onSignIn: ReturnType<typeof useRequireAuth> }) {
    const { t } = useTranslation()

    return (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="star"
            title={t('balance_star_signed_out_title')}
            body={t('balance_star_signed_out_body')}
            action={
                <Button
                    data-testid="star-transfer-sign-in"
                    variant="primary"
                    size="large"
                    onClick={onSignIn(() => undefined)}
                >
                    {t('auth_sign_in')}
                </Button>
            }
        />
    )
}
