'use client'

import { useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { MONETIZATION_PATH } from '@features/monetization/routes'
import { PageBackBar } from '@features/navigation'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { type ReactNode, useState } from 'react'
import { formatRemaining, useCooldown } from '../hooks/use-cooldown'
import { useSpaceTier } from '../hooks/use-space-tier'
import { SPACE_TIER_CONTAINER, SPACE_TIER_FOOTER, SPACE_TIER_PANEL } from '../lib/container'
import { EstimateCard } from './estimate-card'
import { SpaceTierFaq } from './space-tier-faq'
import { SpaceTierSkeleton } from './space-tier-skeleton'
import { ConfirmTierDialog, TierChangedDialog } from './tier-dialogs'
import { TierSelector } from './tier-selector'

/**
 * `/space-tier` — legacy's `SpaceTierModal`, as a page.
 *
 * The content and the rules are legacy's, unchanged: the ladder opens on the current tier, the
 * button reads "Change to Tier N" and is disabled while the selection is the current tier, is
 * locked (tiers 5 and 10 need an unlock — `available_tiers`), or is inside the 24h cooldown, in which
 * case it reads "Available in HH:MM:SS" and re-enables itself when the count reaches zero rather
 * than waiting for the backend's stale `can_change`.
 *
 * What moved: the modal's *Cancel* is the bar's back control, its action footer is a sticky bar
 * (`SPACE_TIER_FOOTER`), and closing the success step leaves the reader on this screen.
 *
 * One addition: a locked tier says *why* it is locked, under the button. Legacy ships that sentence
 * in every locale (`space_tier_w2_tier_s_and_tier_s_require_your_space`) and never renders it, so its
 * button simply goes dead on tiers 5 and 10 with nothing to explain it.
 */
export function SpaceTierView() {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const {
        state,
        isLoading,
        isError,
        refetch,
        estimate,
        isEstimateLoading,
        changeTier,
        isChanging,
    } = useSpaceTier()

    /*
     * The *tier* the reader picked, not an index — so a refetch that reorders or extends the ladder
     * cannot move the selection to a different tier. `null` means "not touched yet", which reads as
     * the current tier: legacy resets to it every time the modal opens.
     */
    const [picked, setPicked] = useState<number | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [changedTo, setChangedTo] = useState<number | null>(null)

    const blockedByBackend = state ? !state.canChange : false
    const cooldown = useCooldown(state?.cooldownEndsAt ?? null, blockedByBackend)

    const bar = (
        <div className="sticky top-0 z-20 bg-(--background)">
            <PageBackBar
                title={t('space_tier_title')}
                className={SPACE_TIER_CONTAINER}
                home={MONETIZATION_PATH}
            />
        </div>
    )

    const column = (content: ReactNode) => (
        <>
            {bar}
            <div className={cn(SPACE_TIER_CONTAINER, 'flex flex-1 flex-col')}>{content}</div>
        </>
    )

    if (isLoading) return column(<SpaceTierSkeleton />)

    if (isError) {
        return column(
            <ChannelEmptyState
                className={cn('mb-6 flex-1', SPACE_TIER_PANEL, RISE)}
                testId="space-tier-error"
                tone="error"
                icon="exclamation-circle"
                title={t('space_tier_error_title')}
                action={
                    <Button
                        data-testid="space-tier-retry"
                        variant="secondary"
                        size="large"
                        onClick={refetch}
                    >
                        {t('common_retry')}
                    </Button>
                }
            />,
        )
    }

    if (!state) {
        // No session: the query never ran. The wall gates the *press*, never the route.
        return column(
            <ChannelEmptyState
                className={cn('mb-6 flex-1', SPACE_TIER_PANEL, RISE)}
                testId="space-tier-signed-out"
                icon="award"
                title={t('space_tier_signed_out_title')}
                body={t('space_tier_signed_out_body')}
                action={
                    <Button
                        data-testid="space-tier-sign-in"
                        variant="primary"
                        size="large"
                        onClick={requireAuth(() => undefined)}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />,
        )
    }

    const selectedTier = picked !== null && state.tiers.includes(picked) ? picked : state.current
    const selectedIndex = Math.max(0, state.tiers.indexOf(selectedTier))

    const canChange = state.canChange || cooldown.ended
    const inCooldown = !canChange && cooldown.remainingMs > 0
    const isLocked = !state.available.includes(selectedTier)
    const isSame = selectedTier === state.current
    const disabled = !canChange || isLocked || isSame || isChanging

    const lockedTiers = state.tiers.filter(tier => !state.available.includes(tier))

    const confirm = async () => {
        try {
            const tier = await changeTier(selectedTier)
            setConfirmOpen(false)
            setPicked(null)
            setChangedTo(tier)
        } catch {
            // The query client has already raised the toast (`meta.showErrorToast`); the dialog
            // stays open so the reader can try again or cancel.
        }
    }

    return column(
        <>
            {/* The three blocks arrive in reading order, 60ms apart — `riseDelay`, the stagger
                every other screen uses — and the footer last, so the action lands once there is
                something above it to act on. */}
            <div className="flex flex-col items-center gap-4 pb-4">
                <div className={cn('w-full', RISE)}>
                    <TierSelector
                        state={state}
                        selectedIndex={selectedIndex}
                        onSelect={index => setPicked(state.tiers[index] ?? state.current)}
                    />
                </div>
                <div className={cn('w-full', RISE)} style={riseDelay(1)}>
                    <EstimateCard
                        tier={selectedTier}
                        estimate={estimate}
                        isLoading={isEstimateLoading}
                    />
                </div>
                <div className={cn('w-full', RISE)} style={riseDelay(2)}>
                    <SpaceTierFaq />
                </div>
            </div>

            <div className={cn(SPACE_TIER_FOOTER, RISE)} style={riseDelay(3)}>
                {isLocked && lockedTiers.length >= 2 && !isSame ? (
                    <p
                        data-testid="space-tier-locked"
                        className="type-caption-meta m-0 mb-2 text-center text-(--text-body)"
                    >
                        {t('space_tier_locked_hint', {
                            first: lockedTiers[0],
                            second: lockedTiers[1],
                        })}
                    </p>
                ) : null}
                <Button
                    data-testid="space-tier-submit"
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={disabled}
                    onClick={() => setConfirmOpen(true)}
                >
                    {inCooldown
                        ? t('space_tier_available_in', {
                              time: formatRemaining(cooldown.remainingMs),
                          })
                        : t('space_tier_change_to', { tier: selectedTier })}
                </Button>
            </div>

            <ConfirmTierDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                state={state}
                targetTier={selectedTier}
                pending={isChanging}
                onConfirm={confirm}
            />
            <TierChangedDialog
                open={changedTo !== null}
                onOpenChange={open => {
                    if (!open) setChangedTo(null)
                }}
                state={state}
                tier={changedTo ?? state.current}
            />
        </>,
    )
}
