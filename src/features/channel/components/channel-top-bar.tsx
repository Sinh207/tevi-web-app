'use client'

import { ShareDialog, spaceShareContext } from '@features/share'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Channel } from '../api/types'
import { CHANNEL_CONTAINER } from '../lib/container'
import { ChannelVerifiedMark } from './channel-verified-mark'
import { ChannelViewerMenu } from './channel-viewer-menu'

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
 * ## The title is back, the rule under it is not
 *
 * The name was removed from this bar once, on the grounds that it is thirty pixels below in
 * `CardUserHeader` at `type-title-t2-bold` and repeating it says the same thing twice on one screen.
 * That reading is still true at the top of the page and stops being true the moment you scroll: past
 * the header there is nothing on screen naming whose space this is. Restored by request, with the
 * verified mark beside it.
 *
 * ⚠ It shows **always**, not on scroll. The pattern that resolves the duplication properly is to
 * reveal it once the header's own name leaves the viewport, and that is a scroll listener plus a
 * transition — deliberately not added here, because the same listener was declined for the blurred
 * bar below and one of those two decisions would then be wrong.
 *
 * The `border-b` did **not** come back. The header card starts immediately below and carries its own
 * rounded top edge from `md`, which already reads as an edge; a rule there drew a line across the
 * page for a boundary that does not exist.
 *
 * **The `h1` stays in the header**, and this title is a `<span>`. Two headings saying the same thing
 * is worse than one, and the one worth keeping is the full-width original rather than the copy
 * truncated to fit between two buttons.
 *
 * ## Legacy's blurred fading bar is not reproduced
 *
 * Legacy pins the bar `position: fixed` on mobile and fades in a blurred copy of the cover behind it
 * past `scrollTop >= 60`, driven by a scroll listener on its own scroll container — a container this
 * app does not have, since the window scrolls. Reproducing it means re-adding that listener plus a
 * `backdrop-filter` layer and a duplicate background image, for a decorative effect.
 *
 * The DS's answer for a bar over a cover is `App Bar data-theme="overlay"`, and `app-bar.css` states
 * that Figma applies **no backdrop blur anywhere on that page** — the translucent fill is used bare.
 * A third reason: the DS cover has no scrim, so a light cover under a translucent bar would be
 * unreadable. Opaque, sticky, `--background`. If product wants the immersive look later, the honest
 * route is the overlay-theme AppBar positioned over the cover, which is a DS-backed change.
 */
export function ChannelTopBar({
    channel,
    isOwner = false,
}: {
    channel: Channel
    /** Hides the overflow menu — nothing in it applies to the person whose space it is. */
    isOwner?: boolean
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
     * Falls back to the handle for a channel with no display name — a real state, the field is
     * nullable. `@slug` identifies the space where an empty bar identifies nothing, and it is the
     * same fallback `channel-identity.tsx` uses so the two never disagree.
     */
    const title = channel.name ?? `@${channel.slug}`

    return (
        // 60px tall and `top-0 z-20`, matching the sticky-bar precedent in `/brand-assets`. The tab
        // strip parks under it at `top-[60px] z-10`, so the two make one 108px stack.
        <div className="sticky top-0 z-20 bg-(--background-surface) md:bg-(--background) print:hidden">
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
            <AppBar className={cn(CHANNEL_CONTAINER, 'md:px-0 max-md:px-0')}>
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
                        onClick={() => {
                            // Same rule as `PageBackBar`: a channel opened from a shared link has
                            // no history to go back to, so fall through to home rather than
                            // leaving the button dead.
                            if (window.history.length > 1) router.back()
                            else router.push('/')
                        }}
                    />
                </AppBarCluster>

                {/*
                 * The channel's name, centred — the DS default for `AppBarTitle`.
                 *
                 * A `<span>`, **not** a second `h1`. The document's heading is the display name in
                 * `channel-identity.tsx`, at full width and full size; this is a copy of it squeezed
                 * between two buttons, so promoting it would give the page two `h1`s that say the
                 * same thing and hand a screen-reader user the truncated one first.
                 *
                 * `AppBarTitle`'s centred variant is `position: absolute` at 50% with a translate
                 * back, which means it does **not** participate in the flex row and will happily run
                 * under the buttons. The two 40px discs plus the bar's own padding are 56px a side,
                 * so the cap is `100% - 112px` — written as a calc rather than a guessed `max-w-[60%]`
                 * because the buttons are a fixed size and the viewport is not.
                 */}
                <AppBarTitle className="max-w-[calc(100%-112px)]">
                    {/*
                     * `w-full`, and it is load-bearing. `AppBarTitle` is a **column** flex with
                     * `items-center`, so a child without an explicit width sizes to its content and
                     * simply ignores the parent's `max-width` — a long display name painted straight
                     * across both buttons, cap or no cap. Taking the parent's width is what puts the
                     * child inside the constraint so `truncate` has something to truncate against.
                     */}
                    <div className="flex w-full min-w-0 items-center justify-center gap-1">
                        <AppBarTitleText className="min-w-0 truncate">{title}</AppBarTitleText>
                        {/*
                         * 24, and **not** the 16 that matched the title's own 16px.
                         *
                         * Matching the type size is the rule this row used to follow, and at 16 the
                         * tick reads as punctuation rather than as a mark. 24 is what fits without
                         * costing anything: `AppBarTitleText` is `type-body-strong` and
                         * `--line-height-default` is 1.5, so the title's line box is already 24px —
                         * and the bar itself is a fixed `h-[60px]` (`shared/ui/app-bar.tsx`). The
                         * badge therefore grows into space that was already there and cannot move
                         * the bar. Same number as the rows use, one scale rather than per-surface.
                         */}
                        <ChannelVerifiedMark channel={channel} size={24} />
                    </div>
                </AppBarTitle>

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
                    {!isOwner && <ChannelViewerMenu channel={channel} />}
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
