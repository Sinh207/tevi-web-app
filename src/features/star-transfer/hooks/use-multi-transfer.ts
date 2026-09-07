'use client'

import { useAuth } from '@features/auth'
import { useRequireStars } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { transferApi } from '../api/transfer-api'
import type { Transfer } from '../api/types'
import {
    type FileProblem,
    fileProblem,
    MESSAGE_MAX_LENGTH,
    planTransfers,
    readTeviId,
    type TransferPlan,
    withKnownParties,
    withoutReceiver,
} from '../lib/transfer-rules'
import { useTransferWrite } from './use-transfer-write'

/** Upload → Review → Receipt, and the state where none of them is on screen. */
export type MultiStep = 'closed' | 'upload' | 'review' | 'receipt'

/**
 * Sending Star to a list of people, read off a CSV.
 *
 * ## The backend reads the file, not this client
 *
 * The CSV goes to `transfer-star/template/validation/` and comes back as rows the backend has already
 * resolved to accounts, with per-row errors. Nothing here parses CSV — which is the right split twice
 * over: only the backend can turn a Tevi ID into an account, and a client-side parser would be a second
 * implementation of a format the backend owns, disagreeing with it on the first quoted comma.
 *
 * What this client *does* own is the step after: `planTransfers` decides what will actually be sent —
 * repeated IDs summed, rejected lines counted, the reader's own account dropped. That is in
 * `lib/transfer-rules.ts` with tests, because it is the arithmetic the review screen and the request
 * body must agree on.
 *
 * ## An upload that answers nothing is a *failed* upload
 *
 * A validation response with no rows means the file did not have the shape the template describes —
 * an empty file, the wrong columns, a spreadsheet saved as CSV with a preamble. It is reported as an
 * upload failure rather than as "0 receivers", which is what legacy shows and is indistinguishable
 * from a file that was read fine and had nothing usable in it.
 *
 * ## The file is checked before it is sent, and only for what a client can know
 *
 * Size and type, in `fileProblem` — the two things that make an upload pointless. Everything about the
 * *contents* is the backend's answer.
 */
export interface MultiTransferFlow {
    step: MultiStep
    file: File | null
    /** Why the chosen file was refused locally, or `null`. */
    fileProblem: FileProblem
    /** The validation request failed, or came back with nothing usable in it. */
    uploadFailed: boolean
    isValidating: boolean
    isDownloading: boolean
    /** What will be sent, once a file has been read. `null` before that. */
    plan: TransferPlan | null
    message: string
    setMessage: (value: string) => void
    canReview: boolean
    isSending: boolean
    receipt: Transfer[]
    open: () => void
    close: () => void
    /** The file input's `onChange` — validates, then uploads. */
    chooseFile: (file: File | null) => void
    clearFile: () => void
    downloadTemplate: () => void
    removeReceiver: (teviId: string) => void
    review: () => void
    back: () => void
    confirm: () => void
    sendMore: () => void
}

export function useMultiTransfer(): MultiTransferFlow {
    const { t } = useTranslation()
    const { activeId, currentUser } = useAuth()
    const requireStars = useRequireStars()
    const write = useTransferWrite()

    const [step, setStep] = useState<MultiStep>('closed')
    const [file, setFile] = useState<File | null>(null)
    const [problem, setProblem] = useState<FileProblem>(null)
    const [uploadFailed, setUploadFailed] = useState(false)
    const [plan, setPlan] = useState<TransferPlan | null>(null)
    const [message, setMessage] = useState('')
    const [receipt, setReceipt] = useState<Transfer[]>([])

    const selfId = readTeviId(currentUser?.id, activeId)

    /**
     * The file the screen is currently *about*.
     *
     * Two validations can be in flight — the "browse file" label and the drop zone are both live while
     * one is running — and TanStack calls `onSuccess` for **every** pending mutation, so the last
     * response to arrive used to win regardless of which file it belonged to. Pick a big file A, then
     * a small file B: B resolved first, A resolved second and overwrote the plan, and the screen then
     * showed "B.csv" over A's receivers and posted A's. The guard below drops any answer that is not
     * about the file on screen.
     */
    const currentFile = useRef<File | null>(null)

    const validate = useMutation({
        mutationFn: (chosen: File) => transferApi.validateTemplate(chosen, { accountId: activeId }),
        onSuccess: (rows, chosen) => {
            // Superseded: the reader picked another file while this one was validating.
            if (chosen !== currentFile.current) return
            const next = planTransfers(rows, selfId)
            /*
             * No rows at all is a failure, not an empty plan — see the note above. A file whose every
             * line was *rejected* is different and keeps its plan, so the review screen can say how
             * many lines were unusable.
             */
            if (rows.length === 0) {
                setUploadFailed(true)
                setPlan(null)
                return
            }
            setUploadFailed(false)
            setPlan(next)
        },
        onError: (_error, chosen) => {
            if (chosen !== currentFile.current) return
            setUploadFailed(true)
            setPlan(null)
        },
    })

    /**
     * The CSV template, saved to disk.
     *
     * A `Blob` and an object URL, not legacy's `encodeURI('data:text/csv;charset=utf-8,' + body)`:
     * a `#` anywhere in the template truncates a `data:` URL at that character, and a literal `%`
     * makes `encodeURI` produce an invalid escape that some browsers refuse outright. Both are
     * ordinary things to find in a spreadsheet header.
     *
     * The object URL is revoked immediately after the click — the download has already been handed to
     * the browser by then, and a URL that is never revoked keeps the whole file in memory for the life
     * of the document.
     */
    const download = useMutation({
        mutationFn: () => transferApi.getTemplate(activeId),
        onSuccess: csv => {
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
            const link = document.createElement('a')
            link.href = url
            link.download = 'tevi-star-transfer-template.csv'
            link.click()
            URL.revokeObjectURL(url)
        },
        // A toast, not a field message: nothing on the form is wrong, the download simply did not
        // arrive.
        onError: () => toast.error(t('star_transfer_error')),
    })

    const reset = useCallback(() => {
        currentFile.current = null
        setFile(null)
        setProblem(null)
        setUploadFailed(false)
        setPlan(null)
        setMessage('')
        setReceipt([])
    }, [])

    const chooseFile = useCallback(
        (chosen: File | null) => {
            setUploadFailed(false)
            setPlan(null)
            currentFile.current = chosen
            if (!chosen) {
                setFile(null)
                setProblem(null)
                return
            }
            // The name is kept on screen whichever way this goes: a reader told "only CSV files" needs
            // to see *which* file they picked to understand why.
            setFile(chosen)
            const refused = fileProblem(chosen)
            setProblem(refused)
            if (!refused) validate.mutate(chosen)
        },
        [validate],
    )

    const canReview = plan !== null && plan.receivers.length > 0

    const confirm = requireStars(plan?.total ?? 0, () => {
        if (!canReview || write.isPending || !plan) return
        write.mutate(
            plan.receivers.map(receiver => ({
                user_id: receiver.party.id,
                amount: receiver.stars,
                /*
                 * One note for the whole batch, as legacy sends it: the CSV has no message column, so
                 * the field on the upload screen is the sender's single note and every receiver gets
                 * the same one.
                 *
                 * **Always a string, `''` included** — billy requires the key on every element and
                 * reports it per row (`index`). See `TransferRequest`.
                 */
                description: message.trim(),
            })),
            {
                /*
                 * `transfers.length` is checked, and it is not defensive: `normalizeTransfers` drops a
                 * record with no `created_at` (B55), so a 2xx can legitimately parse to `[]` — and
                 * `[]` is truthy, so the receipt screen used to be reached and then render `null`.
                 * The Star had left and the reader got a bare "Transfer details" bar over nothing:
                 * no receipt, no id, no error. The money did move, so this is not an error toast
                 * about the transfer failing — it is the history, which is where the record is.
                 */
                onSuccess: transfers => {
                    if (transfers.length === 0) {
                        toast.success(t('star_transfer_sent_no_receipt'))
                        setStep('closed')
                        reset()
                        return
                    }
                    /*
                     * The receivers, carried across the response — the write does not echo `user`, so
                     * a bulk receipt otherwise lists N cards that name nobody. Positional against the
                     * rows just sent, and skipped entirely if the counts disagree: see
                     * `withKnownParties`, and note `plan` is the same object the request was built
                     * from two lines above, so the order is the request's order.
                     */
                    setReceipt(
                        withKnownParties(
                            transfers,
                            plan.receivers.map(r => r.party),
                        ),
                    )
                    setStep('receipt')
                },
            },
        )
    })

    return {
        step,
        file,
        fileProblem: problem,
        uploadFailed,
        isValidating: validate.isPending,
        isDownloading: download.isPending,
        plan,
        message,
        setMessage: useCallback((value: string) => {
            setMessage(value.slice(0, MESSAGE_MAX_LENGTH))
        }, []),
        canReview,
        isSending: write.isPending,
        receipt,
        open: useCallback(() => {
            reset()
            setStep('upload')
        }, [reset]),
        close: useCallback(() => {
            setStep('closed')
            reset()
        }, [reset]),
        chooseFile,
        clearFile: useCallback(() => {
            currentFile.current = null
            setFile(null)
            setProblem(null)
            setUploadFailed(false)
            setPlan(null)
        }, []),
        downloadTemplate: useCallback(() => {
            if (!download.isPending) download.mutate()
        }, [download]),
        /*
         * Removing the last receiver leaves an empty plan rather than dropping back to the upload
         * screen. Legacy navigates back, which discards the file *and* the note the reader wrote —
         * and it happens on the press of a small icon button, which is the worst place for a
         * destructive surprise. An empty list with a disabled Confirm is recoverable: the way out is
         * Back, which is on the screen.
         */
        removeReceiver: useCallback((teviId: string) => {
            setPlan(current => (current ? withoutReceiver(current, teviId) : current))
        }, []),
        review: useCallback(() => setStep('review'), []),
        back: useCallback(() => setStep('upload'), []),
        confirm,
        sendMore: useCallback(() => {
            reset()
            setStep('upload')
        }, [reset]),
    }
}
