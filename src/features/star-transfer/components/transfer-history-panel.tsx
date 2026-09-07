'use client'

import { LedgerSkeleton } from '@shared/components/ledger'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import { useEffect } from 'react'
import { useTransferHistory } from '../hooks/use-transfer-history'
import { STAR_TRANSFER_EMPTY_ART } from '../lib/illustrations'
import { TransferHistoryRow } from './transfer-history-row'

/**
 * The transfers this account has sent — day headers, infinite, inside the screen's white panel.
 *
 * ## Two modes, because legacy has two screens
 *
 * `inline` is the block on the main screen: a **Transaction history** header with **View all** on its
 * right, then the list. `full` is what View all leads to — the same list with no header of its own,
 * because the page's back bar is titled *Transfer history* by then (`StarTransferView` owns that state).
 * Legacy renders the identical component in both places and this does the same; what changes is the
 * chrome around it.
 *
 * It briefly had one mode and no View all, on the argument that an infinite list makes a second screen
 * redundant. That was a reduction of legacy's UX rather than a port of it.
 *
 * ## No panel background of its own
 *
 * Unlike `/my-star`'s `LedgerPanel`, this list does **not** paint a surface: it already sits inside the
 * screen's white panel (see `StarTransferView`), and a second surface inside the first would draw a card
 * on a card. That is also why the header is a sticky *row* with a hairline under it rather than a
 * `ListHeader` — legacy's own treatment.
 *
 * `LedgerSkeleton` is the shared one: built from the same `ListRow` parts these rows are, so the
 * placeholder and the real row are the same height and nothing jumps when the list arrives.
 */
export function TransferHistoryPanel({
    mode,
    onViewAll,
    onRetransfer,
    className,
}: {
    mode: 'inline' | 'full'
    /** Switch the screen to the full history. Only called in `inline` mode. */
    onViewAll: () => void
    onRetransfer: (teviId: string) => void
    className?: string
}) {
    const { t } = useTranslation()
    const {
        groups,
        isLoading,
        isError,
        isEmpty,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        refetch,
    } = useTransferHistory()

    /*
     * The same pair as `MyStarView` — the ref plus an effect, with `enabled` detached the moment there
     * is nothing to fetch, so no observer is left attached to a sentinel whose callback would do
     * nothing.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) fetchNextPage()
    }, [sentinelInView, fetchNextPage])

    return (
        <section
            aria-label={mode === 'inline' ? t('star_transfer_txn_history') : undefined}
            className={cn('flex min-w-0 flex-col', className)}
        >
            {mode === 'inline' && (
                /*
                 * Sticky, with the panel's own background behind it: the list scrolls under this row, and a
                 * transparent sticky header has rows sliding visibly behind its text. Legacy's spacing —
                 * 24 above, 12 below — and its hairline.
                 *
                 * ## The offsets are **bar-relative**, and that is the whole trick
                 *
                 * There are three sticky layers on this screen and each has to park under the one above it:
                 *
                 * | layer | sticks at | why that number |
                 * |---|---|---|
                 * | the page's back bar | `0` | `StarTransferView` owns it, `z-20` |
                 * | this header | **`60`** | the DS `AppBar` is `h-[60px]` |
                 * | a day header | **`121`** | 60 + this row's own 61 (24 + a 24 line-box + 12 + the 1px rule) |
                 *
                 * They were `0` and `46`, which is what `web-app` uses — and 46 is *its* bar height, not
                 * ours. The result was this header sliding **behind** the back bar (which is `z-20`, so it
                 * wins) and the day label landing on top of it. Legacy's own arithmetic is the same shape:
                 * its day header sits at 107 = its 46 bar + the same 61 header.
                 *
                 * Written as literals because Tailwind only emits arbitrary values it can see in the
                 * source, so a computed constant would produce no class at all. If the bar or this row's
                 * padding changes, both numbers here change with it — hence the table.
                 *
                 * The z-order that goes with it: bar `20` › this header `2` › a day header `1` › the rows,
                 * which are static. The rows only stay under the day label because `TransferHistoryRow`
                 * carries `isolate` — see the note there, it is the second half of this fix.
                 */
                <div className="sticky top-[60px] z-[2] flex items-center justify-between gap-2 border-(--separator-default) border-b bg-(--background-surface) pt-6 pb-3">
                    <h2 className="type-body-strong text-(--text-title)">
                        {t('star_transfer_txn_history')}
                    </h2>
                    {/* Only when there is something to view all *of* — legacy's own condition. */}
                    {groups.length > 0 && (
                        <Button
                            data-testid="star-transfer-history-view-all"
                            variant="ghost"
                            size="small"
                            className="h-auto px-0 text-(--text-link)"
                            onClick={onViewAll}
                        >
                            {t('star_transfer_view_all')}
                        </Button>
                    )}
                </div>
            )}

            {isLoading ? (
                <LedgerSkeleton />
            ) : isError ? (
                <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
                    <p className="type-dense-default text-(--text-body)">
                        {t('balance_txn_error_body')}
                    </p>
                    <Button
                        data-testid="star-transfer-history-retry"
                        variant="secondary"
                        size="medium"
                        onClick={refetch}
                    >
                        {t('common_retry')}
                    </Button>
                </div>
            ) : isEmpty ? (
                /*
                 * Legacy's empty state, and legacy's own art at its own size: Theo at 120, the title at
                 * 16/600, the sentence at 16/400 capped so it wraps to two lines rather than one long one.
                 */
                <div className="flex flex-col items-center gap-2 px-3 py-12 text-center">
                    <Image
                        src={STAR_TRANSFER_EMPTY_ART.src}
                        alt=""
                        aria-hidden
                        width={STAR_TRANSFER_EMPTY_ART.width}
                        height={STAR_TRANSFER_EMPTY_ART.height}
                        className="mb-2 h-auto"
                        /*
                         * Same reason as `ChannelEmptyState`'s art: the wall only renders when the
                         * list under it is empty, so this few-KB local vector can be the page's
                         * Largest Contentful Paint — and `next/image` would lazy-load it. Eager, not
                         * `priority`: the panel sits under the transfer form, so it is not the
                         * document's hero and has no claim on a preload.
                         */
                        loading="eager"
                    />
                    <p className="type-body-strong text-(--text-title)">
                        {t('star_transfer_empty_title')}
                    </p>
                    <p className="type-body-default max-w-[400px] text-(--text-body)">
                        {t('star_transfer_empty_body')}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col">
                    {/*
                     * ## Groups sit **flush**, and the 12px between them is the *previous* group's
                     *
                     * A `sticky` element is bounded by its **parent**, so a wrapper per day is what makes a
                     * label get *pushed* out by its own group ending — the iOS look, and legacy's.
                     *
                     * Two things had to be true for the handover to land, and each was wrong once:
                     *
                     * 1. **The 12px between groups must sit *inside* the previous group's content box.** A
                     *    flex `gap` is outside both boxes, and a `pb-3` on the group itself is outside its
                     *    **content** box — and a sticky element is clamped to its containing block's content
                     *    box, not its padding box. Both released the outgoing label 12px early, leaving a
                     *    window with rows running under the panel header and no date at all (measured: one
                     *    at 91, the next at 143, nothing at 121). So the 12px is the *rows container's*
                     *    `pb-3`, which is content, and group N+1's label starts exactly where group N's
                     *    label is released.
                     * 2. **The label's padding is symmetric.** With the separation as `pt-5`, the label's
                     *    *text* sat 20px below its box top, so the incoming date appeared 30px under the
                     *    header while the outgoing one was still on screen. At `py-2` — legacy's own
                     *    `p: '8px 0'` — the text arrives 8px under the header edge and the outgoing text is
                     *    already hidden behind it.
                     *
                     * Traced frame by frame at 900×700 over the scroll range where two labels are alive.
                     */}
                    {groups.map((group, index) => (
                        <div key={group.key} className="flex flex-col">
                            <div
                                className={cn(
                                    'sticky z-[1] bg-(--background-surface) py-2',
                                    // 121 under the panel header, 60 straight under the bar when there is
                                    // no panel header — the two rows of the table above.
                                    mode === 'inline' ? 'top-[121px]' : 'top-[60px]',
                                )}
                            >
                                <span className="type-dense-default text-(--text-title)">
                                    {group.label}
                                </span>
                            </div>
                            {/*
                             * The 12px between groups is this container's `pb-3`, i.e. **inside** the
                             * group's content box — see the note above for why that placement is the whole
                             * fix. Trimmed on the last group, which has the panel's own padding under it.
                             */}
                            <div
                                className={cn(
                                    'flex flex-col gap-1',
                                    index < groups.length - 1 && 'pb-3',
                                )}
                            >
                                {group.rows.map(transfer => (
                                    <TransferHistoryRow
                                        key={transfer.id}
                                        transfer={transfer}
                                        onRetransfer={onRetransfer}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    {hasNextPage && (
                        <div
                            ref={sentinelRef}
                            // A loading mechanism, not content: the rows it brings in announce themselves.
                            aria-hidden="true"
                            className="flex items-center justify-center py-4"
                        >
                            {isFetchingNextPage && <Loader />}
                        </div>
                    )}
                </div>
            )}
        </section>
    )
}
