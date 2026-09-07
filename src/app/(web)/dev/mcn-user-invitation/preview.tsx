'use client'

import { McnUserInvitationFooter } from '@features/channel/dev'
import { useState } from 'react'

/**
 * The interactive half of `/dev/mcn-user-invitation` — the footer, which cannot be server-rendered
 * at all: `onAnswer` is a function, and a function does not cross the server→client boundary.
 *
 * Pressing spins the pressed button for 900ms and then releases it, so the pending state is
 * watchable rather than a flicker, and the next press can play it again. Nothing is requested and
 * nothing navigates — the real screen `replace`s to `/` on success, which would end the preview on
 * the first press.
 *
 * `canAnswer` is `true`: the real screen renders this block only in its `ready` state, so a preview
 * with the buttons dead would be previewing a state that does not exist. The **disabled** look is
 * still reachable here — it is what the *other* button does while one is in flight, which is the
 * pair's real disabled state and the only one worth checking.
 *
 * Unlike the creator invitation's footer preview there is **no `createdAt`**, because there is no
 * countdown: this screen states its 72 hours as a sentence (B101). So the fixtures vary by width
 * instead of by time — see the page.
 */
export function McnUserInvitationFooterPreview() {
    const [pending, setPending] = useState<'accept' | 'reject' | null>(null)

    return (
        <McnUserInvitationFooter
            canAnswer
            isBusy={pending !== null}
            pendingAction={pending}
            onAnswer={action => {
                if (pending) return
                setPending(action)
                // Roughly a real round trip, then released so it can be played again.
                setTimeout(() => setPending(null), 900)
            }}
        />
    )
}
