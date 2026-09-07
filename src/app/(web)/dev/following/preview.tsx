'use client'

import { type FollowedChannel, FollowingChannelRow, movePinnedRow } from '@features/channel'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * The interactive half of `/dev/following`.
 *
 * It holds the three pieces of state the real screen's hook holds — which row is writing, which is
 * exiting, and each row's pin/mute flags — so the **motion and the two toggles** can be watched,
 * which is the whole reason the page exists. Pin and mute flip immediately (the shipped screen is
 * optimistic, so that is honest); Unfollow plays the exit and then puts the row back, because a
 * preview that empties itself after five presses is one you have to reload to use.
 *
 * Nothing is requested, and nothing here re-implements a *decision*: the row is the shipped
 * component and every rule it applies — the mute tri-state, the truncation, which rows draw a rule
 * — is its own.
 */
export function FollowingPreview({ rows }: { rows: FollowedChannel[] }) {
    const [state, setState] = useState(rows)
    const [pendingSlug, setPendingSlug] = useState<string | null>(null)
    const [exitingSlug, setExitingSlug] = useState<string | null>(null)

    function write(slug: string, patch: Partial<FollowedChannel>) {
        if (pendingSlug || exitingSlug) return
        setPendingSlug(slug)
        // Roughly a real round trip, so the disabled kebab is visible rather than a flicker.
        setTimeout(() => {
            setPendingSlug(null)
            setState(previous =>
                previous.map(row => (row.slug === slug ? { ...row, ...patch } : row)),
            )
        }, 600)
    }

    /**
     * Pin is not a field patch — it **moves the row**, and the shipped screen does it optimistically
     * because the endpoint answers before a re-read can see it (see `useFollowedChannels`). So this
     * calls the same `movePinnedRow` the hook does rather than imitating it, and applies it at once
     * rather than behind the fake round trip: that immediacy is the behaviour worth previewing.
     */
    function togglePin(slug: string, pinned: boolean) {
        if (pendingSlug || exitingSlug) return
        setState(previous => movePinnedRow(previous, slug, pinned))
    }

    function playExit(slug: string) {
        if (pendingSlug || exitingSlug) return
        setExitingSlug(slug)
        setTimeout(() => setExitingSlug(null), 900)
    }

    return (
        <div className="overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]">
            <ul className="list-none">
                {state.map((channel, index) => (
                    <FollowingChannelRow
                        key={channel.slug}
                        channel={channel}
                        // "Is anything above me still visible", matching the real view — see
                        // `following-view.tsx` for why `index > 0` draws a stray line.
                        rule={state.slice(0, index).some(above => above.slug !== exitingSlug)}
                        pending={pendingSlug === channel.slug}
                        busy={pendingSlug !== null}
                        exiting={exitingSlug === channel.slug}
                        onTogglePin={() => togglePin(channel.slug, !channel.pin)}
                        onToggleMute={() =>
                            write(channel.slug, {
                                notification_settings: {
                                    notification:
                                        channel.notification_settings?.notification === false,
                                },
                            })
                        }
                        onUnfollow={() => playExit(channel.slug)}
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
                        setPendingSlug(null)
                        setExitingSlug(null)
                        setState(rows)
                    }}
                >
                    Reset
                </Button>
            </div>
        </div>
    )
}
