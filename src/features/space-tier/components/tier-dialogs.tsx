'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RISE } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import { Trans } from 'react-i18next'
import type { SpaceTierState } from '../api/types'
import { tierBadgeSrc } from '../lib/tiers'
import { BadgeStage } from './badge-stage'
import { StarAmount } from './star-amount'

function Badge({
    src,
    size,
    alt,
    className,
    style,
}: {
    src: string | null
    size: number
    alt: string
    className?: string
    style?: React.CSSProperties
}) {
    return (
        <span
            className={cn('flex flex-none items-center justify-center', className)}
            style={{ width: size, height: size, ...style }}
        >
            {src ? (
                <Image
                    src={src}
                    alt={alt}
                    width={size * 2}
                    height={size * 2}
                    className="size-full object-contain"
                />
            ) : null}
        </span>
    )
}

/**
 * "Change to Tier N?" — legacy's `ConfirmChangeModal`: current badge → target badge, what fans will
 * pay, and the two consequences, over Change / Cancel.
 *
 * Still a dialog on the page: it is a confirmation of a press, not a place. Not `ConfirmDialog`,
 * whose closed prop list has no room for the badges or the consequence list.
 *
 * Legacy's two consequence marks are MUI's `Hexagon` and `FavoriteRounded`; the DS has no hexagon,
 * so the badge line takes `award` — the glyph the drawer's Space tier row already wears — and the
 * heart stays a heart.
 */
export function ConfirmTierDialog({
    open,
    onOpenChange,
    state,
    targetTier,
    pending,
    onConfirm,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    state: SpaceTierState
    targetTier: number
    pending: boolean
    onConfirm: () => void
}) {
    const { t } = useTranslation()
    const testId = 'space-tier-confirm'

    return (
        <Dialog open={open} onOpenChange={next => (pending ? undefined : onOpenChange(next))}>
            <DialogContent data-testid={testId} className="w-[420px] items-center gap-4">
                {/* Read left to right as the change itself: the current badge settles in, the
                    arrow follows, and the new one pops last — the thing being chosen. */}
                <div className="flex items-center justify-center gap-3">
                    <Badge
                        src={tierBadgeSrc(state.images, state.current)}
                        size={72}
                        alt={t('space_tier_tier', { tier: state.current })}
                        className={cn('opacity-70', RISE)}
                    />
                    <span className={RISE} style={{ animationDelay: '120ms' }}>
                        <Icon
                            name="arrow-right"
                            size={24}
                            className="text-(--text-title) rtl:-scale-x-100"
                        />
                    </span>
                    <BadgeStage className="size-[88px]">
                        <Badge
                            src={tierBadgeSrc(state.images, targetTier)}
                            size={72}
                            alt={t('space_tier_tier', { tier: targetTier })}
                            className={POP}
                            style={{ animationDelay: '220ms' }}
                        />
                    </BadgeStage>
                </div>

                <div className="flex w-full flex-col items-center gap-1 text-center">
                    <DialogTitle data-testid={subTestId(testId, 'title')}>
                        {t('space_tier_confirm_title', { tier: targetTier })}
                    </DialogTitle>
                    <DialogDescription className="type-dense-default text-(--text-body)">
                        <Trans
                            i18nKey="space_tier_confirm_body"
                            values={{ tier: targetTier }}
                            components={[<StarAmount key="price" size={12} />]}
                        />
                    </DialogDescription>
                </div>

                <ul className="m-0 flex w-full list-none flex-col rounded-xl bg-(--background) p-0">
                    {[
                        {
                            key: 'badge',
                            icon: 'award' as const,
                            text: t('space_tier_confirm_badge', {
                                from: state.current,
                                to: targetTier,
                            }),
                        },
                        { key: 'fans', icon: 'heart' as const, text: t('space_tier_confirm_fans') },
                    ].map((row, index) => (
                        <li
                            key={row.key}
                            className={
                                index > 0
                                    ? 'flex items-start gap-3 border-(--separator-default) border-t px-4 py-3'
                                    : 'flex items-start gap-3 px-4 py-3'
                            }
                        >
                            <Icon
                                name={row.icon}
                                weight="filled"
                                size={24}
                                className="flex-none text-(--text-brand)"
                            />
                            <span className="type-dense-default flex-1 text-(--text-body)">
                                {row.text}
                            </span>
                        </li>
                    ))}
                </ul>

                <DialogFooter className="w-full">
                    <Button
                        data-testid={subTestId(testId, 'confirm')}
                        variant="accent"
                        size="large"
                        disabled={pending}
                        aria-busy={pending || undefined}
                        onClick={onConfirm}
                    >
                        {pending ? <Loader /> : null}
                        {t('space_tier_change_to', { tier: targetTier })}
                    </Button>
                    <Button
                        data-testid={subTestId(testId, 'cancel')}
                        variant="secondary"
                        size="large"
                        disabled={pending}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common_cancel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * "Your Space is now Tier N" — legacy's `SuccessModal`.
 *
 * Two deliberate departures. Legacy paints this one on a `#007AFF → #501BC0` gradient with a looping
 * Lottie confetti over it; neither is a DS surface and the confetti JSON is not in this repo, so it is
 * the DS dialog with the badge as its art. And *Got it* now closes only this step — legacy also
 * closed the whole Space tier modal, which on a page would mean navigating away from the screen the
 * reader just changed.
 */
export function TierChangedDialog({
    open,
    onOpenChange,
    state,
    tier,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    state: SpaceTierState
    tier: number
}) {
    const { t } = useTranslation()
    const testId = 'space-tier-success'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid={testId}
                className="w-[420px] items-center gap-4 text-center"
            >
                {/* The celebration legacy draws with a confetti Lottie, said with the screen's own
                    motion instead: the badge pops in, then floats and glows with sparkles at its
                    corners and rings spreading from it — none of it a new asset. */}
                <BadgeStage rings className="size-[168px]">
                    <Badge
                        src={tierBadgeSrc(state.images, tier)}
                        size={120}
                        alt=""
                        className={POP}
                    />
                </BadgeStage>
                <div
                    className={cn('flex flex-col items-center gap-1', RISE)}
                    style={{ animationDelay: '160ms' }}
                >
                    <DialogTitle
                        data-testid={subTestId(testId, 'title')}
                        className="type-title-t1-bold"
                    >
                        {t('space_tier_success_title', { tier })}
                    </DialogTitle>
                    <DialogDescription className="type-dense-default text-(--text-body)">
                        <Trans
                            i18nKey="space_tier_success_body"
                            values={{ tier }}
                            components={[<strong key="n" className="font-bold" />]}
                        />
                    </DialogDescription>
                </div>
                <div
                    className={cn(
                        'flex w-full flex-col gap-0.5 rounded-xl border border-(--primary-300) bg-(--primary-50) p-3.5 text-start',
                        RISE,
                    )}
                    style={{ animationDelay: '260ms' }}
                >
                    <span className="type-caption-label-strong text-(--text-body)">
                        {t('space_tier_whats_new')}
                    </span>
                    <span className="type-body-default text-(--text-title)">
                        <Trans
                            i18nKey="space_tier_success_price"
                            values={{ tier }}
                            components={[<StarAmount key="price" size={16} />]}
                        />
                    </span>
                </div>
                <DialogFooter className="w-full">
                    <Button
                        data-testid={subTestId(testId, 'close')}
                        variant="primary"
                        size="large"
                        onClick={() => onOpenChange(false)}
                    >
                        {t('space_tier_got_it')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
