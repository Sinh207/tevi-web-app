'use client'

import { safeExternalUrl } from '@shared/lib/safe-url'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { Channel } from '../api/types'
import { isWebLink, SOCIAL_ICON, SOCIAL_MARK_SIZE, socialMarkUrl } from '../lib/social-links'
import { ChannelAboutCard } from './channel-about-card'
import { ChannelCopyLink } from './channel-copy-link'

/**
 * The Details card — description, the space's link, social links, categories.
 *
 * ## Four rows, no headings, full-bleed rules between them
 *
 * Legacy is one `<Card>` holding up to four `<CardContent>`s at 12px padding with a `<Divider/>`
 * between each. **None of them is labelled**: the description has no "Description" above it, the
 * chips have no "Social links". An earlier pass added those headings and it read as a form. The rule
 * between two rows is the only separation legacy uses, and it is enough — `divide-y` reproduces it
 * exactly, including the full-bleed span a padded rule would not have.
 *
 * Each row is conditional, so `divide-y` is also doing the thing a hand-placed rule cannot: with one
 * row present there is no rule, with three there are two, and neither case needs to be written down.
 *
 * ## Yes, this repeats the header
 *
 * All four are already above. Legacy shows them again here, in both its trees, and it is not an
 * oversight: the header's copies are **abbreviated** — the bio is clamped to three lines, the socials
 * are bare 24px marks with no names, the categories are not there at all. This card is the unabridged
 * version, which is what an "About" tab is for.
 *
 * The one thing it does *not* repeat is the joined date: that reads as a fact about the account rather
 * than about the space, and legacy keeps it in the header only.
 *
 * ## Identical on both surfaces
 *
 * Unlike the tab it sits in, this block is the same for an owner and a visitor — legacy's two `details`
 * components differ only in which context they read the channel from, and in a font-size drift on the
 * description (16 in `creator/`, 14 in `viewer/`) that is drift rather than intent. So it takes a
 * `Channel` and no ownership flag, which is the rule everywhere except the four places the surfaces
 * genuinely diverge.
 */
export function ChannelAboutDetails({ channel }: { channel: Channel }) {
    const customLink = channel.social_links.find(link => link.platform === 'custom_link') ?? null
    const platformLinks = channel.social_links.filter(link => link !== customLink)
    const categories = channel.categories
    const links = [customLink, ...platformLinks].filter(link => link !== null)

    const hasAnything =
        channel.description || channel.shareable_url || links.length > 0 || categories.length > 0
    if (!hasAnything) return null

    return (
        <ChannelAboutCard className="divide-y divide-(--separator-default)">
            {channel.description && (
                <div className="min-w-0 p-3">
                    {/*
                     * Unclamped here, deliberately — the header's copy is the one that stops at three
                     * lines with a "more". Somewhere has to hold the whole thing, and this is it.
                     */}
                    <p className="type-dense-default whitespace-pre-line break-words text-(--text-title)">
                        {channel.description}
                    </p>
                </div>
            )}

            {channel.shareable_url && (
                <div className="min-w-0 p-3">
                    {/*
                     * The same control the header's identity block uses, at the 20px mark and
                     * 16/medium text legacy draws here. One component rather than two copies of the
                     * copy behaviour: this row and that one are the same offer, and they had already
                     * drifted apart once on the globe glyph.
                     */}
                    <ChannelCopyLink
                        url={channel.shareable_url}
                        size={20}
                        className="type-body-emphasis"
                    />
                </div>
            )}

            {links.length > 0 && (
                <div className="min-w-0 p-3">
                    {/*
                     * MUI `Chip variant="outlined"` with an `avatar`: 32 tall, fully rounded, 1px
                     * hairline, label 14/medium, and the mark inset at the leading edge. `gap-1` is
                     * legacy's `mr: 0.5, mb: 0.5` (4px both ways) on a wrapping row.
                     */}
                    <ul className="flex min-w-0 flex-wrap items-center gap-1">
                        {links.map(link => {
                            const href = safeExternalUrl(link.url)
                            if (!href) return null
                            const platform = link.platform ?? ''
                            const spriteName = SOCIAL_ICON[platform]
                            const label = link.title ?? platform

                            return (
                                <li key={link.id} className="min-w-0">
                                    <a
                                        data-testid="channel-social-link"
                                        data-row-key={link.id}
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="type-dense-emphasis flex h-8 min-w-0 items-center gap-1.5 rounded-[var(--radius-fill)] border border-(--separator-default) ps-1.5 pe-3 text-(--text-title) transition-colors hover:bg-(--background-subtle)"
                                    >
                                        {/* Same two rules as the header's socials row: one globe
                                            for "a website", never the outlined brand mark — and
                                            the brand/UI size pair, because a chip mixes the two
                                            families exactly as that row does. See
                                            `SOCIAL_MARK_SIZE`. */}
                                        {isWebLink(platform) ? (
                                            <Icon
                                                name="globe"
                                                weight="filled"
                                                size={SOCIAL_MARK_SIZE.ui}
                                                className="flex-none"
                                            />
                                        ) : spriteName ? (
                                            <Icon
                                                name={spriteName}
                                                size={SOCIAL_MARK_SIZE.brand}
                                                className="flex-none"
                                            />
                                        ) : (
                                            <Image
                                                src={socialMarkUrl(platform)}
                                                alt=""
                                                width={SOCIAL_MARK_SIZE.brand}
                                                height={SOCIAL_MARK_SIZE.brand}
                                                className="size-6 flex-none rounded-full"
                                            />
                                        )}
                                        <span className="min-w-0 truncate">{label}</span>
                                    </a>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}

            {categories.length > 0 && (
                <div className="min-w-0 p-3">
                    {/* The same chip without the mark, so the padding is even rather than inset. */}
                    <ul className="flex min-w-0 flex-wrap items-center gap-1">
                        {categories.map(category => (
                            <li
                                // The name is the identity — the wire sends bare strings and the
                                // set is a fixed taxonomy, so there is nothing else to key on.
                                key={category}
                                className="type-dense-emphasis flex h-8 items-center rounded-[var(--radius-fill)] border border-(--separator-default) px-3 text-(--text-title)"
                            >
                                {category}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </ChannelAboutCard>
    )
}
