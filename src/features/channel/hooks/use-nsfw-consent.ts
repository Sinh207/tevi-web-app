'use client'

import { useAuth } from '@features/auth'
import { useCallback, useEffect, useState } from 'react'
import { grantNsfwConsent, hasNsfwConsent } from '../lib/nsfw-consent'

/**
 * Whether this viewer has agreed to see this channel's sensitive content, and a way to say yes.
 *
 * ## Read in an effect, not in the initialiser
 *
 * This is the one shape that works. `useState(() => hasNsfwConsent(...))` looks equivalent and is
 * not: `localStorage` does not exist on the server, so the initialiser returns `false` there and the
 * stored value on the client's **first** render — the render that has to match the server HTML. For
 * anyone who had already consented that is a hydration mismatch, and React resolves it by throwing
 * away the server's markup for the subtree.
 *
 * So both sides start at `false` and the effect corrects it after mount. Same shape as
 * `useMayAnimate` in `shared/components/animated-avatar.tsx`, for the same reason.
 *
 * The cost is a flash of the gate for someone who already agreed. That is the **safe** direction: the
 * alternative is a flash of the content for someone who has not, which is the one thing this gate
 * exists to prevent.
 */
export function useNsfwConsent(slug: string) {
    const { activeId } = useAuth()
    const [isConfirmed, setIsConfirmed] = useState(false)

    useEffect(() => {
        // Also re-reads on an account switch: consent is per account, so the answer changes with it.
        setIsConfirmed(hasNsfwConsent(slug, activeId))
    }, [slug, activeId])

    const confirm = useCallback(() => {
        grantNsfwConsent(slug, activeId)
        setIsConfirmed(true)
    }, [slug, activeId])

    return { isConfirmed, confirm }
}
