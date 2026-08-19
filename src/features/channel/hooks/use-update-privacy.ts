'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { ApiError } from '@shared/lib/api/errors'
import { getActiveAccountId } from '@shared/lib/api/token'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { channelApi, channelKeys } from '../api/channel-api'
import type { Channel, ChannelPrivacy } from '../api/types'

/**
 * Change the signed-in account's space visibility — the write behind
 * `/settings/space-visibility`.
 *
 * ## Optimistic, and the confirm dialog is why that is safe
 *
 * The radio moves before the server answers, for the reason `useUpdateMe` gives: a settings
 * control that waits for a round trip reads as broken — you press it, nothing happens, and
 * half a second later it agrees. What makes it *safe* here rather than merely fast is that
 * the two consequential directions have already been through a confirm dialog, so the
 * optimistic flip is not the first time the person is asked; it is the acknowledgement of an
 * answer they have already given.
 *
 * Legacy instead keeps the dialog open with its button spinning and closes it on the
 * response. That is a second wait after the deliberation, and it puts the outcome in a modal
 * that is about to disappear rather than on the screen that owns the setting.
 *
 * The rollback is why `onMutate` snapshots: the previous value is the only thing that can
 * undo an optimistic write, and it stops existing the moment anything else touches the key.
 *
 * ## What the cache write is careful about
 *
 * `privacy` is patched onto the cached `Channel`, **never** the whole body. The endpoint's
 * acknowledgement is `{ privacy }` — not a channel — so folding it over the cache entry
 * would blank the account's own slug, name and avatar from a settings change. (`useUpdateMe`
 * guards the mirror image of this for `/me`.) An acknowledgement this client cannot parse
 * falls back to *asking*: `parseAckPrivacy` returns `null` and the entry is invalidated, so
 * the optimistic value stays on screen and the truth arrives from `my-channel/`.
 *
 * `channelKeys.detail(slug)` is patched **and** invalidated, and it needs both. It is a
 * second copy of the same channel — the one `/@{slug}` renders — and its visibility is what
 * decides whether the owner sees the publish banner (`channelVisibility`).
 *
 * The optimistic half was missing, and the screen that exposed it is the banner itself
 * (`channel-publish-banner.tsx`), which is *rendered from this key*. Invalidating alone meant
 * pressing Publish left the banner on screen for the whole round trip, still saying
 * "Unpublished" — and worse, `isPending` goes false when the mutation settles while the
 * refetch is still in flight, so for that window the button re-armed over a change that had
 * already succeeded. The second press is a request the backend answers with the 24-hour rate
 * limit, for something the person only asked for once.
 *
 * The invalidation stays on top of the patch rather than being replaced by it: the patch
 * writes what was *asked for*, and `onSuccess` writes what was **acknowledged** onto
 * `my-channel` — so if those two ever differ, only a refetch makes the profile page agree.
 *
 * ## The account is pinned in the variables
 *
 * `getActiveAccountId()` is read once, in `update`, and carried through — same discipline as
 * `useUpdateMe`. `useMutation` re-registers its options every render, so callbacks that run
 * after the response are the latest ones; reading the active account inside them would file
 * one person's new visibility under another person's query key after a switch. The request
 * is pinned the same way, so it also cannot be sent with the wrong bearer.
 *
 * ## One write at a time
 *
 * `isPending` gates every option on the screen. The endpoint is rate-limited to one
 * transition per 24 hours, so two overlapping writes are not just a race — the second is a
 * request that is *going* to fail, and it would fail with the rate-limit error for a change
 * the person never asked for twice.
 */
export function useUpdatePrivacy(slug: string | null | undefined) {
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const mutation = useMutation({
        /*
         * No `meta.showErrorToast`: this one needs to say *which* failure it was, and meta is
         * a static message. `onError` below toasts instead, so adding meta here would toast
         * twice.
         */
        mutationFn: ({
            privacy,
            accountId,
        }: {
            privacy: ChannelPrivacy
            accountId: string | null
        }) => channelApi.updatePrivacy(privacy, accountId),

        onMutate: async ({ privacy, accountId }) => {
            /*
             * Both copies of this channel, because both are on screen somewhere: `my-channel/`
             * behind `useMyChannel()` (the shell, the settings radio) and `detail(slug)` behind
             * the profile page — which is where the publish banner lives. Patching only the
             * first is what left that banner up for a whole round trip.
             */
            const keys = [
                channelKeys.myChannel(accountId),
                ...(slug ? [channelKeys.detail(slug, accountId)] : []),
            ]
            // An in-flight refetch would land after the optimistic write and undo it, so it is
            // cancelled rather than raced.
            await Promise.all(keys.map(queryKey => queryClient.cancelQueries({ queryKey })))
            const previous = keys.map(
                key => [key, queryClient.getQueryData<Channel | null>(key)] as const,
            )
            for (const [key, entry] of previous) {
                if (entry) queryClient.setQueryData<Channel>(key, { ...entry, privacy })
            }
            return { previous }
        },

        onError: (error, _variables, context) => {
            for (const [key, entry] of context?.previous ?? []) {
                if (entry) queryClient.setQueryData(key, entry)
            }

            // The app's own abort, not news to anyone.
            if (error instanceof ApiError && error.isCanceled) return

            /*
             * **429 gets its own sentence.** Everywhere else in this app the backend's own
             * message is kept off the screen and one generic line stands in for every
             * failure (`lib/auth-error.ts`, `settings_update_failed`) — because "what went
             * wrong" is usually neither actionable nor safe to repeat. This is the exception
             * that proves the rule: the rate limit is the one failure the person can act on,
             * it is a rule of the product rather than an implementation detail, and "try
             * again" is actively wrong advice for it. The sentence is still ours, not the
             * body's. Which status the backend actually uses is B24.
             *
             * A network failure deliberately *does* toast. `query-client.ts` skips those on
             * the grounds that they are "toasted elsewhere", and nothing does that yet — so
             * without this, losing connection here would silently roll the radio back and
             * read as the control being dead.
             */
            const rateLimited = error instanceof ApiError && error.isRateLimited()
            toast.error(t(rateLimited ? 'space_visibility_rate_limited' : 'settings_update_failed'))
        },

        onSuccess: (acknowledged, { accountId }) => {
            const key = channelKeys.myChannel(accountId)

            if (acknowledged === null) {
                // Unparseable acknowledgement: keep what is on screen, go and ask.
                void queryClient.invalidateQueries({ queryKey: key })
            } else {
                /*
                 * Written from the *acknowledgement*, not from what was requested. They are
                 * the same value in every case we know of — but if the backend ever clamps a
                 * transition (refuses `unpublished` and answers `protected`, say), the screen
                 * must show what happened rather than what was asked for.
                 */
                queryClient.setQueryData<Channel | null>(key, current =>
                    current ? { ...current, privacy: acknowledged } : current,
                )
            }

            if (slug) {
                void queryClient.invalidateQueries({
                    queryKey: channelKeys.detail(slug, accountId),
                })
            }

            // Legacy's own confirmation, kept: this screen has no other "it worked" signal —
            // the radio already moved optimistically, so without this a successful save and a
            // save that is still in flight look identical.
            toast.success(t('space_visibility_updated'))
        },
    })

    const { mutate, isPending, variables } = mutation

    const update = useCallback(
        (privacy: ChannelPrivacy) => mutate({ privacy, accountId: getActiveAccountId() }),
        [mutate],
    )

    return {
        update,
        isPending,
        /**
         * **Which** option is being written, or `null`.
         *
         * Read off the mutation's own `variables` rather than mirrored into a `useState` the
         * caller would have to clear: a second copy of this is a second thing that can be
         * left behind when a request settles in a way nobody thought about (an error, an
         * abort, an unmount and remount). `variables` outlives the request, hence the
         * `isPending` guard — without it this would keep naming the last option written long
         * after it landed.
         */
        writing: isPending ? (variables?.privacy ?? null) : null,
    }
}
