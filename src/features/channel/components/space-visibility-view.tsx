'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import {
    Alert,
    AlertActions,
    AlertContent,
    AlertIcon,
    AlertSubtitle,
    AlertTitle,
} from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useId, useState } from 'react'
import type { ChannelPrivacy } from '../api/types'
import { useUpdatePrivacy } from '../hooks/use-update-privacy'
import {
    isSpaceVisibilityChange,
    SPACE_VISIBILITY_OPTIONS,
    spaceVisibilityConfirmKey,
} from '../lib/space-visibility'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelEmptyState } from './channel-empty-state'
import { SpaceVisibilityOption } from './space-visibility-option'

/**
 * `/settings/space-visibility` — pick who can see your space.
 *
 * Legacy: `containers/spaceVisibilitySettings`. Same three options, same copy, same rule about
 * which ones need confirming. The option table and that rule live in `lib/space-visibility.ts`;
 * this file is the states around them, and the states are most of the work.
 *
 * ## The action is gated, not the route
 *
 * A signed-out visitor gets a prompt with a sign-in button, not a redirect to `/login`. That is
 * the app's rule everywhere (`CLAUDE.md`): whatever someone was looking at stays on screen and
 * `useRequireAuth` raises the dialog in place. `isAuthenticated` already excludes the anonymous
 * session the app mints on bootstrap, so an anonymous visitor is treated as signed out — which
 * is correct, since an anonymous account has no space to configure.
 *
 * A signed-in account with **no** channel is normally unreachable here: `MyChannelProvider`
 * replaces every route with the onboarding gate in that state. It is still handled, for the one
 * way through — the `my-channel/` query erroring, which `onboardingGate` deliberately reads as
 * "we do not know" rather than "no channel" so the app stays usable. See `MySpaceRedirect`,
 * which keeps the same fallback for the same reason.
 *
 * ## Why an error is its own screen
 *
 * Rendering the picker with nothing selected while the fetch is failing invites someone to
 * "fix" it by choosing a mode — and the mode they choose could be the one it is already in, or
 * the write could spend their one transition per 24 hours undoing nothing. So a failed read is
 * a retry, not a form.
 *
 * ## The animation, and why it is only two things
 *
 * The regions rise in on a 60ms stagger (`RISE` / `riseDelay`), which is the app's one entrance
 * — 240ms on the menu drawer's own curve, reused rather than invented, because Figma carries no
 * motion layer (`shared/lib/motion.ts`). Everything else that moves is a *state* change and is a
 * transition, not an animation: the card's ring and tint, the radio's fill and dot, the press
 * scale. The "Current" badge is the single exception and uses `tevi-pop`, because a badge that
 * appears when something became true is exactly what that keyframe is for. Every one of them is
 * off under `prefers-reduced-motion`.
 */
export function SpaceVisibilityView() {
    const { t } = useTranslation()
    const { isAuthenticated, isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()
    const { myChannel, isLoading, isError, refresh } = useMyChannel()
    const { update, isPending, writing } = useUpdatePrivacy(myChannel?.slug)

    /**
     * The confirm dialog, as **two** pieces of state rather than one nullable value.
     *
     * `confirming` is what it is asking about and `confirmOpen` is whether it is showing, and
     * they are separate because the dialog does not disappear when it closes — base-ui plays a
     * 200ms exit (`shared/ui/dialog.tsx`). Collapsing them into one nullable value means that
     * for the whole of that exit `confirming` is `null`, so the sentence explaining the
     * consequence unmounts and the confirm button flips from red back to blue *while the
     * dialog is still on screen*. Keeping the value past the close is what makes it fade out
     * looking like what the person was just reading.
     *
     * `confirming` is deliberately not cleared on close: nothing reads it while the dialog is
     * shut, and the next selection overwrites it.
     */
    const [confirming, setConfirming] = useState<ChannelPrivacy | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)

    /*
     * One `name` for the whole group is what makes it a radio group to the browser — one tab
     * stop, arrow keys moving the selection. `useId` rather than a literal because the drawer
     * or a future dialog could mount this twice, and two groups sharing a `name` would behave
     * as one.
     */
    const groupName = useId()

    const privacy = myChannel?.privacy

    function select(next: ChannelPrivacy) {
        // Serialised: the endpoint allows one transition per 24 hours, so a second overlapping
        // write is a request that is going to fail — with the rate-limit error, for a change
        // nobody asked for twice.
        if (isPending) return
        if (!isSpaceVisibilityChange(privacy, next)) return

        // Confirm the directions that take something away; apply the one that gives it back.
        if (spaceVisibilityConfirmKey(next)) {
            setConfirming(next)
            setConfirmOpen(true)
        } else {
            update(next)
        }
    }

    /**
     * The confirm button, and it re-runs the same two gates `select` did.
     *
     * Not belt-and-braces: the dialog is a pause of arbitrary length, and the value it is
     * asking about can stop being a change while it is open — another tab or another device
     * setting the same visibility, which the `storage` event and a refetch both propagate into
     * this screen. Firing anyway would spend the account's one transition per 24 hours on a
     * write that changes nothing. Doing nothing is the right outcome and needs no message: the
     * card behind the dialog is already showing that option as current.
     */
    function confirm() {
        setConfirmOpen(false)
        if (!confirming || isPending) return
        if (!isSpaceVisibilityChange(privacy, confirming)) return
        update(confirming)
    }

    if (isBootstrapping || isLoading) {
        return (
            <div className="flex flex-col gap-3 px-3 pt-3 pb-6 md:px-6" aria-busy="true">
                {/* The real card heights, not three equal bars: the options are 1, 3 and 8
                    lines of copy, so equal placeholders would let the page jump twice on
                    load. `docs/DEFINITION_OF_DONE.md` §1. The 160ms stagger is the DS
                    skeleton's own pulse. */}
                {[96, 148, 268].map((height, index) => (
                    <Skeleton key={height} h={height} delay={index * 160} className="rounded-xl" />
                ))}
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <ChannelEmptyState
                testId="channel-visibility-signed-out"
                icon="user-simple-alt"
                title={t('channel_signed_out_title')}
                // `flex-1`, so the prompt sits in the middle of the space it has rather than
                // clinging to the bar on a desktop window. The page's `main` and column are
                // both `flex-1`; this is the last link in that chain.
                className={cn('flex-1', RISE)}
                action={
                    <Button
                        data-testid="channel-visibility-sign-in"
                        variant="primary"
                        size="large"
                        onClick={requireAuth(() => {
                            // Signing in re-runs `useMyChannel`; this screen re-renders with
                            // the real value and needs to do nothing else.
                        })}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />
        )
    }

    if (isError) {
        return (
            <div className={cn('px-3 pt-3 md:px-6', RISE)}>
                <Alert status="error">
                    <AlertIcon status="error" />
                    <AlertContent>
                        <AlertTitle>{t('channel_error_title')}</AlertTitle>
                        <AlertSubtitle>{t('channel_error_body')}</AlertSubtitle>
                        <AlertActions>
                            <Button
                                data-testid="channel-visibility-refresh"
                                variant="secondary"
                                size="small"
                                onClick={() => refresh()}
                            >
                                <Icon name="arrow-rotate-right" size={20} />
                                {t('common_retry')}
                            </Button>
                        </AlertActions>
                    </AlertContent>
                </Alert>
            </div>
        )
    }

    /*
     * Signed in, no channel — and **not** the same screen as the error above, which is the
     * distinction `channelApi.getMyChannel` exists to preserve (a 404 resolves as `null`
     * rather than throwing). "This space could not be loaded, try again" is the wrong thing
     * to say to someone who does not have one: there is nothing to retry, and the answer is
     * to create it.
     *
     * Normally unreachable — `MyChannelProvider` shows the onboarding gate instead of every
     * route in this state — so this is the fallback for the one way past it, the query
     * erroring while `onboardingGate` reads that as "we do not know". Same fallback, same
     * copy, as `MySpaceRedirect`.
     */
    if (!myChannel) {
        return (
            <ChannelEmptyState
                icon="user-sparkles-alt"
                title={t('channel_no_channel_title')}
                body={t('channel_no_channel_body')}
                className={cn('flex-1', RISE)}
                action={
                    <Button
                        data-testid="channel-visibility-retry"
                        variant="secondary"
                        size="large"
                        onClick={() => refresh()}
                    >
                        <Icon name="arrow-rotate-right" size={20} />
                        {t('common_retry')}
                    </Button>
                }
            />
        )
    }

    return (
        <div className="flex flex-col gap-3 px-3 pt-3 pb-6 md:px-6">
            {/*
             * `<fieldset>` + a visually-hidden `<legend>`, which is the native grouping for a
             * set of radios: it is what gives the group a name in the accessibility tree
             * ("Space visibility, radio group") instead of three unrelated controls. The legend
             * is hidden because the page's `<h1>` already says it 40px above — printing it
             * twice would be the accessible version of a duplicate heading.
             *
             * `aria-busy` while a write is in flight, on the group rather than on each option:
             * one operation is running, not three.
             */}
            <fieldset
                className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
                aria-busy={isPending || undefined}
            >
                <legend className="sr-only">{t('space_visibility_title')}</legend>
                {SPACE_VISIBILITY_OPTIONS.map((option, index) => (
                    <SpaceVisibilityOption
                        key={option.value}
                        option={option}
                        name={groupName}
                        id={`${groupName}-${option.value}`}
                        label={t(option.titleKey)}
                        body={t(option.bodyKey)}
                        bullets={option.bulletKeys.map(key => t(key))}
                        /*
                         * `checked` and `current` are the same value here, because the write
                         * is optimistic — the cached channel already carries the new value
                         * while the request is in flight. They are two props because they are
                         * two questions ("is this the selection" / "is this what is saved"),
                         * and `busy` is what stands between them on screen: the badge is
                         * replaced by a loader until the server agrees.
                         */
                        checked={privacy === option.value}
                        current={privacy === option.value}
                        currentLabel={t('space_visibility_current')}
                        busy={writing === option.value}
                        softDisabled={isPending}
                        onSelect={() => select(option.value)}
                        className={RISE}
                        style={riseDelay(index)}
                    />
                ))}
            </fieldset>

            {/*
             * The rate limit, said **before** it bites rather than only inside the confirm
             * dialog and the failure toast. It is the one thing about this screen that cannot
             * be undone by pressing the other option, so it belongs where it can be read
             * without committing to anything.
             */}
            <p
                className={cn(
                    'type-caption-meta flex items-start gap-2 px-1 text-(--text-subtitle)',
                    RISE,
                )}
                style={riseDelay(SPACE_VISIBILITY_OPTIONS.length)}
            >
                <Icon
                    name="info-circle"
                    size={16}
                    className="mt-[2px] flex-none text-(--icon-secondary)"
                />
                {t('space_visibility_note_24h')}
            </p>

            {/*
             * Every prop below reads `confirming`, which outlives the close — so the sentence
             * and the button colour are still there while the dialog fades out. See the state
             * declaration for why that is two pieces of state and not one.
             */}
            <ConfirmDialog
                testId="channel-visibility-confirm"
                open={confirmOpen}
                onOpenChange={open => {
                    if (!open) setConfirmOpen(false)
                }}
                title={t('space_visibility_confirm_title')}
                description={
                    confirming ? t(spaceVisibilityConfirmKey(confirming) ?? '') : undefined
                }
                confirmLabel={t('common_confirm')}
                // Legacy's word for this button is "Close", not "Cancel", and it is the better
                // one: nothing is being cancelled — the change has not started.
                cancelLabel={t('common_close')}
                /*
                 * Only unpublishing is destructive, and the distinction is not decoration:
                 * protecting a space hides content until you unprotect it, while unpublishing
                 * stops existing memberships auto-renewing — money that does not come back
                 * when you republish. A red button on both would say they are the same.
                 */
                destructive={confirming === 'unpublished'}
                /*
                 * `confirm` closes immediately rather than holding the dialog open on a
                 * spinner. The dialog was the deliberation; the outcome belongs on the screen
                 * that owns the setting — where the radio has already moved and the badge is
                 * showing a loader — not in a modal that is about to disappear. A failure
                 * rolls the radio back and toasts (`useUpdatePrivacy`).
                 */
                onConfirm={confirm}
            />
        </div>
    )
}
