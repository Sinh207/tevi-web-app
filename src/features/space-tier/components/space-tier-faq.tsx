'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useId, useState } from 'react'
import { SPACE_TIER_FAQ } from '../lib/tiers'
import { SPACE_TIER_LEARN_MORE_PATH } from '../routes'

/**
 * Legacy's `FaqList`: a heading with *Learn more* beside it, then six questions of which one at a
 * time is open. Each row is a real disclosure — a `button` with `aria-expanded` controlling its
 * answer — where legacy's is a clickable `Stack`.
 */
export function SpaceTierFaq() {
    const { t } = useTranslation()
    const [openId, setOpenId] = useState<string | null>(null)
    const baseId = useId()

    return (
        <section data-testid="space-tier-faq" className="flex w-full flex-col">
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                <h2 className="type-body-strong m-0 text-(--text-title)">{t('space_tier_faq')}</h2>
                <Link
                    data-testid="space-tier-learn-more"
                    href={SPACE_TIER_LEARN_MORE_PATH}
                    className="type-body-default -my-2 rounded-md py-2 text-(--text-link) transition-colors hover:text-(--text-link-hover) focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                >
                    {t('space_tier_learn_more')}
                </Link>
            </div>

            <div className="flex flex-col rounded-xl bg-(--background-surface) py-1">
                {SPACE_TIER_FAQ.map((item, index) => {
                    const isOpen = openId === item.id
                    const panelId = `${baseId}-${item.id}`
                    return (
                        <div
                            key={item.id}
                            className={cn(
                                'px-4',
                                index > 0 &&
                                    '[&>button]:border-(--separator-default) [&>button]:border-t',
                            )}
                        >
                            <button
                                type="button"
                                data-testid="space-tier-faq-item"
                                data-option-value={item.id}
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpenId(isOpen ? null : item.id)}
                                className="flex min-h-12 w-full cursor-pointer items-center gap-2 py-3 text-start focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                            >
                                <span className="type-body-strong flex-1 text-(--text-title)">
                                    {t(item.question)}
                                </span>
                                <Icon
                                    name="angle-down"
                                    size={20}
                                    className={cn(
                                        'flex-none text-(--text-subtitle) transition-[rotate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                                        isOpen && 'rotate-180',
                                    )}
                                />
                            </button>
                            {/*
                             * Height animates through `grid-template-rows: 0fr → 1fr`, the one way
                             * to transition to an intrinsic height without measuring it. Closed, the
                             * answer is `inert` — out of the tab order and the accessibility tree,
                             * which is what `hidden` used to give — and it fades as it folds.
                             */}
                            <div
                                id={panelId}
                                inert={!isOpen}
                                className={cn(
                                    'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                                    isOpen
                                        ? 'grid-rows-[1fr] opacity-100'
                                        : 'grid-rows-[0fr] opacity-0',
                                )}
                            >
                                <div className="min-h-0 overflow-clip">
                                    <p className="type-dense-default m-0 pb-3 text-(--text-body)">
                                        {t(item.answer)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
