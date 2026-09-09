'use client'

import { useRequireAuth } from '@features/auth'
import { PageBackBar } from '@features/navigation'
import {
    ActionMenu,
    ActionMenuAnchor,
    ActionMenuContent,
    ActionMenuItem,
} from '@shared/components/action-menu'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials, avatarImageClass } from '@shared/ui/avatar'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useMcnPartnership } from '../hooks/use-mcn-partnership'
import { formatActivityDateTime, formatJoinedDate } from '../lib/channel-format'
import {
    MCN_PARTNERSHIP_CONTAINER,
    MCN_PARTNERSHIP_PANEL,
    MCN_PARTNERSHIP_SCREEN,
} from '../lib/container'
import { ChannelAboutCard, ChannelAboutCardTitle } from './channel-about-card'
import { ChannelEmptyState } from './channel-empty-state'
import { McnPartnershipSkeleton } from './mcn-partnership-skeleton'

/**
 * `/mcn-partnership` — the screen a creator managed by a multi-channel network reads their contract
 * on, and the one place they can end it.
 *
 * ## It is a port of legacy's `containers/mcnPartnership`, block for block
 *
 * Bar with a kebab; a card naming the network with the date the partnership started; the revenue
 * split as two figures under a rule, with the platform-fee caveat under them; the pending-departure
 * banner when there is one; and a contact line. Same order, same content, same actions.
 *
 * **This is not the same screen as `ChannelAboutMcn`**, which draws a compressed version of the same
 * facts inside the About tab of the creator's own space. Both exist in legacy and both are kept:
 * the tab block is a summary you meet while looking at your space, this is the screen the account
 * drawer sends you to. They share the hook that schedules a departure (`useMcnLeave`), which is what
 * keeps them from disagreeing about whether one is pending.
 *
 * ## The bar belongs to the view, not to `page.tsx`
 *
 * Its trailing control is **state**: the kebab is offered only when a departure can actually be
 * scheduled (`canLeave` — see `canRequestLeave`), so it cannot be rendered on the server. Same
 * arrangement, and the same reason, as `/star-transfer`. The cost is that `loading.tsx` draws no
 * bar; the benefit is that no reader is ever shown a menu whose one item would be refused.
 *
 * ## Six states, and legacy has three
 *
 * `bootstrapping / signed-out / loading / error / none / ready`, decided in one place by
 * `mcnPartnershipState`. Legacy has loading, empty and content — so a signed-out visitor and a
 * creator whose `my-channel/` request failed both read **"No MCN Partnership"**, which is a
 * statement about their contract rather than about the app's ignorance. Two of the four additions
 * are DoD §1 (error, signed out); the other two are the ordering that keeps "no network" from
 * flashing before the answer arrives.
 */
export function McnPartnershipView() {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const { state, mcn, space, leave, isBusy, canLeave, confirmLeave, cancelLeave, refresh } =
        useMcnPartnership()

    /** Which confirmation is open. One value, because the two can never be open together. */
    const [asking, setAsking] = useState<'leave' | 'cancel' | null>(null)

    /**
     * Whether the screen is showing a **wall** rather than the partnership.
     *
     * This is what picks between §6's two surface treatments, and it is a property of the *state*
     * rather than of the route: with cards to show, this is a multi-block screen and the page colour
     * separates them; with none, one block is left and it has to sit on the plane the cards were on.
     * `MCN_PARTNERSHIP_SCREEN` carries the whole argument.
     *
     * The two skeleton states are deliberately **not** walls: they draw the cards, so they stay on
     * the page colour with them — and so does `loading.tsx`, which draws the same skeleton.
     */
    const isWall = state === 'signed-out' || state === 'error' || state === 'none'

    const name = mcn?.name ?? null
    const slug = space?.slug ?? null

    const body =
        state === 'bootstrapping' || state === 'loading' ? (
            <McnPartnershipSkeleton />
        ) : state === 'signed-out' ? (
            <ChannelEmptyState
                testId="channel-mcn-partnership-signed-out"
                className={cn('flex-1', RISE)}
                icon="document-list"
                title={t('mcn_partnership_signed_out_title')}
                body={t('mcn_partnership_signed_out_body')}
                action={
                    /* The action *is* the gate — `useRequireAuth` raises the dialog, and once
                       there is a real account this branch stops rendering on its own, so the
                       callback has nothing left to do. Same shape as `/follow-requests`. */
                    <Button
                        data-testid="channel-mcn-partnership-sign-in"
                        variant="primary"
                        size="large"
                        onClick={requireAuth(() => undefined)}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />
        ) : state === 'error' ? (
            <ChannelEmptyState
                testId="channel-mcn-partnership-error"
                className={cn('flex-1', RISE)}
                icon="exclamation-diamond"
                tone="error"
                title={t('mcn_partnership_error_title')}
                body={t('mcn_partnership_error_body')}
                action={
                    <Button
                        data-testid="channel-mcn-partnership-retry"
                        variant="secondary"
                        size="large"
                        onClick={() => void refresh()}
                    >
                        {t('common_retry')}
                    </Button>
                }
            />
        ) : state === 'none' ? (
            /* Legacy's own empty copy, and the state an **owner** lands on too: the operator of a
               network negotiates no split with themselves, so there is nothing here for them. */
            <ChannelEmptyState
                testId="channel-mcn-partnership-empty"
                className={cn('flex-1', RISE)}
                icon="document-list"
                title={t('mcn_partnership_empty_title')}
                body={t('mcn_partnership_empty_body')}
            />
        ) : (
            <div className={cn('flex flex-col gap-3 py-3', RISE)}>
                <ManagedByCard
                    name={name}
                    thumb={space?.images.thumb ?? null}
                    slug={slug}
                    joinedAt={mcn?.joinedAt ?? null}
                    locale={currentLanguage}
                />
                <RevenueSplitCard
                    creatorRate={mcn?.creatorRate ?? null}
                    mcnRate={mcn?.mcnRate ?? null}
                />
                {leave && (
                    <LeavePendingCard
                        departureAt={leave.expected_departure_at}
                        locale={currentLanguage}
                        busy={isBusy}
                        onCancel={() => setAsking('cancel')}
                    />
                )}
                <ContactLine name={name} url={space?.message_url ?? null} />
            </div>
        )

    return (
        <>
            {/*
             * Opaque and sticky, and painted in **the screen's own colour** — which changes with the
             * state (`isWall`). Below `md` an empty state runs its surface full-bleed, and a
             * page-coloured bar over it is a strip of the wrong colour above the panel.
             *
             * Legacy paints this bar `#ffffff` below `md` and `#f4f4f4` from `md` on *every* state,
             * i.e. a white strip over its grey content column. Not ported: this app's rule is that
             * the bar matches the screen under it, and `/my-star` and `/my-wallet` — legacy's other
             * `#f4f4f4` card stacks — already follow it.
             */}
            <div
                className={cn(
                    'sticky top-0 z-20',
                    isWall ? MCN_PARTNERSHIP_SCREEN : 'bg-(--background)',
                )}
            >
                <PageBackBar
                    title={t('mcn_partnership_title')}
                    className={MCN_PARTNERSHIP_CONTAINER}
                    actions={
                        canLeave ? (
                            /*
                             * A kebab with one item — legacy's shape, kept here where
                             * `ChannelAboutMcn` deliberately flattened it to a button.
                             *
                             * The two are not inconsistent: there, the action sits **in a card
                             * header** next to the network's name, where a menu hides the only thing
                             * it offers behind a tap. Here it is the **app bar's** trailing slot,
                             * where a bare destructive word next to a title is the wrong weight for
                             * a page whose subject is a contract — and where every other screen in
                             * this app that carries a page-level action carries it as a kebab.
                             */
                            <ActionMenu>
                                {/*
                                 * `ActionMenuAnchor` + `BarIconButton`, which is what every other
                                 * **bar** menu in this app is — `NotificationBarActions`,
                                 * `MembershipActionsMenu`, `DonationActionsMenu`,
                                 * `ChannelViewerMenu`. It was `ActionMenuTrigger` with a
                                 * `more-vertical`: the row-sized kebab the primitive draws for a
                                 * *list row*, which in the bar's trailing cluster is a bare glyph
                                 * with no disc, sitting opposite a 40px back button — visibly not
                                 * the same kind of control. The anchor paints nothing and still
                                 * stamps `aria-haspopup` / `aria-expanded`, so the skin is the
                                 * sub-page bar's own disc and the ARIA contract is unchanged.
                                 * `more-horizontal` for the same reason: it is the glyph the four
                                 * bars above use, and it is symmetric under RTL.
                                 */}
                                <ActionMenuAnchor
                                    render={
                                        <BarIconButton
                                            data-testid="channel-mcn-partnership-menu"
                                            name="more-horizontal"
                                            label={t('mcn_partnership_actions')}
                                            /*
                                             * `aria-disabled` while a request is in flight, and the
                                             * kebab **stays mounted** — the distinction this repo
                                             * draws wherever a control opens a dialog. The dialog
                                             * returns focus here when it closes; unmounting the
                                             * trigger at that exact moment (which is what gating
                                             * the render on `isBusy` did) drops focus to the
                                             * document and sends a keyboard reader to the top of
                                             * the page by their own confirmation.
                                             *
                                             * Nothing slips through: reopening the menu mid-flight
                                             * reaches a dialog whose Confirm is `disabled` while
                                             * `pending`.
                                             */
                                            aria-disabled={isBusy || undefined}
                                        />
                                    }
                                />
                                <ActionMenuContent>
                                    <ActionMenuItem
                                        data-testid="channel-mcn-partnership-leave"
                                        tone="destructive"
                                        onClick={() => setAsking('leave')}
                                    >
                                        {t('channel_mcn_leave')}
                                        <Icon
                                            name="logout-bracket"
                                            size={20}
                                            className="flex-none"
                                            aria-hidden="true"
                                        />
                                    </ActionMenuItem>
                                </ActionMenuContent>
                            </ActionMenu>
                        ) : undefined
                    }
                />
            </div>

            <div
                className={cn(
                    MCN_PARTNERSHIP_CONTAINER,
                    'flex flex-1 flex-col pb-6',
                    isWall && MCN_PARTNERSHIP_SCREEN,
                )}
            >
                {isWall ? (
                    <div className={cn('flex flex-1 flex-col', MCN_PARTNERSHIP_PANEL)}>{body}</div>
                ) : (
                    body
                )}
            </div>

            {/*
             * Both confirmations are mounted with the screen rather than beside the control that
             * opens them: the kebab disappears the moment a departure is scheduled, and a dialog
             * unmounted mid-transition by its own trigger is a dialog that cannot play its exit.
             *
             * The copy is `channel_mcn_*` — the same strings the About tab's card uses, deliberately
             * shared. Two screens asking the same question in two wordings is how a translation set
             * drifts, and the question really is the same one.
             */}
            <ConfirmDialog
                testId="channel-mcn-partnership-leave-confirm"
                open={asking === 'leave'}
                onOpenChange={open => setAsking(open ? 'leave' : null)}
                title={t('channel_mcn_leave')}
                description={t('channel_mcn_leave_description', { hours: 48 })}
                confirmLabel={t('channel_mcn_leave_confirm')}
                cancelLabel={t('common_close')}
                /*
                 * **Closed on press, not on success** — `ConfirmDialog` closes nothing by itself
                 * (its confirm button is only `disabled` while `pending`), so a caller that leaves
                 * it open is offering the same irreversible press again the moment the request
                 * settles. `follow-requests-view.tsx` states the rule and the reason: the mutation
                 * reports its own outcome by toast, and a dialog held open behind a spinner for a
                 * request that fails leaves the reader confirming twice.
                 */
                onConfirm={() => {
                    confirmLeave()
                    setAsking(null)
                }}
                pending={isBusy}
                destructive
            />
            <ConfirmDialog
                testId="channel-mcn-partnership-cancel-confirm"
                open={asking === 'cancel'}
                onOpenChange={open => setAsking(open ? 'cancel' : null)}
                title={t('channel_mcn_cancel_title')}
                description={t('channel_mcn_cancel_description')}
                confirmLabel={t('channel_mcn_leave_confirm')}
                cancelLabel={t('common_close')}
                onConfirm={() => {
                    cancelLeave()
                    setAsking(null)
                }}
                pending={isBusy}
            />
        </>
    )
}

/**
 * **Managed by MCN** — the network's mark, its name and the date the partnership began.
 *
 * ## The whole card is a link, and only when there is somewhere to go
 *
 * Legacy makes the row clickable unconditionally and `window.open`s `/@{slug}` — including when
 * `slug` is undefined, which opens `/@undefined` in a new tab. The slug comes from the organization
 * record, which is a second request that can be slow, empty or failed, so "there is no slug yet" is
 * an ordinary state and the card renders as a plain block then: no chevron, no pointer, nothing to
 * press. A press that goes nowhere is worse than an affordance that is absent.
 *
 * Same-tab `next/link` rather than `window.open`: `/@{slug}` is this app, and a new tab for an
 * in-app destination is a decision legacy made because its own page was a dead end.
 */
function ManagedByCard({
    name,
    thumb,
    slug,
    joinedAt,
    locale,
}: {
    name: string | null
    thumb: string | null
    slug: string | null
    joinedAt: string | null
    locale: string
}) {
    const { t } = useTranslation()
    const joined = formatJoinedDate(joinedAt, locale)

    const row = (
        <div className="flex min-w-0 items-center gap-3 p-3">
            <Avatar size="large" type={thumb ? 'image' : 'initials'}>
                {thumb ? (
                    <Image
                        src={thumb}
                        alt=""
                        width={48}
                        height={48}
                        /*
                         * **`unoptimized`**, for the reason `MiniAppMark` and `ProgramAvatar`
                         * both state: `next/image` *throws* on a host missing from
                         * `next.config.ts`'s `remotePatterns` rather than falling back to the
                         * raw image — one unexpected host takes the whole screen down in dev
                         * and 400s out of the optimizer in production. This URL comes from the
                         * **organization** service, which no other screen in this app calls, so
                         * its host has never been observed here. A 48px logo is not worth
                         * putting a creator's revenue split behind that bet.
                         */
                        unoptimized
                        className={avatarImageClass}
                    />
                ) : (
                    /* Legacy falls back to `'M'` for a network with no name at all; two letters is
                       what every other avatar in this app draws, and `Avatar`'s initials type brings
                       its own ground so the circle is never an empty ring. */
                    <AvatarInitials>
                        {(name ?? 'MCN').trim().slice(0, 2).toUpperCase()}
                    </AvatarInitials>
                )}
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
                <p className="type-body-default min-w-0 truncate text-(--text-title)">
                    {name ?? '—'}
                </p>
                {joined && (
                    <p className="type-dense-default text-(--text-subtitle)">
                        {t('mcn_partnership_since', { date: joined })}
                    </p>
                )}
            </div>
            {slug && (
                <Icon
                    name="angle-right"
                    size={24}
                    className="flex-none text-(--icon-secondary)"
                    aria-hidden="true"
                />
            )}
        </div>
    )

    return (
        <ChannelAboutCard className="overflow-hidden">
            <div className="border-(--separator-default) border-b p-3">
                <ChannelAboutCardTitle as="h2">
                    {t('mcn_partnership_managed_by')}
                </ChannelAboutCardTitle>
            </div>
            {/*
             * **The row is the link, not the card.** Legacy puts the press on the whole block,
             * header included, which makes the link's accessible name "Managed by MCN Sao Bắc Đẩu
             * Media Since …" — a heading read out as part of a destination. The header is a label
             * for the card, not part of where the press goes, so it stays outside.
             */}
            {slug ? (
                <Link
                    data-testid="channel-mcn-partnership-space"
                    href={`/@${slug}`}
                    className="block transition-colors hover:bg-(--background-subtle)"
                >
                    {row}
                </Link>
            ) : (
                row
            )}
        </ChannelAboutCard>
    )
}

/**
 * **Revenue split** — the two halves of the contract, and the caveat that they are applied after
 * Tevi's own cut.
 *
 * `null` prints an em dash rather than legacy's `0`, for the reason `ChannelAboutMcn` writes down at
 * length: a rate the backend did not send is not a 0% split, and this is the screen a creator reads
 * their terms off. Both columns stay in the DOM either way, so the rule between them holds the
 * centre line.
 */
function RevenueSplitCard({
    creatorRate,
    mcnRate,
}: {
    creatorRate: number | null
    mcnRate: number | null
}) {
    const { t } = useTranslation()

    return (
        <ChannelAboutCard>
            <div className="border-(--separator-default) border-b p-3">
                <ChannelAboutCardTitle as="h2">
                    {t('mcn_partnership_revenue_split')}
                </ChannelAboutCardTitle>
            </div>

            <dl className="flex items-center p-3">
                <Share label={t('mcn_partnership_your_share')} rate={creatorRate} />
                <div aria-hidden="true" className="h-8 w-px flex-none bg-(--separator-default)" />
                <Share label={t('mcn_partnership_mcn_share')} rate={mcnRate} />
            </dl>

            {/*
             * The fee caveat. Legacy tints it `gray.25` and paints the mark `#FFB800`; the DS pair
             * for "a note you should read, and it is not an error" is the warning tint block.
             *
             * ⚠ **The tint is warning; the sentence is not.** `--accents-warning-active` on
             * `--accents-warning-bg-active` measures **2.84** in Light — `docs/DESIGN_SYSTEM.md` §6b
             * is about exactly this, and its heading is the rule: the accent inks *are for marks*.
             * They also do not flip, so the pair only reads as broken at one end (5.81 in Dark),
             * which is why a dark-mode screenshot passes it. `--text-body` is **4.67 / 6.66**, and it
             * is what legacy actually paints this line (`gray.500` on `gray.25`, 5.50) as well as
             * what `FollowingLimitNotice` — the same feature's other warning notice — settled on for
             * the same reason. The **glyph** keeps the accent: that is the mark §6b means.
             */}
            <div className="px-3 pb-3">
                <p className="type-caption-meta flex items-start gap-2 rounded-(--radius-lg) bg-(--accents-warning-bg-active) p-2 text-(--text-body)">
                    <Icon
                        name="exclamation-triangle"
                        weight="filled"
                        size={16}
                        className="mt-px flex-none text-(--accents-warning-active)"
                        aria-hidden="true"
                    />
                    <span>{t('mcn_partnership_fees_note')}</span>
                </p>
            </div>
        </ChannelAboutCard>
    )
}

function Share({ label, rate }: { label: string; rate: number | null }) {
    const { t } = useTranslation()
    const value: string = rate === null ? '—' : t('channel_about_percent', { rate })

    return (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <dt className="type-dense-default text-center text-(--text-subtitle)">{label}</dt>
            <dd className="type-title-t2-semibold text-(--text-title)">{value}</dd>
        </div>
    )
}

/**
 * **Leave request is pending** — what a creator sees for the 48 hours between confirming and the
 * partnership actually ending, and the one control that can still stop it.
 *
 * Three parts, all legacy's: the sentence explaining that the network has been told; the deadline,
 * on the warning tint; and the note that only they can call it off, beside the button that does.
 *
 * The date is `formatActivityDateTime` — a localised date with a 24-hour clock, which is what this
 * app uses wherever a moment is a **deadline** rather than a historical fact. Legacy's
 * `dd MMM yyyy h:mm a` is a fixed pattern that reads wrong in six of the nine locales.
 */
function LeavePendingCard({
    departureAt,
    locale,
    busy,
    onCancel,
}: {
    departureAt: string | null
    locale: string
    busy: boolean
    onCancel: () => void
}) {
    const { t } = useTranslation()
    const deadline = formatActivityDateTime(departureAt, locale)

    return (
        <ChannelAboutCard>
            <div className="border-(--separator-default) border-b p-3">
                {/* `h2` like the other two cards, and `type-dense-strong` (14/600) rather than
                    their 16 — legacy sizes this one heading down, and it is the only block on the
                    screen that is a notice rather than a section of the contract. */}
                <h2 className="type-dense-strong text-(--text-title)">
                    {t('mcn_partnership_pending_title')}
                </h2>
            </div>

            <div className="flex flex-col gap-3 p-3">
                <p className="type-dense-default text-(--text-subtitle)">
                    {t('mcn_partnership_pending_body')}
                </p>

                {/* The deadline row is dropped rather than printed empty when the timestamp is
                    unreadable — `formatActivityDateTime` answers `''` for that, and "Auto-effect in"
                    with nothing after it is worse than the sentence above it alone. */}
                {deadline && (
                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-(--radius-md) bg-(--accents-warning-bg-active) px-2 py-1 text-(--accents-warning-active)">
                        <p className="type-dense-default flex min-w-0 items-center gap-2">
                            <Icon
                                name="clock"
                                weight="filled"
                                size={16}
                                className="flex-none"
                                aria-hidden="true"
                            />
                            <span className="truncate">{t('mcn_partnership_auto_effect_in')}</span>
                        </p>
                        <time
                            dateTime={departureAt ?? undefined}
                            className="type-dense-emphasis flex-none"
                        >
                            {deadline}
                        </time>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    {/*
                     * **The tint stays, the sentence does not take the accent** — the same
                     * correction as the fee caveat above, so the screen's two notes are one
                     * treatment rather than two.
                     *
                     * It shipped as `--accents-indigo-active` on the indigo tint: **3.62 in Light
                     * and 4.40 in Dark**, the only block on the screen failing AA in *both* modes,
                     * and the one that exists to be read. `--text-title` is
                     * `docs/DESIGN_SYSTEM.md` §6b's named pair for exactly this shape — a tinted
                     * note block, as `TwoStepVerificationDialog`'s reset note and
                     * `PayoutConfirmDialog`'s ETA strip both draw it — and measures **17.92 /
                     * 17.69**. The **glyph** keeps the accent: §6b's heading is that the accent inks
                     * are for marks.
                     *
                     * Legacy's own pair here is brand purple on `#EEE9F9`, and
                     * `--background-brand` / `--text-on-brand` would port that literally (5.98 /
                     * 4.99, §6a). Not taken: in Dark that tint is `--primary-400`, which put a block
                     * the same weight as the accent button beside it — measured on the comps' own
                     * layout, the note read as a second CTA. The hue this screen shipped is kept and
                     * only the ink is corrected.
                     */}
                    <p className="type-caption-meta flex flex-1 items-start gap-2 rounded-(--radius-lg) bg-(--accents-indigo-bg-active) p-3 text-(--text-title)">
                        <Icon
                            name="info-circle"
                            size={18}
                            className="mt-px flex-none text-(--accents-indigo-active)"
                            aria-hidden="true"
                        />
                        <span>{t('mcn_partnership_pending_note')}</span>
                    </p>
                    <Button
                        data-testid="channel-mcn-partnership-cancel"
                        /*
                         * `accent`, not `primary`: this is the block's call to action, and in this
                         * DS the accent is the CTA while `primary` is the neutral press. Legacy
                         * paints it `primary.500` — its brand purple — which is the same intent
                         * expressed in the palette it had.
                         */
                        variant="accent"
                        size="medium"
                        className="flex-none"
                        /*
                         * `aria-disabled` rather than `disabled`, the distinction this repo draws
                         * for a control that opens a dialog: the dialog returns focus here when it
                         * closes, and a `disabled` element cannot receive it — focus drops to the
                         * document and a keyboard reader is sent to the top of the page by their own
                         * confirmation. The press is refused below instead.
                         */
                        aria-disabled={busy || undefined}
                        onClick={() => {
                            if (busy) return
                            onCancel()
                        }}
                    >
                        {t('mcn_partnership_cancel_request')}
                    </Button>
                </div>
            </div>
        </ChannelAboutCard>
    )
}

/**
 * **Any question? Contact <network>** — legacy's footer line, and the only thing on this screen that
 * leaves the app.
 *
 * Rendered only when the organization record carried an address. Legacy renders the sentence
 * whenever it has *either* a `contact_url` or a `website`, the second of which that endpoint never
 * sends — so the fallback is dead code and is not reproduced.
 *
 * ## Two keys, because one sentence with a link in the middle of it cannot be translated
 *
 * Legacy has a single string, `Any question? Contact [%s]`, and renders it by **deleting** the
 * placeholder and appending the name as a link. That works in the seven languages whose placeholder
 * happens to sit at the end, and produces `질문이 있으신가요? 에게 문의하세요` in Korean — where the name
 * carries a postposition and belongs *inside* the clause. The same trap waits for any locale that
 * inflects.
 *
 * So the question and the link are separate strings, and the **link** carries the name
 * (`mcn_partnership_contact_link`, which is legacy's own second key `contact_s` — already
 * translated in all eight, Korean included). The link then reads `Contact <network>` rather than
 * the bare name, which is also the better accessible name for a destination.
 *
 * `rel="noopener noreferrer"` and a new tab: the destination is a URL the **backoffice** chose, so
 * it is outside this origin by assumption. `safeExternalUrl` is `features/mini-app`'s and cannot be
 * imported across the boundary; the check that matters here — that it is `http(s)` and not
 * `javascript:` — is done in place.
 */
function ContactLine({ name, url }: { name: string | null; url: string | null }) {
    const { t } = useTranslation()
    const safe = toExternalHref(url)
    if (!safe) return null

    return (
        <p className="type-dense-default flex flex-wrap items-center justify-center gap-1 py-2 text-center text-(--text-subtitle)">
            <span>{t('mcn_partnership_contact_question')}</span>
            <a
                data-testid="channel-mcn-partnership-contact"
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                className="type-dense-emphasis text-(--text-link) hover:underline"
            >
                {t('mcn_partnership_contact_link', {
                    name: name ?? t('mcn_partnership_managed_by'),
                })}
            </a>
        </p>
    )
}

/**
 * An absolute `http(s)` URL, or `null`.
 *
 * An `href` the backoffice wrote is a sink: `javascript:` there executes as us on a plain click,
 * with nothing to intercept. Parsing rather than pattern-matching, because `\tjavascript:…` and
 * `JaVaScRiPt:` both defeat a prefix test and neither defeats `new URL`.
 */
function toExternalHref(url: string | null): string | null {
    if (!url) return null
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
    } catch {
        return null
    }
}
