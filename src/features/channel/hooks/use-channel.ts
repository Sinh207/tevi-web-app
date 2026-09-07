'use client'

import { useAuth } from '@features/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { channelApi, channelKeys } from '../api/channel-api'
import type { Channel } from '../api/types'

/**
 * A channel by slug.
 *
 * ## Bridging the server's seed to the client's key
 *
 * The page seeds the cache from its server fetch, but under `channelKeys.detail(slug, null)` — the
 * server has no bearer, so it can only produce the anonymous view. The client reads an
 * **account-scoped** key, because the payload is personalised (`is_followed`, `blocking_channel`,
 * `notification_settings`) and an un-scoped entry would hand one account another's follow state after
 * a switch.
 *
 * Those two keys never met, and the mistake is worth naming because it is not obvious: **this app
 * always holds a session.** Bootstrap calls `ensureAnonymousSession()`, so even a visitor who has
 * never signed in has an `activeId` — which means "anonymous visitor reads the `null` key" was simply
 * untrue, and the seed was dead weight that nothing ever read.
 *
 * `initialData` is the bridge. It renders the server's body immediately under whatever key this
 * account uses, so the first paint is real content rather than a skeleton.
 *
 * That seed must count as **stale on arrival**, or a signed-in visitor sits with `is_followed: false`
 * — the anonymous answer — for up to a minute, and the Follow button lies. See
 * `initialDataUpdatedAt` below for why that takes an explicit `0` and why omitting the option (which
 * is what this file used to do, with a comment claiming the opposite) does not achieve it.
 *
 * So the honest cost is one client request per visitor, not zero. A **crawler** does get zero, which
 * is the case that actually mattered for the server render: it never runs the JavaScript at all.
 *
 * ## The creator's own space is already in the cache
 *
 * `MyChannelProvider` fetches `my-channel` app-wide as soon as the session resolves and holds it for
 * five minutes, because the shell reads the creator's slug on every navigation. That entry is a
 * complete, account-scoped `Channel` — **the same object** this hook was about to request under a
 * different key. So walking to your own space showed a skeleton while the answer sat one cache entry
 * away, which is what prompted this: *"khi vào page của chính mình thì đâu cần hiện loading?"*
 *
 * Seeding from it makes that navigation paint immediately. A hard reload is unchanged and still
 * correct — nothing has been fetched yet on either key, so the skeleton is the honest answer there.
 *
 * ⚠ The two bodies come from **different endpoints** (`my-channel/` vs `channels/{slug}/`) and they
 * are **known** to differ: `mcn` exists only on the former, confirmed against the live endpoint. So
 * the seed briefly carries a field the refetch then removes, and anything reading `channel.mcn`
 * would blink. Nothing does — MCN is read through `useMyChannel()` precisely because of this, see
 * `channel-about-mcn.tsx` — but a future field with the same asymmetry would hit it, and the symptom
 * is a value that appears on navigation and vanishes a moment later rather than an error.
 *
 * The seed stays: `my-channel` is the *richer* body, so it adds rather than drops, and the fix for
 * such a field is to source it from `useMyChannel()` too rather than to give up painting instantly.
 */
export function useChannel(slug: string) {
    const { activeId } = useAuth()
    const queryClient = useQueryClient()

    /** The account's own channel, if that is the one being viewed. `null` = they have none. */
    const ownChannelSeed = () => {
        const mine = queryClient.getQueryData<Channel | null>(channelKeys.myChannel(activeId))
        return mine && mine.slug === slug ? mine : undefined
    }

    const query = useQuery({
        queryKey: channelKeys.detail(slug, activeId),
        queryFn: () => channelApi.getChannel(slug, activeId),
        enabled: Boolean(slug),
        /**
         * A function, not a value: it is only consulted when the cache is empty, so on a client-side
         * navigation back to this channel the real cached entry wins instead of being overwritten by
         * a stale server seed from the first page load.
         *
         * `my-channel` is tried first because it is account-scoped and therefore already correct,
         * where the server seed is the anonymous view and needs correcting.
         */
        initialData: () =>
            ownChannelSeed() ??
            queryClient.getQueryData<Channel>(channelKeys.detail(slug, null)) ??
            undefined,
        /**
         * Each seed carries its **real** age, and the two ages are very different.
         *
         * ⚠ `0`, not `undefined`, for the server seed — and the difference is a bug that lived here
         * behind a comment saying the opposite. Omitting `initialDataUpdatedAt` does **not** make
         * `initialData` stale: TanStack stamps it `Date.now()`, so the *anonymous* body counted as
         * fresh for the full 60s `staleTime` and a signed-in visitor could sit for a minute with
         * `is_followed: false` and a Follow button that lies about a channel they already follow.
         * Nothing surfaced it because the page looks completely correct while it is wrong.
         * `0` is the epoch, i.e. infinitely old, which is what "correct this on the next tick"
         * actually requires. `use-channel.test.tsx` pins it.
         *
         * The `my-channel` body has no such problem — it was fetched *for this account* — so
         * carrying its true age across lets a fresh one skip the refetch entirely, while an older one
         * still paints instantly and revalidates in the background. Passing a fabricated `Date.now()`
         * there would be the mirror-image bug: pinning a five-minute-old body as fresh for another
         * sixty seconds.
         */
        initialDataUpdatedAt: () =>
            ownChannelSeed()
                ? queryClient.getQueryState(channelKeys.myChannel(activeId))?.dataUpdatedAt
                : 0,
    })

    return {
        channel: query.data as Channel | null | undefined,
        /**
         * Whether the body on screen was fetched **for this account** — i.e. whether its
         * viewer-relative fields (`is_followed`, `follow_requested`, `notification_settings`, both
         * blocks) can be believed yet.
         *
         * `dataUpdatedAt` is the whole test, and it works because of the stamp above: the anonymous
         * server seed is deliberately dated **0**, so anything greater is a real fetch under
         * `channelKeys.detail(slug, activeId)` — or the `my-channel` body, which is account-scoped
         * too and carries its own real age.
         *
         * The bug this exists for: the seed says `is_followed: false` for **everybody**, because
         * there is no bearer on the server. So the auto-follow bar painted on the first client
         * render and vanished a beat later for anyone who already followed the space — most visibly
         * when arriving from the Following list, where the reader follows *by definition*. Hiding a
         * prompt is not a fix for showing it wrongly; not showing it until the answer is known is.
         *
         * This is the same shape as `useChannelOwnership`'s `'unknown'`, and for the same reason —
         * the first paint is always the anonymous view, so anything account-relative has to be able
         * to say "not yet" rather than guessing "no".
         */
        isViewerKnown: query.dataUpdatedAt > 0,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,
    }
}
