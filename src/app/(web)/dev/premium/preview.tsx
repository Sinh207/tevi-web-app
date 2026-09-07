'use client'

import {
    DEV_BENEFITS,
    DEV_PACKAGES,
    groupPlans,
    PLAN_ORDER,
    PREMIUM_HERO_RAMP,
    PremiumAnnualCard,
    PremiumBenefitDialog,
    PremiumBenefitsSkeleton,
    PremiumPlanCard,
    PremiumPlansSkeleton,
    savingsPercent,
} from '@features/premium/dev'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * Every previewable state, in the order they matter.
 *
 * The plan grid is drawn twice: once with the whole catalogue and once with the monthly plan
 * removed, which is the payload that makes the annual card drop its strike-through **and** its
 * discount line. Both are computed by `lib/plans.ts` rather than by the cards, so this is a preview
 * of the arithmetic as much as of the layout.
 *
 * The cards are on the hero's own ramp, because that is the only ground they are ever drawn on and
 * the gold frame is unreadable against a white page.
 */
export function PremiumPreview() {
    const [openAt, setOpenAt] = useState<number | null>(null)
    const full = groupPlans(DEV_PACKAGES)
    const annualOnly = groupPlans(DEV_PACKAGES.filter(p => p.duration_days !== 30))

    return (
        <div className="flex flex-col gap-8">
            <Section
                title="Plans — the whole catalogue"
                note="$4.99 / $9.99 / $89.99. Twelve months at 9.99 is 119.88, so the annual card saves 25%."
            >
                <PlanGrid plans={full} savings={savingsPercent(full)} />
            </Section>

            <Section
                title="Plans — no monthly package"
                note="The annual card loses its strike-through and its discount line: there is nothing honest to compare against."
            >
                <PlanGrid plans={annualOnly} savings={savingsPercent(annualOnly)} />
            </Section>

            <Section title="Skeletons" note="Reserved at the cards' and rows' real heights.">
                <div className={cn('flex flex-col gap-6 rounded-2xl py-6', PREMIUM_HERO_RAMP)}>
                    <PremiumPlansSkeleton />
                </div>
                <PremiumBenefitsSkeleton />
            </Section>

            <Section
                title="Benefit carousel"
                note="Opens on the slide pressed. Slide 2 is the comparison table; slide 4 has no copy in the bundle (English is the honest fallback); slide 5 is a comparison payload with no usable rows."
            >
                <div className="flex flex-wrap gap-2">
                    {DEV_BENEFITS.map((benefit, index) => (
                        <Button
                            /* Two fixtures share a slug on purpose (the comparison shape twice),
                               so the key is positional — as it is in the real list. */
                            // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                            key={index}
                            variant="secondary"
                            size="medium"
                            onClick={() => setOpenAt(index)}
                        >
                            {index + 1}. {benefit.name}
                        </Button>
                    ))}
                </div>
            </Section>

            {openAt !== null && (
                <PremiumBenefitDialog
                    benefits={DEV_BENEFITS}
                    initialIndex={openAt}
                    /*
                     * `null`: the footer's Subscribe button routes through the screen's real
                     * checkout, and a harness must not put a live charge behind a preview. What is
                     * being previewed here is the carousel — the button's own states belong to
                     * `/premium` itself.
                     */
                    subscribe={null}
                    onClose={() => setOpenAt(null)}
                />
            )}
        </div>
    )
}

function PlanGrid({
    plans,
    savings,
}: {
    plans: ReturnType<typeof groupPlans>
    savings: number | null
}) {
    return (
        <div className={cn('rounded-2xl p-4', PREMIUM_HERO_RAMP)}>
            <div className="mx-auto grid max-w-[612px] grid-cols-1 gap-2 md:grid-cols-3">
                {PLAN_ORDER.map(plan => {
                    const pkg = plans[plan]
                    if (!pkg) return null
                    if (plan === 'annual') {
                        return (
                            <PremiumAnnualCard
                                key={plan}
                                pkg={pkg}
                                monthlyPkg={plans.monthly}
                                savings={savings}
                                onSubscribe={() => {}}
                            />
                        )
                    }
                    return (
                        <PremiumPlanCard key={plan} plan={plan} pkg={pkg} onSubscribe={() => {}} />
                    )
                })}
            </div>
        </div>
    )
}

function Section({
    title,
    note,
    children,
}: {
    title: string
    note: string
    children: React.ReactNode
}) {
    return (
        <section className="flex flex-col gap-3">
            <header className="flex flex-col gap-0.5">
                <h2 className="type-body-strong text-(--text-title)">{title}</h2>
                <p className="type-caption-meta text-(--text-subtitle)">{note}</p>
            </header>
            {children}
        </section>
    )
}
