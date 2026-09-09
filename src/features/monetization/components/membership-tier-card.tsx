'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import { MEMBERSHIP_ART } from '../lib/illustrations'

/**
 * The hero on `/monetization/membership` — the tier's name and its monthly Star price, between a
 * crown bleeding off one edge and a mascot on the other.
 *
 * ## It is a tinted card, painted from the **Primary ramp** — and that is what makes it survive Dark
 *
 * Legacy paints `#FEF6FF` inside a `#CD7EF4` hairline: a lilac wash, hard-coded, in an app that has
 * a dark theme. The DS has no card for this shape — `Card type="premium"` is the gold Premium
 * gradient and `type="balance"` is the pinned black money card — and there is no `--accents-purple`
 * family either. There *is* the brand ramp, and Tevi's brand is that purple (`--primary-500` is
 * `#501bc0`, legacy's own button fill).
 *
 * So: `--primary-50` ground inside a `--primary-300` hairline. The Primary ramp **inverts between
 * modes** (`--primary-50` is `#f6f2fe` in Light and `#140735` in Dark — see `CLAUDE.md`), which is
 * exactly the property wanted here: the same two tokens give a pale lilac card on a light page and a
 * deep aubergine one on a dark page, with no variant and no second set of values.
 *
 * The **ink is a text token, not a ramp step**. `--text-title` and `--text-body`, which invert with
 * the ground, never `--text-brand`: brand ink on a brand tint is the pair that fails contrast, and
 * this repo has already been bitten by the sibling case (`--text-on-brand` vs `--text-brand`, and
 * `--text-on-primary` inside the balance card).
 *
 * ## Both marks are decorative and neither is allowed to eat a press
 *
 * `alt=""`, `aria-hidden`, `pointer-events-none`, and pinned with the logical `start-*` / `end-*` so
 * the card mirrors under `ar` — legacy pins them physically, which puts the crown on top of the
 * name in Arabic. The text column sits above both (`z-1`) so a long tier name in a locale that
 * needs the room runs over the mascot instead of being clipped behind it.
 */
export function MembershipTierCard({
    name,
    starPrice,
    className,
}: {
    name: string
    /** The tier's Star figure. `0` prints as `0` — a free tier is a real thing to have set up. */
    starPrice: number
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()

    return (
        <div
            data-testid="monetization-membership-tier"
            className={cn(
                'relative flex min-h-[100px] flex-none flex-col justify-center overflow-hidden rounded-xl',
                'border border-(--primary-300) bg-(--primary-50) px-6 py-4',
                className,
            )}
        >
            <Image
                src={MEMBERSHIP_ART.crown.src}
                width={MEMBERSHIP_ART.crown.width}
                height={MEMBERSHIP_ART.crown.height}
                alt=""
                aria-hidden
                className="pointer-events-none absolute start-0 top-1/2 -translate-y-1/2 select-none"
            />
            <Image
                src={MEMBERSHIP_ART.banner.src}
                width={MEMBERSHIP_ART.banner.width}
                height={MEMBERSHIP_ART.banner.height}
                alt=""
                aria-hidden
                className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 select-none"
            />

            <div className="relative z-1 flex min-w-0 flex-col gap-0.5">
                <p
                    data-testid="monetization-membership-tier-name"
                    className="type-body-strong m-0 truncate text-(--text-title)"
                >
                    {name}
                </p>
                <div className="flex items-center gap-1">
                    <StarMark size={16} />
                    <span
                        data-testid="monetization-membership-tier-price"
                        className="type-title-t2-bold text-(--text-title)"
                    >
                        {starPrice.toLocaleString(currentLanguage)}
                    </span>
                    <span className="type-dense-default text-(--text-body)">
                        {t('monetization_membership_per_month')}
                    </span>
                </div>
            </div>
        </div>
    )
}
