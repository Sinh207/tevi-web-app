import { ChannelEmptyState } from '@features/channel'
import {
    MCN_INVITATION_ART,
    McnInvitationHero,
    McnInvitationLetter,
    McnInvitationNetworkChip,
    McnInvitationRates,
} from '@features/channel/dev'
import {
    MCN_INVITATION_CONTAINER,
    MCN_INVITATION_PANEL,
    MCN_INVITATION_SCREEN,
    McnInvitationSkeleton,
} from '@features/channel/skeleton'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { McnInvitationFooterPreview } from './preview'

export const metadata: Metadata = {
    title: 'MCN invitation',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/invitation/verify`'s blocks: `pnpm dev`, then open /dev/mcn-invitation.
 * 404s in production (`proxy.ts` stops the request; the `notFound()` below is the belt to that
 * braces).
 *
 * ## Why this one earns a harness more than any other screen in the feature
 *
 * The real screen needs **a multi-channel network to send you an email**. `/dev/blocked-accounts`
 * exists because its screen needs an account that has blocked someone — which you can at least
 * arrange by blocking a stranger. There is no equivalent here: short of a backoffice operator
 * inviting you, the only reachable state is the expired-link wall.
 *
 * Three things are visible nowhere else:
 *
 * - the hero's **frosted strip pinned to `.theme-light`** over fixed-colour art. It is the only
 *   surface in the app using that mechanism, and it has to be checked in *both* themes — the whole
 *   point is that it does **not** invert with them.
 * - the rates block **withholding both figures** when the rate is unreadable, and the decimal case.
 *   These are commercial terms on the screen where a creator agrees to them, so "what does a bad
 *   payload draw" is worth being able to look at.
 * - the footer's **countdown near zero**. `01:00:0x` is 71 hours after an invitation is sent.
 *
 * ## What it deliberately does **not** preview
 *
 * `McnInvitationView` — the component that owns the query. `/dev/blocked-accounts` states the rule
 * this follows: *"a version of it that did not would be a second implementation of the screen with
 * its own drift."* So the harness composes the same blocks inside the same
 * `MCN_INVITATION_SCREEN` / `_PANEL` / `_CONTAINER` the real screen uses, and the two walls and the
 * skeleton below are the shipped components with the shipped copy.
 *
 * Copy is **English literals**, not `t()` — every string here is a fixture label describing what is
 * being shown, and the blocks themselves translate their own. A dev page is not a locale surface.
 */

/** Where the 72-hour window is measured from — four points across it, for the countdown. */
const HOUR = 60 * 60 * 1000
const SENT = {
    fresh: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    /** 71 hours in: the countdown reads about `01:00:00` and is watchable. */
    nearlyGone: new Date(Date.now() - 71 * HOUR).toISOString(),
    /** Past the window: `00:00:00`, and the buttons still work — the server owns expiry (B100). */
    expired: new Date(Date.now() - 80 * HOUR).toISOString(),
    /** `created_at` is nullable: no clock at all, and the label falls back to a bare **Agree**. */
    unknown: null,
}

const NAME = 'Sao Bắc Đẩu Media'
/** The truncation case for the hero strip, which is the one place a long name is clipped on purpose. */
const LONG_NAME = 'A network whose name is long enough to need truncating in the strip'

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
function Panel({ children }: { children: React.ReactNode }) {
    return (
        <div className={`${MCN_INVITATION_CONTAINER} ${MCN_INVITATION_SCREEN}`}>
            <div className={`flex flex-col ${MCN_INVITATION_PANEL}`}>{children}</div>
        </div>
    )
}

export default function DevMcnInvitationPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">MCN invitation</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/channel` — the blocks of /invitation/verify, which needs an MCN to
                    email you a token. Switch the theme: the hero strip is pinned to Light on
                    purpose and must not follow. Press Agree or Reject to watch the pending state.
                </p>
            </header>

            <Section
                title="hero"
                note="172px band, object-cover over a committed 1224×816 WebP. The strip is .theme-light, so its ink stays dark over the fixed-colour art in both themes."
            >
                <Panel>
                    <McnInvitationHero name={NAME} sentAt={SENT.fresh} locale="en" />
                </Panel>
            </Section>

            <Section
                title="hero — long name, and no timestamp"
                note="The name truncates; an unreadable created_at drops the time rather than printing “Invalid Date”, which is what legacy renders."
            >
                <Panel>
                    <McnInvitationHero name={LONG_NAME} sentAt={null} locale="en" />
                </Panel>
            </Section>

            <Section
                title="network chip"
                note="--background-brand / --text-on-brand. The pair is measured against each mode's own ground, so check both."
            >
                <Panel>
                    <div className="p-3">
                        <McnInvitationNetworkChip name={NAME} />
                    </div>
                </Panel>
            </Section>

            <Section
                title="revenue split"
                note="70/30, the decimal case, and 0/100 — a genuine zero is kept, not swallowed. A rate the API did not send renders nothing at all: `invitationRates` returns null for both halves, so the real screen omits the block rather than printing 100/0 as legacy does."
            >
                <Panel>
                    <div className="flex flex-col gap-3 p-3">
                        <McnInvitationRates creator={70} mcn={30} />
                        <McnInvitationRates creator={52.5} mcn={47.5} />
                        <McnInvitationRates creator={100} mcn={0} />
                    </div>
                </Panel>
            </Section>

            <Section
                title="letter"
                note="Trans with <0>/<1> placeholders, so each locale places its own emphasis. The greeting is your own display name and is dropped entirely when it is not known yet."
            >
                <Panel>
                    <div className="py-3">
                        <McnInvitationLetter name={NAME} />
                    </div>
                </Panel>
            </Section>

            <Section
                title="footer — 30 minutes in"
                note="Agree carries the countdown. Reject is a ghost button on --text-error, which measures 3.60:1 in Light — see docs/DESIGN_SYSTEM.md §6b, where that is a standing DS question rather than this screen's choice."
            >
                <Panel>
                    <McnInvitationFooterPreview createdAt={SENT.fresh} />
                </Panel>
            </Section>

            <Section
                title="footer — 71 hours in"
                note="About 01:00:00 left, ticking. The only way to see the clock near zero."
            >
                <Panel>
                    <McnInvitationFooterPreview createdAt={SENT.nearlyGone} />
                </Panel>
            </Section>

            <Section
                title="footer — past the window, and with no timestamp"
                note="00:00:00 clamps rather than going negative, and the buttons stay live: the countdown informs, the server decides. With no created_at there is no clock and no interval at all — the label is a bare Agree."
            >
                <Panel>
                    <div className="flex flex-col gap-6">
                        <McnInvitationFooterPreview createdAt={SENT.expired} />
                        <McnInvitationFooterPreview createdAt={SENT.unknown} />
                    </div>
                </Panel>
            </Section>

            <Section
                title="loading"
                note="The same component the route's loading.tsx renders — heights come from the `h` prop, because Skeleton writes height into inline style and a className would be silently ignored."
            >
                <Panel>
                    <McnInvitationSkeleton />
                </Panel>
            </Section>

            <Section
                title="walls"
                note="The expired/no-token wall and the load failure. Both are the shipped ChannelEmptyState; the signed-out prompt is the third and is reachable by signing out."
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
