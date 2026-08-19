'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import {
    Banner,
    BannerSubtitle,
    BannerText,
    BannerTile,
    BannerTitle,
    BannerTrailing,
} from '@shared/ui/banner'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import type { Channel } from '../api/types'
import { useUpdatePrivacy } from '../hooks/use-update-privacy'

/**
 * The owner's "your space is unpublished — publish it" banner. Legacy's
 * `containers/channel/components/creator/components/content/unpublishedChannel`.
 *
 * ## This is the `owner-unpublished` half of the state table
 *
 * `channelVisibility` has answered `owner-unpublished` since it was written and
 * `channel-flags.ts` documents it as "full shell **plus** a publish banner" — but nothing
 * rendered the banner, so the state was indistinguishable from `normal` on screen. The only
 * thing telling an owner their space was invisible to everyone else was the padlock beside
 * their name (`channel-identity.tsx`), which says *that* it is shut and not *how to open it*.
 *
 * ## `Banner`, not `Alert` — the row is the point
 *
 * This started as an `Alert`, which was the wrong DS component and looked it: a neutral card
 * with the button stacked **under** two lines of text. Legacy's banner is one row — artwork,
 * text, and the action on the trailing edge — and the DS draws exactly that as
 * `Banner type="branded"` (Figma 37:8711): 48px tile, title + subtitle, `__trailing` button.
 * `Alert` is the surface for reporting a failure; this is a call to action, so it is the
 * surface for one. See the note in `shared/ui/banner.tsx`.
 *
 * ## Beside the tabs, not instead of them
 *
 * Legacy renders this **in place of** its tab strip, so an unpublished creator cannot reach
 * their own posts from their own space. That is the one deliberate divergence here: the tabs
 * stay (`showsChannelTabs` already returns `true` for this state), because nothing is being
 * withheld from the owner — the space is hidden from *other people*, and a banner is the
 * honest way to say so.
 *
 * ## Why publishing confirms here and not in Settings
 *
 * `spaceVisibilityConfirmKey('public')` is `null` — opening a space back up takes nothing
 * away, so `/settings/space-visibility` applies it on the press. That rule is unchanged and
 * this does not route around it: what is being confirmed here is not the consequence, it is
 * the **press**. Settings is a screen you went to in order to change this; the banner is a
 * button sitting above your own posts, and the transition is rate-limited to one per 24
 * hours — so a mis-press costs a day. Legacy confirms from the banner too, with this same
 * sentence.
 */
export function ChannelPublishBanner({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    const [confirmOpen, setConfirmOpen] = useState(false)
    /*
     * The slug is what invalidates `channelKeys.detail` — this very page's copy of the
     * channel. Without it the write would land on `my-channel/` and the banner would still be
     * on screen, over a channel body that had already been told it is public.
     */
    const { update, isPending } = useUpdatePrivacy(channel.slug)

    return (
        <>
            {/*
             * **`tone="warning"`, not the DS's branded gradient.** Every banner type Figma
             * draws is a promotion, so its fill is brand purple and its text is White — and
             * that fill says *offer* over a card that is telling the owner their space is shut.
             * Legacy paints this band `#FFF8D7`; `--accents-warning-bg-active` is the token
             * for it (`#fefce8` light, `#1f1c0d` dark) and unlike the hex it survives Dark.
             * The geometry stays Figma's, only the four tone colours change — see
             * `shared/ui/banner.tsx`.
             */}
            <Banner tone="warning" className={cn('flex-none', RISE)}>
                {/*
                 * **A padlock, and it is the nearest honest glyph rather than the right one.**
                 * Legacy fills this tile with a hand-drawn person-behind-a-padlock SVG; the DS
                 * sprite has no such glyph and no `eye-slash` either, and this repo does not
                 * hand-draw paths (`shared/ui/icon.tsx`). `lock-simple` is what every other
                 * surface in the app already uses for this state — the padlock beside the
                 * channel name, the visitor's wall, the `/settings/space-visibility` tile — so
                 * it is at least the *same* glyph everywhere the state appears. Worth a design
                 * pass, same as the note in `lib/space-visibility.ts`.
                 */}
                <BannerTile>
                    <Icon name="lock-simple" weight="filled" size={24} />
                </BannerTile>
                <BannerText>
                    <BannerTitle>{t('channel_state_unpublished_title')}</BannerTitle>
                    {/*
                     * **`truncate={false}`, overriding Figma's `textTruncation: ENDING`.** The
                     * DS clips this line to keep the branded card at exactly 80px, which is
                     * right for the marketing copy it was drawn with ("Upgrade to keep all
                     * features"). Ours is an instruction that ends in the 24-hour rule — the
                     * one fact the owner needs *before* pressing — and it does not fit on one
                     * line at any width this column takes, let alone on a phone. A card that
                     * grows beats a sentence that stops at "You can only switch…".
                     */}
                    <BannerSubtitle truncate={false}>{t('channel_publish_body')}</BannerSubtitle>
                </BannerText>
                <BannerTrailing>
                    {/*
                     * **`accent`, not `primary`.** `primary` is `--zinc-950` — the neutral that
                     * inverts with the mode — and it is the right paint for a *neutral* press
                     * (Confirm, Save, Continue). This is the card's reason for existing: the
                     * one action the owner is here to take. Accent is what carries that in
                     * this product, and it is the house rule for action buttons generally, not
                     * a choice this banner made on its own.
                     */}
                    <Button
                        variant="accent"
                        size="medium"
                        onClick={() => setConfirmOpen(true)}
                        disabled={isPending}
                    >
                        {t('channel_action_publish')}
                    </Button>
                </BannerTrailing>
            </Banner>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('space_visibility_confirm_title')}
                description={t('space_visibility_note_24h')}
                confirmLabel={t('channel_action_publish')}
                // "Close", not "Cancel" — nothing is being cancelled, the change has not
                // started. Same wording as the visibility screen's dialog.
                cancelLabel={t('common_close')}
                /*
                 * Closes on the press rather than holding a spinner: the write is optimistic
                 * (`useUpdatePrivacy` patches `privacy` and rolls back on failure), so the
                 * banner disappearing *is* the acknowledgement, and a failure rolls it back
                 * and toasts.
                 */
                onConfirm={() => {
                    setConfirmOpen(false)
                    update('public')
                }}
            />
        </>
    )
}
