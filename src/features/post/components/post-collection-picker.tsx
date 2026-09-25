'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount } from '@shared/lib/format-count'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useState } from 'react'
import { useCollections } from '../hooks/use-collections'

/**
 * *Select collection* — which of the creator's collections a new post is filed into.
 *
 * ## A button per row, not a checkbox
 *
 * Legacy draws each row as **name over post count**, with an outlined pill on the trailing edge
 * that reads *Add* or *Remove*. That was built here as a checkbox list first, which is a different
 * statement: a checkbox says "tick the ones you want and confirm", a button says "this one is in,
 * press to take it out". Legacy's is the one that matches what actually happens — the selection is
 * applied on publish, row by row, with no confirm step of its own.
 *
 * ## Creating one is its own screen
 *
 * Legacy opens *Create new collection* as a second dialog with a label, a placeholder and a save
 * button. Here it is a screen inside the same frame (this app's dialog draws one layer), but it is
 * still a **screen** rather than the inline field this had at first: naming a collection is a step,
 * and a field wedged under a list reads as an afterthought.
 */
/**
 * Past this many, legacy stops offering *Create new collection*.
 *
 * The same number as the page size, and not a coincidence: the picker reads one page, so a creator
 * with more than this cannot see what they already have — and a new collection made blind is one
 * they cannot then find to file into.
 */
const COLLECTION_CREATE_LIMIT = 10

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
    const { t, currentLanguage } = useTranslation()
    const [creating, setCreating] = useState(false)
    const [name, setName] = useState('')

    const collections = useCollections({ enabled: true })

    function toggle(id: string) {
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
    }

    async function create() {
        const trimmed = name.trim()
        if (!trimmed || collections.isCreating) return
        const created = await collections.create(trimmed)
        setName('')
        setCreating(false)
        /*
         * Selected on creation. A creator who has just named a collection from inside a composer
         * means this post to go in it; making them press *Add* afterwards is a step with no
         * decision in it. A create that answers no body leaves nothing to select.
         */
        if (created?.id) onChange([...selected, created.id])
    }

    if (creating) {
        return (
            <div data-testid={subTestId(testId, 'panel')} className="flex flex-col gap-2">
                <label htmlFor={`${testId}-name`} className="type-body-strong text-(--text-title)">
                    {t('post_collection_name_label')}
                </label>
                <input
                    id={`${testId}-name`}
                    value={name}
                    // biome-ignore lint/a11y/noAutofocus: the screen is opened by pressing "Create new collection", so the field is the reason the reader is here.
                    autoFocus
                    disabled={collections.isCreating}
                    placeholder={t('post_collection_name_placeholder')}
                    data-testid={subTestId(testId, 'input')}
                    onChange={event => setName(event.target.value)}
                    onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        // Enter inside the composer would otherwise publish the post.
                        event.preventDefault()
                        void create()
                    }}
                    className="type-body-default rounded-(--radius-sm) border border-(--input-border) bg-transparent px-3 py-2 text-(--text-title) placeholder:text-(--text-placeholder)"
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        variant="secondary"
                        size="medium"
                        disabled={collections.isCreating}
                        onClick={() => {
                            setName('')
                            setCreating(false)
                        }}
                        data-testid={subTestId(testId, 'cancel')}
                    >
                        {t('common_cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        size="medium"
                        disabled={!name.trim() || collections.isCreating}
                        onClick={() => void create()}
                        data-testid={subTestId(testId, 'submit')}
                    >
                        {t('post_collection_create')}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div data-testid={testId} className="flex flex-col">
            {collections.isLoading ? (
                <div className="flex flex-col gap-3 py-2" aria-busy="true">
                    <Skeleton h={20} className="w-2/3 rounded-(--radius-sm)" />
                    <Skeleton h={20} className="w-1/2 rounded-(--radius-sm)" />
                </div>
            ) : collections.isError ? (
                <div className="flex items-center gap-3 py-3">
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
                    {collections.collections.map((collection, index) => {
                        const inside = selected.includes(collection.id)
                        return (
                            <div
                                key={collection.id}
                                data-option-value={collection.id}
                                /*
                                 * A hairline **between** rows, not under each of them — so the list
                                 * ends on a row rather than on a rule, and the first one does not
                                 * carry a line that separates it from the dialog's own header.
                                 * Legacy draws no divider here at all; this is the one addition to
                                 * its markup on this screen, and it earns its place: the rows are
                                 * two lines tall with a button on the end, and without a rule they
                                 * read as one block of text.
                                 */
                                className={
                                    index === 0
                                        ? 'flex items-center justify-between gap-3 py-3'
                                        : 'flex items-center justify-between gap-3 border-(--separator-default) border-t py-3'
                                }
                            >
                                <span className="flex min-w-0 flex-col gap-1">
                                    <span className="type-body-strong truncate text-(--text-title)">
                                        {collection.name}
                                    </span>
                                    {/*
                                     * The count, with legacy's leading dot. Drawn only above zero —
                                     * an empty collection has nothing to count, and "0 posts" under
                                     * its name is a statement nobody needs.
                                     */}
                                    {collection.post_count > 0 ? (
                                        <span className="type-caption-meta flex items-center gap-1 text-(--text-placeholder)">
                                            <span
                                                aria-hidden="true"
                                                className="size-1 rounded-full bg-current"
                                            />
                                            {t('post_collection_count', {
                                                count: collection.post_count,
                                                formatted: formatCompactCount(
                                                    collection.post_count,
                                                    currentLanguage,
                                                ),
                                            })}
                                        </span>
                                    ) : null}
                                </span>

                                {/*
                                 * Legacy's outlined pill, and its two words. It says what pressing
                                 * does rather than what the state is — which is the difference
                                 * between this and the checkbox that was here before.
                                 */}
                                <Button
                                    variant="secondary"
                                    size="small"
                                    disabled={disabled}
                                    onClick={() => toggle(collection.id)}
                                    data-testid={subTestId(testId, 'option')}
                                    className="flex-none"
                                >
                                    {inside
                                        ? t('post_collection_remove')
                                        : t('post_collection_add')}
                                </Button>
                            </div>
                        )
                    })}

                    {collections.collections.length === 0 ? (
                        <p
                            data-testid={subTestId(testId, 'message')}
                            className="type-dense-default py-3 text-(--text-placeholder)"
                        >
                            {t('post_collection_empty')}
                        </p>
                    ) : null}

                    {/*
                     * Said plainly rather than paged over: the picker asks for one page, and a
                     * creator with more collections would otherwise scroll a list that never grows.
                     * It becomes an infinite query when a collections screen exists to justify one.
                     */}
                    {collections.hasMore ? (
                        <p className="type-caption-meta py-2 text-(--text-placeholder)">
                            {t('post_collection_more')}
                        </p>
                    ) : null}
                </>
            )}

            {/*
             * Legacy's footer button: a brand-coloured pill on the **trailing** edge (its
             * `DialogActions` aligns right), with a `+` glyph in the same colour.
             *
             * The colour is `--text-brand` rather than legacy's raw `#3C1490`, which sits between
             * `--primary-600` and `--primary-700` and has no token of its own. `--text-brand` is
             * what this design system calls that colour, and it moves with the theme where a hex
             * cannot — `DESIGN_SYSTEM.md` bars the raw value outright. The hover is
             * `--background-segment` for the same reason: reaching into the Primary ramp for a
             * `--primary-50` tint would pick a *dark* fill in dark mode, since that ramp inverts.
             *
             * Hidden past ten, as legacy hides it (`collections.length < 10`): the list asks for one
             * page, so past that the creator cannot see what they already have and a new one would
             * be filed somewhere they cannot check.
             */}
            {collections.collections.length < COLLECTION_CREATE_LIMIT ? (
                <div className="flex justify-end pt-3">
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setCreating(true)}
                        data-testid={subTestId(testId, 'trigger')}
                        className="type-dense-emphasis flex h-10 items-center gap-1 rounded-[40px] border-[1.5px] border-(--text-brand) bg-(--background-surface) px-4 text-(--text-brand) transition-colors hover:bg-(--background-segment) disabled:opacity-40"
                    >
                        <Icon name="plus" size={20} className="flex-none" />
                        {t('post_collection_create_new')}
                    </button>
                </div>
            ) : null}
        </div>
    )
}
