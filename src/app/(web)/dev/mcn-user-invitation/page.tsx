import { ChannelEmptyState } from '@features/channel'
import {
    MCN_INVITATION_ART,
    McnUserInvitationLetter,
    McnUserInvitationSenderStrip,
    McnUserInvitationSupportLink,
} from '@features/channel/dev'
import {
    MCN_INVITATION_CONTAINER,
    MCN_INVITATION_PANEL,
    MCN_INVITATION_SCREEN,
    McnUserInvitationSkeleton,
} from '@features/channel/skeleton'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { McnUserInvitationFooterPreview } from './preview'

export const metadata: Metadata = {
    title: 'MCN manager invitation',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/mcn-user-invitation/verify`'s blocks: `pnpm dev`, then open
 * /dev/mcn-user-invitation. 404s in production (`proxy.ts` stops the request; the `notFound()`
 * below is the belt to that braces).
 *
 * ## Why this screen needs a harness, given `/dev/mcn-invitation` already exists
 *
 * They are two screens, and only one thing they share is previewable in the other: the panel.
 * Everything the harness is *for* differs.
 *
 * - **The strip is the inverse case of the creator hero.** That one pins itself to `.theme-light`
 *   because its ground is fixed-colour art, and the thing to verify is that it does *not* invert.
 *   This one's ground is a token pair that does flip (`--accents-success-bg-active` →
 *   `dark:…-bg-focus`) under semantic ink, so the thing to verify is that it *does* — and that both
 *   inks stay legible on both grounds. Measured at 9.48:1 (Light) and 6.89:1 (Dark) on the 12px
 *   label; legacy's own pairing is 3.59:1 and fails AA. Numbers are in
 *   `McnUserInvitationSenderStrip`'s docstring; this page is where you look at them.
 * - **The two buttons sit side by side**, where the creator's are stacked — and that is where the
 *   one real defect in this screen lived: `Button` carries `shrink-0`, so two `fullWidth` buttons in
 *   a flex row overflow to 200% and the trailing one lands off the screen's edge, unpressable. It
 *   renders plausibly, which is why there is a **narrow-column section below**: the pair has to stay
 *   inside its container at 320px, and a grid is what guarantees it.
 * - **There is no countdown**, and the absence is the thing to see. Legacy states the 72 hours as a
 *   flat sentence, so nothing on this screen reads the clock (B101) — where the creator screen's
 *   Agree button carries a live `HH:MM:SS`.
 * - **The name fallback is visible here and nowhere else.** `organization.name` is nullable, and both
 *   invitation screens substitute `mcn_partnership_managed_by` — so a payload without a name renders
 *   *"Invitation to join Managed by MCN as a manager"*. That reads badly and is a **standing product
 *   question**, not a defect this screen invented; the section below exists so it can be looked at
 *   and decided rather than argued about in a docstring.
 *
 * ## What it deliberately does **not** preview
 *
 * `McnUserInvitationView` — the component that owns the query. `/dev/blocked-accounts` states the
 * rule this follows: *"a version of it that did not would be a second implementation of the screen
 * with its own drift."* So the harness composes the same blocks inside the same
 * `MCN_INVITATION_SCREEN` / `_PANEL` / `_CONTAINER` the real screen uses, and the walls and the
 * skeleton below are the shipped components with the shipped copy.
 *
 * Copy is **English literals**, not `t()` — every string here is a fixture label describing what is
 * being shown, and the blocks themselves translate their own. A dev page is not a locale surface.
 */

const NAME = 'Sao Bắc Đẩu Media'
/** The truncation case for the strip, which is the one place a long name is clipped on purpose. */
const LONG_NAME = 'A network whose name is long enough to need truncating in the sender strip'

/** 30 minutes ago — the ordinary case, and what the strip's date and time are read from. */
const SENT = new Date(Date.now() - 30 * 60 * 1000).toISOString()

function Section({
    title,
    note,
    children,
}: {
    title: string
    note?: string
    children: React.ReactNode
}) {
    return (
        <section className="flex flex-col gap-2">
            <h2 className="type-micro-overline text-(--text-body)">{title}</h2>
            {note && <p className="type-caption-meta text-(--text-subtitle)">{note}</p>}
            {children}
        </section>
    )
}

/** The blocks sit on the real screen's panel, so the surfaces are the ones that ship. */
function Panel({ children, width }: { children: React.ReactNode; width?: number }) {
    return (
        <div
            className={`${MCN_INVITATION_CONTAINER} ${MCN_INVITATION_SCREEN}`}
            style={width ? { maxWidth: width } : undefined}
        >
            <div className={`flex flex-col ${MCN_INVITATION_PANEL}`}>{children}</div>
        </div>
    )
}

export default function DevMcnUserInvitationPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">MCN manager invitation</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/channel` — the blocks of /mcn-user-invitation/verify, which needs an
                    MCN to email you a token. Not to be confused with /dev/mcn-invitation, which is
                    the *creator* invitation: different endpoint, different query parameter, a
                    revenue split and a countdown. Switch the theme — unlike that screen&rsquo;s
                    hero, this strip is supposed to follow it. Press Reject or Accept to watch the
                    pending state.
                </p>
            </header>

            <Section
                title="sender strip"
                note="--accents-success-bg-active, and dark:…-bg-focus because bg-active is 1.09:1 against the panel in Dark — i.e. no band at all. The ink is semantic on purpose: this ground flips with the theme, so pinning it the way the creator hero does would be wrong here."
            >
                <Panel>
                    <McnUserInvitationSenderStrip name={NAME} sentAt={SENT} locale="en" />
                </Panel>
            </Section>

            <Section
                title="sender strip — long name, and no timestamp"
                note="The name truncates; an unreadable created_at drops the time rather than printing “Invalid Date”, which is what legacy renders. Note it is one <time> element, not legacy's date-over-time pair — one instant should be one node."
            >
                <Panel>
                    <McnUserInvitationSenderStrip name={LONG_NAME} sentAt={null} locale="en" />
                </Panel>
            </Section>

            <Section
                title="sender strip — vi, for the date format"
                note="formatActivityDateTime is locale-aware and runs client-side only, so the month name and the 24-hour clock change with the reader. Nothing here reads the clock, so there is no hydration mismatch to arrange around."
            >
                <Panel>
                    <McnUserInvitationSenderStrip name={NAME} sentAt={SENT} locale="vi" />
                </Panel>
            </Section>

            <Section
                title="support link"
                note="A real anchor with an href, target=_blank and rel=noopener — legacy uses an IconButton calling window.open, which has no href and no accessible name. min-h-10 because 14px text with 8px padding is a 37px touch target and DoD §4 asks for 40. It points at the manager article, which is a different URL from the creator screen's."
            >
                <Panel>
                    <div className="p-3">
                        <McnUserInvitationSupportLink />
                    </div>
                </Panel>
            </Section>

            <Section
                title="letter"
                note="Trans with a <0> placeholder, so each locale places its own emphasis — legacy wraps the network name in nested Typography nodes, which forces English word order. The two bullets are legacy's exact sentences, awkward grammar included: they are terms somebody is agreeing to, and B101 asks whether they are still true. The greeting is not a prop — it is your own space name, falling back to /me's display name — so it is present here only if YOU are signed in, and dropped entirely otherwise. Legacy renders “Dear undefined,” in that window."
            >
                <Panel>
                    <div className="py-3">
                        <McnUserInvitationLetter name={NAME} />
                    </div>
                </Panel>
            </Section>

            <Section
                title="letter — no network name  ⚠ standing question"
                note="organization.name is nullable, and the fallback is mcn_partnership_managed_by — so the sign-off and the headline read “Managed by MCN”. It is honest and it reads badly. Both invitation screens do this; fixing it is one shared key, and it is worth deciding rather than inheriting."
            >
                <Panel>
                    <McnUserInvitationSenderStrip name={null} sentAt={SENT} locale="en" />
                    <div className="py-3">
                        <McnUserInvitationLetter name={null} />
                    </div>
                </Panel>
            </Section>

            <Section
                title="footer"
                note="Reject leads, which is legacy's order and this screen's own copy inviting a refusal. No countdown: the 72 hours is a sentence, because the number is the client's own guess (B101). Press one and the other goes disabled — that pair is the real disabled state."
            >
                <Panel>
                    <McnUserInvitationFooterPreview />
                </Panel>
            </Section>

            <Section
                title="footer — narrow column, 320px  ⚠ regression surface"
                note="This is where the defect was: Button carries shrink-0, so two fullWidth buttons in a flex row want 100% each, cannot shrink, and the trailing one sits off the edge unpressable. A grid makes each cell exactly half. If Accept ever leaves this box or its label clips, that is the bug coming back."
            >
                <Panel width={320}>
                    <McnUserInvitationFooterPreview />
                </Panel>
            </Section>

            <Section
                title="loading"
                note="The same component the route's loading.tsx renders, so the streaming gap and the in-screen wait are one picture. Heights come from the `h` prop — Skeleton writes height into inline style, so a className would be silently ignored and every bar would be 12px."
            >
                <Panel>
                    <McnUserInvitationSkeleton />
                </Panel>
            </Section>

            <Section
                title="walls"
                note="The expired/no-token wall and the load failure — two states legacy collapses into one, so a 500 there tells somebody holding a live link that it has expired. Both are the shipped ChannelEmptyState with the shipped copy, shared with the creator screen. The signed-out prompt is the third and is reachable by signing out."
            >
                <Panel>
                    <ChannelEmptyState
                        art={MCN_INVITATION_ART.invalid}
                        title="The invitation link has expired or is invalid!"
                    />
                </Panel>
                <div className="h-3" />
                <Panel>
                    <ChannelEmptyState
                        icon="exclamation-diamond"
                        tone="error"
                        title="Couldn’t load this invitation"
                        body="Check your connection and try again."
                    />
                </Panel>
            </Section>
        </main>
    )
}
