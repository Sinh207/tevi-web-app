'use client'

import { BecomeAMemberDialogs, type MembershipTarget, useJoinFlow } from '@features/membership'
import { Sheen } from '@shared/components/sheen'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { GIFT_BOB, RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import type { ReactNode } from 'react'
import type { EventDetail } from '../api/types'
import { useUnlockEvent } from '../hooks/use-unlock-event'

/**
 * The two ways into a gated stream — **join the membership**, or **pay for this one broadcast** —
 * and the dialogs behind each.
 *
 * Legacy's `common/exclusive/actionButtons`, which picks between three shapes:
 *
 * | required packages | priced | controls |
 * |---|---|---|
 * | yes | yes | *Become a Member* · "or" · *Purchase access* |
 * | yes | no | *Become a Member* |
 * | no | yes | *Purchase access* |
 *
 * Its fourth branch — a *Sign in* button for a guest — is **not** reproduced, and its absence is the
 * point: both controls here are wrapped by guards that open the sign-in dialog themselves
 * (`useRequireStars` composes `useRequireAuth`; `useJoinFlow`'s write does the same). A guest
 * therefore sees the real offer and is asked to sign in *at the press*, which is this app's rule —
 * gate the action, never the route — instead of being shown a button that hides what is on sale.
 *
 * ## Membership is the accent when both routes exist
 *
 * Legacy paints purchase grey (`#F4F4F4`) whenever the membership route is also available, and that
 * hierarchy is right rather than incidental: a membership is a relationship and a ticket is one
 * night, so when both are offered the creator's own preference is the recurring one. With only one
 * control on screen it takes the accent, because it is then the single action.
 *
 * ## `enabled` is why this is not just `BecomeAMemberButton`
 *
 * That component decides its own copy and its own dialog set, and it queries the space's tiers on
 * sight. Here the tiers are only worth asking about when the stream actually requires one — most
 * gated streams are priced, not members-only — so the flow is taken headless and the query gated.
 * `useJoinFlow`'s own doc names this exact case as the reason it exists.
 */
export function EventUnlockActions({
    event,
    requiresMembership,
    fallback,
}: {
    event: EventDetail
    requiresMembership: boolean
    /**
     * Rendered instead when **neither** route can be completed here.
     *
     * The caller cannot compute that condition itself: `canOffer` comes from a query inside this
     * component (the space's tiers), so "a members-only stream whose only tier is cash-priced" is
     * knowable here and nowhere else. Taking the fallback as a node keeps one owner for the
     * decision — the alternative is reporting the answer upward through state, which is a render
     * the parent has to throw away.
     */
    fallback?: ReactNode
}) {
    const { t, currentLanguage } = useTranslation()
    const unlock = useUnlockEvent(event)

    const target: MembershipTarget = {
        slug: event.channel?.slug ?? '',
        name: event.channel?.name ?? null,
        id: event.channel?.id ?? null,
        avatarUrl: event.channel?.images.thumb ?? null,
    }
    /*
     * Hooks run unconditionally — `enabled` is what stops the request, not a conditional call. With
     * `requiresMembership` false the tiers are never fetched and `canOffer` is false, so the control
     * is simply not drawn.
     */
    const join = useJoinFlow(target, { enabled: requiresMembership && Boolean(target.slug) })

    const showMembership = requiresMembership && join.canOffer
    const showUnlock = unlock.canUnlock

    // Nothing this client can complete: a members-only stream whose space sells no Star-priced
    // tier, or a priced one whose payload carries no `product_id`. The panel around this still says
    // what the gate is; what it offers instead is the caller's `fallback` — the app hand-off, since
    // the app can complete both purchases.
    if (!showMembership && !showUnlock) return <>{fallback}</>

    const price = formatStarAmount(unlock.price, currentLanguage)

    return (
        <div className="flex w-full min-w-0 flex-col gap-2">
            {showMembership && (
                <Button
                    data-testid="event-become-member"
                    variant="accent"
                    size="large"
                    fullWidth
                    onClick={join.open}
                    className={cn('relative overflow-hidden', RISE)}
                    style={riseDelay(2)}
                >
                    {/* The recurring offer catches the light — a slow sheen across the accent. */}
                    <Sheen strength="brightest" />
                    {/* The membership crown — the same glyph the space's own Become a member
                        button and the join dialog's CTA carry. */}
                    <Icon name="crown" weight="filled" size={20} className="relative" />
                    <span className="relative">{t('event_become_a_member')}</span>
                </Button>
            )}

            {showMembership && showUnlock && (
                /*
                 * Legacy's `<Divider>or</Divider>` — a rule with the word centred in it. Built from
                 * two flex rules rather than a border-with-background trick so it is correct on any
                 * surface: this panel is `--background-surface` below `md` and a card above it, and
                 * a word with an opaque background would show its own patch on one of the two.
                 */
                <div
                    aria-hidden
                    className={cn('flex min-w-0 items-center gap-3', RISE)}
                    style={riseDelay(3)}
                >
                    <span className="h-px flex-1 bg-(--separator-default)" />
                    <span className="type-caption-meta text-(--text-placeholder)">
                        {t('event_or')}
                    </span>
                    <span className="h-px flex-1 bg-(--separator-default)" />
                </div>
            )}

            {showUnlock && (
                <Button
                    data-testid="event-unlock"
                    variant={showMembership ? 'secondary' : 'accent'}
                    size="large"
                    fullWidth
                    disabled={unlock.isPending}
                    aria-busy={unlock.isPending || undefined}
                    onClick={unlock.request}
                    className={RISE}
                    style={riseDelay(showMembership ? 4 : 2)}
                >
                    {t('event_purchase_access', { price })}
                    <span className={cn('flex', GIFT_BOB)}>
                        <StarMark size={16} />
                    </span>
                </Button>
            )}

            {/*
             * The confirmation legacy shows before the charge, with the same two questions in it.
             * `ConfirmDialog` derives its own sub-part ids from `testId`, which is why no `*TestId`
             * props are threaded — `shared/ui`'s note explains why that is deliberate.
             */}
            <ConfirmDialog
                open={unlock.isConfirming}
                onOpenChange={next => {
                    if (!next) unlock.cancel()
                }}
                title={t('event_unlock_confirm_title')}
                description={t('event_unlock_confirm_body', { price })}
                confirmLabel={t('common_confirm')}
                onConfirm={unlock.confirm}
                pending={unlock.isPending}
                testId="event-unlock-confirm"
            />

            {/* Become a member → Confirm → Success. Mounted only when the route is offered, so a
                priced-only stream pays for none of it. */}
            {showMembership && <BecomeAMemberDialogs flow={join} target={target} />}
        </div>
    )
}
