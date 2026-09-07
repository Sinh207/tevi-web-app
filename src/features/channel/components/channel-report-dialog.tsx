'use client'

import { TextAreaField } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { keepFor } from '@shared/lib/api/query-client'
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
import Image from 'next/image'
import Link from 'next/link'
import { useId, useState } from 'react'
import { reasonLabelKey, reportApi, reportKeys } from '../api/report-api'
import type { Channel } from '../api/types'
import { REPORT_ART } from '../lib/illustrations'

/**
 * "Report space" — legacy's `components/reportContents/formReport`, for a channel.
 *
 * ## The two buttons are one flow, not two
 *
 * Legacy offers **Report** and **Report and Block**, and the second is the first plus a block. That
 * is how it is written here: one mutation, and the caller is told whether to block afterwards. A
 * separate "block" path would be able to block somebody whose report failed to send.
 *
 * ## The reasons are fetched, and each carries a stable id
 *
 * `core/v1/report/report/channel/contents/` answers `{ type, text }` pairs. **`type` is submitted**
 * (legacy posts `content?.type`, never the prose) and it is also what makes the list translatable —
 * `reasonLabelKey` maps it to this app's own copy, with `text` behind it for an id that ships later.
 * Legacy translates by reverse-looking-up the English bundle for a byte-identical string, which
 * falls back to English the day anyone edits one.
 *
 * The query is enabled only while the dialog is open — a menu row nobody presses costs no request.
 */
export function ChannelReportDialog({
    channel,
    open,
    onOpenChange,
    onBlock,
}: {
    channel: Channel
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Called after a successful "Report and Block" — the caller owns the block mutation. */
    onBlock: () => void
}) {
    const { t } = useTranslation()
    const [reason, setReason] = useState('')
    /** Filed — the dialog now shows the confirmation instead of the form. */
    const [submitted, setSubmitted] = useState(false)
    const [description, setDescription] = useState('')
    const groupName = useId()

    const reasons = useQuery({
        queryKey: reportKeys.channelReasons,
        queryFn: ({ signal }) => reportApi.getChannelReasons({ signal }),
        enabled: open,
        // A fixed catalogue. Refetching it per open would be a request to be told the same list.
        ...keepFor(60 * 60 * 1000),
    })

    const submit = useMutation({
        mutationFn: (alsoBlock: boolean) =>
            reportApi
                .reportChannel({ channelId: channel.id, content: reason, description })
                .then(() => alsoBlock),
        onSuccess: alsoBlock => {
            setReason('')
            setDescription('')
            /*
             * The form is replaced by the confirmation **in the same dialog**, rather than closing
             * and opening a second one. Legacy uses two dialogs and this is one, because they are
             * one step of one flow: the reader pressed Report and is being told what happened to it.
             *
             * `onOpenChange` is not called here — closing is the reader's, through the
             * confirmation's own button.
             */
            setSubmitted(true)
            if (alsoBlock) onBlock()
        },
        meta: { showErrorToast: t('channel_report_failed') },
    })

    function close() {
        onOpenChange(false)
        // Reset only once the dialog is gone: doing it here would swap the confirmation back to the
        // form for the length of the close animation.
        window.setTimeout(() => setSubmitted(false), 200)
    }

    if (submitted) {
        return (
            <Dialog open={open} onOpenChange={close}>
                <DialogContent className="w-[420px] items-center">
                    {/* 88×104, the art's own box. Legacy draws it at 86 wide and squashes it two
                        pixels; nothing is gained by copying that. */}
                    <Image
                        src={REPORT_ART.submitted.src}
                        alt=""
                        width={REPORT_ART.submitted.width}
                        height={REPORT_ART.submitted.height}
                    />
                    <DialogHeader>
                        <DialogTitle>{t('channel_report_thanks_title')}</DialogTitle>
                        <DialogDescription>{t('channel_report_thanks')}</DialogDescription>
                    </DialogHeader>
                    {/*
                     * Legacy links "Community Guidelines" inside the sentence. The sentence is one
                     * translated string here, so the link is its own row rather than a fragment
                     * spliced into nine translations at a position none of them agree on.
                     */}
                    <Link
                        data-testid="channel-report-guidelines"
                        href="/community-guidelines"
                        className="type-dense-default text-(--text-link) hover:underline"
                    >
                        {t('channel_community_guidelines')}
                    </Link>
                    <Button
                        data-testid="channel-report-close"
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
            <DialogContent className="w-[420px]">
                <DialogHeader>
                    <DialogTitle>{t('channel_report_title')}</DialogTitle>
                    <DialogDescription>{t('channel_report_reason')}</DialogDescription>
                </DialogHeader>

                {/*
                 * **One scroll area for the whole body**, reasons and description together — the
                 * description is not pinned under a scrolling list.
                 *
                 * It was, and the shape was wrong in both directions: with nine reasons the field
                 * sat below a box the reader had to scroll *inside*, and with the list absent (a
                 * failed fetch) it sat at the same offset under an empty gap. A form reads top to
                 * bottom; only the dialog's own footer is fixed.
                 */}
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
                             * states: the reader cannot proceed and is not told why. This branch used
                             * to be absent, so a failed fetch rendered an empty box between the title
                             * and the description field.
                             *
                             * An empty **success** lands here too, deliberately: a 200 with no rows
                             * leaves nothing to choose, which is the same dead end as a failure.
                             */
                            <div className="flex flex-col items-center gap-2 py-4 text-center">
                                <p className="type-dense-default text-(--text-subtitle)">
                                    {t('channel_report_reasons_failed')}
                                </p>
                                <Button
                                    data-testid="channel-report-retry"
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
                                /*
                                 * `htmlFor` + `id`, not a label *wrapping* the control. The input
                                 * does live inside `Radio`, so wrapping works in a browser — but it
                                 * is invisible to a linter reading this file, and `lint/a11y` was
                                 * right to ask: the association has to be legible without knowing
                                 * what `Radio` renders. Same pairing `space-visibility-option.tsx`
                                 * uses, and the same reason `Radio` takes `as="span"` here.
                                 */
                                <label
                                    key={item.type}
                                    htmlFor={`${groupName}-${item.type}`}
                                    className="flex min-w-0 cursor-pointer items-center gap-3 rounded-(--radius-md) px-1 py-2"
                                >
                                    <Radio
                                        data-testid="channel-report-reason"
                                        as="span"
                                        id={`${groupName}-${item.type}`}
                                        name={groupName}
                                        value={item.type}
                                        checked={reason === item.type}
                                        onChange={() => setReason(item.type)}
                                    />
                                    <span className="type-dense-default min-w-0 text-(--text-title)">
                                        {/* Our copy for a known id, the backend's wording for one
                                          that ships after this client — see `reasonLabelKey`. */}
                                        {t(reasonLabelKey(item.type), item.text)}
                                    </span>
                                </label>
                            ))
                        )}
                    </div>

                    <TextAreaField
                        data-testid="channel-report-detail"
                        label={t('channel_report_description')}
                        placeholder={t('channel_report_description_placeholder')}
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        rows={3}
                    />
                </div>

                {/*
                 * Legacy's own footer: a **right-aligned row of two small buttons**, not two
                 * full-width ones stacked. Its numbers are `width: fit-content`, `height: 29`, 14/600
                 * — which is the DS `small` (28) to within a pixel, so `small` it is. What is not
                 * carried over is its `borderRadius: 40`: the DS draws every button at radius 12 and
                 * a pill here would be the one round control in the app.
                 *
                 * Order is legacy's too — the plain Report first, the destructive pair second, which
                 * puts the heavier action furthest from the thumb's resting place.
                 *
                 * Both are disabled until a reason is chosen, which is also legacy's rule and the
                 * reason the description stays optional: a report with no category is not actionable
                 * by whoever reads it.
                 */}
                <div className="flex min-w-0 items-center justify-end gap-3">
                    <Button
                        data-testid="channel-report-submit"
                        variant="secondary"
                        size="small"
                        disabled={!reason || submit.isPending}
                        onClick={() => submit.mutate(false)}
                    >
                        {t('channel_report_submit')}
                    </Button>
                    <Button
                        data-testid="channel-report-submit-block"
                        variant="destructive"
                        size="small"
                        disabled={!reason || submit.isPending}
                        onClick={() => submit.mutate(true)}
                    >
                        {t('channel_report_and_block')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
