'use client'

import { ApiError } from '@shared/lib/api/errors'
import { useEffect, useRef, useState } from 'react'
import { channelApi } from '../api/channel-api'

/**
 * Is this username free? — the one field on the form whose answer only the server has.
 *
 * ## Why this is worth a request per pause and the name field is not
 *
 * `nameRuleFailures` checks the display name locally because its rules are arithmetic on a
 * string. A username is different in the way that matters: **the change is rate-limited to once a
 * week**, so finding out on Save that it was taken costs the person a whole edit cycle for
 * nothing, and there is no local test for "somebody else has it". That asymmetry is the entire
 * justification for the debounce below — it is not "live validation is nicer".
 *
 * ## The three states are three states
 *
 * `idle | checking | taken | free` and not a boolean, because "not known to be taken" and "known
 * to be free" have to look different: the first is the state while typing and must not render a
 * green tick, and the second is the only one that should. Collapsing them is how a checkmark ends
 * up appearing under a username that has not been checked yet.
 *
 * ## Aborting is what keeps the answer honest
 *
 * Every new keystroke aborts the request in flight. Without that, two overlapping checks can land
 * out of order and the field ends up showing the verdict for a username the box no longer
 * contains — which, for a rate-limited field, means someone confidently saving a name that was
 * never free. The abort also means `isCanceled` is an expected outcome here and is deliberately
 * *not* treated as a failure.
 */

export type SlugStatus = 'idle' | 'checking' | 'free' | 'taken'

/** Legacy's own debounce for this field — 1000ms. Long, and correctly so: it is a whole word. */
const DEBOUNCE_MS = 1000

export function useSlugCheck(value: string, original: string) {
    const [status, setStatus] = useState<SlugStatus>('idle')
    /**
     * The backend's own sentence, and one of the two places this app shows one.
     *
     * "That username is taken", "Usernames must be at least 5 characters", "This word is
     * reserved" — none of which a key of ours can say, and all of which are the only useful thing
     * to put under the field. The narrowing rules are `parseChannelFieldErrors`': a 4xx body only,
     * a short single sentence or nothing. Untranslated by nature.
     */
    const [message, setMessage] = useState<string | null>(null)
    const controller = useRef<AbortController | null>(null)

    useEffect(() => {
        const slug = value.trim()

        // Unchanged is not a question: the account already owns this username, and asking would
        // get it told that its own name is taken.
        if (!slug || slug === original) {
            controller.current?.abort()
            setStatus('idle')
            setMessage(null)
            return
        }

        setStatus('checking')
        setMessage(null)

        const timer = setTimeout(() => {
            controller.current?.abort()
            const abort = new AbortController()
            controller.current = abort

            channelApi
                .checkSlug(slug, abort.signal)
                .then(() => {
                    setStatus('free')
                    setMessage(null)
                })
                .catch((error: unknown) => {
                    // Our own abort — a newer keystroke is already asking. Say nothing.
                    if (error instanceof ApiError && error.isCanceled) return
                    /*
                     * A network failure is not a verdict. Rendering "taken" because the request
                     * did not arrive would tell someone their own idea is unavailable; the field
                     * goes back to `idle` and the save path finds out for real.
                     */
                    if (error instanceof ApiError && error.isNetwork) {
                        setStatus('idle')
                        setMessage(null)
                        return
                    }
                    setStatus('taken')
                    setMessage(rejectionMessage(error))
                })
        }, DEBOUNCE_MS)

        return () => clearTimeout(timer)
    }, [value, original])

    // Abort whatever is in flight when the form goes away. Without this, a slow check resolves
    // into an unmounted component's state setters after the drawer has closed.
    useEffect(() => () => controller.current?.abort(), [])

    return { status, message }
}

/**
 * The sentence a rejection carried, or `null` — same three guards as `providerSignInErrorText`.
 *
 * Body only (never `error.message`, which falls back to axios's own wording), 4xx only (a 5xx
 * body is where stack fragments live), one short sentence or nothing.
 */
function rejectionMessage(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (!error.status || error.status < 400 || error.status >= 500) return null
    const body = error.data
    if (!body || typeof body !== 'object') return null
    const message = (body as { message?: unknown }).message
    if (typeof message !== 'string') return null
    const trimmed = message.trim()
    return trimmed && trimmed.length <= 160 ? trimmed : null
}
