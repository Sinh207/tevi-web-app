'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Skeleton } from '@shared/ui/skeleton'
import { useState } from 'react'
import { useCollections } from '../hooks/use-collections'

/**
 * Which of the creator's collections a new post is filed into.
 *
 * ## It is a disclosure, not a dialog
 *
 * Legacy opens this as a modal over the composer, which is a modal. This app's dialog primitive
 * draws one layer, and stacking two puts the second one's backdrop over the form the author is
 * mid-way through — so the picker expands in place, the same call `PostSettingsPanel` makes about
 * legacy's other three modals.
 *
 * Collapsed by default and the query is disabled until it opens, so a composer nobody files from
 * costs no request.
 *
 * ## Creating one is inline, because the alternative is a third layer
 *
 * Legacy's *Add collection* is its own modal on top of the picker modal. Here a name field appears
 * under the list; it is the same two controls without the stack.
 */
export function PostCollectionPicker({
    selected,
    onChange,
    disabled = false,
    testId,
}: {
    selected: string[]
    onChange: (ids: string[]) => void
    disabled?: boolean
    testId?: string
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')

    const collections = useCollections({ enabled: open })

    function toggle(id: string) {
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
    }

    async function createAndSelect() {
        const trimmed = name.trim()
        if (!trimmed || collections.isCreating) return
        const created = await collections.create(trimmed)
        setName('')
        /*
         * Selected on creation. A creator who has just named a collection from inside a composer
         * means this post to go in it — making them tick it afterwards is a step with no decision
         * in it. A create that answers no body simply leaves nothing to tick.
         */
        if (created?.id) onChange([...selected, created.id])
    }

    return (
        <div data-testid={testId} className="flex flex-col gap-2">
            <button
                type="button"
                data-testid={subTestId(testId, 'trigger')}
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen(current => !current)}
                className="type-dense-emphasis flex items-center justify-between text-(--text-title)"
            >
                <span>{t('post_collection_title')}</span>
                <span className="type-caption-meta text-(--text-placeholder)">
                    {selected.length > 0
                        ? t('post_collection_selected', { count: selected.length })
                        : t('post_collection_none')}
                </span>
            </button>

            {open ? (
                <div className="flex flex-col gap-2">
                    {collections.isLoading ? (
                        <div className="flex flex-col gap-2" aria-busy="true">
                            <Skeleton h={20} className="w-2/3 rounded-(--radius-sm)" />
                            <Skeleton h={20} className="w-1/2 rounded-(--radius-sm)" />
                        </div>
                    ) : collections.isError ? (
                        <div className="flex items-center gap-2">
                            <p className="type-dense-default text-(--text-subtitle)">
                                {t('post_collection_error')}
                            </p>
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => collections.refetch()}
                                data-testid={subTestId(testId, 'retry')}
                            >
                                {t('common_retry')}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/*
                             * `Checkbox` **is** a `<label>` and its own header says never to nest it
                             * in another one — so the copy is a sibling `<label htmlFor>` rather
                             * than a wrapper. `Radio` takes an `as` prop and could have been
                             * wrapped; this one cannot, and the two are not interchangeable.
                             */}
                            {collections.collections.map(collection => {
                                const inputId = `${testId ?? 'collection'}-${collection.id}`
                                return (
                                    <div
                                        key={collection.id}
                                        className="flex items-center gap-2"
                                        data-option-value={collection.id}
                                    >
                                        <Checkbox
                                            id={inputId}
                                            checked={selected.includes(collection.id)}
                                            disabled={disabled}
                                            onChange={() => toggle(collection.id)}
                                            data-testid={subTestId(testId, 'option')}
                                        />
                                        <label
                                            htmlFor={inputId}
                                            className="type-dense-default min-w-0 cursor-pointer truncate text-(--text-title)"
                                        >
                                            {collection.name}
                                        </label>
                                    </div>
                                )
                            })}

                            {collections.collections.length === 0 ? (
                                <p
                                    data-testid={subTestId(testId, 'message')}
                                    className="type-dense-default text-(--text-placeholder)"
                                >
                                    {t('post_collection_empty')}
                                </p>
                            ) : null}

                            {/*
                             * Said plainly rather than paged over: the picker asks for one page, and
                             * a creator with more collections than that would otherwise scroll a
                             * list that never grows. It becomes an infinite query when a collections
                             * screen exists to justify one.
                             */}
                            {collections.hasMore ? (
                                <p className="type-caption-meta text-(--text-placeholder)">
                                    {t('post_collection_more')}
                                </p>
                            ) : null}
                        </>
                    )}

                    <div className="flex items-center gap-2">
                        <input
                            value={name}
                            disabled={disabled || collections.isCreating}
                            placeholder={t('post_collection_new_placeholder')}
                            data-testid={subTestId(testId, 'input')}
                            onChange={event => setName(event.target.value)}
                            onKeyDown={event => {
                                if (event.key !== 'Enter') return
                                // Enter inside a composer would otherwise submit the post.
                                event.preventDefault()
                                void createAndSelect()
                            }}
                            className="type-dense-default min-w-0 flex-1 rounded-(--radius-sm) border border-(--input-border) bg-transparent px-2 py-1 text-(--text-title) placeholder:text-(--text-placeholder)"
                        />
                        <Button
                            variant="secondary"
                            size="small"
                            disabled={!name.trim() || collections.isCreating || disabled}
                            onClick={() => void createAndSelect()}
                            data-testid={subTestId(testId, 'submit')}
                        >
                            {t('post_collection_create')}
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    )
}
