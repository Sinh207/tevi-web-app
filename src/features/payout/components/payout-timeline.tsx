'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import type { PayoutRequestDetail } from '../api/types'
import { payoutStatus } from '../lib/payout-status'
import { payoutStepLabel, payoutTimeline } from '../lib/payout-timeline'

/**
 * What happened to this payout — legacy's timeline, and the geometry is unusual on purpose.
 *
 * ## The rail is on the **trailing** side, and the steps are right-aligned
 *
 * Legacy pins the line and the dots to the right (`right: 10.5px` / `right: 7.5px`) and sets
 * `alignItems: 'flex-end'` with `pr: 32px` on every step. That is not a mistake to correct: the
 * disclosure's own label ("Status") sits on the leading side, so the history hangs off the other edge
 * and the two do not compete for the same column. Reproduced with `end`/`pe` rather than `right`/`pr`,
 * so it mirrors in Arabic instead of staying pinned to the left of an RTL page.
 *
 * ## The current step carries **no chip and no dot**
 *
 * Legacy's `type: status === 'completed' ? 'text' : 'status'` and `dot: status !== 'completed'`, per
 * step. So the step matching the request's status prints only its timestamp — because the coloured
 * chip naming that status is already in the disclosure's summary row, a few pixels above. Marking it
 * twice is what the first version of this did.
 *
 * Every other step is a **grey** chip (`#BFBFBF`) plus its timestamp. Grey, not the status colour:
 * these are things that have already happened, and colouring each one turns a history into five
 * competing signals.
 *
 * ## The failure reason sits under its own step
 *
 * Not at the top of the screen and not in the summary — it belongs to the moment it happened, which is
 * what a timeline is for. It is the one step that can carry prose.
 */
export function PayoutTimeline({ request }: { request: PayoutRequestDetail }) {
    const { t, currentLanguage } = useTranslation()
    const steps = payoutTimeline(request)

    if (steps.length === 0) return null

    return (
        <ol className="relative m-0 flex list-none flex-col gap-4 p-0">
            {/*
             * The rail. `end-[11px]` and `w-[2px]` are legacy's `right: 10.5px` on a 2px line, rounded
             * to the pixel this app can actually paint.
             */}
            <span
                aria-hidden="true"
                className="absolute inset-y-1 end-[11px] w-[2px] bg-(--separator-strong)"
            />
            {steps.map(step => (
                /*
                 * `pe-8` on the **step**, not on the list — legacy's `pr: 32px` is per item, and that is
                 * what reserves the lane the dots live in. With the padding on the list instead, each
                 * dot was positioned against a narrowed row: they landed 32px inside the rail and
                 * printed **on top of the chip text**. Obvious in a screenshot, invisible in the code.
                 */
                <li
                    key={`${step.status}-${step.at}`}
                    className="relative flex flex-col items-end gap-1 pe-8 text-end"
                >
                    {/*
                     * No dot on the current step — legacy's `dot: status !== …`. The step is identified
                     * by the chip in the summary above, so a marker here is a second answer to a
                     * question already answered.
                     */}
                    {!step.isCurrent && (
                        <span
                            aria-hidden="true"
                            /*
                             * `end-[8px]` on a `size-2` dot centres it at 12px — the centre of the 2px
                             * rail at `end-[11px]`. One pixel out and the dots sit beside the line
                             * rather than on it.
                             */
                            className="absolute top-[6px] end-[8px] size-2 rounded-full bg-(--separator-strong)"
                        />
                    )}
                    {step.status === 'submitted' ? (
                        <span className="type-caption-meta text-(--text-subtitle)">
                            {t('payout_detail_submitted_at', {
                                time: formatLedgerDateTime(step.at, currentLanguage),
                            })}
                        </span>
                    ) : (
                        <>
                            {/*
                             * A past step wears a grey chip; the current one wears none. Legacy's
                             * `StatusChip` hard-codes `#BFBFBF` with white text for **every** state,
                             * which maps to a `--text-placeholder` ground rather than to a status tone.
                             */}
                            {!step.isCurrent && (
                                <span className="type-caption-label w-fit rounded-full bg-(--text-placeholder) px-2 py-0.5 text-(--text-on-primary)">
                                    {t(payoutStepLabel(step.status))}
                                </span>
                            )}
                            <span className="type-caption-meta text-(--text-subtitle)">
                                {formatLedgerDateTime(step.at, currentLanguage)}
                            </span>
                            {/*
                             * Only when the backend gave one. A rejection with no stated reason must not
                             * render an empty line that reads as a missing translation.
                             */}
                            {step.status === 'failed' && request.failReason && (
                                <span className="type-dense-default text-(--text-error)">
                                    {request.failReason}
                                </span>
                            )}
                        </>
                    )}
                </li>
            ))}
        </ol>
    )
}

/**
 * The coloured chip in the disclosure's summary row — the request's **current** status.
 *
 * Legacy puts it in the `AccordionSummary`, in the status's own colour with white text, so the state is
 * readable without opening the fold. That is why the matching step inside the timeline carries no chip
 * of its own.
 */
export function PayoutStatusChip({ request }: { request: PayoutRequestDetail }) {
    const { t } = useTranslation()
    const status = payoutStatus(request.status)
    if (!status) return null

    return (
        <span
            className="type-caption-label w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-(--text-on-accent)"
            style={{ backgroundColor: `var(${status.tone})` }}
        >
            {t(status.label)}
        </span>
    )
}
