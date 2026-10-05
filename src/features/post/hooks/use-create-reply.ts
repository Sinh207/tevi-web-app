'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { balanceKeys, useRequireStars } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import { ApiError } from '@shared/lib/api/errors'
import { uploadApi } from '@shared/lib/api/upload-api'
import { fileExtension, uploadKey } from '@shared/lib/api/upload-key'
import { eventBus } from '@shared/lib/event-bus'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
    INSUFFICIENT_STARS_CODE,
    postApi,
    postKeys,
    type ReplyImage,
    type ReplyTarget,
} from '../api/post-api'
import type { Reply } from '../api/reply-types'
import type { Post } from '../api/types'
import { postLang } from '../lib/post-draft'
import { type ReplyDraft, replyText } from '../lib/reply-draft'

/**
 * Posting a reply — the charge, the uploads, the write, and what each failure means.
 *
 * ## Three requests in a fixed order, and the order is the control
 *
 * **Charge → upload → create.** Legacy's `handleCreateComment` runs the same sequence and returns
 * early when the purchase fails; that early return is the whole reason a channel that sells
 * interactions is not replied to for free. Reversing it, or running the two in parallel to save a
 * round trip, is the failure this hook exists to prevent — and it is silent on both sides.
 *
 * The uploads sit **after** the charge deliberately, though they are the slow half: a reader who
 * cannot pay should not wait for ten pictures to reach Google before being told so.
 *
 * ## A failure after the charge does not refund, and nothing here pretends otherwise
 *
 * If the upload or the write fails once the Star has moved, the reader has paid for a reply that
 * did not appear. No client can reverse that, and a hopeful rollback would be a lie in the one
 * place it costs money. The draft is **kept** so the press can be repeated — which is the only
 * thing this side can honestly offer — and the balance is invalidated either way so the figure on
 * screen is the server's. Whether the backend reverses a half-finished charge is **B107**.
 *
 * That is also why `retry` is off on every call in the chain (`post-api.ts` states it): a replayed
 * charge is a second charge, and a replayed reply is a row the reader did not write.
 *
 * ## Which images go up, and under whose name
 *
 * Every attachment is uploaded before the reply is written, because the endpoint takes **URLs**,
 * not bytes. An upload that fails answers `null` and that picture is **dropped** rather than
 * failing the reply: legacy does the same (it toasts and continues), and losing one picture from a
 * reply whose words landed is better than losing the words too. Ten separate failures still produce
 * a text-only reply — and an images-only draft whose every upload failed is refused instead, since
 * a reply with neither is not a reply.
 *
 * The object key's first segment is normally a **channel** id. The reader's own channel lives in
 * `features/channel`, which imports this feature, so it cannot be read here — the account id stands
 * in. It is a bucket namespace, not an authorisation: the key is never what decides who may write.
 *
 * ## The account is pinned at the press
 *
 * `activeId` is read when the mutation runs and threaded through all three calls. The switcher is
 * two taps away, and a reply — or a charge — that resolves after a switch must still belong to the
 * account that made it.
 */
/**
 * What is being replied to, as the hook needs it.
 *
 * The **post** case carries the whole post because the charge is priced off its `channel`; the
 * **reply** case carries the reply for the same reason, off its `post_channel`. Neither is a bare
 * id: a caller holding only an id could not have computed the cost it passes in, and the two would
 * then be free to disagree about which space is being paid.
 */
export type ReplyDestination =
    | { kind: 'post'; post: Post }
    /** An answer to a reply. `reply.post_channel` prices it — never `owner_channel`. */
    | { kind: 'reply'; reply: Reply }

export function useCreateReply(
    destination: ReplyDestination,
    {
        cost,
        onCreated,
    }: {
        /** What replying costs on this channel, or `null` when it is free. `replyCost` decides. */
        cost: number | null
        /** The reply landed. The screen clears the draft and refetches from here. */
        onCreated?: (reply: Reply | null) => void
    },
) {
    const { activeId } = useAuth()
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const requireStars = useRequireStars()
    const queryClient = useQueryClient()

    /**
     * The channel to credit, or `null` when this reply costs nothing.
     *
     * Both halves are required, exactly as in `usePostReaction`: a price with no channel id names no
     * beneficiary, so the charge cannot be made — and making the *free* half instead would be
     * replying for nothing on a space that charges.
     */
    const priced = cost !== null && cost > 0
    /*
     * Which space is credited, and it is read from a **different field** on each branch: a post is
     * priced by its own `channel`, an answer to a reply by the parent post's `post_channel`. The
     * reply's `owner_channel` is neither, and paying it would move the reader's Star to whoever
     * happened to write the comment being answered.
     */
    const beneficiary = priced
        ? ((destination.kind === 'post'
              ? destination.post.channel?.id
              : destination.reply.post_channel?.id) ?? null)
        : null

    /** The endpoint's own discriminator — ids only, which is all the request needs. */
    const target: ReplyTarget =
        destination.kind === 'post'
            ? { kind: 'post', postId: destination.post.id }
            : { kind: 'reply', replyId: destination.reply.id }

    const mutation = useMutation({
        mutationFn: async ({
            draft,
            accountId,
        }: {
            draft: ReplyDraft
            accountId: string | null
        }) => {
            if (beneficiary && cost !== null) {
                await postApi.chargeInteraction(
                    { product: 'comment', channelId: beneficiary, cost },
                    accountId,
                )
            }

            const images = await uploadDraftImages(draft, accountId)
            const text = replyText(draft)

            /*
             * Every picture failed and there were no words — there is nothing left to post. Thrown
             * rather than resolved so the caller's error path runs and the draft survives; a silent
             * success here would clear a composer whose contents never left the device.
             */
            if (!text && images.length === 0) throw new Error('reply has no content')

            /*
             * The reader's own language, not `'en'`. iOS tags every post it creates with the two
             * letters of the current locale, so the field takes one from a shipped client already —
             * `postLang` narrows `zh-CN` and the rest. **B109**.
             */
            return postApi.createReply(
                { target, text, images, lang: postLang(currentLanguage) },
                accountId,
            )
        },
        onSuccess: reply => {
            /*
             * Two things moved: the reply list has a row, and the post's `reply_count` went up. Both
             * live under this feature's prefix, and neither is guessed at — a count written locally
             * disagrees with the server's the moment two readers reply at once.
             */
            void queryClient.invalidateQueries({ queryKey: postKeys.all })
            if (beneficiary) void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            onCreated?.(reply)
        },
        onError: error => {
            /*
             * The balance is re-read on **every** failure of a priced reply, not only on a failure
             * of the charge: from here there is no telling which of the three calls fell over, and
             * the one outcome that must not persist is a screen still showing Star the account no
             * longer has.
             */
            if (beneficiary) void queryClient.invalidateQueries({ queryKey: balanceKeys.all })

            /*
             * "Not enough Star" is an **offer**, not a failure — the same call `usePostUnlock` makes
             * on the same code, and for the same reason: `useRequireStars` gated the press against a
             * balance that has since been spent in another tab. The **whole price** is asked for,
             * not a computed gap, because the figure this client held is precisely what was wrong.
             *
             * The toast still fires beside it. Suppressing it would mean a reader with nothing
             * listening for the event — a `/app/*` webview — is told nothing at all.
             */
            if (isInsufficientStars(error) && cost !== null && cost > 0) {
                eventBus.emit('payment:star-purchase-requested', {
                    shortfall: cost,
                    ack: () => {},
                })
            }
        },
        /**
         * The API's own sentence wins on a 4xx; ours is the fallback (`docs/API_ERRORS.md`). This
         * is the write whose refusals are most likely to be worth reading — a post that has since
         * closed its replies, a reader the creator has restricted — and none of them is something a
         * generic string can say.
         */
        meta: { showErrorToast: t('post_reply_failed') },
    })

    function send(draft: ReplyDraft) {
        if (mutation.isPending) return
        // Priced with nobody to credit: the charge cannot be made, and replying free is the hole.
        if (priced && !beneficiary) return
        mutation.mutate({ draft, accountId: activeId })
    }

    /**
     * The press.
     *
     * `requireStars` on a channel that charges — it composes `useRequireAuth`, so a guest is asked
     * to sign in and a reader who is short is offered Star **without losing the draft** — and a bare
     * `requireAuth` where replying is free. `requireStars(0, …)` is not used for the free case: it
     * would work, but it reads as though nothing were being spent when something is.
     */
    const submit = beneficiary ? requireStars<[ReplyDraft]>(cost ?? 0, send) : requireAuth(send)

    return {
        submit,
        isPending: mutation.isPending,
        /** The Star this press will cost, for the button's own label. `null` when free. */
        cost: beneficiary ? cost : null,
    }
}

/**
 * Upload what the reader attached, and answer with the rows the endpoint wants.
 *
 * Sequential rather than `Promise.all`, which is legacy's shape and the right one here: ten
 * concurrent multi-megabyte `PUT`s on a phone connection is how the *first* one times out. The
 * index is part of every key — ten pictures chosen in one gesture share a millisecond, and without
 * it they would all write to the same object (`upload-key.ts` spells this out).
 */
async function uploadDraftImages(
    draft: ReplyDraft,
    accountId: string | null,
): Promise<ReplyImage[]> {
    if (draft.images.length === 0) return []

    const namespace = accountId ?? 'anon'
    const now = Date.now()
    const uploaded: ReplyImage[] = []

    for (const [index, image] of draft.images.entries()) {
        const key = uploadKey(namespace, 'p', fileExtension(image.file), now, index)
        let uri: string | null = null
        try {
            uri = await uploadApi.uploadImage(key, image.file)
        } catch {
            // One picture, not the reply. See the hook's note.
            uri = null
        }
        if (uri) uploaded.push({ uri, w: image.width, h: image.height })
    }

    return uploaded
}

/**
 * Was it refused for want of Star?
 *
 * Both halves, for the reason `use-post-unlock.ts` gives at its own copy: the code alone is not
 * promised unique across statuses, and a bare 422 from `ecom/purchase/` is any validation failure —
 * offering a top-up for a malformed product id helps nobody.
 */
function isInsufficientStars(error: unknown): boolean {
    return (
        error instanceof ApiError && error.status === 422 && error.code === INSUFFICIENT_STARS_CODE
    )
}
