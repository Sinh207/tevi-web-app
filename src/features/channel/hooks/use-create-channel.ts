'use client'

import { accountDisplayName, useAuth, useUpdateMe, validateDisplayName } from '@features/auth'
import { ApiError } from '@shared/lib/api/errors'
import { uploadApi } from '@shared/lib/api/upload-api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { channelApi, channelKeys } from '../api/channel-api'

/**
 * Creating the account's space: three fields, three round trips, one submit.
 *
 * ## Validation is the backend's, and it happens while you type
 *
 * Neither the name nor the slug has a client-side rule here, and that is deliberate rather than
 * lazy. `POST me/validate-display-name/` and `POST channel/check-slug/` both answer **4xx with a
 * message** — "already taken", "reserved", "too short" — and that message is the only thing worth
 * showing. A regex duplicated in the client would eventually disagree with the service and reject a
 * name the service would have accepted, which is the worse failure: the user cannot argue with it.
 *
 * So: debounce, ask, show what came back. Every request carries an `AbortSignal` and the previous
 * one is cancelled, because a slow answer for `ad` must not overwrite a fast one for `ada` — the
 * classic out-of-order bug that makes a form flicker between valid and invalid.
 *
 * ## What the three fields actually write
 *
 * `name` and `slug` go to `POST my-channel/`. **`dob` does not** — it belongs to the *account*, so
 * legacy sends it separately through `updateUser`, and this does the same via `useUpdateMe`. Worth
 * knowing before someone tries to add it to the create payload and wonders why it vanishes.
 *
 * The avatar is uploaded **before** the channel exists, so its object key cannot contain a channel
 * id the way `edit-profile`'s does. Legacy uses a bare timestamp; so does this.
 *
 * ## The form is not empty when it opens
 *
 * Legacy seeds it from the account, and this is the part the first version missed entirely — it
 * rendered four blank fields and left the user to invent everything.
 *
 * - **Name** becomes `"{display_name}'s Space"`, and it is pushed through the *same* validation path
 *   as typing would, so a display name the service rejects surfaces immediately rather than on
 *   submit.
 * - **Date of birth** defaults to today, eighteen years ago — the earliest date that passes, which
 *   is a hint about the rule as much as a value.
 * - **Link** takes `suggestions[0]`, but only while the field is still empty, so a seeded suggestion
 *   can never overwrite something the user typed.
 *
 * ## Two debounces, not one
 *
 * 1000ms for the name and 500ms for the link, both legacy's. They are not arbitrary: a name is typed
 * as a phrase and asking after every word is wasted, while a link is typed as one token and the
 * answer is the thing the user is waiting for.
 */
/** Legacy: `setTimeout(..., 1000)` on the name, `500` on the slug. */
const NAME_DEBOUNCE_MS = 1000
const SLUG_DEBOUNCE_MS = 500

/** Legacy's image rules, checked before the file is ever uploaded. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png']

/** Legacy's `dayjs().year(currentYear - 18)` — today's month and day, eighteen years back. */
function eighteenYearsAgo(): string {
    const now = new Date()
    return new Date(now.getFullYear() - 18, now.getMonth(), now.getDate())
        .toISOString()
        .slice(0, 10)
}

export interface FieldState {
    value: string
    /** The backend's message, verbatim. `null` when the field is clean or unchecked. */
    error: string | null
    checking: boolean
}

const EMPTY: FieldState = { value: '', error: null, checking: false }

/** The message a 4xx carried, or a fallback — never `error.message`, which is axios's own wording. */
function backendMessage(error: unknown, fallback: string): string {
    if (!(error instanceof ApiError)) return fallback
    const body = error.data as { message?: unknown; errors?: { error?: unknown }[] } | undefined
    const first = Array.isArray(body?.errors) ? body.errors[0]?.error : undefined
    if (typeof first === 'string' && first.trim()) return first
    if (typeof body?.message === 'string' && body.message.trim()) return body.message
    return fallback
}

export function useCreateChannel({
    fallbackError,
    messages,
}: {
    fallbackError: string
    /** Copy for the rules this form checks itself, rather than asking the backend. */
    messages: { minimumAge: string; avatarTooLarge: string; avatarWrongType: string }
}) {
    const { activeId, currentUser, refreshUser } = useAuth()
    const queryClient = useQueryClient()
    const updateMe = useUpdateMe()

    const [name, setName] = useState<FieldState>(EMPTY)
    const [slug, setSlug] = useState<FieldState>(EMPTY)
    const [dob, setDobValue] = useState(eighteenYearsAgo)
    const [dobError, setDobError] = useState<string | null>(null)
    const [avatar, setAvatar] = useState<{ file: Blob; preview: string } | null>(null)
    const [avatarError, setAvatarError] = useState<string | null>(null)
    /** The picked file, held while the cropper is open. `null` when it is closed. */
    const [cropping, setCropping] = useState<{ src: string; type: string } | null>(null)
    const [suggestions, setSuggestions] = useState<string[]>([])

    /** One controller per field, so a stale answer can never land on a newer value. */
    const nameRun = useRef<AbortController>(undefined)
    const slugRun = useRef<AbortController>(undefined)

    useEffect(
        () => () => {
            nameRun.current?.abort()
            slugRun.current?.abort()
        },
        [],
    )

    /** Revoking on replace and on unmount — an object URL held for the page's life is a leak. */
    useEffect(
        () => () => {
            if (avatar) URL.revokeObjectURL(avatar.preview)
        },
        [avatar],
    )

    const checkName = useCallback(
        (value: string, { immediate = false }: { immediate?: boolean } = {}) => {
            nameRun.current?.abort()
            if (!value.trim()) return setName({ value, error: null, checking: false })
            const run = new AbortController()
            nameRun.current = run
            setName({ value, error: null, checking: true })

            const timer = setTimeout(
                async () => {
                    try {
                        await validateDisplayName(value, run.signal)
                        if (run.signal.aborted) return
                        setName({ value, error: null, checking: false })
                        // Legacy seeds link suggestions off the *name*, before the user has typed one.
                        const next = await channelApi.suggestSlugs(value, run.signal)
                        if (run.signal.aborted) return
                        setSuggestions(next)
                        /*
                         * Fill the link with the first suggestion — but only while it is still empty.
                         * `setSlug` reads the current value inside the updater rather than closing over
                         * it, so a suggestion arriving after the user has started typing cannot
                         * overwrite them.
                         */
                        if (next[0])
                            setSlug(current =>
                                current.value
                                    ? current
                                    : { value: next[0], error: null, checking: false },
                            )
                    } catch (error) {
                        if (run.signal.aborted || (error instanceof ApiError && error.isCanceled))
                            return
                        setName({
                            value,
                            error: backendMessage(error, fallbackError),
                            checking: false,
                        })
                    }
                    /*
                     * `immediate` for the seeded value. A debounce exists to avoid one request per
                     * keystroke; nobody typed this one, so waiting a second before asking about it just
                     * delays the answer — and the answer is what unlocks the button.
                     */
                },
                immediate ? 0 : NAME_DEBOUNCE_MS,
            )
            run.signal.addEventListener('abort', () => clearTimeout(timer))
        },
        [fallbackError],
    )

    const checkSlug = useCallback(
        (value: string) => {
            slugRun.current?.abort()
            if (!value.trim()) return setSlug({ value, error: null, checking: false })
            const run = new AbortController()
            slugRun.current = run
            setSlug({ value, error: null, checking: true })

            const timer = setTimeout(async () => {
                try {
                    await channelApi.checkSlug(value, run.signal)
                    if (run.signal.aborted) return
                    setSlug({ value, error: null, checking: false })
                } catch (error) {
                    if (run.signal.aborted || (error instanceof ApiError && error.isCanceled))
                        return
                    setSlug({ value, error: backendMessage(error, fallbackError), checking: false })
                    // A rejected link is the other moment legacy asks for alternatives.
                    setSuggestions(await channelApi.suggestSlugs(value))
                }
            }, SLUG_DEBOUNCE_MS)
            run.signal.addEventListener('abort', () => clearTimeout(timer))
        },
        [fallbackError],
    )

    /**
     * Eighteen or over, checked here rather than on the server.
     *
     * The one client-side rule in the form, and it earns the exception: it needs no round trip to
     * know, and a birthday is the field a user is most likely to correct by a day or two — a 400ms
     * wait per keystroke to be told a number is too small would be absurd.
     */
    const setDob = useCallback(
        (value: string) => {
            setDobValue(value)
            setDobError(value && value > eighteenYearsAgo() ? messages.minimumAge : null)
        },
        [messages.minimumAge],
    )

    /**
     * Legacy's file rules, applied **before** the upload rather than after: 2 MB, JPEG or PNG.
     * Rejecting a 40 MB photo after it has been sent wastes the upload and the user's data.
     */
    const pickAvatar = useCallback(
        (file: File | null) => {
            setAvatarError(null)
            if (!file) return
            if (file.size > MAX_AVATAR_BYTES) return setAvatarError(messages.avatarTooLarge)
            if (!AVATAR_TYPES.includes(file.type)) return setAvatarError(messages.avatarWrongType)
            /*
             * The picked file goes to the **cropper**, not straight into the form.
             *
             * Legacy uploads whatever was chosen and lets `object-fit: cover` centre-crop it in an
             * 80px circle — so a landscape photo silently loses both edges and the creator only
             * finds out once their space is live. `edit-profile` already solved this with
             * `ImageCropDialog`, and reusing it is what keeps the two avatar flows from drifting.
             */
            setCropping({ src: URL.createObjectURL(file), type: file.type })
        },
        [messages.avatarTooLarge, messages.avatarWrongType],
    )

    /** The cropper's output replaces the picked file — this is what actually gets uploaded. */
    const applyCrop = useCallback((blob: Blob) => {
        setAvatar(previous => {
            if (previous) URL.revokeObjectURL(previous.preview)
            return { file: blob, preview: URL.createObjectURL(blob) }
        })
    }, [])

    const closeCropper = useCallback(() => {
        setCropping(current => {
            // The source URL belongs to the dialog's lifetime, not the form's.
            if (current) URL.revokeObjectURL(current.src)
            return null
        })
    }, [])

    /**
     * Seed once, from the account.
     *
     * Guarded by a ref rather than by a dependency list: `currentUser` is a query result and its
     * identity changes on every refetch, so an effect keyed on it would re-seed the form — wiping
     * whatever the user had typed — the first time anything invalidated `/me`.
     */
    const seeded = useRef(false)
    const displayName = accountDisplayName(currentUser)
    useEffect(() => {
        if (seeded.current || !displayName) return
        seeded.current = true

        /*
         * **Two calls, and they are not the same call.**
         *
         * `suggestSlugs` fires *immediately* with the raw display name, not through the name
         * field. `checkName` also asks for suggestions, but only after its 1000ms debounce and only
         * if validation passed — measured, that put the request 1.27s after `/me` landed, so the
         * link sat empty for over a second on a form whose whole first impression is that it is
         * already filled in.
         *
         * The independence matters more than the timing: coupling suggestions to name-validation
         * *success* means a seeded name the service happens to reject leaves the user with no link
         * **and** no suggestions — the two things that would have helped. Legacy makes both calls
         * from this same effect for exactly that reason.
         *
         * The queries differ too, and deliberately: this one asks about `Ada Lovelace`, the
         * debounced one about `Ada Lovelace's Space`. The first is the better seed for a handle.
         */
        void channelApi.suggestSlugs(displayName).then(next => {
            if (!next.length) return
            setSuggestions(next)
            // Same guard as everywhere else: never overwrite a slug the user has already touched.
            setSlug(current =>
                current.value ? current : { value: next[0], error: null, checking: false },
            )
        })

        // Through `checkName`, not `setName`: the seeded value gets validated like a typed one, so
        // a display name the service rejects is visible before the user reaches the button.
        checkName(`${displayName}'s Space`, { immediate: true })
    }, [displayName, checkName])

    const create = useMutation({
        mutationFn: async () => {
            const input: { name: string; slug: string; images?: { thumb: string } } = {
                name: name.value.trim(),
                slug: slug.value.trim(),
            }
            if (avatar) {
                // No channel id to key on yet — the channel is what this call creates. Legacy uses
                // a bare timestamp here for the same reason.
                const url = await uploadApi.uploadImage(
                    `Images/Channel/Thumb/Web/cc-${Date.now()}.jpg`,
                    avatar.file,
                )
                if (url) input.images = { thumb: url }
            }
            return channelApi.createMyChannel(input, activeId)
        },
        onSuccess: async () => {
            // The gate reads `my-channel`, so this is what dismisses the whole onboarding screen.
            await queryClient.invalidateQueries({ queryKey: channelKeys.myChannel(activeId) })
            // `/me` now has a channel; the shell's avatar and the drawer read it.
            await refreshUser()
        },
        onError: error => {
            /*
             * `sensitive` is the one backend code that must not become a toast: it means moderation
             * rejected the *image*, and a generic banner next to an untouched avatar leaves the user
             * with no idea what to change.
             */
            const body = (error instanceof ApiError ? error.data : null) as {
                errors?: { code?: unknown; error?: unknown }[]
            } | null
            const sensitive = body?.errors?.find(item => item.code === 'sensitive')
            if (sensitive && typeof sensitive.error === 'string') setAvatarError(sensitive.error)
        },
    })

    const submit = useCallback(() => {
        if (dob) updateMe.update({ dob })
        create.mutate()
    }, [create, dob, updateMe])

    /**
     * Legacy's rule exactly: a value in every field and no **known** error. Note what is *not*
     * here — `checking`.
     *
     * Including it read as obviously safer and was measurably worse. This form seeds itself, so on
     * a cold load the fields fill at ~2.6s and a `checking` gate kept the button dead until ~3.6s:
     * a full second staring at a complete form and a control that does nothing, with nothing on
     * screen explaining why. A disabled button owes the reader a reason, and "a request you cannot
     * see is in flight" is not one it can give.
     *
     * Nothing is lost by dropping it. Submitting mid-check does not skip validation, it moves it:
     * `POST my-channel/` rejects the same name with the same message, and `onError` puts it on the
     * same field. The guard arrives one step later instead of pre-emptively freezing the form.
     */
    const ready =
        Boolean(name.value.trim()) &&
        Boolean(slug.value.trim()) &&
        Boolean(dob) &&
        !dobError &&
        !name.error &&
        !slug.error

    return {
        name,
        slug,
        dob,
        dobError,
        avatar,
        avatarError,
        cropping,
        applyCrop,
        closeCropper,
        suggestions,
        setName: checkName,
        setSlug: checkSlug,
        setDob,
        pickAvatar,
        applySuggestion: (value: string) => checkSlug(value),
        submit,
        isCreating: create.isPending,
        /** Everything the backend has accepted and nothing still in flight. */
        ready,
    }
}
