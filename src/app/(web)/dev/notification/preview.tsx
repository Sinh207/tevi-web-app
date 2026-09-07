'use client'

import { NotificationRow, resolveInboxTarget } from '@features/notification'
import { Button } from '@shared/ui/button'
import type { ComponentProps } from 'react'
import { useState } from 'react'

/** The row's own message type, without widening the feature's barrel to re-export it. */
type Message = ComponentProps<typeof NotificationRow>['message']

/**
 * The interactive half of `/dev/notification`.
 *
 * It holds the three pieces of state the real screen's hook holds — which rows are read, which row
 * is being deleted, and which is exiting — so the **motion and the read tint** can actually be
 * watched, which is the whole reason the page exists. Pressing a row flips it to read; the kebab's
 * Delete spins for 600ms, plays the exit and then puts the row back, because a preview that empties
 * itself after four presses is one you have to reload to use. Nothing is requested.
 */
export function NotificationPreview({ rows }: { rows: Message[] }) {
    const [read, setRead] = useState<ReadonlySet<string>>(
        () => new Set(rows.filter(row => row.read).map(row => row.id)),
    )
    const [removingId, setRemovingId] = useState<string | null>(null)
    const [exitingId, setExitingId] = useState<string | null>(null)

    const toggle = (id: string, next: boolean) =>
        setRead(previous => {
            const set = new Set(previous)
            if (next) set.add(id)
            else set.delete(id)
            return set
        })

    function play(id: string) {
        if (removingId || exitingId) return
        setRemovingId(id)
        // Roughly a real round trip, so the pending state is visible rather than a flicker.
        setTimeout(() => {
            setRemovingId(null)
            setExitingId(id)
            setTimeout(() => setExitingId(null), 900)
        }, 600)
    }

    return (
        <div className="overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]">
            <ul className="list-none">
                {rows.map((row, index) => {
                    const message = { ...row, read: read.has(row.id) }
                    return (
                        <NotificationRow
                            key={row.id}
                            message={message}
                            target={resolveInboxTarget(message)}
                            // "Is anything above me still visible", matching the real view — see
                            // `notification-view.tsx` for why `index > 0` draws a stray line.
                            rule={rows.slice(0, index).some(above => above.id !== exitingId)}
                            busy={removingId !== null}
                            exiting={exitingId === row.id}
                            enterDelay={index * 40}
                            locale="en"
                            /* The press marks read, exactly as the real screen's does. The
                               navigation is the browser's, so an internal row really does leave
                               this page — which is itself worth seeing. */
                            onOpen={() => toggle(row.id, true)}
                            onToggleRead={() => toggle(row.id, !read.has(row.id))}
                            onDelete={() => play(row.id)}
                        />
                    )
                })}
            </ul>
            <div className="flex justify-center p-3">
                <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                        setRead(new Set(rows.filter(row => row.read).map(row => row.id)))
                        setRemovingId(null)
                        setExitingId(null)
                    }}
                >
                    Reset
                </Button>
            </div>
        </div>
    )
}
