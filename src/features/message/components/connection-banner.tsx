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
    return <ConnectionStrip kind={online ? 'connecting' : 'offline'} />
}

/** The strip itself, for one state — split out so the dev harness can draw both. */
export function ConnectionStrip({ kind }: { kind: 'offline' | 'connecting' }) {
    const { t } = useTranslation()
    const connecting = kind === 'connecting'
    return (
        <p
            data-testid="message-room-connection"
            data-connection-state={kind}
            role="status"
            className={cn(
                'flex flex-none items-center justify-center gap-2 px-3 py-1 type-caption-label',
                connecting
                    ? 'bg-(--background-subtle) text-(--text-body)'
                    : 'bg-(--accents-error-bg-active) text-(--text-error)',
            )}
        >
            {connecting && <Loader className="size-4" />}
            {t(connecting ? 'message_connecting' : 'message_offline')}
        </p>
    )
}
