'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { useWebConfig } from '@shared/lib/remote-config'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@shared/ui/dialog'

/**
 * A **question-and-answer explainer** — the shape both of legacy's report dialogs are.
 *
 * `components/sustainedViewers` and `components/maintenanceFeeDetails` are two files that render the
 * identical thing: a titled modal holding a list of `{ question, answer }` pairs at 16/600 over
 * 12/400. The only difference is the three-versus-two items and which remote-config numbers get
 * interpolated. So it is one component and two datasets.
 *
 * ## The numbers come from remote config, and every one has a fallback in code
 *
 * `useWebConfig().event.charge` — the streamer's rate and the follower threshold, plus
 * `charge.viewer` for the *viewer's* rate, which is a different pair and legacy reads the wrong one
 * in one of the two dialogs (see `SUSTAINED_VIEWERS_INFO`). Nothing here is nullable: the remote
 * config's own doc explains that every field has a per-field fallback, which is why these read
 * `config.event.charge.fee` with no `??`.
 *
 * ## The 50% split is a literal, in both clients
 *
 * `sustained_viewers_w2_*` interpolates `'50%'` from a hard-coded string rather than from config —
 * so the platform's share is stated in code in two places (legacy and here) and in the translated
 * copy in nine languages. Recorded rather than corrected: it is a commercial term, and inventing a
 * config key for it would put a number on screen that nobody has agreed to make configurable.
 */
export interface InfoItem {
    /** Translation key for the question. */
    question: string
    /** Translation key for the answer. */
    answer: string
    /** Which interpolations the answer needs. Resolved from remote config at render. */
    vars?: readonly ('fee' | 'minutes' | 'viewerFee' | 'viewerMinutes' | 'followers' | 'share')[]
}

/**
 * **Sustained viewers** — three questions.
 *
 * ⚠ The rate here is the **viewer's** (`charge.viewer`), not the streamer's. Legacy gets this right
 * in this dialog and wrong nowhere — but the two pairs are one nesting level apart in the same
 * object (`event.charge.fee` vs `event.charge.viewer.fee`), which is exactly the kind of mistake that
 * would print the streamer's maintenance rate as the audience's contribution. The var names keep
 * them apart.
 */
export const SUSTAINED_VIEWERS_INFO: readonly InfoItem[] = [
    {
        question: 'event_sustained_viewers_q1',
        answer: 'event_sustained_viewers_a1',
        vars: ['viewerMinutes', 'viewerFee'],
    },
    {
        question: 'event_sustained_viewers_q2',
        answer: 'event_sustained_viewers_a2',
        vars: ['share'],
    },
    {
        question: 'event_sustained_viewers_q3',
        answer: 'event_sustained_viewers_a3',
        vars: ['share'],
    },
]

/** **Maintenance fee** — two questions. The rate here *is* the streamer's. */
export const MAINTENANCE_FEE_INFO: readonly InfoItem[] = [
    {
        question: 'event_maintenance_q1',
        answer: 'event_maintenance_a1',
        vars: ['followers'],
    },
    {
        question: 'event_maintenance_q2',
        answer: 'event_maintenance_a2',
        vars: ['fee', 'minutes'],
    },
]

export function EventInfoDialog({
    open,
    onOpenChange,
    title,
    items,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    items: readonly InfoItem[]
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const config = useWebConfig()
    const charge = config.event.charge

    const values = {
        fee: String(charge.fee),
        minutes: String(charge.timeUntilNextFee),
        viewerFee: String(charge.viewer.fee),
        viewerMinutes: String(charge.viewer.timeUntilNextFee),
        followers: new Intl.NumberFormat(currentLanguage).format(charge.followers),
        /** The platform's share. A literal in both clients — see the note above. */
        share: '50%',
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid={testId} className="max-w-[390px] gap-3">
                {/*
                 * Title and dismiss on one row — the **in-flow** placement of the two
                 * `docs/DESIGN_SYSTEM.md` §7 sanctions, and the one its table names for a title that
                 * is ranged left and can wrap. *Maintenance fee details* wraps on a phone in several
                 * locales.
                 *
                 * ⚠ **The first version had no dismiss at all**, on the reasoning that Escape and an
                 * overlay press both close it. They do — for a keyboard and a mouse. A touch reader
                 * has neither, and §7 exists because the DS dialog draws no close affordance of its
                 * own, so every dialog in this app has to bring one. Caught by looking at the
                 * screenshot, not by the type checker.
                 *
                 * §7's other note — *last in the DOM, because base-ui focuses the first focusable
                 * element* — belongs to the `absolute` placement and buys nothing here: this dialog
                 * only explains, so the dismiss is its **only** focusable element and focus lands
                 * there whatever the order. Same shape, and the same reasoning, as
                 * `RevenueInfoDialog` and `BalanceHelpButton`.
                 */}
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="pt-2">{title}</DialogTitle>
                    <DialogCloseButton
                        onClose={() => onOpenChange(false)}
                        className="-me-2 -mt-2"
                    />
                </div>

                {/*
                 * The DS dialog wants something for its `aria-describedby`. The **first question** —
                 * not the first answer, which is what this said before: the answer is also printed
                 * two rows down, so a screen reader met the same paragraph twice in one stop.
                 */}
                <DialogDescription className="sr-only">
                    {t(items[0]?.question ?? '')}
                </DialogDescription>

                <div className="flex min-w-0 flex-col gap-4">
                    {items.map(item => (
                        <div key={item.question} className="flex min-w-0 flex-col gap-1">
                            <p className="type-dense-strong text-(--text-title)">
                                {t(item.question)}
                            </p>
                            <p className="type-caption-meta text-pretty text-(--text-subtitle)">
                                {/*
                                 * Every var is passed regardless of what the item declares. i18next
                                 * ignores the ones a string does not use, and the alternative — a
                                 * per-item pick — is a second place for the two `fee` pairs to get
                                 * swapped. `vars` documents intent; this is what makes it safe.
                                 */}
                                {t(item.answer, values)}
                            </p>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
