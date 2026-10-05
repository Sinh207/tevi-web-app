import { cn } from '@shared/lib/utils'
import type { EventDetail } from '../api/types'
import { isLive, isOffAir, isRecentlyEnded } from './event-status'

/**
 * **Live studio** — the second of the viewer's two screens, and the surface rules it is built on.
 *
 * `docs/EVENT.md` calls the event area three screens: *My event* (the host's revenue report),
 * *Live details* (the page at `/@{slug}/event/{code}`) and *Live studio*. The third is legacy's own
 * vocabulary — `containers/event/layouts/` holds `detailsLayout/` and `studioLayout/` side by side —
 * and it is a different **layout**, not a different route. Legacy swaps between them at runtime, on
 * one URL, and `EventLayout` is the whole of that decision:
 *
 * ```js
 * matchUpMd && !isLoading && !isBlocked &&
 *   (isLive || (isEnded && endedAt && endedAt + 5 * 60 * 1000 >= Date.now()))
 *     ? <LiveLayout>   // the studio: a full-viewport stage, no chrome of the site's
 *     : <DetailsLayout> // the ordinary page, inside the site's shell
 * ```
 *
 * ## Why the constants are here and not in `container.ts`
 *
 * That file is `docs/DESIGN_SYSTEM.md` §6 — the single-panel rule, `--background` against
 * `--background-surface`, cards in a 612px measure. **None of it applies to the studio.** The
 * studio's ground is a video frame under a scrim, which has no theme: it is the same near-black in
 * Light and Dark, because what is behind it is a creator's camera rather than a surface of ours.
 * Putting a `bg-(--background-surface)` constant next to a `bg-black/20` one in the same file is
 * how a later reader concludes the second is a mistake.
 *
 * `EventBanner`'s access pill already states the same exception and states it for the same reason;
 * this is that note applied to a whole screen rather than one badge.
 */

/**
 * **Is this stream one the studio should open for?**
 *
 * Legacy's predicate, minus the two conditions that are not this function's to know: `matchUpMd`
 * (the viewport — `useLiveStudio` reads it, because a pure function cannot) and `isLoading` (the
 * caller has the event or it does not).
 *
 * ## Two statuses, not one
 *
 * `LIVE` is the obvious half. The other is a stream that stopped **within the last five minutes**,
 * and it is the half that is easy to drop as redundant. It is not: somebody who was *watching* when
 * the broadcast ended has to land on "the live broadcast has ended", which is a studio screen. Swap
 * them onto the details page instead and the stream they were watching a second ago reads as one
 * that never happened. `RECENTLY_ENDED_MS` carries the same note from the other side.
 *
 * `isOffAir` rather than a bare `=== 'ENDED'` because legacy's `isEnded` is
 * `['CANCELLED', 'ENDED', 'PAUSED'].includes(status)` — measured, not assumed. A **paused** stream
 * is the case that makes it matter: the host has stepped away and is coming back, and bouncing
 * their audience out to a details page for the duration empties the room.
 *
 * ## `now` is a parameter
 *
 * Same rule as `isRecentlyEnded`, which this composes: a predicate that reads its own clock cannot
 * be tested at the boundary, and the boundary is the entire behaviour. It also keeps one render's
 * answer stable — two components reading `Date.now()` a millisecond apart can land on opposite
 * sides of the window and disagree about which screen the reader is on.
 *
 * ⚠ **Never called during a server render.** The answer changes every second and the studio is a
 * client-only surface; see `useLiveStudio`.
 */
export function isStudioEligible(event: EventDetail | null, now: number): boolean {
    if (!event) return false
    if (isLive(event.status)) return true
    return isOffAir(event.status) && isRecentlyEnded(event.ended_at, now)
}

/**
 * The viewport width from which the studio opens — Tailwind's `md`, this app's 900px.
 *
 * Legacy's `matchUpMd`, and it is a **product** rule rather than a responsive one: the studio is not
 * a narrow version of anything, it is a 9:16 video with a 400px chat column beside it, and below
 * 900px there is no column. Legacy does not shrink it, it shows the details page instead, and so
 * does this. The Figma page carries the same answer in the other direction — a frame captioned
 * *"Live isn't available on mobile web"*.
 *
 * A number rather than a `md:` class because the gate is on **work**, not layout: the studio mounts
 * a player and a socket room, and a CSS-hidden one would still do both on a phone. Same argument as
 * `useRailVisible`, which is why that hook's shape is the one `useLiveStudio` copies.
 */
/**
 * **The Host badge's gold** — legacy's `common/hostBadge`, verbatim: three stops at 102.78°. One
 * value for every Host mark in the live room (the seat plate, the pinned message, the recipient
 * picker, the seat card), so they cannot drift a shade apart again.
 */
export const EVENT_HOST_GRADIENT =
    'linear-gradient(102.78deg, #FF9900 -4.78%, #FFC700 52.5%, #FF6B00 113.18%)'

export const STUDIO_MIN_WIDTH = 900

/**
 * **The portrait studio, switched off.** `EventStudioCompact` (the phone layout) is built but not
 * shipped — the product asked for it to be withdrawn for now. With this `false` the studio opens
 * from `STUDIO_MIN_WIDTH` only, as legacy's does, and a narrow screen on a live stream gets
 * `EventMobileLiveNotice` instead. Flip it to bring the phone studio back; nothing else changes.
 */
export const COMPACT_STUDIO_ENABLED = false

/**
 * The stage — **the whole viewport, over the site's shell.**
 *
 * `fixed` rather than a route of its own. The URL does not change when legacy swaps layouts, and
 * making it a route here would mean a second address for one stream, a `redirect` between them on
 * every status change, and the App Router unmounting `SessionProviders`' whole bootstrap to cross
 * from one to the other. Covering the shell is what legacy's `LiveLayout` does; this is the App
 * Router spelling of it.
 *
 * ## `z-40`, and the number is not free
 *
 * The same slot the mini-app player takes, for the same reasons written up in `docs/MINI_APP.md`
 * §7a: every dialog this screen can raise is `z-50` and must land **over** it, and the mobile tab
 * bar is `z-50` too. The studio never has to fight the tab bar — it only exists from 900px, where
 * there is no tab bar — but taking 50 would put the stage over its own unlock dialog, which is the
 * failure that is invisible until somebody tries to pay.
 *
 * `overflow-hidden` is load-bearing: the backdrop below is `scale-110` so its blur has no soft edge,
 * and without a clip that overscan becomes a scrollbar on the document.
 */
export const EVENT_STUDIO_STAGE = 'fixed inset-0 z-40 overflow-hidden bg-black'

/**
 * The ground — **the channel's own art, blurred past recognition, under a 60% scrim.**
 *
 * Legacy builds it out of two pseudo-elements on one box: `blur(20px) scale(1.1)` over
 * `event.images.banner || channel.images.thumb`, then `rgba(0, 0, 0, 0.6)` on top. Both halves
 * matter and the scrim is the one that is easy to lose — the art underneath is a creator's
 * photograph, so the white chrome over it has no contrast guarantee at all without something
 * between them.
 *
 * `scale-110` is not decoration either. A CSS blur samples past the element's edge and finds
 * nothing, so an unscaled backdrop fades to transparent in a 20px band around all four sides and
 * the black stage shows through as a halo. The 10% overscan pushes that band off-screen.
 *
 * Literal `black`, deliberately: see the file header. This is a scrim over a photograph, not a
 * surface, and `--background` inverting between modes would make it white in Light.
 */
export const EVENT_STUDIO_BACKDROP = 'absolute inset-0 scale-110 bg-cover bg-center blur-[20px]'

/** The 60% black the scrim lays over the blurred art. Legacy's `rgba(0, 0, 0, 0.6)`, exactly. */
export const EVENT_STUDIO_SCRIM = 'absolute inset-0 bg-black/60'

/**
 * The smoked-glass plate every piece of floating chrome sits on — back disc, channel pill, toolbar.
 *
 * Legacy's `#00000033` with `backdrop-filter: blur(4px)`, i.e. black at 20%. **One material for the
 * whole chrome band** — back disc, channel pill, the trailing toolbar and the folded chat strip —
 * and every plate is 40px tall, so the band reads as one row from edge to edge.
 *
 * The toolbar used to be its own plate (`black/50`, a shadow, no blur), after the comps' `Top menu`;
 * the strip beside it had no blur. Side by side at the trailing edge that was three materials and
 * two heights in one row, which is what the review flagged. Legacy itself is 20% on all of them
 * (`getStarAndApp` and `ExpandDrawer` are both `#00000033`), and the blur is what keeps white ink
 * legible over a bright frame at that fill.
 *
 * Nothing *inside* a plate takes this again: a second 20% on top of the first is a darker dot,
 * not a control (the ⋯ disc was one).
 *
 * `rounded-(--radius-fill)` is the DS token the access pill uses, so the studio's chrome and the
 * page's badges round the same way.
 */
export const EVENT_STUDIO_PILL = cn(
    'bg-black/20 text-white backdrop-blur-sm',
    'rounded-(--radius-fill)',
)

/**
 * The inset the floating chrome is pinned at — legacy's 12px, on all four corners.
 *
 * Exported as a class rather than a number because every consumer is a `position: absolute` corner
 * and the logical properties matter: `start-3` / `end-3` flip in Arabic, `left`/`right` do not.
 */
export const EVENT_STUDIO_CHROME_INSET = 'top-3 start-3'
/**
 * ⚠ **The trailing plate is centred against the leading row, not top-aligned with it.**
 *
 * Measured off the comps: the back disc is `y 12, h 40` and the balance plate is `y 16, h 32`, so
 * both are centred on y = 32. Giving the trailing side the same `top-3` puts a 32px plate where a
 * 40px one goes and lifts it 4px above the row it is supposed to sit in — which is what this
 * shipped as, and which reads as a misalignment rather than as a mistake anybody can name.
 *
 * `h-10` + `items-center` rather than `top-4`, so the plate stays centred whatever height its
 * contents end up at.
 */
export const EVENT_STUDIO_CHROME_INSET_END = 'top-3 end-3 flex h-10 items-center'

/**
 * The column a refusal stands in — **510px of the channel's art, centred, full height.**
 *
 * Every one of legacy's six gate screens (`geoRestricted`, `platformRestricted`, `ageRestricted`,
 * `kickout`, `eventIsLocked`, `ended`) draws this identical box and none of them shares it, which is
 * why four of them also carry `assertInset: '16/9'` — a typo for `aspectRatio` that has never done
 * anything in any of the four. Porting them as one constant is what makes that visible.
 *
 * The 510 is the portrait video's width at a 950px stage, so the refusal occupies exactly the space
 * the stream would have. That is the point of it: the reader sees the shape of the thing they are
 * being kept out of, not a dialog floating on a black field.
 */
export const EVENT_STUDIO_COLUMN = cn(
    /*
     * ⚠ **`z-0` is what makes the column's own art visible at all.**
     *
     * The stage paints, in order: the blurred backdrop, the 60% scrim, then this column. All three
     * are `absolute`/in-flow siblings with no z-index, so the column wins on DOM order — but the
     * *image inside it* is `absolute` too, and an explicit negative z-index on that image drops it
     * behind the scrim and the backdrop both, leaving the card floating on plain blur. It shipped
     * that way for one screenshot: the state looks entirely reasonable, it is simply missing the
     * thing that tells the reader what they are being kept out of.
     *
     * `relative z-0` gives the column its own stacking context instead, so its art is above the
     * scrim and everything inside it is ordered locally — which is why `EVENT_STUDIO_NOTICE`
     * carries the matching `relative z-10`.
     */
    'relative z-0 mx-auto flex h-full w-full max-w-[510px] items-center justify-center p-3',
)

/**
 * The area a **playing** stream stands in — the stage's full width, uncapped.
 *
 * ⚠ **`EVENT_STUDIO_COLUMN`'s 510px is a refusal measurement, not a stage one.** Its own note says
 * where the number comes from: the width of a *single portrait* video at a 950px stage, which is
 * the box every one of legacy's six gate screens draws. A playing room is not that. `L3` is two
 * 9:16 tiles side by side and wants ~18:16 of the height; `L4` is four; `L9` is nine. Capping any
 * of them at one portrait tile's width is what squeezed the grid, and it read as a stream playing
 * in a slot far too narrow for it with the channel's own art showing either side.
 *
 * So the cap follows the refusal card and the stage is sized by `seatBoxAspect` instead — height
 * first, width from the arrangement, which is the direction legacy sizes in too.
 */
export const EVENT_STUDIO_PLAY_AREA =
    /*
     * ⚠ **`flex-1 min-h-0`, not `h-full`.** The stage area is a column with the 95px tray band
     * under this, so `h-full` asks for 100% *plus* the band and overflows by exactly the tray — the
     * seats' bottom edge and the name plates on it land under the gifts. Legacy spells the same
     * thing `height: calc(100% − 95px)`; the flex item is that without the number.
     */
    'relative z-0 flex min-h-0 w-full flex-1 items-center justify-center p-3'

/**
 * The gift tray's band — **its own row at the foot of the stage area, full width.**
 *
 * ⚠ It was `absolute inset-x-3 bottom-3 max-w-[510px]`, i.e. floating **over** the stream and
 * capped to the refusal column. Legacy's is neither: `containers/event` gives the tray a row of its
 * own below the video, edge to edge, and the stage shortens to make room. The floating version cost
 * two things — it covered the bottom of the picture (where the seat's name plate and mic live), and
 * at 510px it could show four gifts where legacy shows eleven before *Xem thêm*.
 *
 * In flow rather than positioned, so the stage area's `flex-col` does the arithmetic and the
 * stream shortens by exactly the tray's height without anything having to know what it is.
 *
 * ⚠ **95px, `4px 8px`, a 12px gap** — legacy's `bottomPanel` row, and its stage above is
 * `calc(100% − 95px)`. This shipped as `px-3 pb-3` around a content-height tray, which put the
 * stream's bottom edge wherever the tray happened to end. The row holds two flex items: the tray
 * (87px tall after the padding, which is what `EventGiftTray` is built to) and, when the space
 * sells a tier, the 89px Membership tile — whose presence is what narrows the tray to
 * `calc(100% − 101px)` in legacy's arithmetic, and here simply by flex.
 *
 * ⚠ One caller still does know it: `EventGiftFloat` is `absolute bottom-[99px]`, which is this
 * band's **87px** strip plus its 12px inset spelled out. It lands correctly today only because the
 * two numbers agree, and it went stale the first time the tray's height was corrected — the 87 is
 * legacy's own (`BottomPanel` 95px less its 4px insets), and the banners really want to sit inside
 * the play region rather than measure up from the stage area's floor.
 */
export const EVENT_STUDIO_TRAY_BAND = 'relative z-10 flex h-[95px] flex-none gap-3 px-2 py-1'

/**
 * **The chat column's width — a share of the screen, not legacy's fixed 390px.**
 *
 * 390 was right at legacy's ~1500px reference and wrong either side of it: on a 1920 screen it is
 * a strip the transcript wraps inside, and at 1280 it takes almost a third of the stage. `26vw`
 * reproduces 390 at 1500, and the clamp keeps it legible (320) and from growing past what a line
 * of chat wants (460). One constant, because the fold animation in `EventStudioScreen` has to
 * open to exactly the width the panel draws at.
 */
export const EVENT_STUDIO_CHAT_WIDTH = 'w-[clamp(320px,26vw,460px)]'

/**
 * The chat column — **390px of room furniture down the trailing edge.**
 *
 * Legacy's `DRAWER_WIDTH = 390` on a hardcoded `#292532`.
 *
 * ## Literal dark, where `EVENT_STUDIO_NOTICE` takes tokens — the line between them
 *
 * Both are opaque plates with text on them, so the distinction is not "is it a surface". It is
 * **whether it floats**:
 *
 * - a **floating plate** (the refusal card) reads as a dialog laid over the stage, so it follows
 *   the theme like every other card in the app, and in Light mode a white card on a dark stage is
 *   exactly what a dialog should look like;
 * - **edge-to-edge furniture** (this column, the seat tiles, the chrome pills) is part of the
 *   stage. `EVENT_STUDIO_STAGE` is `bg-black` at every theme, because what it frames is a video,
 *   and a `--background-surface` column would be a white panel welded to a black one in Light.
 *
 * That is the whole rule. If a new piece of the studio is unsure which it is, ask whether it has
 * a gap around it.
 *
 * ⚠ **Dark glass — heavy, never light — and not a `--zinc-*` token.**
 *
 * - The Zinc ramp **inverts** between modes — `--zinc-900` is `#18181b` in Light and `#f4f4f5` in
 *   Dark — so reaching for it produces a near-white column welded to a black stage in Dark, which
 *   is the trap `CLAUDE.md` warns about in its styling rules.
 * - A **light** translucent plate is wrong. This once shipped as `bg-white/10` over the stage, and
 *   **you could read the creator's blurred banner straight through the chat** — caught on a real
 *   broadcast, not in the harness, whose fixtures carry no art.
 *
 * So the column is the stage's own material at reading strength: 82% of a near-black violet over
 * a 24px blur (`--live-chat-panel` + `backdrop-blur-xl`). 78% was tried first and, over an
 * *unblurred* banner in the harness, still let a ghost of its lettering through; 82% does not. The art behind it survives only as a
 * tint — each broadcast's chat takes a little of its channel's colour, which is what makes it the
 * same object as the chrome, the tray and the seats around it — while lettering in the art is
 * gone twice over (already blurred on the stage, blurred again here, under 82%). It was the only
 * opaque slab on a stage of glass. A hairline on its leading edge, the tray's own, keeps the edge.
 */
export const EVENT_STUDIO_PANEL = cn(
    EVENT_STUDIO_CHAT_WIDTH,
    'flex-none text-white',
    'border-white/10 border-s bg-(--live-chat-panel) backdrop-blur-xl',
)

/**
 * **The chat column's palette, measured off the comps** — `Right menu` on `↳ View Live`.
 *
 * Every value here was read from Figma with the plugin, not inferred from legacy and not chosen.
 * That distinction earned its own note: this column first shipped in a neutral grey ramp I picked
 * (`color-mix(white 12%, black)` and a set of `bg-white/N` plates), which is a perfectly
 * reasonable dark panel and is **not the one that was designed**. The comps are a purple family —
 * `#292532` ground, a `#9B8DBC` header wash, a `#501BC0` pin, an `#A467EF` arrival — and a
 * neutral column next to a purple one reads as a different product.
 *
 * ## Why these are literals rather than DS tokens
 *
 * Same argument as the rest of `lib/studio.ts`: this panel sits against video and does not change
 * with the theme, so a `--background-*` token — which inverts — is wrong here rather than merely
 * unnecessary. They are declared as CSS variables on the panel so the values live in one place
 * and a reader can see the family, instead of being sprinkled through six components as
 * `bg-[#501BC0]/50`.
 */
export const EVENT_STUDIO_CHAT_VARS = {
    /**
     * A member's row — **legacy's gradient** (`comment`, `giveGift`, `newSubscriber`): red to
     * legacy's `#FF9900`, both at 60%, at `90.92deg`. Legacy's plate stops at the end of its text;
     * this one is full width like the gift row beside it, so instead of ending in a hard edge the
     * orange reaches full strength by the middle and **fades out to the column's end**.
     */
    '--live-chat-member-row':
        'linear-gradient(90.92deg, rgba(255, 0, 0, 0.6) 1.04%, rgba(255, 153, 0, 0.6) 55%, rgba(255, 153, 0, 0) 100%)',
    /** The same gradient running the other way, so in Arabic it still starts behind the avatar. */
    '--live-chat-member-row-rtl':
        'linear-gradient(269.08deg, rgba(255, 0, 0, 0.6) 1.04%, rgba(255, 153, 0, 0.6) 55%, rgba(255, 153, 0, 0) 100%)',
    '--live-chat-panel': 'rgba(20, 16, 30, 0.82)',
    /** The header block — title, host badges and the leaderboard all sit on this wash. */
    '--live-chat-header': 'rgba(155, 141, 188, 0.2)',
    '--live-chat-divider': '#E0E0E0',
    /** The host's pinned message. */
    '--live-chat-pinned':
        'linear-gradient(135deg, rgba(110, 52, 232, 0.55) 0%, rgba(80, 27, 192, 0.38) 100%)',
    /** The "somebody arrived" pill. */
    '--live-chat-arrival': 'rgba(164, 103, 239, 0.7)',
    /** A host badge, and the leaderboard's own heading chip. */
    '--live-chat-chip': 'rgba(0, 0, 0, 0.3)',
    /** The composer's field. */
    '--live-chat-field': 'rgba(255, 255, 255, 0.2)',
    /**
     * The composer's edge while it is hovered or focused.
     *
     * `Input Container` has three variants and two of them — `Hover` and `Active` — differ from
     * `Inactive` by exactly this 1px stroke. Without it the field is the one control in the column
     * that never acknowledges the pointer.
     */
    '--live-chat-field-focus': '#B9A4E6',
    /** Body ink for a name in the leaderboard. */
    '--live-chat-name': '#E0E0E0',
    /** Secondary ink — counts, scores, the viewer figure. */
    '--live-chat-muted': '#A3A3A3',
    /**
     * A score the board has no figure for — the comps' `Top=Other` prints `-` in this, one step
     * darker than the numbers beside it so a missing value does not read as a small one.
     */
    '--live-chat-score-empty': '#666666',
    /**
     * **The platform's own voice** — every `Tevi icon` line in the `Chat` set (`System`,
     * `System host`, `Paid view live`) is this amber, at 14/Medium, and nothing else in the
     * column is.
     */
    '--live-chat-system': '#FFA914',
    /** The muted line *in the transcript* — the comps' `Type11`, darker than the float's red. */
    '--live-chat-denied': '#D00416',
    /** The muted **float** and the new-comments pill both print in this. */
    '--live-chat-alert': '#FB3748',
    /** …and the float sits on it at a tenth. */
    '--live-chat-alert-ground': 'rgba(251, 55, 72, 0.1)',
    /** The new-comments pill's ground. */
    '--live-chat-jump': '#353535',
    /** The reader's own row, pinned under the leaderboard. */
    '--live-chat-self': '#37343E',
    /** A gift's quantity and its Star figure — the only yellow in the transcript. */
    '--live-chat-gift': '#FFE600',
    /**
     * The pinned message's `Host` badge — legacy's `common/hostBadge`, its gradient verbatim. Not
     * the transcript's black host chip: the pin is the one place legacy draws this one.
     */
    '--live-chat-host': EVENT_HOST_GRADIENT,
    /** The `MEM` badge. A crown and `MEM` in white ride on it. */
    '--live-chat-member': 'linear-gradient(90deg, #FF7360 0%, #C6451D 50%, #FF6B00 100%)',
    /**
     * The disabled pill that stands where the composer was once the broadcast has ended — the
     * comps' `Right menu/Type=Ended`, whose `Small Button / Pill` is this ground with this ink.
     */
    '--live-chat-ended': '#54515B',
    '--live-chat-ended-ink': '#858585',
} as const

/**
 * **A seat tile's palette**, read off legacy's `seats/components/player` rather than the comps —
 * the Figma page draws the grid but not a muted co-host, and legacy is the only statement of what
 * the mic ring does.
 *
 * Literal for the same reason `EVENT_STUDIO_PANEL` is: a seat is edge-to-edge furniture on a video
 * stage, not a floating surface, so a `--zinc-*` token would invert it to a near-white tile welded
 * to a black grid in Dark. `#292532` is the same ground the chat column uses.
 */
export const EVENT_STUDIO_SEAT_VARS = {
    /** An open microphone — the mic disc, and the ring that grows out of the avatar. */
    '--live-seat-mic-on': '#FF6868',
    /** A muted one. Legacy's `#362F47`, one step off the ground rather than a red. */
    '--live-seat-mic-off': '#362F47',
    /** The tile's own ground, behind an avatar and inside the mic badge's collar. */
    '--live-seat-ground': '#292532',
    /** The outer halo while the microphone is open — `#FF6868` at a tenth. */
    '--live-seat-ring-outer': 'rgba(255, 104, 104, 0.1)',
    /** …and the inner one, at a half. */
    '--live-seat-ring-inner': 'rgba(255, 104, 104, 0.5)',
} as const

/**
 * The podium, in the comps' own order: first, second, third, then everybody else.
 *
 * ⚠ Third is `#FF7C00`, not the `#FF6600` legacy uses — a difference of one channel that is
 * invisible beside either colour on its own and only shows when the three sit in a column.
 */
export const EVENT_STUDIO_RANK_INK = ['#E41F37', '#FF6174', '#FF7C00'] as const

/**
 * The podium's medals — gold, silver, bronze — for the top three of the gift board: the ring and
 * the place number (`ink`), the soft glow off the face (`glow`), and the step's own wash (`step`).
 * The list rows below keep `EVENT_STUDIO_RANK_INK`; the podium is where medals belong.
 */
export const EVENT_STUDIO_MEDAL = [
    {
        ink: '#FFD54A',
        glow: 'rgba(255, 213, 74, 0.45)',
        step: 'linear-gradient(180deg, rgba(255, 213, 74, 0.38) 0%, rgba(255, 213, 74, 0.06) 100%)',
    },
    {
        ink: '#D9E1EA',
        glow: 'rgba(217, 225, 234, 0.35)',
        step: 'linear-gradient(180deg, rgba(217, 225, 234, 0.3) 0%, rgba(217, 225, 234, 0.05) 100%)',
    },
    {
        ink: '#F0A46B',
        glow: 'rgba(240, 164, 107, 0.35)',
        step: 'linear-gradient(180deg, rgba(240, 164, 107, 0.32) 0%, rgba(240, 164, 107, 0.05) 100%)',
    },
] as const

/**
 * The refusal card itself — 390px, 24px of padding, a 20px radius, 12px between rows.
 *
 * Legacy's geometry, and the one place its numbers are taken verbatim rather than mapped onto the
 * DS ramp: 20px is not a `--radius-*` step and 24px padding is `--spacing-5`, not `p-5`
 * (`CLAUDE.md`'s spacing-index trap). `p-6` is the 24 the ramp actually offers.
 *
 * ⚠ **This card is a surface and therefore *does* take tokens** — unlike everything else in this
 * file. It is an opaque plate the reader is meant to read a paragraph off, so it follows the theme
 * like any other card; legacy hardcodes `#FFFFFF` with `#141414` and `#666666` ink, which is a white
 * dialog with black text in Dark mode. The stage around it stays literal, the card on it does not.
 */
export const EVENT_STUDIO_NOTICE = cn(
    /*
     * `relative z-10` against the column's art — see `EVENT_STUDIO_COLUMN`. Without it the card is
     * a *static* box in a stacking context whose other child is `absolute`, and positioned
     * elements paint over non-positioned ones regardless of DOM order: the stream's own frame
     * would cover the refusal it is supposed to sit behind.
     */
    'relative z-10 flex w-full max-w-[390px] flex-col items-center gap-3 rounded-[20px] p-6',
    'bg-(--background-surface) text-center',
)

/**
 * **The gift surfaces' palette** — the tray under the stage, the catalogue panel, the float banners.
 *
 * Declared as CSS variables on the tray's own wrapper for the reason `EVENT_STUDIO_CHAT_VARS` gives
 * at length: these sit against **video**, so they do not follow the theme, and a `--background-*`
 * token here would invert to a white plate on a black stage in Light. Keeping them in one block is
 * what stops the same six literals being sprinkled through four components as `bg-[#501BC0]/50`.
 *
 * ⚠ Unlike the chat column's, these were **not** read off the comps — the Figma page has no gift
 * frames that this port could find, and the Desktop Bridge was not connected when it was written.
 * Every value below is legacy's, measured from `bottomPanel/gifts`, `rightPanel/productPackages`
 * and `leftPanel/giveGift`. That makes this the one part of the studio whose source is the running
 * app rather than the design, which is exactly what `docs/EVENT.md` records as still open.
 */
export const EVENT_STUDIO_GIFT_VARS = {
    /**
     * The strip the tiles scroll inside, and the Membership tile beside it. Legacy's `#78787880`
     * was a flat mid-grey — the only grey plate on a stage whose chrome is smoked glass, so the
     * band read as a different product from the bar above it. Black at 30% under the same blur is
     * that glass one step heavier, which a 87px plate carrying twelve labels needs.
     */
    '--live-gift-tray': 'rgba(0, 0, 0, 0.3)',
    /** A tile under the pointer, and the *View more* plate. */
    '--live-gift-tile-hover': 'rgba(0, 0, 0, 0.2)',
    /** The *Send* bar that slides up inside a hovered tile. */
    '--live-gift-send': '#501BC0',
    '--live-gift-send-hover': '#6B2FE0',
    /**
     * A price at rest. It goes white when the tile is hovered. White at 60% rather than legacy's
     * `#858585`, which was a grey that only read on legacy's grey plate.
     */
    '--live-gift-price': 'rgba(255, 255, 255, 0.6)',
    /** The catalogue panel's ground — the same grey the chat column takes. */
    '--live-gift-panel': '#292532',
    /** Its header wash, and the recipient picker's. */
    '--live-gift-header': 'rgba(155, 141, 188, 0.2)',
    /** The header's own sentence — the platform's amber, as everywhere else in the room. */
    '--live-gift-header-ink': '#FFA914',
    /** A tab nobody has chosen. The chosen one is plain white. */
    '--live-gift-tab': '#666666',
    /** A recipient's name in the picker. */
    '--live-gift-recipient': '#E0E0E0',
    /** The sender's name on a float banner — the only yellow out here, matching the transcript's. */
    '--live-gift-sender': '#FFE600',
    /** `Sent [gift]`, under it. */
    '--live-gift-sentence': '#F0F0F0',
    /**
     * The outline the `x12` is drawn with.
     *
     * A four-corner `text-shadow` rather than `-webkit-text-stroke`: the figure is white on a
     * banner whose ground is a **backend-supplied** image, so without an outline it disappears
     * entirely on a light one. Legacy's own four offsets, verbatim.
     */
    '--live-gift-amount-edge': '#FF7C00',
} as const

/**
 * The tray — **a scrolling row, and deliberately not a carousel.**
 *
 * `CLAUDE.md` §10's decision: one card per viewport, dots and "go to slide 3" is a carousel; a row
 * you push sideways is not, and must stay on native scrolling. Legacy uses Swiper `freeMode` here,
 * which is the same intent expressed with 40KB of transform track — and a transform track costs
 * momentum, `overscroll-behavior`, and the browser scrolling a focused tile into view. The last of
 * those is the one that matters: every tile is a button, so a keyboard reader tabbing along the row
 * needs the scrollport to follow them.
 */
export const EVENT_STUDIO_GIFT_TRAY = cn(
    'flex items-stretch gap-1 overflow-x-auto overscroll-x-contain px-3',
    /*
     * Both ends fade out over the 12px of padding, so a tile half-scrolled out of view dissolves
     * into the plate instead of being sliced at a hard edge. Symmetric on purpose: one mask serves
     * both directions, and at rest only the padding — never a whole tile — sits under the fade.
     */
    '[mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]',
    // No visible bar: the strip is 90px tall and a scrollbar inside it eats a third of a tile.
    // Legacy hides Swiper's the same way. The row is still reachable by wheel, drag and keyboard.
    '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
)
