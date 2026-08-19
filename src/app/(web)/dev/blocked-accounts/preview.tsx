'use client'

import { type BlockedAccount, BlockedAccountRow } from '@features/channel'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * The interactive half of `/dev/blocked-accounts`.
 *
 * It holds the two pieces of state the real screen's hook holds — which row is pending and
 * which is exiting — so the **motion** can actually be watched, which is the whole reason the
 * page exists. Pressing Unblock here spins the button for 600ms, plays the exit, and then puts
 * the row back so the next press can play it again. Nothing is requested.
 */
export function BlockedAccountsPreview({ rows }: { rows: BlockedAccount[] }) {
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [exitingId, setExitingId] = useState<string | null>(null)

    function play(id: string) {
        if (pendingId || exitingId) return
        setPendingId(id)
        // Roughly a real round trip, so the pending state is visible rather than a flicker.
        setTimeout(() => {
            setPendingId(null)
            setExitingId(id)
            // The row is restored instead of removed — a preview that empties itself after
            // three presses is a preview you have to reload to use.
            setTimeout(() => setExitingId(null), 900)
        }, 600)
    }

    return (
        <div className="overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]">
            <ul className="list-none">
                {rows.map((entry, index) => (
                    <BlockedAccountRow
                        key={entry.id}
                        entry={entry}
                        // "Is anything above me still visible", matching the real view — see
                        // `blocked-accounts-view.tsx` for why `index > 0` draws a stray line.
                        rule={rows.slice(0, index).some(above => above.id !== exitingId)}
                        unblocking={pendingId === entry.id}
                        busy={pendingId !== null}
                        exiting={exitingId === entry.id}
                        onUnblock={() => play(entry.id)}
                        enterDelay={index * 40}
                        locale="en"
                    />
                ))}
            </ul>
            <div className="flex justify-center p-3">
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                        setPendingId(null)
                        setExitingId(null)
                    }}
                >
                    Reset
                </Button>
            </div>
        </div>
    )
}
