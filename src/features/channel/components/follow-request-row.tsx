'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemCta,
    ListUserItemHandle,
    ListUserItemInfo,
    ListUserItemMeta,
    ListUserItemName,
    ListUserItemNameRow,
    ListUserItemPreview,
} from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { type FollowRequest, listUserName } from '../api/types'
import type { FollowRequestAction } from '../hooks/use-follow-requests'
/*
 * Aliased at the import, not renamed at the source — the same call `blocked-account-row.tsx`
 * makes: the function is a short localised date, and `formatJoinedDate(entry.created_at)` reads
 * like a bug at a call site where the date is when somebody asked to follow.
 */
import { formatJoinedDate as formatShortDate } from '../lib/channel-format'
import { toChannelPath } from '../lib/channel-slug'

/**
 * One pending follow request: who is asking, and the two answers.
 *
 * The DS `List/User Item` (2089:2965) with its `__cta` slot filled — the sibling of
 * `BlockedAccountRow`, and deliberately built the same way rather than shared with it: the two
 * rows differ in the slot that matters (one control against two, one of which is destructive)
 * and agree on everything the DS already owns. A `<ListRow variant>` covering both would be a
 * component whose props are the union of two screens' decisions.
 *
 * ## What this row decides that the blocked row does not
 *
 * **Two buttons, and only one of them is brand-coloured.** Accept is the `accent` press — the
 * brand purple, which is what this app paints an affirmative action with (`edit-profile-view`'s
 * Save makes the same call and says why). Decline is `secondary`: it is not destructive in the
 * DS's sense — nothing of the *reader's* is destroyed — but it is the answer that cannot be
 * taken back, so it must not carry the same weight as Accept. Legacy paints it grey for the
 * same reason and this is the token version of grey.
 *
 * **`size="small"`.** Two buttons plus a name have to fit a 390px phone beside a 48px avatar,
 * and the arithmetic decides it: 390 less the row's 32px of padding and the avatar's 48 + 12
 * leaves 298 for the text and the controls. Two `medium` buttons (h36, px16) take ~177 of that;
 * two `small` ones held at a shared 76px take 160, and the 18px they give back is the difference
 * between a display name that truncates mid-word and one that does not. The blocked row can
 * afford `medium` because it has one control, not two.
 *
 * **The date line is "Requested …", and it is the one line that may not be there.** Legacy shows
 * name and handle only; `created_at` is what turns a queue of strangers into something you can
 * act on ("this has been waiting a week"). The payload's carrying of it is a guess (B77), so the
 * row drops the line and centres its two when it is absent — which is also what fills the DS's
 * three-line stack when it is present.
 *
 * The exit is presentation only; the cache write behind it is `useFollowRequests`'s timer.
 */
export function FollowRequestRow({
    entry,
    rule,
    /** This row's own answer is in flight, and which one it was. */
    pending,
    /**
     * *Some* row's answer is in flight. The list is single-flight, so while this is true and
     * `pending` is null, neither of this row's buttons can act and neither must offer to.
     */
    busy = false,
    exiting,
    onRespond,
    /**
     * Milliseconds of entrance delay. The list staggers its first screen and hands later rows
     * `0` — see `FollowRequestsView`.
     */
    enterDelay = 0,
    locale,
}: {
    entry: FollowRequest
    rule: boolean
    pending: FollowRequestAction | null
    busy?: boolean
    exiting: boolean
    onRespond: (action: FollowRequestAction) => void
    enterDelay?: number
    locale: string
}) {
    const { t } = useTranslation()

    const { user } = entry
    const name = listUserName(user)
    const label = name || (user.slug ? `@${user.slug}` : t('follow_requests_unknown_user'))
    const requestedOn = formatShortDate(entry.created_at, locale)
    const verifiedImage = user.verified_tick_badge?.image ?? null

    const identity = (
        <>
            <ListUserItemNameRow className="w-full">
                <ListUserItemName premium={user.is_premium}>{label}</ListUserItemName>
                {/* The badge *image* is the fact, and the gate lives in `VerifiedBadge`: the
                    payload object is present (`{}`) on an ordinary unverified account, so there is
                    nothing to draw without art — no sprite fallback. */}
                <VerifiedBadge image={verifiedImage} size={24} />
            </ListUserItemNameRow>
            {user.slug && <ListUserItemHandle>@{user.slug}</ListUserItemHandle>}
        </>
    )

    /**
     * The two buttons, built once rather than twice: everything about them differs by one
     * value apiece, and writing them out twice is how the pair drifts — the disabled rule in
     * particular, which is the thing keeping a single-flight list honest.
     *
     * Decline first in the DOM, as it is in legacy and in `ConfirmDialog`: the affirmative
     * answer sits at the end of the row, where the thumb and the reading order both land last.
     */
    const answers: {
        action: FollowRequestAction
        variant: 'secondary' | 'accent'
        /** Written out rather than derived from `label` — a key built by template is a key no
         *  grep for the translation file can find. */
        label: string
        ariaLabel: string
    }[] = [
        {
            action: 'decline',
            variant: 'secondary',
            label: 'follow_requests_decline',
            ariaLabel: 'follow_requests_decline_name',
        },
        {
            action: 'accept',
            variant: 'accent',
            label: 'follow_requests_accept',
            ariaLabel: 'follow_requests_accept_name',
        },
    ]

    return (
        /*
         * The animated box is the `<li>`, and the row inside it keeps its 80px — so the content
         * is *clipped* as the gap closes rather than squashed, which is what makes
         * `overflow-hidden` load-bearing rather than tidy.
         *
         * `aria-hidden` while exiting, because the row is on its way out of the document and a
         * screen reader announcing a name that is fading is noise. `pointer-events-none` for the
         * same reason at the other end: both buttons are still in the DOM for 320ms and must not
         * be pressable.
         */
        <li
            aria-hidden={exiting || undefined}
            className={cn(
                'overflow-hidden',
                exiting
                    ? 'pointer-events-none animate-[tevi-row-collapse_320ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:hidden motion-reduce:animate-none'
                    : 'animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none',
            )}
            style={!exiting && enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
        >
            {/* Surface over Listing, and Segment for hover — both forced by dark mode, both
                explained at length on `blocked-account-row.tsx`. The panel and its rows have to
                agree on this or the card is a surface with black stripes across it. */}
            <ListUserItem className="bg-(--background-surface) transition-colors hover:bg-(--background-segment)">
                {/* `items-center` when the row is a two-line one, matching the text column
                    beside it — the DS slot is `items-start`, which is right for a three-line
                    conversation row and visibly high on a two-line one. */}
                <ListUserItemAvatar className={requestedOn ? undefined : 'items-center'}>
                    <AnimatedAvatar
                        size="large"
                        thumb={user.avatar.thumb}
                        avatarVideo={user.avatar.avatar_video}
                        /*
                         * The avatar never animates, as on the blocked list: a queue of Premium
                         * creators' clips looping while somebody decides who to let in is the
                         * wrong thing for this screen to spend attention — and a battery — on.
                         */
                        isPremium={false}
                        /*
                         * Decorative. It sits in its own column *outside* the link — the anchor
                         * wraps the name and handle only — so it is a picture of somebody whose
                         * name is announced two elements later.
                         */
                        alt=""
                        initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                </ListUserItemAvatar>

                <ListUserItemContent>
                    {rule && <ListRowRule />}
                    <ListUserItemPreview className={requestedOn ? undefined : 'items-center'}>
                        <ListUserItemInfo>
                            {/* The name is a link and the buttons are its siblings — no nested
                                interactive elements, and all three reachable by keyboard in the
                                order they are read. A row whose payload carried no slug renders
                                the same block without the anchor rather than a link to `/@`. */}
                            {user.slug ? (
                                <Link
                                    data-testid="channel-follow-request-link"
                                    data-channel-slug={user.slug}
                                    href={toChannelPath(user.slug)}
                                    className="flex w-full min-w-0 flex-col items-start rounded-(--radius-sm) no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                >
                                    {identity}
                                </Link>
                            ) : (
                                identity
                            )}
                            {requestedOn && (
                                <ListUserItemMeta>
                                    {t('follow_requests_requested_on', { date: requestedOn })}
                                </ListUserItemMeta>
                            )}
                        </ListUserItemInfo>

                        <ListUserItemCta className="self-center gap-2">
                            {answers.map(({ action, variant, label: labelKey, ariaLabel }) => {
                                const running = pending === action
                                return (
                                    <Button
                                        data-testid="channel-follow-request-action"
                                        data-row-key={action}
                                        key={action}
                                        variant={variant}
                                        size="small"
                                        /*
                                         * Two kinds of unavailable, and they must not be the
                                         * same attribute — `blocked-account-row.tsx` draws the
                                         * distinction and it holds here for both buttons.
                                         *
                                         * `aria-disabled` on the button that was just pressed:
                                         * it is the focused element, and `disabled` blurs it,
                                         * dropping a keyboard user to the top of the document
                                         * by their own successful press. `respond()` in the
                                         * hook is what actually refuses the second press.
                                         *
                                         * `disabled` on every button that is *not* the one
                                         * running — including this row's other one, since a
                                         * request cannot be accepted and declined at once.
                                         * Nothing is mid-interaction there, so taking them out
                                         * of the tab order is the honest answer.
                                         */
                                        disabled={(busy || pending !== null) && !running}
                                        aria-disabled={running || undefined}
                                        onClick={() => onRespond(action)}
                                        /*
                                         * The visible label is one word, so it is the same word
                                         * on every row — `aria-label` is what tells a screen
                                         * reader *whose* request this answers. Without it, a
                                         * queue of twenty rows is forty buttons called Accept
                                         * and Decline.
                                         */
                                        aria-label={t(ariaLabel, { name: label })}
                                        className="min-w-[76px]"
                                    >
                                        {/* The label stays put and the loader takes the leading
                                            slot, so the button does not change width mid-request
                                            and shove the row's text. */}
                                        {running && <Loader className="size-[16px]" />}
                                        {t(labelKey)}
                                    </Button>
                                )
                            })}
                        </ListUserItemCta>
                    </ListUserItemPreview>
                </ListUserItemContent>
            </ListUserItem>
        </li>
    )
}
