'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { appLink } from '../access'
import type { EventDetail } from '../api/types'
import { EventAppHandoff } from './event-app-handoff'
import { EventHostInfoCard } from './event-host-info-card'
import { EventPanelShell } from './event-watch-panel'

/**
 * **Your stream is on air, and this is not where you run it** — the host's whole page while their
 * own broadcast is `LIVE`, in place of the revenue report.
 *
 * ## The question the report could not answer
 *
 * Legacy's creator branch is one thing at every status: the revenue report (`creator/index.js`
 * renders `<Details/>` unconditionally). That is right for a stream that has **ended** — the report
 * is a record, and a record is what you want afterwards. While the stream is *running* it answers a
 * question the host is not asking. They opened their own live event on a laptop; what they want to
 * know is whether they can see it, talk to the room, or end it from here. The page said nothing, so
 * the honest reading of a silent page is "this must be broken" — a creator reported exactly that.
 *
 * The answer is no, and it is **ours** rather than a setting of theirs: this rewrite ships no web
 * player and no broadcast controls (`docs/EVENT.md` §3, R1). `EventWatchPanel` already draws that
 * distinction for viewers — *"the website is not allowed to play this" and "this client cannot play
 * a live yet" are different facts, and saying the first when the second is true blames the creator's
 * settings for our missing feature"* — and a host deserves the same care, more so, because it is
 * their broadcast being described.
 *
 * ## ⚠ It is the **viewer's page with one block swapped**, not a bare notice
 *
 * This shipped twice before it was right. First as a card above the report — overruled, because a
 * page whose first block says "you cannot do anything here" and whose remaining five are a dashboard
 * gives two answers to one question. Then as a single centred wall: a title, a sentence and a QR on
 * an otherwise empty card.
 *
 * That second version was the real mistake, and the reason is in the payload: `v4/public/events/{code}/`
 * answers with the banner, the title, the schedule, the description and the channel. A screen that
 * throws all of it away to print one sentence looks like an error state for a stream that is
 * perfectly healthy — and it is the creator's *own* broadcast, the page they would send someone.
 *
 * So the shape is the viewer's: **details card, the panel, description**, with the panel standing
 * exactly where `EventWatchPanel` stands. Everything the viewer's page shows about the stream is
 * equally true for its host, including the Share control in `EventActions` — which is the one thing
 * a live creator on a laptop actually *can* do from here, and the reason this is no longer a wall.
 *
 * **`EventHostCard` is the one viewer block dropped.** It says *Hosted by* and links to the space;
 * the host does not need to be told whose stream this is, and a row pointing at their own page is
 * the kind of filler that makes a screen read as generated rather than designed.
 *
 * ## Shared pieces, on purpose
 *
 * `EventPanelShell` is `EventWatchPanel`'s own card, exported rather than copied — the tinted disc,
 * the 340px measure and the extra vertical air are a designed block, and the six watch states and
 * this one must not drift apart. `EventAppHandoff` is the same QR-or-store pair those states end in,
 * and its QR encodes the **stream**, so a creator with the app installed lands on their own
 * broadcast rather than on a store listing.
 *
 * `tone="brand"` and `signal-stream`, matching `WatchablePanel`: this is a live stream that exists
 * and is going well. Painting it `error` would mark the creator's own broadcast as a fault.
 */
export function EventHostLiveScreen({ event }: { event: EventDetail }) {
    const { t } = useTranslation()

    return (
        <>
            {/*
             * ## ⚠ The masthead is dropped on a short viewport, and that is the whole fit rule
             *
             * The requirement is that this page does **not scroll** — and where it cannot, that the
             * notice stands alone. Measured, the two blocks come to **~776px** of content, so the
             * page fits from about a 780px-tall window and overflows below it: a 768px laptop by 8px,
             * an iPhone SE by 93.
             *
             * `max-height: 819px` hides the masthead, leaving the notice alone. The threshold carries
             * ~44px of slack over the measured 776 because the height is not fixed: the title wraps
             * at two lines on a narrow screen, and the body sentence is nine locales long.
             *
             * Measured across nine viewports — 900 / 844 / 820 draw the masthead and fit; 800 / 768 /
             * 700 / 667 drop it and fit.
             *
             * ⚠ **The floor is ~650px and is not reached by dropping anything else.** The notice
             * alone is 535 (519 on a phone) plus the 60px bar, and most of that is the hand-off: a
             * 160px QR on its plate, the caption, and the store pair. A 600px window still scrolls by
             * 50. Every phone in portrait is at least 667, so nothing this app is drawn on hits it —
             * stated rather than chased, because the next 50px would have to come out of the QR, and
             * `EventAppHandoff` is shared with the viewer's six watch states.
             *
             * A **CSS** query rather than measuring in JS. Reading `innerHeight` to decide what to
             * render means the server cannot know the answer, so the first paint is wrong and
             * corrects itself — a flash on the one screen whose job is to be read at a glance, and a
             * hydration mismatch besides. `display: none` also takes it out of the accessibility
             * tree, which is right: on a short screen the notice *is* the page.
             *
             * ## Why this card and not the viewer's
             *
             * The **creator's** masthead, legacy's own `creator/…/info`: the status chip, a 123×64
             * thumbnail, the title and the start time. It is 141px against the viewer details card's
             * 569, which is what makes fitting possible at all — and it draws no access pill, so the
             * question of whether a creator might be shown *Unlock for 250 ⭐* over their own banner
             * does not arise. The viewer card needed a `showAccess={false}` to be safe; this one has
             * nothing to withhold.
             */}
            <div className="contents [@media(max-height:819px)]:hidden">
                <EventHostInfoCard event={event} />
            </div>

            {/*
             * **No `icon`, and `flex-1` so the card fills what is left of the column.**
             *
             * The disc was a `signal-stream` glyph over a tinted ground, and it was decoration: the
             * heading under it already says *You're live right now*, and the QR below is the only
             * thing on the card anyone acts on.
             *
             * ⚠ It is an **editorial** removal, not a fitting one — worth saying because the 48px
             * plus its `gap-4` looks like 64px of free room and is not. Measured, the floor where
             * the page starts to scroll is **650px before and after**: that number is set by the
             * hand-off block (a 160px QR on its plate, the caption, the store pair), and the disc
             * sits above the part that binds.
             *
             * `flex-1 justify-center` because the card is the page now. Hugging its content left the
             * page colour showing under it on a tall window, which reads as a block that failed to
             * load rather than as a screen — the same reasoning `docs/DESIGN_SYSTEM.md` §6 gives for
             * filling a column with `md:grow` rather than a `min-height`.
             */}
            <EventPanelShell
                testId="event-host-live"
                tone="brand"
                className="flex-1 justify-center"
                title={t('event_host_live_title')}
                body={t('event_host_live_body')}
            >
                <EventAppHandoff url={appLink(event)} testId="event-host-live-app" />
            </EventPanelShell>
        </>
    )
}
