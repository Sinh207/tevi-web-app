'use client'

import { PREMIUM_PATH } from '@features/premium/routes'
import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { PremiumBadge } from '@shared/components/premium-badge'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Trans } from 'react-i18next'

/** The Star price inside the sentence — the number in the strong weight, the mark after it. */
function Price({ children }: { children?: ReactNode }) {
    return (
        <strong className="inline-flex items-center gap-0.5 align-middle font-bold text-(--text-title)">
            {children}
            <StarMark size={14} />
        </strong>
    )
}

/**
 * "Support this creator" — what a space's tier means to the person *reading* it. Legacy's
 * `TierInfoModal`, opened from the tier mark beside a space's name.
 *
 * The badge, the sentence (who set which tier, and what each interaction costs), and the way out of
 * paying: Tevi Premium. Legacy draws that last row on a hard-coded purple gradient with a raster
 * Premium logo; here it is the brand-tinted block the app uses for exactly this kind of notice, with
 * the DS crown as its mark — and it is a real link rather than a clickable `Stack`.
 *
 * Legacy's strings were English fallbacks in code and never reached a locale file, so the copy is
 * keyed fresh (`channel_tier_info_*`) and carried in all nine locales.
 */
export function ChannelTierDialog({
    open,
    onOpenChange,
    image,
    tier,
    slug,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    image: string
    tier: number
    slug: string
    testId?: string
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[420px] gap-4" data-testid={subTestId(testId, 'panel')}>
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="pt-2" data-testid={subTestId(testId, 'title')}>
                        {t('channel_tier_info_title')}
                    </DialogTitle>
                    <DialogCloseButton
                        onClose={() => onOpenChange(false)}
                        className="-me-2 -mt-2"
                    />
                </div>

                <Image
                    src={image}
                    alt=""
                    width={160}
                    height={160}
                    className="mx-auto h-20 w-auto"
                />

                <DialogDescription className="type-dense-default text-center text-(--text-body)">
                    <Trans
                        i18nKey="channel_tier_info_body"
                        values={{ slug, tier }}
                        components={[<Price key="price" />]}
                    />
                </DialogDescription>

                <Link
                    href={PREMIUM_PATH}
                    data-testid={subTestId(testId, 'trigger')}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                        'flex items-center gap-3 rounded-xl border border-(--primary-300) bg-(--primary-50) p-4 no-underline',
                        'transition-colors hover:bg-(--primary-100)',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    )}
                >
                    <PremiumBadge size={32} sparkle={false} className="flex-none" />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="type-body-strong text-(--text-title)">
                            {t('channel_tier_info_premium_title')}
                        </span>
                        <span className="type-dense-default text-(--text-body)">
                            {t('channel_tier_info_premium_body')}
                        </span>
                    </span>
                    <Icon
                        name="angle-right"
                        size={20}
                        className="flex-none text-(--text-title) rtl:-scale-x-100"
                    />
                </Link>
            </DialogContent>
        </Dialog>
    )
}
