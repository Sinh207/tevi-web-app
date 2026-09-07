'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemHandle,
    ListUserItemInfo,
    ListUserItemName,
    ListUserItemNameRow,
    ListUserItemPreview,
} from '@shared/ui/list'
import { type GiftRecipient, giftRecipientName } from '../api/gift-types'

/**
 * One person a gift can be sent to: avatar, name with its marks, handle.
 *
 * The DS `List/User Item` with no `__cta` slot — the row has one action, so the row *is* the
 * control.
 *
 * ## A `<button>`, where the search screen's row is an `<a>`
 *
 * That is the one structural difference from `SearchChannelRow`, and it is the right one: pressing
 * this row **selects** somebody, it does not navigate anywhere. An anchor would offer middle-click,
 * "open in new tab" and a status-bar preview for a destination that does not exist, and it would be
 * announced as a link to a screen reader planning where to go next.
 *
 * `type="button"` is not decoration either: this row is rendered inside the picker, and a default
 * `submit` inside any future form ancestor would post it.
 *
 * ## No identity in the id
 *
 * Every row shares `premium-gift-recipient` and is told apart by `data-channel-slug`, per
 * `docs/TEST_IDS.md`: our identities contain `-` and some are user-chosen, so concatenating one into
 * a selector breaks on the first handle with a quote in it.
 *
 * ## The avatar animates, as it does on `/search`
 *
 * `isPremium` is passed through rather than pinned to `false`. Two lists of the same people in one
 * app that disagree about whether faces move is the kind of inconsistency nobody files and everybody
 * notices — and `AnimatedAvatar` already gates playback on visibility, reduced motion and
 * `saveData`, so the cost is bounded by what is actually on screen.
 */
export function GiftRecipientRow({
    recipient,
    rule,
    onSelect,
    testId = 'premium-gift-recipient',
}: {
    recipient: GiftRecipient
    /** Draw a hairline above this row. Every row but the first. */
    rule: boolean
    onSelect: () => void
    testId?: string
}) {
    const { t } = useTranslation()

    const name = giftRecipientName(recipient)
    const label = name || `@${recipient.slug}`

    return (
        <li>
            <button
                type="button"
                data-testid={testId}
                data-channel-slug={recipient.slug}
                onClick={onSelect}
                /*
                 * `-outline-offset-2` (inward) rather than the usual positive offset: the panel that
                 * holds these rows clips its children, so a ring drawn *outside* a row flush against
                 * the card's edge is cut off — which is how a focus ring goes missing on exactly the
                 * first and last rows of a list.
                 */
                className="block w-full text-start outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                {/*
                 * Surface, not Listing, and the hover is Segment — the two token overrides
                 * `search-channel-row.tsx` documents in full. Short version: `ListUserItem` paints
                 * `--background-listing`, which is `--black` in Dark and identical to `--background`,
                 * so an un-overridden row repaints the page colour over the card it sits in; and
                 * `--background-subtle` is the same `#18181b` as `--background-surface` in Dark, so a
                 * subtle hover would do nothing at all.
                 */}
                <ListUserItem className="bg-(--background-surface) transition-colors hover:bg-(--background-segment)">
                    <ListUserItemAvatar className="items-center">
                        <AnimatedAvatar
                            size="large"
                            thumb={recipient.images.thumb}
                            avatarVideo={recipient.images.avatar_video}
                            isPremium={recipient.is_premium}
                            /* Decorative: the button's own text already names this person. */
                            alt=""
                            initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                        />
                    </ListUserItemAvatar>

                    <ListUserItemContent>
                        {rule && <ListRowRule />}
                        {/*
                         * `items-center` on both the avatar and the preview: the DS draws them
                         * `items-start` for a three-line conversation row, and this row has two
                         * lines — top alignment leaves the avatar sitting visibly above the name it
                         * belongs to.
                         */}
                        <ListUserItemPreview className="items-center">
                            <ListUserItemInfo>
                                <ListUserItemNameRow className="w-full">
                                    <ListUserItemName premium={recipient.is_premium}>
                                        {label}
                                    </ListUserItemName>
                                    {/* The badge *image* is the fact — an unverified account sends
                                        `{}`, so there is nothing to draw without art. */}
                                    <VerifiedBadge
                                        image={recipient.verified_tick_badge?.image ?? null}
                                        size={24}
                                    />
                                    {/*
                                     * `title` rather than `aria-hidden`: this mark is information,
                                     * not decoration — it is the only thing on the row that says the
                                     * space is sensitive, and it is read out with the name.
                                     */}
                                    {recipient.is_nsfw && (
                                        <Icon
                                            name="nsfw"
                                            weight="filled"
                                            size={18}
                                            title={t('channel_nsfw')}
                                            className="flex-none text-(--icon-secondary)"
                                        />
                                    )}
                                </ListUserItemNameRow>
                                <ListUserItemHandle>@{recipient.slug}</ListUserItemHandle>
                            </ListUserItemInfo>
                        </ListUserItemPreview>
                    </ListUserItemContent>
                </ListUserItem>
            </button>
        </li>
    )
}
