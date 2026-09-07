'use client'

import { useBalance, useRequireStars } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { Transfer } from '../api/types'
import {
    type AmountProblem,
    amountProblem,
    MESSAGE_MAX_LENGTH,
    parseStars,
    withKnownParties,
} from '../lib/transfer-rules'
import { type RecipientLookup, useRecipientLookup } from './use-recipient-lookup'
import { useTransferWrite } from './use-transfer-write'

/** Form → Review → Receipt, and the state where none of them is on screen. */
export type SingleStep = 'closed' | 'form' | 'review' | 'receipt'

/**
 * Sending Star to one Tevi ID.
 *
 * ## Two steps before the money moves, not three
 *
 * Legacy has **three**: a form, a review screen, and then a second `ConfirmDialog` on top of the
 * review asking "Confirm this transfer?" — so the reader confirms a screen whose only content is a
 * confirmation. This flow keeps the review (it is where the figures and both parties are restated,
 * which is the check worth making) and moves legacy's confirmation *sentence* onto it, under the
 * heading. One deliberate press, with everything it commits to visible above it.
 *
 * The same shape as `useDonateFlow`, which is the app's other spend flow, and that is not a
 * coincidence worth breaking: a reader who has bought a creator a coffee already knows this dialog.
 *
 * ## The form holds strings, and that is the point
 *
 * `amount` is the **raw field value**, never a number. A controlled numeric input that coerces every
 * keystroke cannot be typed into — clearing it, a leading `0`, the moment after a `.`, each one
 * round-trips through state and fights the caret. The arithmetic lives in `lib/transfer-rules.ts`
 * behind `parseStars`, and nothing here does maths on a field value directly.
 *
 * ## Where each guard sits
 *
 * - **The capability gates the screen**, once, in `StarTransferView`. Nothing in this hook re-asks:
 *   the dialog cannot be opened from anywhere else, and a second gate would be a second answer to
 *   keep in step.
 * - **Star gates the final press**, through `useRequireStars`, because that is the moment the price
 *   is known — the amount can change right up to the review screen. It composes `useRequireAuth`,
 *   which by then is a no-op.
 *
 * The amount field *also* states a shortfall as it is typed (`amountProblem`), which is the same
 * division of labour `DonateDialogs` documents: the field stops the reader discovering the problem
 * after filling the form in, and the hook still gates the press.
 *
 * ## Cancel goes back, it does not discard
 *
 * From the review screen, Back returns to the form with everything still in it. Legacy closes both
 * dialogs and resets every field, so a reader who wanted to change 500 to 5,000 re-types the ID, the
 * amount and the note.
 */
export interface SingleTransferFlow {
    step: SingleStep
    receiverId: string
    setReceiverId: (value: string) => void
    lookup: RecipientLookup
    amount: string
    setAmount: (value: string) => void
    amountProblem: AmountProblem
    message: string
    setMessage: (value: string) => void
    /** Parsed Star, or `0` while the field is unusable. */
    stars: number
    canReview: boolean
    isSending: boolean
    /** What the write answered with — the receipt's contents. */
    receipt: Transfer[]
    open: (prefillReceiverId?: string) => void
    close: () => void
    review: () => void
    back: () => void
    confirm: () => void
    /** Receipt → a fresh, empty form. Legacy's "Send more". */
    sendMore: () => void
}

export function useSingleTransfer(): SingleTransferFlow {
    const { t } = useTranslation()
    const { star, isKnown } = useBalance()
    const requireStars = useRequireStars()
    const write = useTransferWrite()

    const [step, setStep] = useState<SingleStep>('closed')
    const [receiverId, setReceiverId] = useState('')
    const [amount, setAmount] = useState('')
    const [message, setMessage] = useState('')
    const [receipt, setReceipt] = useState<Transfer[]>([])

    const lookup = useRecipientLookup(receiverId)
    // `null` is "not known", which is not "zero" — see `amountProblem`.
    const balance = isKnown ? star : null
    const problem = amountProblem(amount, balance)
    const stars = parseStars(amount) ?? 0

    const reset = useCallback(() => {
        setReceiverId('')
        setAmount('')
        setMessage('')
        setReceipt([])
    }, [])

    const open = useCallback(
        (prefillReceiverId?: string) => {
            reset()
            /*
             * The one thing an opening *can* carry: the ID from a history row's **Retransfer**. Seeded
             * here rather than as a separate "prefill" state because opening is the only moment where
             * "this is the ID we mean" and "the reader has typed nothing yet" are both true — the same
             * reasoning `useDonateFlow.open` gives for seeding its amount.
             */
            if (prefillReceiverId) setReceiverId(prefillReceiverId)
            setStep('form')
        },
        [reset],
    )

    const close = useCallback(() => {
        setStep('closed')
        reset()
    }, [reset])

    const canReview = lookup.status === 'found' && stars > 0 && problem === null

    const confirm = requireStars(stars, () => {
        if (!canReview || write.isPending || !lookup.party) return
        write.mutate(
            [
                {
                    user_id: lookup.party.id,
                    amount: stars,
                    /*
                     * Trimmed, and **always a string** — `''` for no note, never `undefined`. Billy
                     * requires the key (`errors: [{ input: 'description', code: 'required' }]`) and
                     * accepts it empty; see `TransferRequest`.
                     */
                    description: message.trim(),
                },
            ],
            {
                /*
                 * Same guard as the bulk flow, same reason: `normalizeTransfers` drops a record with
                 * no `created_at` (B55), so a 2xx can parse to `[]` — and `[]` is truthy, so the
                 * receipt screen was reached and rendered `null`: a bare "Transfer details" bar over
                 * nothing, after the Star had left. The money moved, so this is a *success* message
                 * pointing at the history rather than an error about the transfer.
                 */
                onSuccess: transfers => {
                    if (transfers.length === 0) {
                        toast.success(t('star_transfer_sent_no_receipt'))
                        setStep('closed')
                        reset()
                        return
                    }
                    /*
                     * The receiver, carried across the response: the write does not echo `user`, so
                     * without this the receipt names nobody. See `withKnownParties` — the server's own
                     * party still wins wherever it sends one.
                     */
                    setReceipt(withKnownParties(transfers, [lookup.party]))
                    setStep('receipt')
                },
            },
        )
    })

    return {
        step,
        receiverId,
        setReceiverId,
        lookup,
        amount,
        setAmount,
        amountProblem: problem,
        message,
        // Capped here rather than in the component, so the cap cannot differ between the field and
        // its character counter.
        setMessage: useCallback((value: string) => {
            setMessage(value.slice(0, MESSAGE_MAX_LENGTH))
        }, []),
        stars,
        canReview,
        isSending: write.isPending,
        receipt,
        open,
        close,
        review: useCallback(() => setStep('review'), []),
        back: useCallback(() => setStep('form'), []),
        confirm,
        sendMore: useCallback(() => {
            reset()
            setStep('form')
        }, [reset]),
    }
}
