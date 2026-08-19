'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { eventBus } from '@shared/lib/event-bus'
import { formatStarAmount } from '@shared/lib/money'
import { STAR_FLOAT } from '@shared/lib/motion'
import { AppBarStarIcon } from '@shared/ui/app-bar'
import { useEffect, useState } from 'react'

/**
 * The Star amount that drifts off the balance when it moves — `-120 ★` on a spend, `+500 ★` on a
 * top-up. Legacy: `layouts/common/starSpendAnimation`.
 *
 * Rendered inside whichever control shows the figure; the host supplies the positioning context
 * (`relative`), and this fills it absolutely so the number floats *under* the balance without
 * reserving any layout of its own.
 *
 * ## It owns its own lifetime, which is what fixes legacy's central bug
 *
 * Legacy keeps the amount in the balance provider and clears it on a `setTimeout(2000)` while the CSS
 * animation runs `4s` — so the element unmounts halfway through and **the last two seconds have never
 * played**. Two independent clocks for one animation, and they disagree.
 *
 * Here there is one clock: the animation's own `animationend`. Nothing times anything, so nothing can
 * drift, and changing the duration is a change in exactly one place (`STAR_FLOAT`).
 *
 * ## The `key` is load-bearing
 *
 * A second movement inside the two seconds re-renders the *same* element, and CSS does not restart an
 * animation that is already running — legacy has no `key` and therefore silently swallows the second
 * spend, showing the first amount frozen. Keying on a per-event sequence number makes React replace
 * the node, which is the only reliable way to restart it.
 *
 * ## Both directions, which legacy does not do
 *
 * Legacy guards with `if (!amount || amount <= 0) return null`, so a **top-up is silent** — the delta
 * is negative for a credit and the guard drops it. That reads as an oversight rather than a decision:
 * adding money is the moment a person most wants to see the figure acknowledge them. So a credit
 * flashes too, in the success tone, and a debit keeps legacy's warning tone.
 *
 * ## It never accumulates
 *
 * The deltas are not a running total and must never be treated as one — frames are only delivered
 * while the tab holds the socket. The figure comes from `useBalance()`; this draws a moment.
 */
export function StarChangeFlash() {
    const { t, currentLanguage } = useTranslation()
    /** `seq` exists only to be the `key` — see above. */
    const [change, setChange] = useState<{ delta: number; seq: number } | null>(null)

    useEffect(() => {
        let seq = 0
        const onChange = ({ delta }: { delta: number }) => {
            seq += 1
            setChange({ delta, seq })
        }
        eventBus.on('balance:star-changed', onChange)
        return () => eventBus.off('balance:star-changed', onChange)
    }, [])

    /*
     * Zero is filtered by the emitter too, and guarded again here on purpose: this component is
     * exported, so the next thing that emits on this event is not necessarily `BalanceProvider`. A
     * flash reading `-0 ★` is worse than none, and `> 0` would sign it as a debit.
     */
    if (!change || change.delta === 0) return null

    const isCredit = change.delta > 0
    const amount = formatStarAmount(Math.abs(change.delta), currentLanguage)

    return (
        <span
            key={change.seq}
            className={[
                // Absolute and `pointer-events-none`: it floats over whatever it annotates and must
                // not intercept a press aimed at the balance underneath it.
                'pointer-events-none absolute inset-x-0 top-[10px] flex items-center justify-center gap-1',
                'type-dense-strong whitespace-nowrap',
                isCredit ? 'text-(--accents-success-active)' : 'text-(--accents-warning-active)',
                STAR_FLOAT,
            ].join(' ')}
            /*
             * The one clock — and the reason `STAR_FLOAT` collapses the duration under reduced motion
             * rather than removing the animation. With `animate-none` there is no `animationend`, so
             * this never runs and the flash stays over the balance for the rest of the session.
             */
            onAnimationEnd={() =>
                setChange(current => (current?.seq === change.seq ? null : current))
            }
        >
            {/*
             * Announced, unlike legacy's silent decoration: a balance changing is the kind of thing a
             * screen-reader user is entitled to hear once. `role="status"` rather than an alert — it is
             * information, not a problem.
             */}
            <span role="status" className="sr-only">
                {isCredit
                    ? t('balance_star_added', { amount })
                    : t('balance_star_spent', { amount })}
            </span>
            <span aria-hidden="true">{isCredit ? `+${amount}` : `-${amount}`}</span>
            {/* Already `aria-hidden` inside — the DS icon is decorative by construction. */}
            <AppBarStarIcon size={14} />
        </span>
    )
}
