'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import Image from 'next/image'
import { useState } from 'react'
import { PAYOUT_ART } from '../lib/illustrations'

/**
 * The two explainers on `/my-wallet/setup-payouts` — *More info* beside the billing country, and
 * *Learn more* beside the method list.
 *
 * One component for both, because they are the same object: an illustration, two question-and-answer
 * pairs, and a way out. Legacy builds them as two 200-line `ResponsiveModal`s with the copy inline.
 *
 * ## The trigger is the caller's, and this is why
 *
 * Both links sit **inside a sentence** ("This is where you opened your financial account. More info"),
 * so the control has to be an inline `<button>` in the caller's own paragraph — not a component that
 * brings its own block-level trigger. So this takes `trigger`-less control of nothing: the caller
 * renders the link and owns `open`.
 */
export function PayoutInfoDialog({
    open,
    onOpenChange,
    kind,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** `location` — where you bank · `timing` — when the money arrives. */
    kind: 'location' | 'timing'
    testId?: string
}) {
    const { t } = useTranslation()

    const art = kind === 'location' ? PAYOUT_ART.chooseLocation : PAYOUT_ART.methodsInfo
    const title =
        kind === 'location' ? t('payout_setup_location_info_title') : t('payout_setup_timing_title')
    const pairs =
        kind === 'location'
            ? [
                  ['payout_setup_location_q1', 'payout_setup_location_a1'],
                  ['payout_setup_location_q2', 'payout_setup_location_a2'],
              ]
            : [
                  ['payout_setup_timing_q1', 'payout_setup_timing_a1'],
                  ['payout_setup_timing_q2', 'payout_setup_timing_a2'],
              ]

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid={testId} className="w-[420px] gap-3">
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="type-body-strong pt-2 text-(--text-title)">
                        {title}
                    </DialogTitle>
                    <DialogCloseButton
                        onClose={() => onOpenChange(false)}
                        className="-me-2 -mt-2"
                    />
                </div>
                {/*
                 * `alt=""`: the art restates the title beside it, so a description would have a screen
                 * reader announce the same thing twice. Centred and capped at its drawn width — the
                 * dialog is wider than the art on every breakpoint that reaches it.
                 */}
                <Image
                    src={art.src}
                    alt=""
                    width={art.width}
                    height={art.height}
                    className="mx-auto h-auto w-full max-w-[264px]"
                />
                <div className="flex flex-col gap-3">
                    {pairs.map(([question, answer]) => (
                        <div key={question} className="flex flex-col gap-1">
                            <p className="type-dense-strong m-0 text-(--text-title)">
                                {t(question)}
                            </p>
                            <p className="type-dense-default m-0 text-(--text-body)">{t(answer)}</p>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * The inline *More info* / *Learn more* link, and the dialog it opens.
 *
 * Packaged with the dialog so a caller writes one element inside its paragraph. A real `<button>`
 * rather than legacy's `<Typography component='label' onClick>` — a label with a click handler is not
 * keyboard-reachable and is announced as a label for nothing.
 */
export function PayoutInfoLink({
    kind,
    label,
    testId,
}: {
    kind: 'location' | 'timing'
    label: string
    testId?: string
}) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                type="button"
                data-testid={testId}
                onClick={() => setOpen(true)}
                className="type-dense-default cursor-pointer border-0 bg-transparent p-0 text-(--text-link) underline-offset-2 hover:underline focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
            >
                {label}
            </button>
            <PayoutInfoDialog open={open} onOpenChange={setOpen} kind={kind} />
        </>
    )
}
