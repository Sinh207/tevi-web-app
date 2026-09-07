'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatAmountWithCode } from '@shared/lib/money'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PayoutRequestDetail } from '../api/types'
import { usePayoutRequest } from '../hooks/use-payout-request'
import { PAYOUT_CONTAINER } from '../lib/container'
import { formatPayoutEtaRange, payoutEta } from '../lib/payout-eta'
import { PAYOUT_TRACKING_PATH } from '../routes'
import { PayoutAmountRows, PayoutConfigRows, PayoutDetailRow } from './payout-detail-rows'
import { PayoutDetailSkeleton } from './payout-detail-skeleton'
import { PayoutDisclosure } from './payout-disclosure'
import { PayoutStatusChip, PayoutTimeline } from './payout-timeline'

/**
 * `/my-wallet/payout-tracking/{id}` — one payout request in full.
 *
 * ## The answer is above the folds
 *
 * A creator opens this to find out **how much arrived and when**, so the net figure and the status are
 * the top of the screen, and the two things that are *working* — the fee breakdown and the status
 * history — are folded. That is legacy's arrangement (both its accordions ship collapsed) and the right
 * one: opening either by default pushes the figure off the top of a phone.
 *
 * ## Five states, and "no such payout" is not "it failed"
 *
 * Loading / error / missing / signed-out / the request. Legacy has three, because both its `else` and
 * its `catch` set the detail to `null` — so a dead network and a deleted payout show the same empty
 * state, and the reader is told there is nothing to see when nothing was successfully asked. See
 * `usePayoutRequest`.
 *
 * Back goes to `/my-wallet/payout-tracking`, not `/my-wallet`: this screen is a row of that list, and a
 * shared link or a push notification can open it with no history behind it.
 */
export function PayoutDetailView({ id, className }: { id: string; className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const { isAuthenticated, isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()
    const { request, isLoading, isError, isMissing, refetch } = usePayoutRequest(id)

    const isSignedOut = !isBootstrapping && !isAuthenticated

    return (
        <>
            {/*
             * `--background`, not the single-panel `PAYOUT_SCREEN`. **This screen is not a single
             * panel** — it is three cards, and the page colour between them is what separates them. The
             * full-bleed rule (`docs/DESIGN_SYSTEM.md` §6) applies to a screen that is *one* block of
             * content; painting the surface edge to edge here would close the gaps and turn three cards
             * into one undivided sheet.
             */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('payout_detail_title')}
                    home={PAYOUT_TRACKING_PATH}
                    className={PAYOUT_CONTAINER}
                />
            </div>

            <div className={cn(PAYOUT_CONTAINER, 'flex flex-1 flex-col pb-6', className)}>
                {/*
                 * No surface and no radius on the wrapper: each card carries its own, and the gaps
                 * between them show the page. `px-4` is the column's inset, cancelled per card below.
                 */}
                <div className="flex flex-1 flex-col px-4">
                    {isSignedOut ? (
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="bank"
                            title={t('payout_signed_out_title')}
                            body={t('payout_signed_out_body')}
                            action={
                                <Button
                                    data-testid="payout-detail-sign-in"
                                    variant="primary"
                                    size="large"
                                    onClick={requireAuth(() => undefined)}
                                >
                                    {t('auth_sign_in')}
                                </Button>
                            }
                        />
                    ) : isLoading ? (
                        <PayoutDetailSkeleton />
                    ) : isError ? (
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="exclamation-diamond"
                            tone="error"
                            title={t('payout_detail_error_title')}
                            body={t('payout_detail_error_body')}
                            action={
                                <Button
                                    data-testid="payout-detail-retry"
                                    variant="secondary"
                                    size="large"
                                    onClick={refetch}
                                >
                                    {t('common_retry')}
                                </Button>
                            }
                        />
                    ) : isMissing || !request ? (
                        /*
                         * A distinct state, not the error one: the request succeeded and there is no
                         * such payout. Offering "try again" here would invite a reader to retry
                         * something that will keep answering the same way, so the action goes back to
                         * the list instead.
                         */
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="money-search"
                            title={t('payout_detail_missing_title')}
                            body={t('payout_detail_missing_body')}
                            action={
                                <Button
                                    data-testid="payout-detail-back"
                                    variant="secondary"
                                    size="large"
                                    onClick={() => {
                                        window.location.assign(PAYOUT_TRACKING_PATH)
                                    }}
                                >
                                    {t('payout_detail_back_to_list')}
                                </Button>
                            }
                        />
                    ) : (
                        /*
                         * **Three cards with page colour between them**, not one card with heavy rules
                         * inside it. Legacy's 5px `#F4F4F4` dividers are the gaps *between* separate
                         * `Paper`s once you see the screen — a band of page colour, which is what
                         * `gap-3` on `--background` produces without pretending a border is a gap.
                         *
                         * `-mx-4` cancels the panel's inset so each card carries its own, and `contents`
                         * is not used: the cards need to be siblings in a gapped column.
                         */
                        <div className="-mx-4 flex flex-col gap-3">
                            {/*
                             * Card one: the figure, the request id, when it lands, and the status fold.
                             * `RISE` with a 60ms stagger down the cards, the increment every other
                             * screen in this app uses.
                             */}
                            <div
                                className={cn(
                                    'flex flex-col overflow-clip bg-(--background-surface) px-4 md:rounded-xl',
                                    RISE,
                                )}
                            >
                                <div className="flex flex-col items-center gap-1 px-2 py-8 text-center">
                                    <p
                                        dir="ltr"
                                        className="type-heading-h1-bold m-0 text-(--text-title)"
                                    >
                                        {request.netAmount === null
                                            ? '—'
                                            : formatAmountWithCode(
                                                  request.netAmount,
                                                  request.netAmountCurrency,
                                                  currentLanguage,
                                              )}
                                    </p>
                                    <p className="type-dense-default m-0 text-(--text-body)">
                                        {t('payout_detail_heading')}
                                    </p>
                                </div>
                                <div className="flex flex-col border-(--separator-default) border-t py-2">
                                    <RequestIdRow request={request} />
                                    <EtaRow request={request} />
                                    {/*
                                     * `border-dashed` — legacy's separator inside a card, where the gaps
                                     * between cards do the separating.
                                     */}
                                    <div className="my-2 border-(--separator-default) border-t border-dashed" />
                                    {/*
                                     * The coloured chip rides the **summary** row, which is where legacy
                                     * puts it — so the state is readable without opening the fold, and
                                     * the matching step inside the timeline carries no chip of its own.
                                     */}
                                    <PayoutDisclosure
                                        label={t('payout_detail_status')}
                                        summary={<PayoutStatusChip request={request} />}
                                    >
                                        <PayoutTimeline request={request} />
                                    </PayoutDisclosure>
                                </div>
                            </div>

                            {/*
                             * Card two — **the account, flat and always visible**, before the fee
                             * breakdown. Legacy's order: after "how much", the next question is "into
                             * what", not "how was it worked out". Folding this was my own idea and it
                             * was wrong.
                             */}
                            {request.config && (
                                <div
                                    className={cn(
                                        'flex flex-col overflow-clip bg-(--background-surface) px-4 py-2 md:rounded-xl',
                                        RISE,
                                    )}
                                    style={riseDelay(1)}
                                >
                                    <PayoutConfigRows request={request} />
                                </div>
                            )}

                            {/* Card three: the working — gross, sub-receive, fees, net. Folded. */}
                            <div
                                className={cn(
                                    'flex flex-col overflow-clip bg-(--background-surface) px-4 md:rounded-xl',
                                    RISE,
                                )}
                                style={riseDelay(2)}
                            >
                                {/*
                                 * **Open by default**, which is what legacy's shipped screen shows: the
                                 * fee breakdown is why the figure at the top is what it is, so a reader
                                 * who came for the amount is one glance from the derivation. The status
                                 * fold above stays closed — a log is useful when something looks wrong
                                 * and noise the rest of the time.
                                 */}
                                <PayoutDisclosure
                                    label={t('payout_detail_show_detail')}
                                    defaultOpen
                                >
                                    <PayoutAmountRows request={request} />
                                </PayoutDisclosure>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

/**
 * `Estimated receive time`, in **bold** — legacy's treatment, and a row I left out of the first pass.
 *
 * Omitted entirely when there is no option to compute from, exactly as legacy does
 * (`{formatPayoutRange && …}`): a blank value would read as "we do not know", which is a different
 * claim from "this option states none".
 */
function EtaRow({ request }: { request: PayoutRequestDetail }) {
    const { t, currentLanguage } = useTranslation()
    const eta = payoutEta(request)
    if (!eta) return null

    return (
        <PayoutDetailRow
            strong
            label={t('payout_detail_eta')}
            value={
                eta.kind === 'range'
                    ? formatPayoutEtaRange(eta.fromMs, eta.toMs, currentLanguage)
                    : t('payout_detail_eta_hours', { count: eta.hours })
            }
        />
    )
}

const COPY_TOAST_ID = 'payout-request-id-copy'

/**
 * `Request ID` with a copy control — the one field a creator quotes to support.
 *
 * The same pair this repo uses everywhere else (`app/privacy-settings`, the ledger sheet): a toast
 * states the fact, and the glyph becomes a tick for two seconds for the eye already on the pointer.
 * The failure branch is real — `navigator.clipboard` is absent on an insecure origin — and the toast
 * then carries the value so it can be selected by hand.
 *
 * ⚠ `pages` is this repo's copy glyph; the DS sprite has no `copy`.
 */
function RequestIdRow({ request }: { request: PayoutRequestDetail }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    useEffect(() => () => clearTimeout(timer.current), [])

    const value = request.requestNumber || request.id

    async function copy() {
        try {
            await navigator.clipboard.writeText(value)
            toast.success(t('payout_detail_id_copied'), { id: COPY_TOAST_ID })
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error(t('payout_detail_id_copy_failed', { value }), { id: COPY_TOAST_ID })
        }
    }

    return (
        <PayoutDetailRow
            label={t('payout_detail_request_id')}
            value={
                <span className="flex items-center justify-end gap-2">
                    {/* `#` before the number — legacy's own `#{requestNumber}`. */}
                    <span className="break-all">#{value}</span>
                    <Button
                        data-testid="payout-detail-copy"
                        variant="ghost"
                        size="small"
                        iconOnly
                        aria-label={t('payout_detail_copy_id')}
                        onClick={copy}
                        className="size-8 shrink-0 text-(--text-brand)"
                    >
                        <Icon name={copied ? 'check' : 'pages'} size={20} />
                    </Button>
                </span>
            }
        />
    )
}
