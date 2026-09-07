'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { TopEarningItem } from '../api/types'
import { formatItemTime } from '../lib/format'

/**
 * The period's best-earning content — thumbnail, what it is, when it went out, what it made.
 *
 * ## A hand-composed row, not a DS list row
 *
 * `List/Row`'s leading slot is 48px and holds a tile or an avatar; this row's thumbnail is a 56px
 * **16:9-ish media still**, which is a different component — and the DS's media rows (`card media`,
 * `media player`) are among the five families that were never ported
 * (`docs/DESIGN_SYSTEM.md`). Bending `ListRow` into it would misrepresent the port, so the row is
 * flex and every value in it is a token or a `type-*` utility. `MembershipRow` makes the opposite
 * call — `List/User Item` genuinely fits an avatar row — and the difference is which DS node the
 * content actually is.
 *
 * ## Rows are not links, yet
 *
 * The payload carries no post code or URL — only a title, a tag, a time and a figure — so there is
 * nothing to navigate to. Legacy renders them as plain rows too. When the endpoint grows a code,
 * the row becomes an `<a>` to the post; until then it is text, because a row that looks pressable
 * and is not is worse than a row that does not (see `BalanceActionRows` on dead controls).
 *
 * ## The thumbnail
 *
 * `next/image`, so it is optimised and lazy like every other remote image in the app — which means
 * its host has to be in `next.config.ts`'s `remotePatterns`. These are post and stream stills off
 * the same CDN as covers and avatars (`**.tevicdn.com` and friends), which is already listed. An
 * item with no thumbnail gets the glyph tile rather than a broken image or a grey void: this list is
 * short, and a hole in it reads as a failure.
 */
export function TopEarningCard({
    items,
    className,
    style,
}: {
    items: TopEarningItem[]
    className?: string
    /** Carries the entrance's `animationDelay` — see the view's `riseDelay`. */
    style?: CSSProperties
}) {
    const { t, currentLanguage } = useTranslation()

    return (
        <section
            style={style}
            className={cn(
                'flex flex-col rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface) p-4',
                className,
            )}
        >
            <h2 className="type-body-strong pb-2 text-(--text-title)">
                {t('analytics_top_earning_title')}
            </h2>

            <ul className="flex list-none flex-col p-0">
                {items.map((item, index) => (
                    <li
                        key={item.key}
                        className={cn(
                            'flex items-center gap-3 py-3',
                            // A hairline between rows and none under the last: the card's own border
                            // is already the closing edge.
                            index < items.length - 1 && 'border-b border-(--separator-default)',
                        )}
                    >
                        <div className="relative size-14 flex-none overflow-hidden rounded-[var(--radius-md)] bg-(--background-subtle)">
                            {item.thumbnail ? (
                                <Image
                                    src={item.thumbnail}
                                    alt=""
                                    fill
                                    // The box is 56px at every breakpoint, so the optimizer is told
                                    // exactly that rather than left to guess from the viewport.
                                    sizes="56px"
                                    className="object-cover"
                                />
                            ) : (
                                <span className="flex size-full items-center justify-center text-(--icon-secondary)">
                                    <Icon name="image" size={20} aria-hidden />
                                </span>
                            )}
                        </div>

                        <div className="flex min-w-0 flex-auto flex-col gap-1">
                            {item.tag ? (
                                <Badge size="small" className="self-start">
                                    {item.tag}
                                </Badge>
                            ) : null}
                            {/* `line-clamp-2` rather than `truncate`: a post title is a sentence, and
                                one line of it on a phone is usually not enough to tell two apart. */}
                            <p className="type-dense-emphasis line-clamp-2 text-(--text-title)">
                                {item.title}
                            </p>
                            {item.time !== null ? (
                                <p className="type-caption-meta text-(--text-subtitle)">
                                    {formatItemTime(item.time, currentLanguage)}
                                </p>
                            ) : null}
                        </div>

                        {/* `tabular-nums` so the figures align down the column — Inter's
                            proportional digits make `1` narrower than `8`, which is invisible in a
                            sentence and very visible in a stack of amounts. */}
                        <p className="type-body-strong flex-none text-(--text-title) tabular-nums">
                            {item.display || '—'}
                        </p>
                    </li>
                ))}
            </ul>
        </section>
    )
}
