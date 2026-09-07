'use client'

import { type FollowRequest, FollowRequestRow } from '@features/channel'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * The interactive half of `/dev/follow-requests`.
 *
 * It holds the two pieces of state the real screen's hook holds — which row is answering, with
 * which verb, and which is exiting — so the **motion** can be watched, which is the whole reason
 * the page exists. Pressing Accept or Decline spins that button for 600ms, plays the exit, then
 * puts the row back so the next press can play it again. Nothing is requested.
 */
export function FollowRequestsPreview({ rows }: { rows: FollowRequest[] }) {
    const [pending, setPending] = useState<{ id: string; action: 'accept' | 'decline' } | null>(
        null,
    )
    const [exitingId, setExitingId] = useState<string | null>(null)

    function play(id: string, action: 'accept' | 'decline') {
        if (pending || exitingId) return
        setPending({ id, action })
        // Roughly a real round trip, so the pending state is visible rather than a flicker.
        setTimeout(() => {
            setPending(null)
            setExitingId(id)
            // The row is restored instead of removed — a preview that empties itself after three
            // presses is a preview you have to reload to use.
            setTimeout(() => setExitingId(null), 900)
        }, 600)
    }

    return (
        <div className="bg-(--background-surface) md:rounded-[var(--radius-xl)]">
            <div className="overflow-hidden md:rounded-t-[var(--radius-xl)]">
                <ul className="list-none">
                    {rows.map((entry, index) => (
                        <FollowRequestRow
                            key={entry.id}
                            entry={entry}
                            // "Is anything above me still visible", matching the real view — see
                            // `follow-requests-view.tsx` for why `index > 0` draws a stray line.
                            rule={rows.slice(0, index).some(above => above.id !== exitingId)}
                            pending={pending?.id === entry.id ? pending.action : null}
                            busy={pending !== null}
                            exiting={exitingId === entry.id}
                            onRespond={action => play(entry.id, action)}
                            enterDelay={index * 40}
                            locale="en"
                        />
                    ))}
                </ul>
            </div>
            {/* The shipped bar's geometry, without its dialog: the two bulk buttons and the
                hairline above them are what has to be checked at 390px and in both themes. */}
            <div className="flex items-center justify-end gap-3 border-(--separator-default) border-t p-3 md:rounded-b-[var(--radius-xl)]">
                <Button variant="secondary" size="medium">
                    Decline all
                </Button>
                <Button variant="accent" size="medium">
                    Accept all
                </Button>
            </div>
            <div className="flex justify-center p-3">
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                        setPending(null)
                        setExitingId(null)
                    }}
                >
                    Reset
                </Button>
            </div>
        </div>
    )
}
