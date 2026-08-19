'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { Channel } from '../api/types'
import { useChannelActions } from '../hooks/use-channel-actions'

/**
 * The viewer's action row.
 *
 * ## ⚠ This row is **not** in the design system
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`. Every candidate was checked:
 *
 * - `preview/space.html` draws only the *owner* row (Custom profile + Earning report).
 * - `.tevi-card[data-type="space"]` **does not exist** — the only `space` value in the whole
 *   stylesheet is `.tevi-card-user-header[data-type="space"]`.
 * - `banner`'s eight types are marketing (branded, campaign, countdown, gradient…). Using one for an
 *   action row would be a misuse of a component built around a gradient and a promo CTA.
 * - `button-extra` is `Button/Block` (a 55×62 *vertical tile* drawn for a livestream gift rail) and
 *   `Button/Gift` (an 88×108 tile with a price pill). Neither is "Donate" or "Message".
 *
 * So it is composed from the DS `Button`, which is the honest fallback: every variant used below is
 * one Figma actually ships.
 *
 * ## What is missing from the DS, stated plainly
 *
 * Legacy's "already a member" button is `#E5FFEB` on `#008D1F` — a **success-tinted** button. The DS
 * `Button` has `primary | secondary | ghost | accent | destructive` and no such state. That variant
 * needs to come from design; it is not invented here, and `shared/ui/button.tsx` is deliberately not
 * given a `success` variant, because that file must only say what the DS says.
 *
 * Membership, donation, messages and the mini app are each their own plan, so their buttons are
 * absent rather than present-and-inert — a row of four disabled controls tells the reader nothing.
 * Follow is the one action that is fully backed today.
 */
export function ChannelViewerActions({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    const { follow, unfollow } = useChannelActions(channel)

    const isProtected = channel.privacy === 'protected'
    const isRequested = channel.follow_requested && !channel.is_followed

    /**
     * Three states on one button, and the order matters: `requested` before `followed`, because a
     * protected space sets `follow_requested` while `is_followed` stays false.
     */
    const label = isRequested
        ? t('channel_action_requested')
        : channel.is_followed
          ? t('channel_action_following')
          : isProtected
            ? t('channel_action_request_follow')
            : t('channel_action_follow')

    const isActive = channel.is_followed || isRequested
    const pending = follow.isPending || unfollow.isPending

    return (
        <div className="flex min-w-0 items-center gap-2">
            <Button
                // Filled while there is nothing yet to undo, quiet once there is — the DS's own
                // primary/secondary distinction, not a colour invented for this row.
                variant={isActive ? 'secondary' : 'primary'}
                size="large"
                className="flex-1"
                // `useRequireAuth` already wraps these handlers, so an anonymous visitor gets the
                // login dialog rather than a route change: the *action* is gated, never the page.
                onClick={channel.is_followed || isRequested ? unfollow.run : follow.run}
                // Disabled only while a request is in flight. DoD §2: a mutation's control must not
                // be pressable twice.
                disabled={pending}
                aria-live="polite"
            >
                {/*
                 * `check` for the followed state, not `user-check` — the sprite has no
                 * `user-check` (nor `user-slash`), and the seven `user-*` glyphs it does carry are
                 * `plus`, `heart-alt`, `simple-alt`, `sparkles-alt`, `swich`, `wave` and
                 * `chalkboard-play`. Substituting one of those would say something else; a plain
                 * check beside the word "Following" says exactly what happened.
                 */}
                <Icon name={isActive ? 'check' : 'user-plus'} weight="filled" size={20} />
                {label}
            </Button>
        </div>
    )
}
