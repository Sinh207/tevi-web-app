'use client'

import { useUserRoomStatus } from '@features/realtime'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Loader } from '@shared/ui/loader'
import { useEffect, useState, useSyncExternalStore } from 'react'

/** A drop shorter than this is not announced — a wifi hand-off should not flash a banner. */
const GRACE_MS = 2_000

function subscribeOnline(onChange: () => void) {
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => {
        window.removeEventListener('online', onChange)
        window.removeEventListener('offline', onChange)
    }
}

/**
 * The strip under a conversation's header that says it is not live — Android's two bars: "No
 * internet connection" when the device is offline, "Connecting…" while the socket is down. iOS and
 * legacy say nothing, and a reader typing into a room that will not deliver cannot tell.
 *
 * The socket half waits `GRACE_MS` before it shows, and neither half blocks anything: a send while
 * offline fails into its own Retry, and the thread re-reads on reconnect (`useSocketReconnect`).
 */
export function ConnectionBanner() {
    const { t } = useTranslation()
    const online = useSyncExternalStore(
        subscribeOnline,
        () => navigator.onLine,
        () => true,
    )
    const status = useUserRoomStatus()
    const down = status === 'disconnected' || status === 'error'

    const [showDown, setShowDown] = useState(false)
    useEffect(() => {
        if (!down) {
            setShowDown(false)
            return
        }
        const timer = setTimeout(() => setShowDown(true), GRACE_MS)
        return () => clearTimeout(timer)
    }, [down])

    if (online && !showDown) return null

    return (
        <p
            data-testid="message-room-connection"
            role="status"
            className={cn(
                'flex flex-none items-center justify-center gap-2 px-3 py-1 type-caption-label',
                online
                    ? 'bg-(--background-subtle) text-(--text-body)'
                    : 'bg-(--accents-error-bg-active) text-(--text-error)',
            )}
        >
            {online && <Loader className="size-4" />}
            {t(online ? 'message_connecting' : 'message_offline')}
        </p>
    )
}
