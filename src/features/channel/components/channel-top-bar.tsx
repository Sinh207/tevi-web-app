'use client'

import { StarBalancePill } from '@features/balance'
import { ShareDialog, spaceShareContext } from '@features/share'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster } from '@shared/ui/app-bar'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Channel } from '../api/types'
import { CHANNEL_CONTAINER } from '../lib/container'
import { ChannelViewerMenu } from './channel-viewer-menu'

/**
 * The plate the bar's controls wear **below `sm`**, where the bar sits over the cover: legacy's
 * `#00000080` with white ink, plus a backdrop blur. Fixed colours rather than tokens — the ground is
 * a photograph, which does not flip with the theme. From `sm` the controls are `BarIconButton`'s
 * own ghost.
 */
const CHANNEL_BAR_CONTROL =
    'max-sm:bg-black/50 max-sm:text-white max-sm:backdrop-blur-sm max-sm:hover:not-disabled:bg-black/65'

/**
 * The channel page's own bar — back on the leading side, share on the trailing side.
 *
 * ## Why not `PageBackBar`
 *
 * Its `trailing` prop renders **inside the leading `AppBarCluster`** — it is the slot the desktop
 * breadcrumb goes in, not a trailing cluster (`features/navigation/components/page-back-bar.tsx`). This bar needs share
 * and, later, an overflow menu on the *other* end. `AppBar` is already `justify-between`, so two
 * clusters is what the DS expects; the back button is a deliberate copy of `PageBackBar`'s, down to
 * the `1-icon` type and the RTL mirror.
 *
 * ## No title
 *
 * The space's name is not repeated here (product call, 2026-10-07). It was restored once so a
 * scrolled page still named whose space it is, then dropped again: the header prints it at
 * `type-title-t2-bold` right under the cover, and the copy in the bar was a truncated duplicate
 * squeezed between two clusters. The bar is controls only. The `h1` stays in `channel-identity.tsx`.
 *
 * The `border-b` did not come back either. The header card starts immediately below and carries its
 * own rounded top edge from `md`, which already reads as an edge.
 *
 * ## Below `sm` the bar is drawn over the cover — legacy's immersive bar, ported on request
 *
 * It was declined once (opaque, sticky, `--background`, on the grounds that the DS draws no blur and a
 * light cover under a translucent bar is unreadable). Product asked for legacy's look on a phone, so
 * here it is, with the readability problem solved rather than inherited:
 *
 * - **Over the cover** the bar has no paint and **no layout height** (`max-sm:h-0` on the sticky
 *   host, so the cover starts at the top of the screen and the 60px bar overflows onto it). The
 *   controls are legacy's dark plate — `#00000080`, white glyph — plus a backdrop blur, because a
 *   bare glyph on an unknown photograph is the one ground nothing can be guaranteed against.
 * - **Once the cover has gone** (`coverPassed`, from `useBandPassed` on the cover's last pixel —
 *   an observer, not legacy's per-frame `scrollTop >= 60` listener on a container this app does not
 *   have) a blurred copy of the cover fades in behind the bar, legacy's `blur(20px)`, under a
 *   `black/30` scrim legacy does not have — without it a pale cover washes the bar out — and `saturate-150`, so the scrim does not leave the colour muddy.
 *   The plates stay, and so does the bar's `px-4`. A filled edge control keeps its inset
 *   (`PageBackBar`'s rule), and dropping both the plate and the inset at this moment would move every
 *   control 16px sideways in the middle of a scroll.
 * - The backdrop reuses the cover's own URL and `sizes`, so on a phone it is a cache hit, and it is
 *   `sm:hidden` and lazy, so a wider screen never fetches it. A sensitive space passes no
 *   `backdropSrc` (`ChannelView` says why) and gets the scrim over the plain segment fill.
 *
 * From `sm` up: opaque, ghost controls.
 */
export function ChannelTopBar({
    channel,
    isOwner = false,
    coverPassed = false,
    backdropSrc = null,
}: {
    channel: Channel
    /** Hides the overflow menu — nothing in it applies to the person whose space it is. */
    isOwner?: boolean
    /** Below `sm`: has the cover scrolled out from under the bar? See the note above. */
    coverPassed?: boolean
    /** Below `sm`: the art blurred behind the bar once the cover has gone, or `null` for none. */
    backdropSrc?: string | null
}) {
    const { t } = useTranslation()
    const router = useRouter()
    /*
     * **The share sheet, which is what legacy's own `iconBtnShare` opens.** This pressed
     * `navigator.share` (`useShareSpace`) for as long as there was nothing to open — the DS draws
     * no share sheet, so the platform's was the honest substitute. `features/share` is that sheet
     * now: a link preview, seven channels and a QR step, with the link **minted per channel** so
     * "shares by Telegram" is a real figure rather than a guess.
     *
     * What is given up is the OS sheet on a phone, which reaches WhatsApp, SMS and AirDrop. That is
     * a real loss and a deliberate one: legacy has no such path, the attribution only exists on
     * ours, and a row that hands the reader over to the OS can be added to the sheet later without
     * moving this call site.
     */
    const [shareOpen, setShareOpen] = useState(false)

    /**
     * The share sheet's title. Falls back to the handle for a channel with no display name — a real
     * state, the field is nullable — the same fallback `channel-identity.tsx` uses.
     */
    const title = channel.name ?? `@${channel.slug}`

    return (
        // 60px tall and `top-0 z-20`, matching the sticky-bar precedent in `/brand-assets`. The tab
        // strip parks under it at `top-[60px] z-10`, so the two make one 108px stack.
        <div
            data-testid="channel-top-bar"
            data-cover-passed={coverPassed || undefined}
            className={cn(
                'sticky top-0 z-20 bg-(--background-surface) md:bg-(--background) print:hidden',
                // Over the cover on a phone: no paint and no layout height — see the note above.
                'max-sm:h-0 max-sm:bg-transparent',
            )}
        >
            {/*
             * The blurred cover behind the bar once the cover itself has gone. Absolutely placed in
             * the sticky host (a positioned element), before the bar in the DOM so the bar — which
             * is `relative` — paints over it. `scale-125` pushes the blur's soft edge outside the
             * clip.
             */}
            <div
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute inset-x-0 top-0 h-[60px] overflow-hidden sm:hidden',
                    'bg-(--background-segment) transition-opacity duration-300',
                    coverPassed ? 'opacity-100' : 'opacity-0',
                )}
            >
                {backdropSrc && (
                    <Image
                        src={backdropSrc}
                        alt=""
                        fill
                        // The cover's own `sizes` (`channel-cover.tsx`), so a phone gets the file
                        // it has already downloaded for the cover.
                        sizes="(max-width: 612px) 100vw, 612px"
                        className="scale-125 object-cover blur-[20px] saturate-150"
                    />
                )}
                <div className="absolute inset-0 bg-black/30" />
            </div>
            {/*
             * `md:px-0` — the same rule `PageBackBar` applies, at the same breakpoint. Below `md` it
             * is `px-0` too, because the edge controls are ghost; `PageBackBar` says why.
             *
             * `AppBar` carries `px-4`, drawn for a phone where the bar spans the screen. Once the
             * column caps, that 16px measures from the *column's* edge while the header card below
             * fills the column edge to edge — so the back button sits inset from a card that is not,
             * and the bar reads as narrower than the page. The rule is "match the content", and the
             * breakpoint is wherever the content stops being full-bleed.
             *
             * That used to be `sm` here, because `CHANNEL_CONTAINER` capped at every width and the
             * card therefore had a visible edge from 612 up. The container is now full-bleed below
             * `md`, so the answer moved with it — and this page and the settings screens now agree
             * on both the number and the reason.
             */}
            {/* `px-0` from `sm` (ghost controls); `px-4` below it, where the controls are plates. */}
            <AppBar className={cn(CHANNEL_CONTAINER, 'px-0 max-sm:px-4')}>
                <AppBarCluster className="min-w-0">
                    {/*
                     * `BarIconButton`, the same control `PageBackBar` renders. It used to be an
                     * `AppBarButton` with an unfilled 22px glyph, which made this bar visibly a
                     * different thing from every other sub-page bar — see that component's note.
                     */}
                    <BarIconButton
                        data-testid="channel-back"
                        name="angle-left"
                        weight="filled"
                        mirrored
                        label={t('common_back')}
                        className={CHANNEL_BAR_CONTROL}
                        onClick={() => {
                            // Same rule as `PageBackBar`: a channel opened from a shared link has
                            // no history to go back to, so fall through to home rather than
                            // leaving the button dead.
                            if (window.history.length > 1) router.back()
                            else router.push('/')
                        }}
                    />
                    {/* Over the cover (below `sm`) it wears the controls' dark plate. The prefixed
                        string is written out because Tailwind only sees literal classes. */}
                    <StarBalancePill
                        testId="channel-star-balance"
                        className="md:hidden max-sm:[--star-pill-bg:rgb(0_0_0/0.5)] max-sm:[--star-pill-edge:transparent] max-sm:[--star-pill-ink:white] max-sm:[--star-pill-plus-bg:rgb(255_255_255/0.2)] max-sm:[--star-pill-plus-ink:white]"
                    />
                </AppBarCluster>

                <AppBarCluster>
                    {channel.shareable_url && (
                        <BarIconButton
                            data-testid="channel-share"
                            /*
                             * Outline, where the back arrow beside it is filled — not an
                             * oversight. `icons.md` marks the glyphs the DS ships in only one
                             * weight (`link-simple`, `globe`, `premium`…); `share` is not one of
                             * them, so its default weight is a real choice rather than the only
                             * option. A chevron has no meaningful outline form — it is a stroke
                             * either way, and `--filled` only thickens it — while a filled share
                             * glyph is a solid mass that reads as the loudest thing in a bar whose
                             * job is to stay out of the way.
                             */
                            name="share"
                            label={t('channel_share')}
                            className={CHANNEL_BAR_CONTROL}
                            onClick={() => setShareOpen(true)}
                        />
                    )}
                    {/*
                     * The overflow menu — mute, follow/unfollow, block. **Viewers only**: every row
                     * in it is something one account does about another, and an owner has no use
                     * for any of them.
                     *
                     * It was deferred on the grounds that the DS dropdown was not ported. It is:
                     * `shared/ui/menu.tsx`, on base-ui, already worn by the Live tab's filter and
                     * the event row's menu. See `ChannelViewerMenu` for what it does and does not
                     * carry (Report is the one legacy row still missing).
                     */}
                    {!isOwner && (
                        <ChannelViewerMenu
                            channel={channel}
                            triggerClassName={CHANNEL_BAR_CONTROL}
                        />
                    )}
                </AppBarCluster>
            </AppBar>

            {/*
             * Mounted beside the bar rather than inside the cluster: the bar is `sticky` with its
             * own stacking context, and a dialog rendered inside it would portal out anyway. Only
             * when the space has a link — the same condition the button itself is behind.
             */}
            {channel.shareable_url && (
                <ShareDialog
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                    url={channel.shareable_url}
                    title={title}
                    image={channel.images.thumb}
                    context={spaceShareContext(channel)}
                />
            )}
        </div>
    )
}
