'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount } from '@shared/lib/format-count'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useState } from 'react'
import { useCollections } from '../hooks/use-collections'
import { COLLECTIONS_MAX } from '../lib/collection-page'

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
    /* A full first page with more behind it is past the limit too. */
    const atLimit = collections.hasMore || collections.collections.length >= COLLECTIONS_MAX

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
            <div data-testid={subTestId(testId, 'panel')} className="flex flex-col gap-4 pt-1">
                <div className="flex flex-col gap-2">
                    <label
                        htmlFor={`${testId}-name`}
                        className="type-dense-strong text-(--text-title)"
                    >
                        {t('post_collection_name_label')}
                    </label>
                    {/*
                     * The search bar's pill — 48px, 24px radius, the segment fill — so the one
                     * free-text field in the composer matches the one every reader already knows,
                     * rather than the square-cornered outline it had. The border is transparent
                     * until focus, which is the only state the pill needs to draw.
                     */}
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
                        className="type-body-default box-border h-12 w-full rounded-[24px] border border-transparent bg-(--background-segment) px-4 text-(--text-title) caret-(--accents-indigo-active) outline-none transition-colors placeholder:text-(--text-placeholder) focus:border-(--input-border-focus) disabled:cursor-not-allowed disabled:opacity-60"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        variant="secondary"
                        size="large"
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
                        size="large"
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
                     * The collections screen pages the rest.
                     */}
                    {collections.hasMore ? (
                        <p className="type-caption-meta py-2 text-(--text-placeholder)">
                            {t('post_collection_more')}
                        </p>
                    ) : null}
                </>
            )}

            {/*
             * The DS button, full width — the same `primary` the collections screen's own
             * *Create new collection* uses (`collection-list.tsx`), so the one action reads the
             * same in both places. It was a hand-drawn outlined pill on the trailing edge, legacy's
             * `#3C1490` one, which sat apart from every other button in the app and was easy to
             * miss beside a column of *Add* pills that looked much like it.
             *
             * Hidden at ten, as legacy hides it (`collections.length < 10`), and at a first page
             * with more behind it — past the limit either way (`COLLECTIONS_MAX`).
             *
             * **Sticky**, because legacy puts this in `DialogActions` — a footer outside the
             * scrolling area. Left in the flow it scrolls away with the list, and a creator with a
             * screen's worth of collections has to scroll past all of them to find it. It needs its
             * own background, or the rows pass underneath: `--background-subtle`, which is what
             * `DialogContent` paints.
             *
             * `-bottom-3 pb-3`: sticky stops at the scroller's **padding** edge, so `bottom-0` left
             * the composer's 12px bottom padding open under the bar and the rows scrolled past
             * through it. Pulling the bar down over that padding and filling it closes the gap.
             */}
            {atLimit ? null : (
                <div className="sticky -bottom-3 border-(--separator-default) border-t bg-(--background-subtle) py-3">
                    <Button
                        variant="primary"
                        size="large"
                        fullWidth
                        disabled={disabled}
                        onClick={() => setCreating(true)}
                        data-testid={subTestId(testId, 'trigger')}
                    >
                        <Icon name="plus" size={20} className="flex-none" />
                        {t('post_collection_create_new')}
                    </Button>
                </div>
            )}
        </div>
    )
}
