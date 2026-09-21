'use client'

import { TextAreaField } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { keepFor } from '@shared/lib/api/query-client'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import { Radio } from '@shared/ui/radio'
import { Skeleton } from '@shared/ui/skeleton'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { postReportApi, postReportKeys, reasonLabelKey } from '../api/post-report-api'
import type { Post } from '../api/types'

/**
 * "Report post" — legacy's `posts/common/reportPost`.
 *
 * ## It is the space report's twin, and the duplication is the smaller cost
 *
 * `features/channel`'s `ChannelReportDialog` is the same six moving parts: a fetched reason
 * catalogue, a radio list keyed on stable ids, an optional free-text note, and two buttons where
 * the second is the first plus a block. Sharing them would mean a component in `shared/` that takes
 * an endpoint pair, a key prefix, a copy namespace and a block callback — four parameters whose only
 * purpose is to make one file serve two, in a repo where `features/post` and `features/channel`
 * **cannot import each other at all**. So it is a deliberate second implementation, and the two
 * things that must not drift between them already live in `shared/lib/api/report-reasons.ts`: the
 * row schema and the label-key rule.
 *
 * What is *not* duplicated, and is worth stating: this one has no illustration. `REPORT_ART` is
 * `features/channel`'s asset (`lib/illustrations.ts`) and this feature may not read it; a second
 * committed copy of the same WebP to decorate a confirmation is exactly what `docs/STATIC_ASSETS.md`
 * asks people not to do. The confirmation is text, which says the same thing.
 *
 * ## Two buttons, one flow
 *
 * The second is the first plus a block, and the block is the **caller's** — a separate block path
 * would be able to block somebody whose report failed to send.
 *
 * ## The reasons are fetched, and `type` is what is submitted
 *
 * Never the prose. The id is also what makes the list translatable; `text` stands behind it for an
 * id that ships after this client. The query runs only while the dialog is open, so a menu row
 * nobody presses costs no request.
 */
export function PostReportDialog({
    post,
    open,
    onOpenChange,
    onBlock,
    testId = 'post-report',
}: {
    post: Post
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Called after a successful "Report and block" — the caller owns the block mutation. */
    onBlock: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const [reason, setReason] = useState('')
    const [description, setDescription] = useState('')
    /** Filed — the dialog now shows the confirmation instead of the form. */
    const [submitted, setSubmitted] = useState(false)
    const groupName = useId()

    const reasons = useQuery({
        queryKey: postReportKeys.reasons,
        queryFn: ({ signal }) => postReportApi.getReasons({ signal }),
        enabled: open,
        // A fixed catalogue. Refetching per open would be a request to be told the same list.
        ...keepFor(60 * 60 * 1000),
    })

    const submit = useMutation({
        mutationFn: (alsoBlock: boolean) =>
            postReportApi
                .reportPost({ postId: post.id, content: reason, description })
                .then(() => alsoBlock),
        onSuccess: alsoBlock => {
            setReason('')
            setDescription('')
            /*
             * The form is replaced by the confirmation **in the same dialog** rather than closing
             * and opening a second one: they are one step of one flow — the reader pressed Report
             * and is being told what happened to it. Closing is theirs, through the confirmation's
             * own button.
             */
            setSubmitted(true)
            if (alsoBlock) onBlock()
        },
        meta: { showErrorToast: t('post_report_failed') },
    })

    function close() {
        onOpenChange(false)
        // Reset once the dialog is gone; doing it here swaps the confirmation back to the form for
        // the length of the close animation.
        window.setTimeout(() => setSubmitted(false), 200)
    }

    if (submitted) {
        return (
            <Dialog open={open} onOpenChange={close}>
                <DialogContent className="w-[420px]" data-testid={testId}>
                    <DialogHeader>
                        <DialogTitle data-testid={subTestId(testId, 'title')}>
                            {t('post_report_thanks_title')}
                        </DialogTitle>
                        <DialogDescription data-testid={subTestId(testId, 'description')}>
                            {t('post_report_thanks')}
                        </DialogDescription>
                    </DialogHeader>
                    <Button
                        data-testid={subTestId(testId, 'close')}
                        variant="secondary"
                        size="large"
                        fullWidth
                        onClick={close}
                    >
                        {t('common_close')}
                    </Button>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[420px]" data-testid={testId}>
                <DialogHeader>
                    <DialogTitle data-testid={subTestId(testId, 'title')}>
                        {t('post_report_title')}
                    </DialogTitle>
                    <DialogDescription data-testid={subTestId(testId, 'description')}>
                        {t('post_report_reason')}
                    </DialogDescription>
                </DialogHeader>

                {/* One scroll area for reasons and note together — a form reads top to bottom, and
                    only the footer is fixed. `ChannelReportDialog` carries the full note. */}
                <div className="flex max-h-[50vh] min-w-0 flex-col gap-4 overflow-y-auto">
                    <div className="flex min-w-0 flex-col gap-1">
                        {reasons.isLoading ? (
                            [0, 1, 2, 3].map(row => (
                                <Skeleton
                                    key={row}
                                    h={40}
                                    className="w-full rounded-(--radius-md)"
                                />
                            ))
                        ) : reasons.isError || !reasons.data?.length ? (
                            /*
                             * A form with no reasons and no explanation is the worst of the three
                             * states: the reader cannot proceed and is not told why. An empty
                             * **success** lands here too — a 200 with no rows is the same dead end.
                             */
                            <div className="flex flex-col items-center gap-2 py-4 text-center">
                                <p className="type-dense-default text-(--text-subtitle)">
                                    {t('post_report_reasons_failed')}
                                </p>
                                <Button
                                    data-testid={subTestId(testId, 'retry')}
                                    variant="secondary"
                                    size="small"
                                    onClick={() => reasons.refetch()}
                                    disabled={reasons.isFetching}
                                >
                                    {t('common_retry')}
                                </Button>
                            </div>
                        ) : (
                            reasons.data.map(item => (
                                /* `htmlFor` + `id` rather than a wrapping label: the association
                                   has to be legible without knowing what `Radio` renders. */
                                <label
                                    key={item.type}
                                    htmlFor={`${groupName}-${item.type}`}
                                    className="flex min-w-0 cursor-pointer items-center gap-3 rounded-(--radius-md) px-1 py-2"
                                >
                                    <Radio
                                        data-testid={subTestId(testId, 'option')}
                                        data-option-value={item.type}
                                        as="span"
                                        id={`${groupName}-${item.type}`}
                                        name={groupName}
                                        value={item.type}
                                        checked={reason === item.type}
                                        onChange={() => setReason(item.type)}
                                    />
                                    <span className="type-dense-default min-w-0 text-(--text-title)">
                                        {/* Our copy for a known id, the backend's wording for one
                                          that ships after this client. */}
                                        {t(reasonLabelKey(item.type), item.text)}
                                    </span>
                                </label>
                            ))
                        )}
                    </div>

                    <TextAreaField
                        data-testid={subTestId(testId, 'input')}
                        label={t('post_report_description')}
                        placeholder={t('post_report_description_placeholder')}
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        rows={3}
                    />
                </div>

                {/* Legacy's footer: a right-aligned row of two small buttons, the plain Report first
                    and the destructive pair second — heavier action furthest from the thumb. Both
                    disabled until a reason is chosen, which is why the note stays optional: a report
                    with no category is not actionable by whoever reads it. */}
                <div className="flex min-w-0 items-center justify-end gap-3">
                    <Button
                        data-testid={subTestId(testId, 'submit')}
                        variant="secondary"
                        size="small"
                        disabled={!reason || submit.isPending}
                        onClick={() => submit.mutate(false)}
                    >
                        {t('post_report_submit')}
                    </Button>
                    <Button
                        data-testid={subTestId(testId, 'confirm')}
                        variant="destructive"
                        size="small"
                        disabled={!reason || submit.isPending}
                        onClick={() => submit.mutate(true)}
                    >
                        {t('post_report_and_block')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
