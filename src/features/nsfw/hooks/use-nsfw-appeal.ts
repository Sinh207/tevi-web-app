'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
    forgetFlaggedPostsCache,
    LATEST_STALE_MS,
    type NsfwPostQueue,
    nsfwAppealApi,
    nsfwAppealKeys,
    rememberDeletedPost,
} from '../api/nsfw-appeal-api'

/** Which face the appeal screen is showing. */
export type NsfwAppealStep = 'loading' | 'queue' | 'submitted'

/**
 * The NSFW appeal, as a state machine — because the *sequence* is the product rule, not any one call.
 *
 * ```
 *  open ──► GET  nsfw-appeal/latest/ ──► 200 with data ──► "Appeal submitted!"
 *                    │
 *                    └── 404 / empty ──► GET nsfw-posts/?limit=10 ──► queue
 *                                          │  DELETE v1/posts/{id}/  (per row, spliced locally)
 *                                          └── page empty ──► next cursor? fetch it : done
 *                                                                              │
 *                                                       POST nsfw-appeal/ ◄────┘
 * ```
 *
 * ## Four claims that only hold as a sequence, which is why this is a hook and not four calls
 *
 * - **The existing appeal is checked first, and on every open.** An account that has already
 *   appealed must not be shown its own deleted-posts queue again — the queue is empty for them and
 *   the Submit button would file a duplicate against a case a human is already reading.
 * - **A delete is spliced out of the cache; it does not refetch.** This is the correction the
 *   backend forced. The refetch design was right in principle and wrong in fact: `nsfw-posts/`
 *   answers a **304** right after a delete (`apiClient` then replays the pre-delete body), and once
 *   that was worked around it turned out the backend **caches the list** and serves the deleted row
 *   in a fresh 200 as well. Two different staleness bugs, one consequence: the row comes back and
 *   Submit never enables. The `DELETE` returning 2xx *is* the fact; asking the server to confirm it
 *   only asks a cache. So the row leaves the cache locally, and `rememberDeletedPost` makes the
 *   removal stick across any later read.
 * - **An emptied page is not an empty queue until `next` says so.** The page holds ten; clearing it
 *   means the *page* is done. If the response carried a `next`, the cursor advances and one request
 *   fetches what is behind it — the only request a delete can still cause, and only when it is the
 *   difference between an appeal that can be filed and one that will be refused. With `next: null`
 *   the queue really is empty and **nothing is fetched at all**.
 * - **Submitting flips the step locally.** `POST` succeeding *is* the answer; re-reading `latest/`
 *   to be told what we just did would put a spinner between the press and the confirmation for no
 *   new information.
 */
export function useNsfwAppeal({ enabled }: { enabled: boolean }) {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    /** Set by a successful `POST`; the query below is what answers on a fresh open. */
    const [justSubmitted, setJustSubmitted] = useState(false)
    /**
     * Which page of the queue is on screen — `null` is the first.
     *
     * The screen shows **one page at a time**, not an accumulated list, and that is the shape of the
     * work rather than a shortcut: every row has to be deleted, so a page is a batch to clear and
     * the next one arrives when it is. Accumulating would mean holding rows the creator has already
     * dealt with in order to scroll past them.
     */
    const [cursor, setCursor] = useState<PageCursor | null>(null)

    const latest = useQuery({
        queryKey: nsfwAppealKeys.latest(activeId),
        queryFn: ({ signal }) => nsfwAppealApi.getLatestAppeal({ signal }),
        enabled: enabled && Boolean(activeId),
        // The call has to be current — an appeal filed on the phone a minute ago must not be hidden
        // by this tab's cache — but not *zero*, or the CTA's prefetch is asked again on mount. See
        // `LATEST_STALE_MS`.
        staleTime: LATEST_STALE_MS,
    })

    const hasExistingAppeal = Boolean(latest.data)

    const postsKey = nsfwAppealKeys.posts(activeId, cursor)
    const queue = useQuery({
        queryKey: postsKey,
        queryFn: ({ signal }) => nsfwAppealApi.getFlaggedPosts({ cursor, signal }),
        // Not fetched at all while an appeal is already on file — that screen never shows a queue,
        // so asking for one is a request whose answer nothing would read.
        enabled: enabled && Boolean(activeId) && latest.isSuccess && !hasExistingAppeal,
        staleTime: 0,
    })

    const posts = queue.data?.posts ?? []
    const nextCursor = queue.data?.nextCursor ?? null

    /**
     * The page is clear and there is more behind it — advance.
     *
     * In an effect because it is a *consequence* of the data, not of the press: the last delete on a
     * page and a first read that happens to come back empty are the same situation, and both want
     * the next page. Guarded on `queue.isSuccess` so it cannot fire off an undefined page while the
     * first read is still in flight.
     */
    useEffect(() => {
        if (!enabled || !queue.isSuccess) return
        if (posts.length === 0 && nextCursor) setCursor(nextCursor)
    }, [enabled, queue.isSuccess, posts.length, nextCursor])

    /** Back to page one whenever the screen is closed, so the next open starts from the top. */
    useEffect(() => {
        if (!enabled) setCursor(null)
    }, [enabled])

    const remove = useMutation({
        mutationFn: (id: string) => nsfwAppealApi.deletePost(id),
        onSuccess: async (_data, id) => {
            /*
             * Remembered before the splice, so any read already in flight is filtered too — and so
             * that reopening the screen cannot show the row again out of the backend's cache.
             */
            rememberDeletedPost(id)
            queryClient.setQueryData<NsfwPostQueue>(postsKey, current =>
                current
                    ? { ...current, posts: current.posts.filter(post => post.id !== id) }
                    : current,
            )
            /*
             * Not a refetch — the cached *validator* is what is dropped, so that the **next** honest
             * read of page one (a reopen, or another tab) is not answered 304 with a body that
             * predates every delete made here. Cheap, and strictly better than leaving it.
             */
            await forgetFlaggedPostsCache(activeId)
        },
        meta: { showErrorToast: t('nsfw_appeal_delete_failed') },
    })

    const submit = useMutation({
        mutationFn: () => nsfwAppealApi.submitAppeal(),
        onSuccess: async () => {
            setJustSubmitted(true)
            /*
             * `latest/` has no stored validator to drop — it 404s until an appeal exists, and a 404
             * stores nothing. The queue does, and filing an appeal is the other event that changes
             * what it should say.
             */
            await forgetFlaggedPostsCache(activeId)
            queryClient.invalidateQueries({ queryKey: nsfwAppealKeys.latest(activeId) })
        },
        meta: { showErrorToast: t('nsfw_appeal_submit_failed') },
    })

    /** Empty page **and** nothing behind it. Either alone would offer an appeal too early. */
    const isQueueEmpty = queue.isSuccess && posts.length === 0 && !nextCursor

    /**
     * **A failed `latest/` is a failed screen, not an empty queue** — and that asymmetry is the bug
     * this line exists for.
     *
     * The queue is only fetched once `latest/` has succeeded, so a 500 there left `queue` sitting
     * `isPending` with `fetchStatus: 'idle'`: no rows, no error, nothing in flight. The screen then
     * drew *"All NSFW content has been removed!"* over a Submit button that could never enable —
     * the most reassuring possible rendering of a request that failed. Both reads are therefore one
     * error state, and `retry` re-takes both, because retrying the queue alone re-runs a query that
     * is still disabled.
     */
    const isError = latest.isError || queue.isError
    const retry = () => {
        if (latest.isError) void latest.refetch()
        if (queue.isError) void queue.refetch()
    }

    /**
     * `loading` covers **only the question the screen cannot answer yet**: whether an appeal is
     * already on file. That is what decides *which screen this is*, so until it lands nothing may be
     * drawn that presumes an answer.
     *
     * The queue's own read is deliberately **not** in here. Once `latest/` says there is no appeal we
     * know this is the delete screen, so its instructions and heading are true and only the rows are
     * unknown — `isQueueLoading` skeletons those in place. Folding the two together made the whole
     * screen blank while a list loaded under a heading that was already correct.
     *
     * In practice `loading` is rarely seen: the CTA prefetches `latest/` and holds its own spinner
     * until it resolves, so the screen usually opens already knowing. It is the honest fallback for
     * the paths that skip that — a failed prefetch, or a refetch when the ten seconds lapse.
     */
    const step: NsfwAppealStep =
        justSubmitted || hasExistingAppeal
            ? 'submitted'
            : latest.isPending && !latest.isError
              ? 'loading'
              : 'queue'

    return {
        step,
        posts,
        /** The rows are unknown, but the screen they belong to is not. See the note on `step`. */
        isQueueLoading: queue.isPending && queue.fetchStatus !== 'idle',
        /** Either read failed — a different thing from an empty queue. See the note above. */
        isQueueError: isError,
        retry,
        /** Fetching the page behind the one just cleared — the list is briefly empty, not finished. */
        isQueueRefreshing: queue.isFetching && !queue.isPending,
        deletePost: remove.mutate,
        deletingId: remove.isPending ? remove.variables : null,
        canSubmit: isQueueEmpty && !submit.isPending,
        submitAppeal: submit.mutate,
        isSubmitting: submit.isPending,
    }
}
