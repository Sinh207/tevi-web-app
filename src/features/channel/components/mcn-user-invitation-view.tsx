'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { PageBackBar } from '@features/navigation'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { Trans } from 'react-i18next'
import {
    type McnUserInvitationAction,
    USER_INVITATION_WINDOW_HOURS,
} from '../api/user-invitation-api'
import { useMcnUserInvitation } from '../hooks/use-mcn-user-invitation'
import { formatActivityDateTime } from '../lib/channel-format'
import {
    MCN_INVITATION_CONTAINER,
    MCN_INVITATION_PANEL,
    MCN_INVITATION_SCREEN,
} from '../lib/container'
import { MCN_INVITATION_ART } from '../lib/illustrations'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelEmptyState } from './channel-empty-state'
import { McnUserInvitationSkeleton } from './mcn-user-invitation-skeleton'

/**
 * `/mcn-user-invitation/verify` — the letter a multi-channel network sends somebody it wants as a
 * **manager**, and the two answers to it. A port of legacy's `containers/mcnUserInvitation`, block
 * for block: the tinted sender strip with the send time, the "Invitation to join … as a manager"
 * headline, the support link, the letter with its two bullets, and a sticky footer carrying the
 * expiry notice over Reject and Accept.
 *
 * **It is not `/invitation/verify`**, which is legacy's *creator* invitation on a different endpoint
 * with a different query parameter (`invite_token`, not `token`) and different copy — a revenue
 * split, a 72-hour countdown in the button, and a 60-day commitment. Nothing about a manager is
 * commercial, so none of that appears here.
 *
 * ## What is shared with that screen, and what is not
 *
 * The **geometry** is shared, deliberately: `MCN_INVITATION_CONTAINER` / `_SCREEN` / `_PANEL`, the
 * expired-link art, and the sign-in / error / expired walls. The two screens are the same object
 * seen twice — one document, hero to buttons, reached from an email — and `docs/DESIGN_SYSTEM.md` §6
 * calls that a single panel; two features' worth of near-identical constants would drift on the
 * first tweak to either. What is *not* shared is anything carrying a number or a promise: the
 * schema, the query keys, the state machine's input type, and every sentence.
 *
 * ## The whole screen is client code, and the bar belongs to it
 *
 * The invitation is read **as this bearer**, and there is no SSR bearer in this app by construction
 * (`shared/lib/api/token.ts`) — so nothing here can be server-rendered from data. The bar is in the
 * view rather than in `page.tsx` because it is part of one panel whose surface it has to match; a bar
 * painted by the page would be a strip of the wrong colour above it. Client components are still
 * server-rendered, so the shell is in the first paint either way.
 *
 * ## Seven states, and legacy renders three
 *
 * `mcnUserInvitationState` decides, and its docstring lists what legacy cannot say — chiefly that a
 * signed-out visitor and a visitor with no token both sit on the skeleton **forever**, and that a
 * 500 is reported as an expired link. This screen is reached from an *email*, which is the entry
 * point most likely to be opened in a browser with no session, so the first of those is not an edge
 * case.
 *
 * Harness: **`/dev/mcn-user-invitation`** — the only way to look at any of this, since the real
 * screen needs a network to email you a token. It is not `/dev/mcn-invitation`, which is the
 * creator screen's.
 */
export function McnUserInvitationView({ token }: { token: string | null }) {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const { state, invitation, isBusy, pendingAction, canAnswer, answer, refresh } =
        useMcnUserInvitation(token)

    const name = invitation?.organization?.name ?? null

    /*
     * ## The strings the two invitation screens share are shared as **keys**, not copied
     *
     * The bar's title, `From`, the greeting, `Reject`, the expired-link sentence, the Back to Home
     * button, the sign-in and error walls' copy, and the two toasts. In legacy every one of those is
     * byte-identical between the two screens — its `NoData` is one component's words and its two top
     * bars carry the same three — so a second key for each would be another thirteen strings in nine
     * locales that must never diverge. Nine locales drifting apart on wording nobody meant to differ
     * is exactly how a port grows two vocabularies for one thing.
     *
     * What is *not* shared is every sentence that says something about being a **manager**: the
     * headline, the letter, the two bullets and the expiry notice. Those are this screen's alone,
     * because their subject is.
     */
    const body =
        state === 'bootstrapping' || state === 'loading' ? (
            <McnUserInvitationSkeleton />
        ) : state === 'signed-out' ? (
            <ChannelEmptyState
                testId="channel-manager-invitation-signed-out"
                className={cn('flex-1', RISE)}
                icon="send"
                title={t('mcn_invitation_signed_out_title')}
                body={t('mcn_invitation_signed_out_body')}
                action={
                    /* The action *is* the gate — `useRequireAuth` raises the dialog, and once there
                       is a real account this branch stops rendering on its own, so the callback has
                       nothing left to do. Same shape as the creator invitation and
                       `/mcn-partnership`. */
                    <Button
                        data-testid="channel-manager-invitation-sign-in"
                        variant="accent"
                        size="large"
                        onClick={requireAuth(() => undefined)}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />
        ) : state === 'error' ? (
            <ChannelEmptyState
                testId="channel-manager-invitation-error"
                className={cn('flex-1', RISE)}
                icon="exclamation-diamond"
                tone="error"
                title={t('mcn_invitation_error_title')}
                body={t('mcn_invitation_error_body')}
                action={
                    <Button
                        data-testid="channel-manager-invitation-retry"
                        variant="secondary"
                        size="large"
                        onClick={() => void refresh()}
                    >
                        {t('common_retry')}
                    </Button>
                }
            />
        ) : /*
         * `invalid` **and** `no-token` land here, and sharing one wall is the right answer rather
         * than a shortcut: to the person holding the link, "the token is spent" and "the URL arrived
         * without one" are the same event — a link out of a mail that does not work — and a second
         * wording would only invite them to wonder which of the two happened. Legacy has exactly one
         * `NoData` for both.
         *
         * `-expired` and not `-invalid`: `invalid` is on `check-testids.mjs`'s `STATE_WORDS` list, so
         * it is a lint failure — and the word is the reason rather than the obstacle. This id names
         * *the wall*, a permanent piece of the screen, and a suffix that reads as a validity state is
         * exactly the ambiguity that list exists to stop.
         */
        state === 'invalid' || state === 'no-token' ? (
            <ChannelEmptyState
                testId="channel-manager-invitation-expired"
                className={cn('flex-1', RISE)}
                art={MCN_INVITATION_ART.invalid}
                title={t('mcn_invitation_invalid_title')}
                action={
                    /*
                     * `render={<Link/>}` rather than an `onClick` that pushes: this is a navigation,
                     * so it should be a real anchor — middle-clickable, and reachable without our
                     * JavaScript. Legacy's `router.push('/')` is a button that looks like a link.
                     * `Button` derives `role="link"` from the render element, so it is announced as
                     * one too.
                     *
                     * 400px, which is `ChannelEmptyState`'s cap on its body copy and legacy's own
                     * `maxWidth` on this button — a full-width CTA under a 227px illustration reads
                     * as a footer rather than as the thing to press.
                     */
                    <Button
                        data-testid="channel-manager-invitation-home"
                        variant="accent"
                        size="large"
                        fullWidth
                        className="max-w-[400px]"
                        render={<Link href="/" />}
                    >
                        {t('mcn_invitation_back_home')}
                    </Button>
                }
            />
        ) : (
            <div className={cn('flex flex-1 flex-col', RISE)}>
                <McnUserInvitationSenderStrip
                    name={name}
                    sentAt={invitation?.created_at ?? null}
                    locale={currentLanguage}
                />

                <div className="flex flex-col gap-[10px] p-3">
                    {/*
                     * The page's `h1` is `PageBackBar`'s title, so this is `h2`. Legacy renders it as
                     * a `<p>` and leaves the screen's only heading in the bar — a document outline
                     * with a title and no sections.
                     *
                     * `type-title-t2-bold` is 20/700, legacy's **mobile** size and weight. Its
                     * `md`/`lg` step to 24 is dropped rather than ported: the `.type-*` utilities are
                     * plain CSS in `globals.css`'s `@layer components`, not Tailwind utilities, so a
                     * `md:type-title-t1-bold` variant is not generated and would silently do nothing
                     * — and a hand-written `font-size` is what `CLAUDE.md` forbids. 20 at every width
                     * is also what keeps this headline from out-shouting the creator screen's, which
                     * is 18.
                     *
                     * Deliberately **not** `noWrap`: legacy sets it on a line that interpolates a
                     * network's name, so anything longer than about 30 characters is truncated with
                     * the words "as a manager" cut off — on the sentence that says what the screen
                     * is for.
                     */}
                    <h2 className="type-title-t2-bold break-words text-(--text-title)">
                        {t('mcn_user_invitation_headline', {
                            name: name ?? t('mcn_partnership_managed_by'),
                        })}
                    </h2>

                    <McnUserInvitationSupportLink />
                    <McnUserInvitationLetter name={name} />
                </div>

                <McnUserInvitationFooter
                    canAnswer={canAnswer}
                    isBusy={isBusy}
                    pendingAction={pendingAction}
                    onAnswer={answer}
                />
            </div>
        )

    return (
        <>
            {/*
             * Sticky, opaque, and painted in the screen's own colour — which below `md` is the panel
             * surface, because the letter scrolls *under* this bar and a page-coloured strip over a
             * full-bleed surface is a band of the wrong colour above the content. From `md` the same
             * class returns to the page colour and the panel becomes a card under it.
             *
             * Legacy paints it `#ffffff` below `md` and `#f4f4f4` above, which is the same intent in
             * the palette it had.
             *
             * The title is `mcn_invitation_title` — **the creator screen's key**, because legacy's
             * two bars carry the same three words ("MCN Invitation"). One key rather than two
             * identical ones: a copy change to either bar is a change to both, and nine locales
             * would otherwise drift apart on a string nobody meant to differ.
             */}
            <div className={cn('sticky top-0 z-20', MCN_INVITATION_SCREEN)}>
                <PageBackBar
                    title={t('mcn_invitation_title')}
                    className={MCN_INVITATION_CONTAINER}
                />
            </div>

            <div
                className={cn(
                    MCN_INVITATION_CONTAINER,
                    MCN_INVITATION_SCREEN,
                    'flex flex-1 flex-col',
                )}
            >
                <div
                    className={cn('flex flex-1 flex-col', MCN_INVITATION_PANEL)}
                    aria-busy={state === 'loading' || state === 'bootstrapping' || undefined}
                >
                    {body}
                </div>
            </div>
        </>
    )
}

/**
 * The sender strip — who it is from, and when it was sent, on a tinted band across the top.
 *
 * ## The tint is the DS success surface, not legacy's `#f2fff7`
 *
 * Legacy paints a fixed pale green. Kept as a literal it would stay pale green in Dark mode with
 * `--text-title` — near-white — printed on it, which is the failure mode `globals.css` documents for
 * hard-coded grounds. `--accents-success-bg-active` is the DS's own success surface (`#e6f9e6` in
 * Light, one rung deeper than legacy's and the value every other success ground in this app uses),
 * and `dark:bg-(--accents-success-bg-focus)` is the pairing `payout-confirm-dialog.tsx` already
 * settled: in Dark, `bg-active` (`#082608`) is **1.09:1** against the panel surface, i.e. no band at
 * all, where `bg-focus` (`#104c10`) is 1.74 — the same figure `ledger-detail-dialog.tsx` cites for
 * this token pair.
 *
 * Measured, because a 12px label on a tint is exactly where this goes wrong quietly:
 *
 * | | title (16/600) | subtitle (12) |
 * |---|---|---|
 * | Light, on `#e6f9e6` | 18.06:1 | **9.48:1** |
 * | Dark, on `#104c10` | 10.18:1 | **6.89:1** |
 *
 * Legacy's own pairing — `#858585` on `#f2fff7` — is **3.59:1** on a 12px label, so it fails AA
 * today; this is not a cosmetic re-tint. ⚠ Do not "harmonise" the label to `--text-body`: that ink
 * is `--zinc-500` and lands at **4.39:1** on this ground, just under the 4.5 it needs.
 *
 * The **ink** is semantic — `--text-title` and `--text-subtitle` — precisely because the ground now
 * flips with the theme. That is the opposite of the creator screen's hero, which pins itself to
 * `.theme-light` because its ground is a fixed-colour illustration; the rule is the same one read
 * from both ends (`docs/DESIGN_SYSTEM.md`, and the `--text-on-brand` note in `globals.css`).
 *
 * Green, and not the brand tint, because legacy chose green and this is a port. It is also the
 * screen's only colour: there is no illustration here at all, so nothing is competing with it.
 */
export function McnUserInvitationSenderStrip({
    name,
    sentAt,
    locale,
}: {
    name: string | null
    sentAt: string | null
    locale: string
}) {
    const { t } = useTranslation()
    const sent = formatActivityDateTime(sentAt, locale)

    return (
        <div
            className={cn(
                'flex items-start justify-between gap-3 px-3 py-3',
                'border-(--separator-default) border-b',
                'bg-(--accents-success-bg-active) dark:bg-(--accents-success-bg-focus)',
            )}
        >
            <div className="flex min-w-0 flex-col">
                <p className="type-caption-label text-(--text-subtitle)">
                    {t('mcn_invitation_from')}
                </p>
                {/* `truncate`, which legacy also does here — and the one place it is right on this
                    screen: the sender's name is a label in a fixed-width strip beside a timestamp,
                    not a sentence that has to be readable in full. */}
                <p className="type-body-strong truncate text-(--text-title)">
                    {name ?? t('mcn_partnership_managed_by')}
                </p>
            </div>
            {/* Dropped rather than printed empty when the timestamp is unreadable —
                `formatActivityDateTime` answers `''` for that, and legacy's `fDate`/`fTime` pair
                renders the words "Invalid Date" instead.

                One line where legacy stacks the date over the time in two `<Typography>`s: this is
                one instant, so it is one `<time>` with one `dateTime`, and splitting it would give a
                screen reader two fragments to reassemble. */}
            {sent && (
                <time
                    dateTime={sentAt ?? undefined}
                    className="type-caption-label flex-none text-end text-(--text-subtitle)"
                >
                    {sent}
                </time>
            )}
        </div>
    )
}

/**
 * Where the support article on MCNs lives — **legacy's URL from this screen, verbatim**.
 *
 * It is deliberately *not* the creator screen's link: legacy points the two screens at two different
 * articles on two different support portals, and normalising them is a content decision rather than
 * a port. A constant rather than a literal in the JSX because it is the kind of string that gets
 * copy-pasted into a second call site and then only half-updated.
 */
const MCN_SUPPORT_ARTICLE =
    'https://support.tevi.com/portal/en/kb/articles/multi-channel-network-mcn-overview-for-tevi-creators'

/**
 * "Click to learn more about Tevi MCN" — a full-width centred link under the headline.
 *
 * Legacy renders a `next/link` whose `style` object carries `gap` and an `&:hover` selector, neither
 * of which does anything in an inline style — so the icon sits flush against the text and there is no
 * hover state at all. Both are real here.
 *
 * The glyph is the DS's `question-circle`, replacing legacy's inline 15-line path. It is
 * `aria-hidden`: the sentence beside it already says what the link does, and an announced icon would
 * make the accessible name "circle question Click to learn more…".
 *
 * `--text-link` for legacy's `#007aff`, so it inverts with the theme, and `min-h-10` because it is
 * a touch target — 14px text with 8px of padding is a 37px row, and `docs/DEFINITION_OF_DONE.md`
 * §4 asks for 40. Legacy's is 21px tall.
 */
export function McnUserInvitationSupportLink() {
    const { t } = useTranslation()

    return (
        <a
            data-testid="channel-manager-invitation-learn-more"
            href={MCN_SUPPORT_ARTICLE}
            target="_blank"
            rel="noopener noreferrer"
            className="type-dense-emphasis flex min-h-10 items-center justify-center gap-1 rounded-(--radius-md) px-3 py-2 text-center text-(--text-link) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
            <Icon name="question-circle" size={16} className="flex-none" aria-hidden="true" />
            <span>{t('mcn_user_invitation_learn_more')}</span>
        </a>
    )
}

/**
 * The letter — greeting, what the network is asking, what being a manager means, and the invitation
 * to refuse it.
 *
 * ## `Trans`, because legacy interpolates a name into markup
 *
 * Legacy builds the second line out of nested `<Typography component='label'>` nodes around the
 * network's name, which is a value the backoffice types. Here the emphasis is a `<0>` placeholder, so
 * each locale puts it where its own grammar wants it and nothing is parsed as HTML.
 *
 * ## The two bullets are the contract, and they are quoted rather than paraphrased
 *
 * *Cannot join other MCN as a Creator* and *Can manage this MCN user according to their group
 * permission* are legacy's exact sentences — the second is awkward English and stays awkward, because
 * it is a statement about permissions somebody is agreeing to and "improving" it would be this
 * client inventing terms. Whether both still hold is **B101**'s open half; the copy is not the place
 * to hedge it.
 *
 * `list-disc` with `ps-6` rather than `marginInlineStart: 3` — a logical property either way, and the
 * repo's own scale.
 */
export function McnUserInvitationLetter({ name }: { name: string | null }) {
    const { t } = useTranslation()
    const { myChannel } = useMyChannel()
    const { currentUser } = useAuth()
    const network = name ?? t('mcn_partnership_managed_by')

    /**
     * **The reader's own name, not the network's** — legacy reads `currentUser.display_name` here,
     * and this is the one line on the screen that is about the person rather than about the offer.
     *
     * `myChannel.name` is preferred over it, and the creator screen does the same: a creator who has
     * renamed their space is known by that name everywhere else in the app, and the two answer at
     * different times so having both is what avoids a beat of "Dear ,". `null` when neither is known,
     * and then the line is **dropped** rather than printed empty — legacy renders `Dear undefined,`
     * in exactly that window.
     */
    const reader =
        myChannel?.name?.trim() ||
        (typeof currentUser?.display_name === 'string' ? currentUser.display_name.trim() : '') ||
        null

    return (
        <div className="type-dense-default flex flex-col gap-4 px-3 py-2 text-(--text-body)">
            {/*
             * One key for the whole greeting, not `Dear` + the name in two spans.
             *
             * Legacy prints the label and the name as separate nodes, which forces the label to come
             * first in every language. Korean's own word for it is the honorific **suffix** `님께`, so
             * legacy renders "님께 {name}," — the two halves in the wrong order. Interpolating into one
             * sentence lets each locale place the name. Shared with the creator screen, which reached
             * the same conclusion about the same string.
             */}
            {reader && (
                <p className="type-dense-strong text-(--text-title)">
                    {t('mcn_invitation_greeting', { name: reader })}
                </p>
            )}

            <p>
                <Trans
                    i18nKey="mcn_user_invitation_intro"
                    values={{ name: network }}
                    components={[<b key="0" className="text-(--text-title)" />]}
                />
            </p>

            <div className="flex flex-col gap-2">
                <p>{t('mcn_user_invitation_means')}</p>
                <ul className="m-0 flex list-disc flex-col gap-1 ps-6">
                    <li>{t('mcn_user_invitation_means_creator')}</li>
                    <li>{t('mcn_user_invitation_means_permission')}</li>
                </ul>
            </div>

            <p>{t('mcn_user_invitation_read_carefully')}</p>
        </div>
    )
}

/**
 * The footer — the expiry notice over Reject and Accept, **sticky to the bottom of the viewport**.
 *
 * Legacy pins it the same way, and the reason holds: the letter is long enough to scroll on a phone,
 * and the two answers are the only reason the screen exists. Its `bottom` offset for the mobile tab
 * bar is dropped rather than ported — `/mcn-user-invitation/verify` is not a tab destination, so
 * `TabBarShell` draws no bar and reserves no space here (`(main)/layout.tsx`), and an offset for
 * chrome that is not there is 56px of surface hanging below the buttons.
 *
 * Opaque and in the panel's own colour, because the letter scrolls under it.
 *
 * ## Two buttons in a **row**, and Reject leads
 *
 * Legacy's `<Stack direction='row'>`, in that order, and both are kept. The order is the load-bearing
 * half: this screen's own copy invites a refusal ("feel free to reject if you don't think this is
 * what you would agree on"), so the quieter answer is not hidden. The creator screen stacks its two
 * vertically because its accept label carries a live countdown and would wrap beside anything.
 *
 * There is **no countdown here at all**. Legacy states the window as a flat sentence and this does
 * the same — which is also the honest shape, since the 72 hours is the client's own number
 * (`USER_INVITATION_WINDOW_HOURS`, B101) and a live timer would present a guess as a deadline. It
 * also means nothing on this screen reads the clock, so there is no hydration mismatch to arrange
 * around.
 */
export function McnUserInvitationFooter({
    canAnswer,
    isBusy,
    pendingAction,
    onAnswer,
}: {
    canAnswer: boolean
    isBusy: boolean
    pendingAction: McnUserInvitationAction | null
    onAnswer: (action: McnUserInvitationAction) => void
}) {
    const { t } = useTranslation()

    return (
        <div
            className={cn(
                'sticky bottom-0 z-10 mt-auto flex flex-col gap-4 px-3 pt-2 pb-6',
                MCN_INVITATION_SCREEN,
                // From `md` the panel is the surface, so the footer has to be too — the class above
                // hands the page colour back at that breakpoint and would show a grey band inside a
                // white card.
                'md:bg-(--background-surface)',
            )}
        >
            <p className="type-caption-meta flex items-start gap-2 text-(--text-subtitle)">
                <Icon
                    name="exclamation-circle"
                    size={16}
                    className="mt-px flex-none"
                    aria-hidden="true"
                />
                <span>
                    {t('mcn_user_invitation_expiry_note', {
                        hours: USER_INVITATION_WINDOW_HOURS,
                    })}
                </span>
            </p>

            {/*
             * ⚠ **A grid, not a flex row**, and this is not a style preference: `Button`'s base
             * classes include **`shrink-0`**, so two `fullWidth` buttons side by side in a flex row
             * each want 100% of the container and neither may shrink — the row is 200% wide and the
             * trailing button sits off the screen's edge, where it cannot be pressed. It renders
             * plausibly (the visible half looks like a normal pair) and only a click finds it; the
             * e2e spec caught it as `<main> intercepts pointer events`.
             *
             * `grid-cols-2` makes each cell exactly half and `w-full` then fills its cell, with no
             * reliance on flex shrinking at all. Legacy's `<Stack direction='row'>` has no such trap
             * because MUI's Button is not `shrink-0`.
             */}
            <div className="grid grid-cols-2 gap-3">
                <Button
                    data-testid="channel-manager-invitation-reject"
                    /*
                     * `secondary`, for legacy's grey `#F2F2F2` fill with dark ink — which is what
                     * that variant *is* in this DS. Not `ghost`: legacy gives this button a visible
                     * ground because the two answers sit side by side and equal-weight, and a
                     * borderless one beside a filled one reads as a caption rather than a choice.
                     * (The creator screen's Reject *is* ghost, because there the two are stacked and
                     * the accent one leads.)
                     *
                     * Rejecting is not `destructive`: nothing of the reader's is deleted, and the DS
                     * variant is a filled red block — far too much weight for declining an offer.
                     */
                    variant="secondary"
                    size="large"
                    fullWidth
                    disabled={!canAnswer || isBusy}
                    aria-busy={pendingAction === 'reject' || undefined}
                    onClick={() => onAnswer('reject')}
                >
                    {t('mcn_invitation_reject')}
                    {pendingAction === 'reject' ? (
                        <Loader className="size-5 [&>span]:bg-current" />
                    ) : null}
                </Button>
                <Button
                    data-testid="channel-manager-invitation-accept"
                    /*
                     * `accent`, not `primary`: in this DS the accent is the call to action and
                     * `primary` is the neutral press. Legacy paints it with the theme's default
                     * `contained` button — its brand purple — which is the same intent in the palette
                     * it had.
                     */
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={!canAnswer || isBusy}
                    aria-busy={pendingAction === 'accept' || undefined}
                    onClick={() => onAnswer('accept')}
                >
                    {t('mcn_user_invitation_accept')}
                    {pendingAction === 'accept' ? (
                        <Loader className="size-5 [&>span]:bg-current" />
                    ) : null}
                </Button>
            </div>
        </div>
    )
}
