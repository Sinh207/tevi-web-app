/**
 * Sharing — **handing somebody else a link to a piece of Tevi, and recording that it happened.**
 *
 * ```
 * <ShareDialog/>          the sheet: a link preview, a QR step, and one row per channel
 * spaceShareContext()     a space, named the way the link service needs to hear it
 * ShareContext            that shape, for a caller that builds its own (a post, a live)
 * ```
 *
 * ## What is in scope
 *
 * One question — *how does this URL reach another person* — answered six ways, plus the mint that
 * turns a public URL into an attributed one (`POST v1/links`, one link per channel, which is what
 * makes "shares by channel" a real figure rather than a guess).
 *
 * ## Where it is opened from
 *
 * Four surfaces, all of which legacy opens its own `<Share>` from: the space bar
 * (`channel-top-bar.tsx`), the follow-requests empty state (`share-profile-button.tsx`), an event's
 * kebab menu (`channel-event-menu.tsx`) and the donation support card
 * (`donate-support-card.tsx`). Each owns its own `open` state and passes the link, the title, the
 * thumbnail and — where it can name the content — a `ShareContext`. There is no provider: the
 * payload differs per press, and a global one would need a store to hold what a prop already says.
 *
 * `features/channel`'s `useShareSpace` (the platform sheet with a clipboard fallback) is **gone**
 * with that change: it existed because there was nothing to open, and two gestures for one control
 * is worse than one. What went with it is the OS sheet on a phone — WhatsApp, SMS, AirDrop — which
 * no dialog can offer. If that is wanted back it belongs *inside* the sheet as one more channel
 * (`navigator.share` where it exists), not as a second thing the button might do.
 *
 * The **mini-app** menu is deliberately still on `navigator.share`: its Share is also reachable from
 * inside the framed app (`SHARE_BUTTON_CLICKED`), which is handled in the bridge rather than in a
 * component, so wiring the dialog there means the *host* owning the state. One surface behaving two
 * ways is the thing to avoid, so both halves move together or neither does.
 *
 * It is also **not** the DM half of legacy's sheet ("Send in message"). That needs a messenger
 * feature; `components/share-dialog.tsx` states where the block goes back in and which two of its
 * behaviours are worth keeping.
 *
 * ## Deliberately not exported
 *
 * `shareLinkApi`, `shareKeys`, `useShareLink`, `ShareQrPanel` and the channel table.
 *
 * The model, because a component calling axios is what `CLAUDE.md` forbids and exporting it is the
 * invitation — the same line `features/gift-code` and `features/balance` draw. The hook, because it
 * owns the eager copy-link mint: a second caller for one share is a second mint and a second
 * `share_link_created_v2`. The panel and the table because they are the dialog's insides — a caller
 * that wants one row of it wants a different component, and should say so.
 */

export { ShareDialog } from './components/share-dialog'
export { type ShareContentType, type ShareContext, spaceShareContext } from './lib/share-context'
