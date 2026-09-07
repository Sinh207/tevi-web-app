'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { PageBackBar } from '@features/navigation'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Trans } from 'react-i18next'
import type { McnInvitationAction } from '../api/invitation-api'
import { useMcnInvitation } from '../hooks/use-mcn-invitation'
import { formatActivityDateTime } from '../lib/channel-format'
import {
    MCN_INVITATION_CONTAINER,
    MCN_INVITATION_PANEL,
    MCN_INVITATION_SCREEN,
} from '../lib/container'
import { MCN_INVITATION_ART } from '../lib/illustrations'
import { formatRemaining, invitationRates, invitationRemainingMs } from '../lib/invitation-state'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelEmptyState } from './channel-empty-state'
import { McnInvitationSkeleton } from './mcn-invitation-skeleton'

/**
 * `/invitation/verify` — the letter a multi-channel network sends a creator, and the two answers to
 * it. A port of legacy's `containers/invitation`, block for block: hero band with the sender and the
 * date, the "Joining … network!" headline, the network's name with a help link, the revenue split as
 * two figures under a dashed rule, the letter itself, and a sticky footer carrying the commitment
 * notice over Agree and Reject.
 *
 * **It is not `/mcn-user-invitation/verify`**, which is the *manager* invitation: a different
 * endpoint (`user-invitations/`), a different query parameter (**`token`**, not `invite_token`) and
 * different copy. That screen is `McnUserInvitationView`, and the two are deliberately **not** one
 * component with a mode prop — this one has a hero band and a revenue split, that one has a bullet
 * list and two side-by-side buttons, so a shared component would switch on which screen is asking at
 * every level. What they *do* share is the state machine's shape, and each has its own copy of it for
 * the same reason.
 *
 * ## The whole screen is client code, and the bar belongs to it
 *
 * The invitation is read **as this bearer**, and there is no SSR bearer in this app by construction
 * (`shared/lib/api/token.ts`) — so nothing here can be server-rendered from data. The bar is in the
 * view rather than in `page.tsx` for the same reason `/mcn-partnership` puts it there: it is part of
 * one panel whose surface changes with the state, and a bar painted by the page would be a strip of
 * the wrong colour above it. Client components are still server-rendered, so the shell is in the
 * first paint either way.
 *
 * ## Seven states, and legacy renders three
 *
 * `mcnInvitationState` decides, and its docstring lists what legacy cannot say — chiefly that a
 * signed-out visitor and a visitor with no token both sit on the skeleton **forever**, and that a
 * 500 is reported as an expired link. This screen is reached from an *email*, which is the entry
 * point most likely to be opened in a browser with no session, so the first of those is not an edge
 * case.
 */
export function McnInvitationView({ token }: { token: string | null }) {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const { state, invitation, isBusy, pendingAction, canAnswer, answer, refresh } =
        useMcnInvitation(token)

    const name = invitation?.organization?.name ?? null
    const rates = invitationRates(invitation?.mcn_revenue_rate)

    const body =
        state === 'bootstrapping' || state === 'loading' ? (
            <McnInvitationSkeleton />
        ) : state === 'signed-out' ? (
            <ChannelEmptyState
                testId="channel-invitation-signed-out"
                className={cn('flex-1', RISE)}
                icon="envelope"
                title={t('mcn_invitation_signed_out_title')}
                body={t('mcn_invitation_signed_out_body')}
                action={
                    /* The action *is* the gate — `useRequireAuth` raises the dialog, and once there
                       is a real account this branch stops rendering on its own, so the callback has
                       nothing left to do. Same shape as `/mcn-partnership` and `/follow-requests`. */
                    <Button
                        data-testid="channel-invitation-sign-in"
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
                testId="channel-invitation-error"
                className={cn('flex-1', RISE)}
                icon="exclamation-diamond"
                tone="error"
                title={t('mcn_invitation_error_title')}
                body={t('mcn_invitation_error_body')}
                action={
                    <Button
                        data-testid="channel-invitation-retry"
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
         * than a shortcut: to the person holding the link, "the token is spent" and "the URL
         * arrived without one" are the same event — a link out of a mail that does not work — and
         * a second wording would only invite them to wonder which of the two happened.
         *
         * **One testid, and it is a literal.** A ternary over two ids was the first version, and it
         * is wrong twice: `scripts/build-testid-catalog.mjs` only reads literals, so neither id
         * reached `testids/CATALOG.md` — QC would have had two selectors that exist nowhere in the
         * document they are given — and `docs/TEST_IDS.md` forbids putting *state* in an id at all.
         * A test that needs to tell the two apart has the input to hand: the URL either carries an
         * `invite_token` or it does not.
         *
         * `-expired` and not `-invalid`: `invalid` is on `check-testids.mjs`'s `STATE_WORDS` list, so
         * it is a lint failure. Not a workaround — the word is the reason. This id names *the wall*,
         * which is a permanent piece of the screen, and a suffix that reads as a validity state is
         * exactly the ambiguity that list exists to stop.
         */
        state === 'invalid' || state === 'no-token' ? (
            <ChannelEmptyState
                testId="channel-invitation-expired"
                className={cn('flex-1', RISE)}
                art={MCN_INVITATION_ART.invalid}
                title={t('mcn_invitation_invalid_title')}
                action={
                    /*
                     * `render={<Link/>}` rather than an `onClick` that pushes: this is a
                     * navigation, so it should be a real anchor — middle-clickable, and reachable
                     * without our JavaScript. Legacy's `router.push('/')` is a button that looks
                     * like a link. `Button` derives `role="link"` from the render element, so it
                     * is announced as one too.
                     *
                     * 400px, which is the cap `ChannelEmptyState` puts on its body copy and what
                     * legacy sets on this button — a full-width CTA under a 227px illustration
                     * reads as a footer rather than as the thing to press.
                     */
                    <Button
                        data-testid="channel-invitation-home"
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
                <McnInvitationHero
                    name={name}
                    sentAt={invitation?.created_at ?? null}
                    locale={currentLanguage}
                />

                <div className="flex flex-col gap-[10px] p-3">
                    {/*
                     * The page's `h1` is `PageBackBar`'s title, so this is `h2`. Legacy renders it
                     * as a `<p>` and leaves the screen's only heading in the bar — which is a
                     * document outline with a title and no sections.
                     *
                     * `type-subheading-strong` is 18/600, legacy's exact size and weight. It is
                     * deliberately **not** `noWrap`: legacy sets `noWrap` on a line that
                     * interpolates a network's name, so anything longer than about 30 characters
                     * is truncated with the word "network!" cut off — on the sentence that says
                     * what the screen is for.
                     */}
                    <h2 className="type-subheading-strong text-(--text-title)">
                        {t('mcn_invitation_joining', {
                            name: name ?? t('mcn_partnership_managed_by'),
                        })}
                    </h2>

                    <McnInvitationNetworkChip name={name} />
                    {/* Withheld as a pair when the rate is unreadable — see `invitationRates`. */}
                    {rates.mcn !== null && rates.creator !== null && (
                        <McnInvitationRates creator={rates.creator} mcn={rates.mcn} />
                    )}
                    <McnInvitationLetter name={name} />
                </div>

                <McnInvitationFooter
                    createdAt={invitation?.created_at ?? null}
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
             * Unlike `/mcn-partnership` this does not switch on state: every state here is a single
             * panel, so the treatment is the same throughout — see `MCN_INVITATION_SCREEN`.
             *
             * Legacy paints it `#ffffff` below `md` and `#f4f4f4` above, which is the same intent in
             * the palette it had.
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
 * The hero band — a full-bleed illustration with the sender and the send time on a frosted strip
 * along its bottom edge.
 *
 * ## `next/image` with `object-cover`, not a CSS `background-image`
 *
 * Legacy uses the latter, and a CSS background is the one image kind **no** optimiser touches: not
 * `next/image`, not the loader, not `dangerouslyAllowSVG`. So every creator opening an invitation
 * downloaded the full **2.31 MB** source to fill a strip 172px tall. The committed WebP is 53 KB and
 * `object-cover` reproduces `background-size: cover` exactly, crop for crop — see
 * `MCN_INVITATION_ART` for why the file keeps the source's aspect instead of baking the crop in.
 *
 * `priority`, and this is the one place in this feature where it is right rather than lazy's default:
 * the band is the topmost element of the screen and unavoidably the Largest Contentful Paint, so
 * deferring it defers the only thing there is to look at. `ChannelEmptyState`'s note argues the
 * opposite for its own art, and the difference is exactly that — its art sits inside tabs, dialogs
 * and scrolled panels where it is not the LCP.
 *
 * ## The strip is pinned to Light, and the ink with it
 *
 * The ground under it is a fixed-colour illustration — a bright orange-to-purple gradient, identical
 * in both themes — so semantic ink would invert out from under it: `--text-title` is near-black in
 * Light and near-white in Dark, and white text on a white scrim is unreadable. `.theme-light`
 * re-declares the whole token layer for the subtree, which is the mechanism `globals.css` documents
 * for precisely this ("the one surface that ships its own light art"). Painting literals here instead
 * is what that block was written to stop.
 *
 * `--blur-md` (24px) for legacy's `blur(20px)`: the DS ships 16/24/32 and nothing in between, and
 * rounding up keeps the strip legible over the busiest part of the picture.
 *
 * ## ⚠ This block must never be reachable during SSR, and today it is not
 *
 * `formatActivityDateTime` formats in **local time on purpose** and its own note makes that a
 * contract with its callers: *"every caller is client-only … if one ever does [render on the server],
 * it needs a pinned zone or a mount guard, or it reintroduces exactly the mismatch the joined date
 * just had."* This component is inside a `'use client'` tree, which is still server-rendered — so the
 * guard has to come from somewhere, and it comes from the state machine: there is **no SSR bearer**
 * in this app, so on the server `isAuthenticated` is false and `mcnInvitationState` answers
 * `bootstrapping` or `signed-out`. `ready` is unreachable there, and this function is only called
 * under `ready`.
 *
 * That is a real guard but an *implicit* one, so it is written down: seeding this screen from the
 * server — a prefetch, an RSC-rendered invitation — would put a server-zone timestamp in the HTML and
 * a local-zone one in the browser, and the symptom is a hydration warning on a line nobody would
 * suspect. Pin the zone first if that day comes.
 *
 * One deliberate divergence: legacy prints the date and the time as **two stacked lines** (`fDate`
 * over `fTime`). One line here, because `formatActivityDateTime` is the formatter this feature
 * already uses for exactly this — "when did this arrive" beside a name — and two locale-formatted
 * halves stacked in a 172px band is a second layout to keep working in nine languages for no
 * information gained.
 */
export function McnInvitationHero({
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
        <div className="relative h-[172px] w-full flex-none overflow-clip">
            <Image
                src={MCN_INVITATION_ART.hero.src}
                /* Decorative: it is a gradient with two mascots on it and says nothing the
                   headline under it does not. An `alt` would have a reader announce it first. */
                alt=""
                fill
                sizes="(min-width: 900px) 612px, 100vw"
                className="object-cover"
                priority
            />
            <div
                className={cn(
                    'theme-light absolute inset-x-0 bottom-0',
                    'flex items-center justify-between gap-3 px-6 py-2',
                    'bg-(--background-surface)/40 backdrop-blur-[var(--blur-md)]',
                )}
            >
                <div className="flex min-w-0 flex-col">
                    <p className="type-caption-meta text-(--text-subtitle)">
                        {t('mcn_invitation_from')}
                    </p>
                    {/* `truncate`, which legacy also does here — and the one place it is right on
                        this screen: the sender's name is a label in a fixed-width strip beside a
                        timestamp, not a sentence that has to be readable in full. */}
                    <p className="type-body-strong truncate text-(--text-title)">
                        {name ?? t('mcn_partnership_managed_by')}
                    </p>
                </div>
                {/* Dropped rather than printed empty when the timestamp is unreadable —
                    `formatActivityDateTime` answers `''` for that, and legacy's `fDate`/`fTime`
                    pair renders the words "Invalid Date" instead. */}
                {sent && (
                    <time
                        dateTime={sentAt ?? undefined}
                        className="type-caption-label flex-none text-end text-(--text-subtitle)"
                    >
                        {sent}
                    </time>
                )}
            </div>
        </div>
    )
}

/**
 * Where the support article on MCNs lives.
 *
 * Legacy's own URL from this screen, verbatim — the *other* invitation screen points at a different
 * article on the newer support portal, and normalising the two is a content decision rather than a
 * port. A constant rather than a literal in the JSX because it is the kind of string that gets
 * copy-pasted into a second call site and then only half-updated.
 */
const MCN_SUPPORT_ARTICLE =
    'https://support.tevi.com/hc/en-us/articles/10131445862287-What-is-an-MCN-Multi-Channel-Network-on-Tevi'

/**
 * **MCN name: …**, with the help link at its trailing edge.
 *
 * `--background-brand` / `--text-on-brand` for legacy's `#EEE9F9` on `#080313`. The token pair is one
 * rung darker than legacy's fill (`--primary-200`, `#d9c7fb`, against `#EEE9F9`) and that is the
 * trade `globals.css` already made for `--background-brand`: the value tracks the ramp, so it flips
 * to a dark purple in Dark mode with an ink that was measured against it — where a literal
 * `#EEE9F9` would stay near-white and take the text with it.
 *
 * The help control is a **link, not a button**. Legacy uses an `IconButton` that calls
 * `window.open`, which is a control with no href: it cannot be middle-clicked, copied, or reached by
 * anything that does not run our JavaScript, and it has no accessible name at all — the icon is the
 * whole content. This is an `<a>` with `rel="noopener noreferrer"` and the sentence as its label.
 */
export function McnInvitationNetworkChip({ name }: { name: string | null }) {
    const { t } = useTranslation()

    return (
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-(--radius-md) bg-(--background-brand) px-3 py-2">
            <p className="type-dense-emphasis flex min-w-0 flex-wrap items-center gap-1 text-(--text-on-brand)">
                <span>{t('mcn_invitation_mcn_name')}</span>
                <span className="type-dense-strong min-w-0 break-words">
                    {name ?? t('mcn_partnership_managed_by')}
                </span>
            </p>
            <a
                data-testid="channel-invitation-learn-more"
                href={MCN_SUPPORT_ARTICLE}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('mcn_invitation_learn_more')}
                title={t('mcn_invitation_learn_more')}
                /*
                 * `hover:opacity-70` rather than a hover *background*. Every background token in the
                 * DS is defined against the page or a surface, and the ground here is
                 * `--background-brand` — so a grey wash would read as a hole in the chip in Light and
                 * as a lighter patch in Dark. Opacity is the one treatment that is correct on a
                 * tinted ground without a token of its own.
                 */
                className="flex size-10 flex-none items-center justify-center rounded-[var(--radius-fill)] text-(--text-on-brand) transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                <Icon name="question-circle" size={20} className="size-5" aria-hidden="true" />
            </a>
        </div>
    )
}

/**
 * The revenue split — two figures inside a dashed frame, the creator's first.
 *
 * ## 24/700, where legacy sets 28
 *
 * The DS type ramp has no 28: it steps 20 → 24 → 32, and `CLAUDE.md` forbids setting a `font-size`
 * by hand. `type-title-t1-bold` (24/700) is the step below and keeps the weight, which is what makes
 * these read as the screen's headline figures. The alternative — 32 — is larger than the headline
 * above them and would make the split shout over the sentence explaining it.
 *
 * ## The dashed frame is `--background-brand` as a **border**
 *
 * Legacy's `1px dashed #DCD1F2`, and `--primary-200` is `#d9c7fb` — the nearest rung, and the same
 * one the chip above fills with. Two different elements using one tint reads correctly: a filled row
 * and a dashed outline are not competing for the same job.
 *
 * `--text-title` on the figures and `--text-subtitle` on their labels, so the pair inverts properly.
 * Legacy's `#1A1A1A` / `#858585` is the same relationship in fixed hexes.
 */
export function McnInvitationRates({ creator, mcn }: { creator: number; mcn: number }) {
    const { t } = useTranslation()

    return (
        <dl
            data-testid="channel-invitation-rates"
            className="flex items-stretch justify-evenly rounded-(--radius-md) border border-(--background-brand) border-dashed px-3 py-2"
        >
            {(
                [
                    ['creator', t('mcn_invitation_creator_rate'), creator],
                    ['mcn', t('mcn_invitation_mcn_rate'), mcn],
                ] as const
            ).map(([key, label, value]) => (
                <div
                    key={key}
                    data-testid="channel-invitation-rate"
                    data-rate={key}
                    className="flex min-w-0 flex-col items-center"
                >
                    <dt className="type-dense-emphasis text-center text-(--text-subtitle)">
                        {label}
                    </dt>
                    {/*
                     * The digits are pinned LTR. In Arabic a bare `52.5%` is a number followed by a
                     * neutral, and the bidi algorithm can move the `%` to the leading edge — so the
                     * figure reads `%52.5`. `dir="ltr"` on the run keeps the pair together, which is
                     * what every other percentage in this app does.
                     */}
                    <dd dir="ltr" className="type-title-t1-bold text-(--text-title)">
                        {value}%
                    </dd>
                </div>
            ))}
        </dl>
    )
}

/**
 * The letter — greeting, the pitch, the deadline, the sign-off.
 *
 * ## `Trans`, because legacy uses `dangerouslySetInnerHTML`
 *
 * Legacy builds three of these lines by pushing `<span>`/`<b>` markup into a translated string and
 * handing the result to `innerHTML`. Two of those strings interpolate **the network's name**, which
 * is a value the backoffice types — so a network called `<img onerror=…>` renders as markup on a
 * screen behind a bearer. It is a small hole (the name is not reader-supplied) and it is still a
 * sink that does not need to exist.
 *
 * `<0>` / `<1>` placeholders let each locale put its own emphasis where its own grammar wants it,
 * and nothing is parsed as HTML. The `<b>` in legacy's strings maps to `<0>`; the `[%s]` it replaced
 * with a bold `<span>` maps to an interpolated value inside the same tag.
 *
 * ## The two numbers are the client's, and legacy hard-codes them too
 *
 * `3` days to respond and `60` days of commitment are literals in legacy's JSX, not fields on the
 * payload. They are passed as values rather than baked into the English so the sentences stay
 * translatable — but they are still **guesses about a contract** (**B100**): if the real response
 * window is 72 hours and the real lock-in is 30 days, this letter states terms the backend does not
 * enforce. The response window at least agrees with the countdown on the button (72h = 3 days),
 * which is the one internal consistency available to check.
 */
export function McnInvitationLetter({ name }: { name: string | null }) {
    const { t } = useTranslation()
    const { myChannel } = useMyChannel()
    const { currentUser } = useAuth()
    const network = name ?? t('mcn_partnership_managed_by')

    /**
     * **The reader's own name, not the network's** — legacy reads `myChannel.name` here, and this is
     * the one line on the screen that is about the person rather than about the offer.
     *
     * `/me`'s display name is the fallback, because the two answer at different times: the invitation
     * arrives from its own query while `my-channel/` is still in flight, and a letter that reads
     * "Dear ," for a beat is worse than one addressed by the account's name. `null` when neither is
     * known, and then the line is **dropped** rather than printed empty — legacy renders
     * `Dear undefined,` in exactly that window.
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
             * first in every language. Korean's own word for it is the honorific **suffix** `님께`,
             * so legacy renders "님께 {name}," — the two halves in the wrong order. Arabic's string
             * already carries `[%s]` in the middle of it, which is the same problem seen from the
             * side that noticed. Interpolating into one sentence lets each locale place the name.
             */}
            {reader && (
                <p className="type-dense-strong text-(--text-title)">
                    {t('mcn_invitation_greeting', { name: reader })}
                </p>
            )}

            <p>
                <Trans
                    i18nKey="mcn_invitation_intro"
                    values={{ name: network }}
                    components={[<b key="0" className="text-(--text-title)" />]}
                />
            </p>
            <p>
                <Trans
                    i18nKey="mcn_invitation_respond"
                    values={{ days: 3 }}
                    components={[<b key="0" className="text-(--text-title)" />]}
                />
            </p>
            <p>{t('mcn_invitation_welcome')}</p>

            <p className="flex flex-col">
                <span>{t('mcn_invitation_regards')}</span>
                <span className="type-dense-strong text-(--text-title)">{network}</span>
            </p>
        </div>
    )
}

/**
 * The footer — the commitment notice over Agree and Reject, **sticky to the bottom of the viewport**.
 *
 * Legacy pins it the same way, and the reason holds: the letter is long enough to scroll on a phone,
 * and the two answers are the only reason the screen exists. Its `bottom` offset for the mobile tab
 * bar is dropped rather than ported — `/invitation/verify` is not a tab destination, so
 * `TabBarShell` draws no bar and reserves no space here (`(main)/layout.tsx`), and an offset for
 * chrome that is not there is 56px of surface hanging below the buttons.
 *
 * Opaque and in the panel's own colour, because the letter scrolls under it.
 *
 * The ticking clock lives in `AgreeLabel`, not here — see that component for why the second is a
 * component boundary rather than a piece of state on this one.
 */
export function McnInvitationFooter({
    createdAt,
    canAnswer,
    isBusy,
    pendingAction,
    onAnswer,
}: {
    createdAt: string | null
    canAnswer: boolean
    isBusy: boolean
    pendingAction: McnInvitationAction | null
    onAnswer: (action: McnInvitationAction) => void
}) {
    const { t } = useTranslation()

    return (
        <div
            className={cn(
                'sticky bottom-0 z-10 mt-auto flex flex-col gap-4 px-3 pt-2 pb-6',
                MCN_INVITATION_SCREEN,
                // From `md` the panel is the surface, so the footer has to be too — the class above
                // hands the page colour back at that breakpoint and would show a grey band inside
                // a white card.
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
                    <Trans
                        i18nKey="mcn_invitation_commitment"
                        values={{ days: 60 }}
                        components={[
                            <b key="0" className="text-(--text-title)" />,
                            <b key="1" className="text-(--text-title)" />,
                        ]}
                    />
                </span>
            </p>

            <div className="flex flex-col gap-2">
                <Button
                    data-testid="channel-invitation-accept"
                    /*
                     * `accent`, not `primary`: in this DS the accent is the call to action and
                     * `primary` is the neutral press. Legacy paints it `primary.500` — its brand
                     * purple — which is the same intent in the palette it had.
                     */
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={!canAnswer || isBusy}
                    aria-busy={pendingAction === 'accept' || undefined}
                    onClick={() => onAnswer('accept')}
                >
                    {/* The clock is in the label, as legacy has it. Its own component — it ticks. */}
                    <AgreeLabel createdAt={createdAt} />
                    {pendingAction === 'accept' ? (
                        <Loader className="size-5 [&>span]:bg-current" />
                    ) : null}
                </Button>
                <Button
                    data-testid="channel-invitation-reject"
                    /*
                     * `ghost` + `--text-error` — legacy's `variant='text'` with its `#B3261E` ink,
                     * mapped onto the DS's own error token.
                     *
                     * **Not `destructive`**: that variant is a filled red block, far too much weight
                     * for the quieter of two answers on a screen whose subject is a contract.
                     * `ghost` is what a legacy text button maps to, and the ink is the same token
                     * `ActionMenuItem tone="destructive"` already paints its rows with — so the two
                     * destructive-text surfaces in this app agree.
                     *
                     * ⚠ **It measures 3.60:1 on the panel in Light** (4.92 in Dark), against the 4.5
                     * a 16px label needs. That is not a defect of this button: `--text-error` is
                     * `--accents-error-active`, which `globals.css` never redefines under `.dark`, so
                     * *every* error sentence and every destructive menu row in the app sits on the
                     * same ratio against a light ground. `docs/DESIGN_SYSTEM.md` §6b has the sweep and
                     * the standing decision in writing — *"not one to make screen by screen, which is
                     * why nothing above was changed locally"* — and this pair is literally its
                     * "failure line, bare" row (3.60 L). An earlier pass here dropped the red to pass
                     * the ratio; that was the per-screen deviation §6b rules out, and it also lost the
                     * only thing distinguishing the two answers by anything but position.
                     */
                    variant="ghost"
                    className="text-(--text-error)"
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
            </div>
        </div>
    )
}

/**
 * The Agree button's label — **its own component, because it changes once a second.**
 *
 * ## The second is a component boundary
 *
 * Held as state on `McnInvitationFooter`, the tick re-rendered the whole footer at 1 Hz: the commitment
 * sentence through `Trans` (a translation lookup and an element tree per second), both `Button`s and
 * their `cva` class computation, for a string in one of them. DoD §6 asks for no unnecessary
 * re-renders, and this is the cheapest possible fix — React re-renders the subtree that owns the
 * state, so moving the state down *is* the memoisation.
 *
 * ## No interval at all when there is nothing to count
 *
 * `created_at` is nullable (**B100**), and `invitationRemainingMs` answers `null` for a timestamp it
 * cannot read. So an unreadable one used to start a 1 Hz timer whose every tick produced the same
 * label. The effect is gated on `createdAt`, so that case now costs nothing and the button simply
 * reads **Agree**.
 *
 * ## Painted only after mount, and that is a correctness rule
 *
 * It reads the clock, so a value in the server-rendered HTML is one the browser recomputes a moment
 * later — a hydration mismatch on a string that changes every second. `now` starts `null` and the
 * first reading lands in the effect, so the first paint is the plain **Agree** label.
 * `invitationRemainingMs` takes `now` as an argument precisely so this stays the caller's decision
 * rather than a hidden `Date.now()`.
 *
 * The timer is deliberately **not** stopped at zero: the label informs rather than gates
 * (`canAnswerInvitation` says why), so a run-out invitation keeps showing `00:00:00` — legacy's
 * behaviour, and honest about a window this client only guesses at.
 */
function AgreeLabel({ createdAt }: { createdAt: string | null }) {
    const { t } = useTranslation()
    const [now, setNow] = useState<number | null>(null)

    useEffect(() => {
        if (!createdAt) return
        setNow(Date.now())
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [createdAt])

    const remaining = now === null ? null : formatRemaining(invitationRemainingMs(createdAt, now))

    /*
     * `whitespace-nowrap` comes from `Button`'s own base class, which is what keeps
     * "Agree [71:59:03]" from wrapping between the word and the digits.
     */
    return remaining
        ? t('mcn_invitation_agree_timer', { time: remaining })
        : t('mcn_invitation_agree')
}
