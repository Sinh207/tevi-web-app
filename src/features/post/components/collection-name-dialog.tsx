'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { useId, useState } from 'react'

/**
 * Legacy's cap on a collection's name (`collectionForm`: `value.length > 25` is an error, with a
 * `n/25` counter under the field). The backend's own limit is not documented, so the client keeps
 * the one both shipped web screens enforce.
 */
export const COLLECTION_NAME_MAX = 25

/**
 * Naming a collection — *Create new collection* on the list, *Edit collection* on a row or the
 * collection's own screen. One dialog, so the two cannot disagree about the limit.
 *
 * ## The limit is `maxLength`, not an error message
 *
 * Legacy lets the field overflow and then refuses it twice — a red helper text and a toast. Here
 * the field simply stops at 25 and the counter says so: there is no state in which the reader has
 * typed something the button will not accept, so there is nothing to explain. A paste longer than
 * that is cut by the browser the same way.
 *
 * Legacy also runs the value through DOMPurify on every keystroke. Not ported: a name is rendered
 * as **text** everywhere in this app, so markup in it is inert — and stripping it would silently
 * change what the creator typed.
 */
export function CollectionNameDialog({
    open,
    onOpenChange,
    title,
    submitLabel,
    initialName = '',
    pending = false,
    onSubmit,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    submitLabel: string
    /** What the field starts with — the current name when editing. */
    initialName?: string
    pending?: boolean
    /** Called with the trimmed name. The caller closes the dialog when its write lands. */
    onSubmit: (name: string) => void
    testId?: string
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (!next && pending) return
                onOpenChange(next)
            }}
        >
            <DialogContent
                className="flex w-full max-w-[420px] flex-col gap-0 p-0"
                data-testid={testId}
            >
                {/* Mounted per opening, so the field starts from `initialName` every time. */}
                {open ? (
                    <NameForm
                        title={title}
                        submitLabel={submitLabel}
                        initialName={initialName}
                        pending={pending}
                        onSubmit={onSubmit}
                        onClose={() => onOpenChange(false)}
                        testId={testId}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    )
}

function NameForm({
    title,
    submitLabel,
    initialName,
    pending,
    onSubmit,
    onClose,
    testId,
}: {
    title: string
    submitLabel: string
    initialName: string
    pending: boolean
    onSubmit: (name: string) => void
    onClose: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const inputId = useId()
    const [draft, setDraft] = useState(initialName.slice(0, COLLECTION_NAME_MAX))
    const trimmed = draft.trim()
    const canSubmit = trimmed !== '' && trimmed !== initialName.trim() && !pending

    function submit() {
        if (canSubmit) onSubmit(trimmed)
    }

    return (
        <>
            <DialogScreenHeader
                title={title}
                onClose={onClose}
                disabled={pending}
                testId={subTestId(testId, 'header')}
            />
            <form
                className="flex flex-col gap-2 p-4"
                onSubmit={event => {
                    event.preventDefault()
                    submit()
                }}
            >
                <label htmlFor={inputId} className="type-body-strong text-(--text-title)">
                    {t('post_collection_name_label')}
                </label>
                <input
                    id={inputId}
                    value={draft}
                    // biome-ignore lint/a11y/noAutofocus: the dialog is opened to type this one field.
                    autoFocus
                    maxLength={COLLECTION_NAME_MAX}
                    disabled={pending}
                    placeholder={t('post_collection_name_placeholder')}
                    aria-describedby={`${inputId}-count`}
                    data-testid={subTestId(testId, 'input')}
                    onChange={event => setDraft(event.target.value)}
                    className="type-body-default rounded-(--radius-sm) border border-(--input-border) bg-transparent px-3 py-2 text-(--text-title) placeholder:text-(--text-placeholder)"
                />
                <span
                    id={`${inputId}-count`}
                    data-testid={subTestId(testId, 'count')}
                    className="type-caption-meta self-end text-(--text-placeholder)"
                >
                    {t('collection_name_count', { length: draft.length, max: COLLECTION_NAME_MAX })}
                </span>
                <div className="flex justify-end pt-2">
                    <Button
                        type="submit"
                        variant="primary"
                        size="medium"
                        disabled={!canSubmit}
                        data-testid={subTestId(testId, 'submit')}
                    >
                        {submitLabel}
                    </Button>
                </div>
            </form>
        </>
    )
}
