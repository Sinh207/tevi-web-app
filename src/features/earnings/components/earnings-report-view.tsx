'use client'

import { useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import {
    ListHeader,
    ListHeaderDesc,
    ListHeaderSubtitle,
    ListHeaderText,
    ListHeaderTitle,
} from '@shared/ui/list'
import Link from 'next/link'
import { type ReactNode, useState } from 'react'
import { useEarningsReport } from '../hooks/use-earnings-report'
import { matchesEarningsDateParam } from '../lib/format'
import { EARNINGS_ART } from '../lib/illustrations'
import { earningsReportPath } from '../lib/routes'
import { EarningsDayRow } from './earnings-day-row'
import { EarningsReportSkeleton } from './earnings-report-skeleton'

/**
 * `/@{slug}/earnings-report` — everything below the page's back bar.
 *
 * ## Six states, and the two this screen has that most do not
 *
 * `docs/DEFINITION_OF_DONE.md` §1's loading / error / empty / success, plus:
 *
 * - **signed out** — the app always keeps an anonymous session, so `currentUser` being present
 *   says nothing. An anonymous visitor gets a prompt, not an empty report telling them they have
 *   earned nothing. The prompt gates the *action* (`useRequireAuth` opens the login dialog)
 *   rather than redirecting, per DoD §3: the URL stays put and signing in leaves them here.
 * - **not the owner** — see below. This is the one that is specific to this screen.
 *
 * ## The not-owner state exists because the endpoint ignores the URL
 *
 * The report is derived from the bearer; there is no channel on the request
 * (`api/earnings-api.ts`). So `/@bob/earnings-report` opened by Alice returns **Alice's** figures,
 * and legacy renders them — her money, under his address, with his handle in the back link.
 * Nothing leaks, since it is her own data. What it does is make the URL a lie, and a lie about
 * whose money this is, is one screenshot away from a support ticket.
 *
 * So the slug is compared against the reader's own channel and, when it does not match, the
 * screen says so and offers the link that does. It is not an authorisation check — the server
 * would happily answer — it is the screen refusing to put one person's figures under another
 * person's address.
 *
 * ## The panel, and why it starts at `md`
 *
 * From `md` the whole report sits on a card — `--background-surface`, rounded, with a hairline —
 * and below `md` it does not. That is the same split `PageSurface` makes and for the same reason:
 * a surface whose left and right edges *are* the screen's edges is not a card, it is paint, and
 * the mobile app draws these rows edge to edge. From `md` the column is capped with real space
 * either side, so the panel has something to be a card against and the report reads as one
 * document rather than as four loose cards adrift on a wide page.
 *
 * An earlier version had no panel at any width, on the grounds that the day cards are already
 * surfaces and nesting two makes the inner one stop reading as separate. That reasoning holds for
 * `/settings/space-visibility`, whose option cards *are* the screen — and it is wrong here,
 * because this screen has a **header** that belongs to the list ("Daily earnings report" and what
 * the figures mean). A header with no surface under it does not visibly own the rows below it, so
 * at wide widths it read as a floating caption. Legacy wraps the same two parts in the same card.
 *
 * The nesting is real and is handled the way legacy handles it: inside the panel the day cards
 * are the same fill as the panel and are told apart by their border, exactly as legacy's
 * `gray.100` outline on white does.
 */
export function EarningsReportView({
    slug,
    /**
     * The `[dateTs]` segment, in **seconds**, or `null`. Opens that day on arrival and scrolls it
     * into view. Only ever an initial value — see `expandedDate` below.
     */
    initialDateSeconds = null,
    className,
}: {
    slug: string
    initialDateSeconds?: number | null
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const { days, access, isLoading, isError, isEmpty, refetch, mySlug } = useEarningsReport(slug)

    /**
     * Which day is open — **one at a time**, and held here rather than in each row.
     *
     * One at a time because the panel is a breakdown of the row above it: two open at once and
     * the reader is comparing two lists of the same nine labels with nothing marking which total
     * each belongs to. Legacy allows any number open, and it reads as a wall.
     *
     * Keyed by the day's `date` rather than its index, so a new day arriving at the top of a
     * refetched list does not move the open panel onto its neighbour.
     *
     * The URL seeds it and then stops mattering: expanding a second row does **not** rewrite the
     * path. `/@ada/earnings-report/1739923200` is a deep link somebody was *sent*, and turning
     * every disclosure into a history entry would mean nine presses of Back to leave the screen.
     */
    const [expandedDate, setExpandedDate] = useState<number | null>(null)
    const autoExpandedDate =
        days.find(day => matchesEarningsDateParam(day.date, initialDateSeconds))?.date ?? null
    const openDate = expandedDate ?? autoExpandedDate

    if (access === 'signed-out') {
        return (
            <Panel className={className}>
                <ChannelEmptyState
                    className={cn('flex-1', RISE)}
                    icon="dollar-circle"
                    title={t('earnings_signed_out_title')}
                    body={t('earnings_signed_out_body')}
                    action={
                        /*
                         * The action *is* the gate, as on `/settings/blocked-accounts`:
                         * `useRequireAuth` opens the login dialog when there is no real account,
                         * and by the time the callback could run there is nothing left to do —
                         * `access` stops being `'signed-out'` and this branch unmounts.
                         */
                        <Button
                            variant="primary"
                            size="large"
                            onClick={requireAuth(() => undefined)}
                        >
                            {t('auth_sign_in')}
                        </Button>
                    }
                />
            </Panel>
        )
    }

    if (access === 'not-owner') {
        return (
            <Panel className={className}>
                <ChannelEmptyState
                    className={cn('flex-1', RISE)}
                    icon="lock-simple"
                    title={t('earnings_not_owner_title')}
                    body={t('earnings_not_owner_body')}
                    action={
                        /*
                         * Only offered when the reader *has* a channel to be sent to. A real
                         * account with no channel cannot have a report at all, and a button
                         * pointing at `/@null/earnings-report` is worse than no button — the
                         * onboarding gate in `MyChannelProvider` already handles that account.
                         */
                        mySlug ? (
                            <Button
                                variant="primary"
                                size="large"
                                render={<Link href={earningsReportPath(mySlug)} />}
                            >
                                {t('earnings_not_owner_action')}
                            </Button>
                        ) : undefined
                    }
                />
            </Panel>
        )
    }

    return (
        <Panel className={className}>
            <ReportHeader />

            <div className="flex flex-1 flex-col pt-3 md:p-3 md:pt-3">
                {isLoading ? (
                    <EarningsReportSkeleton />
                ) : isError ? (
                    <ChannelEmptyState
                        className={cn('flex-1', RISE)}
                        icon="exclamation-diamond"
                        tone="error"
                        title={t('earnings_error_title')}
                        body={t('earnings_error_body')}
                        action={
                            <Button variant="secondary" size="large" onClick={refetch}>
                                {t('common_retry')}
                            </Button>
                        }
                    />
                ) : isEmpty ? (
                    <ChannelEmptyState
                        className={cn('flex-1', RISE)}
                        art={EARNINGS_ART.empty}
                        title={t('earnings_empty_title')}
                        body={t('earnings_empty_body')}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {days.map(day => (
                            <EarningsDayRow
                                key={day.id}
                                day={day}
                                locale={currentLanguage}
                                expanded={openDate === day.date}
                                /*
                                 * Scroll-into-view is for the deep-linked row only, and only when
                                 * the reader has not since opened another one — otherwise a
                                 * refetch would yank the page back to a row they had left.
                                 */
                                autoFocusRow={
                                    expandedDate === null && autoExpandedDate === day.date
                                }
                                onToggle={() =>
                                    setExpandedDate(current => {
                                        const open = current ?? autoExpandedDate
                                        /*
                                         * `-1` rather than `null` to close: `null` means "the
                                         * URL's choice still stands", so returning it would
                                         * re-open the deep-linked row the moment the reader
                                         * closed it. Any value that is not a real timestamp
                                         * closes everything, and a negative one can never
                                         * collide with a day.
                                         */
                                        return open === day.date ? -1 : day.date
                                    })
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
        </Panel>
    )
}

/**
 * The report's surface — **a card from `md` up, nothing at all below it.**
 *
 * Same decision, same breakpoint and the same tokens as `shared/components/page-surface.tsx`,
 * which is the app's general answer to "what does a sub-page's content sit on". It is not
 * *imported* from there because that component also owns a padding scheme (16/24 all round) and a
 * `flex-none` above `md`, and this screen wants neither: its padding is asymmetric (the header
 * pads itself, the list pads at `md` only) and it must keep growing to the bottom of a tall
 * window so the panel's lower corners have background beneath them.
 *
 * `flex-1` so a report with two days still fills the phone, matching legacy's
 * `minHeight: calc(var(--window-height) - …)` — and so every state inside it (skeleton, empty,
 * error) is measured against the same box rather than each collapsing to its own height.
 *
 * `--background-surface`, not `--background-listing`: Listing is `--black` in Dark, the same value
 * as `--background`, so a Listing panel and its border vanish into the page in Dark and only in
 * Dark. `blocked-accounts-view.tsx` documents the same trap at length.
 */
function Panel({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-1 flex-col',
                'md:rounded-[var(--radius-xl)] md:border md:border-(--separator-default)',
                'md:bg-(--background-surface)',
                className,
            )}
        >
            {children}
        </div>
    )
}

/**
 * `List/Header` (Figma 2068:9169) in its **Prominent** form: title 16 Semi Bold in Text - Title, a
 * 14 Regular subtitle under it, 12/16 padding and a hairline along the bottom edge.
 *
 * ## Now the real DS port, which this file used to ask for
 *
 * It was hand-rolled here, with a note flagging it as "the next thing to lift out of here if a
 * second screen wants a section header". `features/balance`'s transaction panel is that second
 * screen, so `ListHeader` is in `shared/ui/list.tsx` and this composes it. The hand-rolled version
 * is gone rather than kept alongside — two implementations of one DS node is exactly the drift the
 * port exists to prevent.
 *
 * ## Two overrides survive the move, and both are this screen's, not the DS's
 *
 * 1. **The rule is drawn from `md` only.** Below `md` there is no panel for it to divide, and a
 *    full-bleed line across a phone screen whose content is already a stack of bordered cards just
 *    draws a second edge. `rule={false}` plus a `md:after:*` set, because the prop is all-or-nothing
 *    and the breakpoint is not.
 * 2. **The side padding mirrors that.** Below `md` the column already insets by 16
 *    (`EARNINGS_CONTAINER`), so the header adds none and its text lines up with the cards; from `md`
 *    the panel is the box and the header pads itself. Hence `px-0 md:px-4` over the DS's flat `px-4`.
 *
 * `ListHeaderDesc`'s `gap-[2px]` replaces the old `gap-0.5`, which was the same 2px written another
 * way — the DS's value, now sourced from the DS.
 */
function ReportHeader() {
    const { t } = useTranslation()

    return (
        <ListHeader
            /*
             * The `h2` goes on the title rather than the wrapper: the DS ports are frames, and the
             * document outline belongs to the text inside them — which is why `ListHeaderTitle`
             * takes an `as` and `ListHeader` does not.
             */
            rule={false}
            className={cn(
                'px-0 md:px-4',
                "md:after:absolute md:after:inset-x-0 md:after:bottom-0 md:after:h-px md:after:bg-(--separator-default) md:after:content-['']",
            )}
        >
            <ListHeaderDesc>
                <ListHeaderText>
                    <ListHeaderTitle as="h2">{t('earnings_section_title')}</ListHeaderTitle>
                    <ListHeaderSubtitle>{t('earnings_section_subtitle')}</ListHeaderSubtitle>
                </ListHeaderText>
            </ListHeaderDesc>
        </ListHeader>
    )
}
