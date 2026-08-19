'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { Program } from '../api/types'
import { formatAffiliateMoney, formatCommissionRate } from '../lib/format'
import { ProgramAvatar } from './program-avatar'

/**
 * One program in the list: 48 icon, name, an earnings pill, and the action.
 *
 * ## The row is not the control — the button is
 *
 * Legacy makes the whole row clickable *and* puts a button in it. Here only the button acts, because
 * the row carries no information the button's label does not: there is no "open without joining"
 * destination, so a second target for the same action is two tab stops for one thing. The `View X`
 * chip on the next screen is where the program's own page is reachable.
 *
 * ## The pill says estimate, or falls back to the rate
 *
 * `estimate_income` is what a creator wants (money), `commission_rate` is what we can always say
 * (a percentage). Legacy picks the same way. **Zero estimate still formats as money** — see
 * `formatAffiliateMoney`; a program that genuinely estimates nothing should say `$0.00` rather than
 * silently falling back to a rate and looking like a different kind of offer.
 *
 * The hairline between rows is the list's `divide-y`, not a `border-t` here: a `not-first:` variant
 * that does not exist emits nothing at all, and a missing separator is invisible in review.
 */
export function ProgramRow({
    program,
    actionLabel,
    onPress,
    disabled,
}: {
    program: Program
    /** "Join" normally, "Switch" when something else is already being promoted. */
    actionLabel: string
    onPress: (program: Program) => void
    disabled: boolean
}) {
    const { t, currentLanguage } = useTranslation()

    const money = formatAffiliateMoney(program.estimate_income, currentLanguage)
    const pill = money
        ? t('affiliate_est_income', { amount: money })
        : t('affiliate_commission', { rate: formatCommissionRate(program.commission_rate) })

    return (
        <li className="flex items-center gap-2 px-4 py-2">
            <ProgramAvatar program={program} size="large" px={48} />

            <div className="flex min-w-0 flex-1 flex-col items-start gap-1 py-1">
                <p className="type-body-strong w-full truncate text-(--text-title)">
                    {program.name}
                </p>
                {/* Info-toned, not the accent: it is a figure, not a call to action. */}
                <span className="type-caption-meta inline-flex max-w-full items-center gap-1 rounded-(--radius-fill) bg-(--accents-indigo-bg-active) px-[6px] text-(--accents-indigo-active)">
                    {/* 16, not legacy's 12: the DS ships icons at 16/18/20/22/24/32 and picking a size
                        outside that set is a type error, not a rounding. */}
                    <Icon name="badge-dollar" size={16} className="flex-none" />
                    <span className="truncate">{pill}</span>
                </span>
            </div>

            <Button
                variant="accent"
                size="small"
                className="flex-none rounded-(--radius-fill)"
                disabled={disabled}
                onClick={() => onPress(program)}
            >
                {actionLabel}
            </Button>
        </li>
    )
}
