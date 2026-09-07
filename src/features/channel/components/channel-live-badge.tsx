'use client'

import { LottieAnimation } from '@shared/components/lottie-animation'
import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'

/** Legacy's `icon_live_main.json`, copied out of the old repo rather than fetched from anywhere. */
const LIVE_ANIMATION = '/lotties/icon-live-main.json'

/**
 * The "LIVE" flag over a broadcasting space's avatar — legacy's animation, with a real fallback.
 *
 * ## Two renderings of one fact, and the static one is not a degradation
 *
 * The animation is what legacy draws and what the design intends. But mounting it downloads
 * ~185 KB (a 168 KB player plus a 17 KB JSON of base64 frames), and there are readers this app
 * must not spend that on: somebody who asked the OS for **reduced motion**, and somebody on
 * **data saver**. `useMayAnimate` answers for both — the same answer `AnimatedAvatar` already uses
 * to still an avatar's video, so a page cannot end up stilling one and looping the other.
 *
 * For them the DS `Badge/Live Status` says the same word in the same red. It is not a placeholder
 * for something better: the fact is "this space is live", the animation is emphasis, and dropping
 * emphasis is the correct thing to drop.
 *
 * The static badge is also what **the server renders and what hydrates**, because `useMayAnimate`
 * starts `false` on both sides by design — so the first paint is a badge that already says the
 * right thing, and the animation replaces it a moment later rather than filling a hole.
 *
 * ## Sizing is legacy's, not the avatar's
 *
 * `width: 80` at every breakpoint by default, as legacy sets it — the flag stays the same size
 * whether it sits on the 80px phone avatar or the 120px desktop one. The height comes from the
 * animation's own 540×178 box through `aspect-ratio` rather than a rounded 26px, so nothing is
 * squashed by a fraction of a pixel.
 *
 * `className` is there because **80 is right for an avatar and wrong for a thumbnail**: the
 * `/following` strip draws this over a 16/9 tile that is ~138px wide on a phone, where the default
 * covers more than half the picture. Only the animated rendering takes it — the static fallback is
 * a `Badge`, which is content-sized and already smaller, and forcing a width onto it would clip the
 * word rather than scale it. So the two renderings converge as the override shrinks, which is the
 * direction that matters.
 */
export function ChannelLiveBadge({ className }: { className?: string }) {
    const { t } = useTranslation()
    const mayAnimate = useMayAnimate()
    const label = t('channel_event_live')

    if (!mayAnimate) {
        return (
            <Badge size="small" status="error" className="uppercase">
                {label}
            </Badge>
        )
    }

    return (
        <LottieAnimation
            src={LIVE_ANIMATION}
            ariaLabel={label}
            className={cn('aspect-[540/178] w-20', className)}
        />
    )
}
