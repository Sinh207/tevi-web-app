'use client'

import { accountAvatarUrl, useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { Avatar, AvatarPlaceholder, avatarImageClass } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { Program } from '../api/types'
import { formatAffiliateMoney, formatCommissionRate } from '../lib/format'
import { ProgramAvatar } from './program-avatar'
import { ViewProgramChip } from './view-program-chip'

/** The creator's own face, beside the program's — "you promote this". */
function PromoterAvatar() {
    const { currentUser } = useAuth()
    /*
     * Optional-chained all the way down. Legacy reads `currentUser.avatar.thumb` unguarded, which
     * throws while auth is still hydrating — and this screen is reachable the moment the dialog
     * opens.
     */
    const src = accountAvatarUrl(currentUser)
    return (
        <Avatar size="xl" type={src ? 'image' : 'placeholder'}>
            {src ? (
                <Image src={src} alt="" width={64} height={64} className={avatarImageClass} />
            ) : (
                <AvatarPlaceholder size="xl" className="flex items-center justify-center">
                    <Icon name="user-simple-alt" size={24} />
                </AvatarPlaceholder>
            )}
        </Avatar>
    )
}

/** A pill under an avatar: the revenue estimate on one side, the commission rate on the other. */
function AvatarBadge({
    children,
    tone,
}: {
    children: React.ReactNode
    tone: 'neutral' | 'accent'
}) {
    return (
        <span
            className={[
                'type-caption-meta absolute bottom-0 start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
                'inline-flex items-center gap-1 whitespace-nowrap rounded-(--radius-fill) px-2 py-[3px]',
                tone === 'accent'
                    ? 'bg-(--accents-indigo-active) text-white'
                    : 'bg-(--background-segment) text-(--text-title)',
            ].join(' ')}
        >
            {children}
        </span>
    )
}

/**
 * The join / switch pitch for a program that was pressed.
 *
 * ## One sentence, two named things, and the translator decides the order
 *
 * Legacy builds its body with `.replace('[%s]', name).replace('[%s]', rate)` — positional, so a
 * language that puts the rate first silently swaps the two, and the same file does it in the
 * *opposite* order on the joined screen. Here both are named (`{{name}}`, `{{rate}}`) and the key
 * carries the order.
 *
 * ## What it does *not* do
 *
 * No CTA. The action is a sticky footer that has to sit outside the scrolling area, so the dialog
 * owns it — see `AffiliateDialog`. This screen is only the pitch.
 */
export function ProgramDetailStep({
    program,
    isSwitching,
}: {
    program: Program
    /** Something else is already being promoted, so joining this one replaces it. */
    isSwitching: boolean
}) {
    const { t, currentLanguage } = useTranslation()

    const rate = formatCommissionRate(program.commission_rate)
    const revenue = formatAffiliateMoney(program.estimate_income, currentLanguage)

    return (
        <div className="flex flex-col items-center gap-4 px-4 pb-4">
            <div className="flex items-center justify-center gap-3 px-3 pt-3">
                <div className="relative h-20 w-16">
                    <ProgramAvatar program={program} size="xl" px={64} />
                    {revenue ? <AvatarBadge tone="neutral">{revenue}</AvatarBadge> : null}
                </div>

                {/* The relationship between the two, not a decoration: value flows from the app to
                    the creator. Mirrored in RTL with everything else. */}
                <Icon
                    name="arrow-right"
                    size={24}
                    className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
                />

                <div className="relative h-20 w-16">
                    <PromoterAvatar />
                    <AvatarBadge tone="accent">
                        <Icon name="link-simple" size={16} className="flex-none" />
                        {t('affiliate_percent', { rate })}
                    </AvatarBadge>
                </div>
            </div>

            <ViewProgramChip program={program} />

            <div className="flex flex-col items-center gap-1 text-center">
                <h2 className="type-title-t1-bold text-(--text-title)">
                    {isSwitching ? t('affiliate_detail_switch_title') : t('affiliate_detail_title')}
                </h2>
                <p className="type-dense-default text-(--text-body)">
                    {t('affiliate_detail_body', { name: program.name ?? '', rate })}
                </p>
            </div>

            {revenue ? (
                <p className="type-dense-default flex flex-wrap items-center justify-center gap-1 text-center text-(--text-subtitle)">
                    {t('affiliate_detail_estimate_label')}
                    <span className="type-body-strong text-(--text-title)">{revenue}</span>
                </p>
            ) : null}
        </div>
    )
}
