'use client'

import { McnInvitationFooter } from '@features/channel/dev'
import { useState } from 'react'

/**
 * The interactive half of `/dev/mcn-invitation` — the footer, four times over.
 *
 * It exists for the same reason `/dev/blocked-accounts/preview.tsx` does: the footer's two
 * interesting properties are **motion and time**, and neither survives a server render.
 *
 * - `onAnswer` is a function, so it cannot cross the server→client boundary at all. That alone forces
 *   a client wrapper.
 * - Pressing spins the button for 900ms and then releases it, so the pending state is watchable
 *   rather than a flicker. Nothing is requested and nothing navigates — the real screen `replace`s to
 *   `/` on success, which would end the preview on the first press.
 * - The **countdown ticks**, and `created_at` is what sets it. Four fixtures put it at four points in
 *   the 72-hour window (see the page), which is the only way to see `01:00:0x` counting down without
 *   waiting three days.
 *
 * `canAnswer` is `true` on all four: the real screen only renders this block in its `ready` state, so
 * a preview with the buttons dead would be previewing a state that does not exist.
 */
export function McnInvitationFooterPreview({ createdAt }: { createdAt: string | null }) {
    const [pending, setPending] = useState<'accept' | 'reject' | null>(null)

    return (
        <McnInvitationFooter
            createdAt={createdAt}
            canAnswer
            isBusy={pending !== null}
            pendingAction={pending}
            onAnswer={action => {
                if (pending) return
                setPending(action)
                // Roughly a real round trip, then released so the next press can play it again.
                setTimeout(() => setPending(null), 900)
            }}
        />
    )
}
