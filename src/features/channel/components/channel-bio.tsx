'use client'

import { NsfwInfoDialog } from '@features/nsfw'
import { useTranslation } from '@shared/i18n/use-translation'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useState } from 'react'
import type { Channel, ChannelSocialLink } from '../api/types'
import { formatJoinedDate } from '../lib/channel-format'
import { isWebLink, SOCIAL_ICON, SOCIAL_MARK_SIZE, socialMarkUrl } from '../lib/social-links'
import { ChannelDescription } from './channel-description'

/**
 * Description, links, joined date and the NSFW label — the DS's `__description`, `__meta` and
 * `__socials` rows.
 *
 * **Every row disappears when it has no value**, which is legacy's behaviour (`return null` in each
 * of the six sub-components) and not an accident. A channel with no bio and no links renders a
 * compact header, rather than a stack of empty lines each reserving a text height.
 */
export function ChannelBio({
    channel,
    /** The reader owns this space — the NSFW row then offers the appeal. See `ChannelNsfwLabel`. */
    isOwner = false,
    /**
     * A sensitive space whose gate is unanswered: the **creator's own writing and destinations** are
     * withheld with the art.
     *
     * The two rows that go are the two the creator authored — the description and every link
     * (the named custom one and the platform marks alike). A bio is free text and a link is a place
     * the reader has not agreed to be sent yet, so the gate cannot both withhold the cover and leave
     * a paragraph plus a row of taps to somewhere else standing above it.
     *
     * The two that stay are ours, not theirs: the joined date is a fact about the account, and the
     * NSFW label is the gate's own subject — hiding *that* would take away the one line explaining
     * why the rest is missing. The identity block above (name, handle, the space's own address) is
     * untouched for the reason in `ChannelNsfwGate` — hiding it only hid the address.
     */
    withheld = false,
}: {
    channel: Channel
    isOwner?: boolean
    withheld?: boolean
}) {
    const { t, currentLanguage } = useTranslation()

    /**
     * `custom_link` is separated out and rendered with its **title**, not its URL — it is the one
     * social link a creator names themselves, and legacy gives it its own row with a globe glyph
     * above the row of platform marks.
     */
    const customLink = channel.social_links.find(link => link.platform === 'custom_link') ?? null
    const platformLinks = channel.social_links.filter(link => link !== customLink)
    const joined = formatJoinedDate(channel.created_at, currentLanguage)

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {!withheld && channel.description && <ChannelDescription text={channel.description} />}

            {!withheld && customLink && <ChannelMetaLink link={customLink} />}

            {!withheld && platformLinks.length > 0 && (
                /*
                 * `gap-0`, not the `gap-1` this had while every mark was a 24px glyph filling a
                 * 24px box. Each mark now centres its ink in that box with 2–2.4px to spare on
                 * either side (`SOCIAL_MARK_SIZE`), so the row still separates at the ~4px it
                 * always showed. `gap-1` on top of that would space it at 8px.
                 */
                <ul className="flex min-w-0 flex-wrap items-center gap-0">
                    {platformLinks.map(link => (
                        <ChannelSocialMark key={link.id} link={link} />
                    ))}
                </ul>
            )}

            {joined && (
                <p className="type-body-default flex min-w-0 items-center gap-1 text-(--text-subtitle)">
                    {/* 20 — see the note on `ChannelMetaLink` for why, and for why it is not the
                        DS's 16. It was 24, the full line box of 16/1.5 text. */}
                    <Icon
                        name="calendar"
                        weight="filled"
                        size={20}
                        className="flex-none"
                        aria-hidden="true"
                    />
                    {t('channel_joined_on', { date: joined })}
                </p>
            )}

            {channel.is_nsfw && <ChannelNsfwLabel isOwner={isOwner} />}
        </div>
    )
}

/**
 * The `NSFW` row — a **button**, because the acronym is the one thing in this block a reader can be
 * expected not to know.
 *
 * Legacy renders a CDN glyph plus the literal, untranslated string "NSFW", and nothing happens when
 * you press it. Same shape here — through the sprite and through `t()`, since an untranslated label
 * in a nine-locale app is a bug that happens to be invisible in English — but pressable, opening
 * `NsfwInfoDialog`, which is what the native app does from this exact row.
 *
 * ## A button that looks like the meta rows around it
 *
 * It sits in a column with the joined date, and the two are the same *kind* of thing: facts about
 * the space. So it keeps that column's type and `--text-subtitle` ink rather than becoming a link —
 * the row above it is already `--text-link` and means "somewhere else on the web", which this is
 * not. What marks it as pressable is the hover, plus `w-fit` so the target is the words and not the
 * full width of a 612px column.
 *
 * The glyph stays subtitle-grey; the dialog's copy of it is pink. See `NsfwInfoDialog` for why the
 * same mark is drawn twice in two colours — and for what the **owner** additionally gets behind this
 * row, which is the appeal.
 *
 * `type="button"` explicitly: this block sits inside no form today, and a bare `<button>` in one
 * submits it.
 */
function ChannelNsfwLabel({ isOwner }: { isOwner: boolean }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                data-testid="channel-bio-nsfw"
                type="button"
                onClick={() => setOpen(true)}
                className="type-body-default flex w-fit min-w-0 items-center gap-1 text-start text-(--text-subtitle) transition-colors hover:text-(--text-title)"
            >
                <Icon
                    name="nsfw"
                    weight="filled"
                    size={20}
                    className="flex-none"
                    aria-hidden="true"
                />
                {t('channel_nsfw')}
            </button>
            <NsfwInfoDialog open={open} onOpenChange={setOpen} canAppeal={isOwner} />
        </>
    )
}

/**
 * The creator's own named link — `__meta[data-tone="link"]` in the DS.
 *
 * ## A globe, not a link glyph, and the reason is two rows up
 *
 * This used to render `link-simple`, which is also what the identity block's hint uses for
 * `tevi.com/@slug`. Two rows in the same header, both `--text-link`, both behind the same chain
 * glyph, meaning completely different things: one is **this space's own address**, the other is
 * **somewhere else the creator is pointing you**. Nothing about the pair said which was which.
 *
 * Legacy separates them and this is a straight port of how: `iconLink` for the space's URL,
 * `iconGlobe` for the custom link. A globe is the right mark for "off this site", and it is the same
 * glyph the socials row and the About tab's chips now draw for a `website` link — see `isWebLink`,
 * which exists because those three places had drifted onto two different globes.
 *
 * ## Every glyph in this block is 20 — and the DS says 16
 *
 * Read that as a decision, not as drift. `preview/space.html` draws `__meta-icon` and the socials
 * row beside it at 16; this ships 20, chosen by eye against the real thing at the real viewport.
 * If you are reconciling this file against the DS, **this is the one number not to "fix"** — put
 * it back to 16 only with someone who has looked at both.
 *
 * What was definitely wrong is what these were before: 24. That is not a size the DS uses here at
 * all, and it is exactly the line box of 16px text at `--line-height-default` (1.5) — a filled mark
 * occupying the whole line against a cap height of roughly 11px, which read as the loudest thing in
 * the bio. The comments that justified it cited legacy's marks; legacy is the reference for
 * *behaviour*, not geometry, and the DS owns that (`CLAUDE.md`).
 *
 * 20 is also the size the About tab's link chips already use (`channel-about-details.tsx`), so the
 * two places a visitor meets these same links now agree.
 *
 * ## 16/regular text, and why it is not brought down to the hint's 14
 *
 * Legacy draws both links at 16, differing only in weight (500 for the space URL, 400 here). The DS
 * pins the hint at 14 as part of `CardUserHeader[type=space]`'s fixed 51, so that half cannot move.
 * Rather than shrink this one to match, it stays at 16 with the description and the joined date: it
 * belongs to the **bio** block, which is content the creator wrote, while the hint belongs to the
 * identity block above it. The two blocks reading as two tiers is the hierarchy, and the glyph is
 * what tells them apart at a glance.
 */
function ChannelMetaLink({ link }: { link: ChannelSocialLink }) {
    // User-controlled: a `javascript:` bio link would run as the visitor, on our origin.
    const href = safeExternalUrl(link.url)
    if (!href) return null

    return (
        <p className="type-body-default flex min-w-0 items-center gap-1 text-(--text-link)">
            <Icon name="globe" weight="filled" size={20} className="flex-none" />
            <a
                data-testid="channel-bio-link"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate hover:underline"
            >
                {link.title ?? href}
            </a>
        </p>
    )
}

/**
 * One platform mark.
 *
 * The **CDN image is the source of truth**, with the sprite as a fast path for the thirteen brands
 * it happens to carry. That order is deliberate: the platform list is server-driven (legacy fetches
 * `social-links/supported-platforms/` into its editor), so it is an open set the sprite cannot
 * cover — twitch, threads, reddit, whatsapp and kick are all absent from it today. Inverting the
 * order would mean a new platform silently renders nothing.
 *
 * ## Two sizes for one row, and a box that is neither
 *
 * `SOCIAL_MARK_SIZE` — a brand logo carries a 10% safe area inside its viewBox and a UI glyph does
 * not, so drawing both at one number makes every brand mark look 20% small next to the globe. The
 * reasoning and the measurements are on the constant.
 *
 * The **anchor is a third number** and deliberately so: it stays `size-6`, because these are the
 * only links in the header that are pure icon, with no text to extend the target, and 24px is
 * already under any touch guidance. It is a tap target, not a size spec — what the mark should
 * look like and how much of the page listens for the tap are different questions.
 */
function ChannelSocialMark({ link }: { link: ChannelSocialLink }) {
    const href = safeExternalUrl(link.url)
    if (!href) return null

    const platform = link.platform ?? ''
    const spriteName = SOCIAL_ICON[platform]
    const label = link.title ?? platform

    return (
        <li className="flex-none">
            <a
                data-testid="channel-bio-social"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                className="flex size-6 items-center justify-center text-(--icon-default)"
            >
                {/* Not a brand, so not a brand mark — see `isWebLink`. Filled, like the marks
                    beside it and like legacy's `icon-globe`. */}
                {isWebLink(platform) ? (
                    <Icon name="globe" weight="filled" size={SOCIAL_MARK_SIZE.ui} />
                ) : spriteName ? (
                    <Icon name={spriteName} size={SOCIAL_MARK_SIZE.brand} />
                ) : (
                    <Image
                        src={socialMarkUrl(platform)}
                        alt=""
                        width={SOCIAL_MARK_SIZE.brand}
                        height={SOCIAL_MARK_SIZE.brand}
                        className="size-6"
                    />
                )}
            </a>
        </li>
    )
}
