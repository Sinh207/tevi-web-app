'use client'

import { useUpdateMe } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { ApiError } from '@shared/lib/api/errors'
import { getActiveAccountId } from '@shared/lib/api/token'
import { uploadApi } from '@shared/lib/api/upload-api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { channelApi, channelKeys } from '../api/channel-api'
import type { Channel, ChannelFieldError } from '../api/types'
import { parseApiMessage, parseChannelFieldErrors } from '../api/types'
import {
    buildChannelPatch,
    fileExtension,
    type ProfileValues,
    uploadKey,
} from '../lib/profile-form'

/**
 * Saving the edit-profile form: upload what is pending, patch what changed, and write the date of
 * birth to the account it actually belongs to.
 *
 * ## Three requests, one button, and the order is not arbitrary
 *
 * 1. **Uploads first.** `PATCH my-channel/` takes image *URLs*, so nothing can be patched until
 *    the bytes are at Google and the serve URL is known. A failed upload therefore has to abort
 *    the save rather than continue — patching with the `blob:` preview would write a URL that is
 *    valid in exactly one browser tab and dead everywhere else, including for the person who set
 *    it, one refresh later. That is the single worst outcome this screen can produce, so
 *    `resolveImages` throws rather than degrading.
 * 2. **The channel patch**, containing only the fields that moved (`buildChannelPatch`).
 * 3. **The date of birth**, which is *not* a channel field. It lives on `/me`, so it is a separate
 *    write through `useUpdateMe` — the auth feature's mutation, reached through its barrel, which
 *    is what keeps this from reaching into another feature's internals.
 *
 * The `/me` write is dispatched rather than awaited — `useUpdateMe` is a mutation of its own, so
 * it patches the cache optimistically, rolls back on failure and toasts `settings_update_failed`
 * by itself. That is the difference from legacy, which fires it as
 * `updateUser({dob}).catch(console.error)` and closes the form immediately: there, a rejected date
 * of birth is a console line under a screen that said it saved. Here it is reported — just by the
 * hook that owns that endpoint rather than by this one.
 *
 * ## Not optimistic, unlike every other write in this app
 *
 * `useUpdateMe` and `useUpdatePrivacy` both patch the cache before the server answers, because a
 * *toggle* that waits reads as broken. A form is the opposite case: the person is looking at a
 * Save button they just pressed, so there is already a place for the wait to show, and there are
 * seven fields any one of which the server may reject individually. Optimistically writing seven
 * fields and then rolling back the two that were refused is a worse screen than a spinner.
 *
 * ## What happens on success
 *
 * The response **is** the updated channel, so it is written straight into
 * `channelKeys.myChannel(accountId)` — no refetch to go and ask what we were just told. The
 * public copy of the same channel (`channelKeys.detail`) is invalidated under **both** slugs when
 * the username changed, because the old key is what any open tab is still rendering from.
 *
 * A `null` response (a body this client cannot parse) falls back to invalidating instead. Same
 * guard, same reason, as `useUpdateMe`'s: folding an unknown shape over the cache would blank the
 * account's own name and avatar from a successful save.
 */

export interface PendingUploads {
    /** A cropped cover, ready to upload. */
    cover?: Blob
    /** A cropped still avatar. Mutually exclusive with `avatarVideo` — the last pick wins. */
    thumb?: Blob
    /** A premium looping avatar: the clip, its poster, and the dimensions to record. */
    avatarVideo?: {
        file: File
        poster: Blob
        width: number
        height: number
        durationSeconds: number
    }
}

export interface SaveProfileInput {
    values: ProfileValues
    pending: PendingUploads
}

export function useSaveProfile(initial: ProfileValues | null, channelId: string | undefined) {
    const queryClient = useQueryClient()
    const { t } = useTranslation()
    const { update: updateMe } = useUpdateMe()

    /**
     * Per-field rejections from the last attempt.
     *
     * Held here rather than in the view because they are produced by the response and consumed by
     * the fields, and the only thing that may clear them is another attempt or an edit to the
     * field itself. Keeping them in the hook means the view cannot forget to reset them on a
     * retry — `mutate` does it.
     */
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<ChannelFieldError, string>>>({})

    const mutation = useMutation({
        /*
         * No `meta.showErrorToast`: this needs to distinguish a field rejection (which belongs on
         * the field, silently) from everything else (which gets one toast). Meta is a static
         * message and would toast on top of both.
         */
        mutationFn: async ({
            values,
            pending,
            accountId,
        }: SaveProfileInput & { accountId: string | null }) => {
            if (!initial) throw new Error('Nothing to save')

            const resolved: ProfileValues = {
                ...values,
                images: await resolveImages(values, pending, channelId ?? 'channel'),
            }

            const patch = buildChannelPatch(initial, resolved)
            const channel = patch ? await channelApi.updateMyChannel(patch, accountId) : null

            /*
             * The date of birth, and it is written **after** the channel deliberately. The two are
             * independent writes with no transaction between them, so one of them has to be
             * second; the channel is the one carrying the username change and the images, i.e. the
             * one whose failure the person most needs reported first.
             *
             * **Setting a date is supported; clearing one is not.** An emptied field writes
             * nothing rather than `{ dob: null }` — whether the endpoint accepts a null there is
             * unknown (the DTO is not modelled, see `docs/BACKEND_QUESTIONS.md`), and the failure
             * mode of guessing is a 400 on a save that otherwise succeeded. Refusing to guess
             * costs the one person who wanted to un-set their birthday; guessing costs everyone
             * who cleared the field by accident while editing something else.
             */
            if (values.dateOfBirth && values.dateOfBirth !== initial.dateOfBirth) {
                updateMe({ dob: values.dateOfBirth })
            }

            return { channel, patched: Boolean(patch) }
        },

        onMutate: () => {
            // A retry starts from a clean slate: last attempt's rejections describe values that
            // may no longer be in the form.
            setFieldErrors({})
        },

        onError: error => {
            if (error instanceof ApiError && error.isCanceled) return

            const fields = parseChannelFieldErrors(error instanceof ApiError ? error.data : null)
            if (Object.keys(fields).length > 0) {
                /*
                 * The fields say it themselves — the sentences land under the inputs they are
                 * about. A toast on top would be the same news twice, and the less useful copy of
                 * it, since it cannot point at anything.
                 */
                setFieldErrors(fields)
                return
            }

            /*
             * The other rejection shape: `{ message, code, success: false }` and no `errors` array
             * at all. It used to fall through to the generic line — "Could not save that change.
             * Please try again." — which for `CHN0006` ("You can't change username of verified
             * space") is not vague but *wrong*: trying again cannot work, and what to do instead
             * was in the body we discarded.
             *
             * A toast, like every other failure on this screen. It is the one thing about this
             * that is a judgement call rather than a fact: the sentence can be an instruction
             * ("contact support") and a toast is gone in a few seconds — but a permanent banner on
             * a form is a second error surface to maintain beside the per-field one, and two
             * places to look for what went wrong is its own cost. See `parseApiMessage` for why
             * the backend's own words are allowed through at all.
             */
            const message = parseApiMessage(
                error instanceof ApiError ? error.data : null,
                error instanceof ApiError ? error.status : undefined,
            )
            toast.error(message ?? t('settings_update_failed'))
        },

        onSuccess: ({ channel, patched }, { accountId }) => {
            if (patched) {
                const key = channelKeys.myChannel(accountId)
                if (channel) queryClient.setQueryData<Channel | null>(key, channel)
                else void queryClient.invalidateQueries({ queryKey: key })

                /*
                 * The public copy of this channel — what `/@slug` renders — under **both** names.
                 * The old one because that is the key any tab showing the profile is reading from,
                 * and the new one because the redirect after a username change lands on a key that
                 * has never been fetched and would otherwise render from a server payload built
                 * before the save.
                 */
                const slugs = new Set([initial?.slug, channel?.slug].filter(Boolean) as string[])
                for (const slug of slugs) {
                    void queryClient.invalidateQueries({
                        queryKey: channelKeys.detail(slug, accountId),
                    })
                }
            }

            toast.success(t('profile_saved'))
        },
    })

    const { mutate, isPending } = mutation

    const save = useCallback(
        (input: SaveProfileInput) =>
            // Pinned once, carried through — the discipline `useUpdateMe` documents. A switch
            // mid-save must not file one account's profile under another's key, and must not send
            // the write with the other account's bearer.
            mutate({ ...input, accountId: getActiveAccountId() }),
        [mutate],
    )

    return {
        save,
        isSaving: isPending,
        fieldErrors,
        /** Clear one field's rejection — the field calls this when it is edited. */
        clearFieldError: useCallback((field: ChannelFieldError) => {
            setFieldErrors(current => {
                if (!current[field]) return current
                const next = { ...current }
                delete next[field]
                return next
            })
        }, []),
        /** The saved channel, once there is one — the view uses its slug to navigate. */
        savedChannel: mutation.data?.channel ?? null,
    }
}

/**
 * Turn pending blobs into URLs, and refuse to continue if any of them did not upload.
 *
 * ## The invariant this protects
 *
 * A `blob:` URL is valid inside one document and nowhere else. If one reached `PATCH
 * my-channel/`, the save would *succeed* and the creator's avatar would be broken for every
 * visitor, on every device, forever — and it would look fine to the person who set it until they
 * reloaded. So every path that could produce one throws instead, and the assertion at the end is
 * the backstop for a path nobody thought of.
 *
 * ## The video is all-or-nothing on purpose
 *
 * An animated avatar needs the clip *and* a still poster: `thumb` is what every other surface in
 * the app renders (nav, comments, the switcher), and only the header plays the video. Writing
 * `avatar_video` with no poster produces a channel that has a face on its own page and a
 * placeholder everywhere else. Legacy applies the same rule — `if (serveUrlVideo && serveUrlThumb)`
 * — and here it is a throw rather than a silent skip, because a silent skip is a save that
 * reports success and changes nothing.
 */
async function resolveImages(
    values: ProfileValues,
    pending: PendingUploads,
    channelId: string,
): Promise<ProfileValues['images']> {
    const images = { ...values.images }

    if (pending.cover) {
        const url = await uploadApi.uploadImage(
            uploadKey(channelId, 'cc', fileExtension(pending.cover)),
            pending.cover,
        )
        if (!url) throw new Error('Cover upload failed')
        images.cover = url
    }

    if (pending.thumb) {
        const url = await uploadApi.uploadImage(
            uploadKey(channelId, 'ct', fileExtension(pending.thumb)),
            pending.thumb,
        )
        if (!url) throw new Error('Avatar upload failed')
        images.thumb = url
        // A still avatar replaces a clip. Legacy nulls the video on the same branch.
        images.avatarVideo = null
    }

    if (pending.avatarVideo) {
        const { file, poster, width, height, durationSeconds } = pending.avatarVideo
        const [videoUrl, posterUrl] = await Promise.all([
            uploadApi.uploadAnimatedAvatar(uploadKey(channelId, 'ctv', fileExtension(file)), file),
            uploadApi.uploadImage(uploadKey(channelId, 'ct', 'jpg'), poster),
        ])
        if (!videoUrl || !posterUrl) throw new Error('Animated avatar upload failed')

        images.thumb = posterUrl
        images.avatarVideo = {
            width,
            height,
            playback: { url: videoUrl },
            thumbnail: posterUrl,
            duration_seconds: durationSeconds,
        }
    }

    // The backstop. Reaching this means a preview URL survived every branch above, which is a bug
    // in this function — and the one bug here that would otherwise ship a broken avatar to
    // everyone who visits the space.
    for (const url of [images.thumb, images.cover]) {
        if (url?.startsWith('blob:')) throw new Error('Refusing to save a preview URL')
    }

    return images
}
