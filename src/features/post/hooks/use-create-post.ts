'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { uploadApi } from '@shared/lib/api/upload-api'
import { fileExtension, uploadKey } from '@shared/lib/api/upload-key'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postApi, postKeys } from '../api/post-api'
import type { Post } from '../api/types'
import {
    buildPostBody,
    type PostDraft,
    type PostDraftImage,
    postLang,
    type UploadedImage,
} from '../lib/post-draft'

/**
 * Publishing a post — the uploads, the body, and the write.
 *
 * ## Uploads first, and a failed one is **fatal** here where it is not for a reply
 *
 * A reply drops a picture whose upload failed and posts the words anyway: losing one attachment
 * from a comment beats losing the comment. A post is the opposite — it is composed deliberately,
 * often once, and silently publishing it with two of its five pictures missing is worse than
 * refusing and letting the author press again. Legacy takes the same line for **video**
 * (`if (!processedVideos?.id) return null`, aborting the whole post) and this extends it to images,
 * which legacy does not: it toasts per picture and posts what survived.
 *
 * That is a deliberate divergence, and the reason is that a post is not recoverable by the author
 * the way a comment is. Nothing is lost by refusing: the draft is kept, so the press can be
 * repeated.
 *
 * ## No charge, unlike every other write in this feature
 *
 * Posting is free. `post.createPost.charge` exists in the console (`is_active`, `follower_min`,
 * `price`) and legacy reads it to gate the *composer* behind a Star payment for small accounts —
 * that is a screen-level gate on a flag that ships `false`, not a charge on this request. It has no
 * business in the mutation.
 *
 * ## The account is pinned, and the write is not retried
 *
 * Both for the reasons `post-api.ts` states: a post that resolves after an account switch must
 * still belong to the account that wrote it, and a replayed create is a second post.
 */
export function useCreatePost({ onCreated }: { onCreated?: (post: Post | null) => void } = {}) {
    const { activeId } = useAuth()
    const { t, currentLanguage } = useTranslation()
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async ({
            draft,
            accountId,
        }: {
            draft: PostDraft
            accountId: string | null
        }) => {
            const now = Date.now()
            const namespace = accountId ?? 'anon'

            const images = await uploadImages(draft.images, namespace, now)
            /*
             * `null` from the uploader means the pre-sign answered no URL; a throw means the `PUT`
             * failed. Both are "this picture is not on the server", and neither may reach the
             * write — see the note above on why a post refuses where a reply degrades.
             */
            if (images.length !== draft.images.length) throw new Error('image upload failed')

            let videoId: string | null = null
            if (draft.video) {
                videoId = await uploadApi.uploadPostVideo({
                    file: draft.video.file,
                    poster: draft.video.poster,
                    meta: {
                        extension: fileExtension(draft.video.file),
                        durationSeconds: Math.round(draft.video.durationSeconds),
                        width: draft.video.width,
                        height: draft.video.height,
                        codec: draft.video.codec,
                    },
                })
                if (!videoId) throw new Error('video upload failed')
            }

            /*
             * The cover is uploaded last and only when it can be used — `buildPostBody` sends it
             * for a **paid video post** and nothing else, so uploading it for a free post would be
             * bytes spent on a field that is then dropped.
             */
            let coverImage: UploadedImage | null = null
            if (draft.coverImage && videoId && draft.audience === 'STARGAZERS') {
                /*
                 * Keyed **past** the pictures. Everything in one post shares a timestamp, so the
                 * index is the only thing keeping the objects apart — and `images.length + index`
                 * computed inside the helper put the cover on `2` for a post with three pictures,
                 * which is the third picture's own key. One object, written twice, and the reader
                 * would have seen their cover where a picture should be.
                 */
                const uploaded = await uploadImages(
                    [draft.coverImage],
                    namespace,
                    now,
                    draft.images.length,
                )
                coverImage = uploaded[0] ?? null
                if (!coverImage) throw new Error('cover upload failed')
            }

            const body = buildPostBody(draft, {
                images,
                videoId,
                coverImage,
                lang: postLang(currentLanguage),
            })

            const post = await postApi.createPost(body, accountId)

            /*
             * Filing is a **second request against the created post**, so it can only happen now —
             * the post had no id a moment ago. Legacy does the same thing in the same order.
             *
             * Its failure is swallowed on purpose. The post is published; it is simply not filed,
             * and surfacing that as "couldn't publish your post" would be false. The author can file
             * it from the collection itself, once that screen exists. **B110**.
             */
            if (post?.id && draft.collectionIds.length > 0) {
                try {
                    await postApi.addPostToCollections(post.id, draft.collectionIds, accountId)
                } catch {
                    // Published, unfiled. Not a failed post.
                }
            }

            return post
        },
        onSuccess: post => {
            /*
             * This feature's whole prefix. The new post belongs in the author's own space listing
             * and in the home feed, and neither of those is keyed here — their owners refetch on
             * their own terms. What this can invalidate honestly is what it owns.
             */
            void queryClient.invalidateQueries({ queryKey: postKeys.all })
            onCreated?.(post)
        },
        /**
         * The API's own sentence wins on a 4xx; ours is the fallback (`docs/API_ERRORS.md`). This
         * write has more ways to be refused than most — a price the account may not set, a tier
         * that no longer exists, a body the moderation service rejects — and none of them is
         * something a generic string can name.
         */
        meta: { showErrorToast: t('post_create_failed') },
    })

    return {
        publish: (draft: PostDraft) => {
            if (mutation.isPending) return
            mutation.mutate({ draft, accountId: activeId })
        },
        isPending: mutation.isPending,
    }
}

/**
 * Upload the attached pictures, in order, and answer the rows the body carries.
 *
 * Sequential rather than `Promise.all`, for the reason `useCreateReply` gives: ten concurrent
 * multi-megabyte `PUT`s on a phone connection is how the first one times out. The index is part of
 * every key because pictures chosen in one gesture share a millisecond — `upload-key.ts` spells
 * out what happens without it.
 *
 * The array is **short** when one fails, which is how the caller detects it: comparing lengths is
 * simpler than threading a flag, and the caller is the only party that knows whether a missing
 * picture is fatal.
 */
async function uploadImages(
    images: PostDraftImage[],
    namespace: string,
    now: number,
    /** Where this batch's indices start — the cover is uploaded past the pictures. */
    indexOffset = 0,
): Promise<UploadedImage[]> {
    const uploaded: UploadedImage[] = []

    for (const [index, image] of images.entries()) {
        const key = uploadKey(namespace, 'p', fileExtension(image.file), now, indexOffset + index)
        try {
            const uri = await uploadApi.uploadImage(key, image.file)
            if (!uri) break
            uploaded.push({ uri, w: image.width, h: image.height })
        } catch {
            break
        }
    }

    return uploaded
}
