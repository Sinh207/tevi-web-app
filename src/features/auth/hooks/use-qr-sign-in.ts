'use client'

import { initDeviceInfo } from '@shared/lib/device-info'
import type { DeviceRoomHandle } from '@shared/lib/socket/device-room'
import { openDeviceRoom } from '@shared/lib/socket/device-room-client'
import { useCallback, useEffect, useState } from 'react'
import { authApi, type TokenResponse } from '../api/auth-api'
import { deviceLinkQrText } from '../lib/device-link'
import { useAuth } from '../providers/auth-provider'

/**
 * QR sign-in, from the browser's side: mint a device link, listen in its room, adopt the session
 * the phone sends back.
 *
 * ## Order is the correctness argument
 *
 * The room is joined **before** the code is put on screen. The other way round is a race nobody
 * would ever see in testing and everybody would hit on a fast phone: the approval is a single
 * frame with no replay, so a scan that lands before the `join` is delivered to nobody and the code
 * on screen simply never resolves. Rendering is gated on `qrText`, which is only set once the room
 * is open.
 *
 * ## One code per mount, and a fresh one on retry
 *
 * A device-link token has been displayed — photographed, screen-shared, shoulder-surfed — so it is
 * never reused. Closing the panel closes the room; opening it again mints a new token. `retry()`
 * does the same thing deliberately, and is the only way back from a failure.
 *
 * ## The IP comes back with the link, not from a second request
 *
 * `POST v1/device-links/` answers with `payload.ip` — the address the **auth service** saw, which
 * is the one worth printing, since it is the sentence the phone shows while asking for approval
 * (see `lib/device-link.ts`). This used to `fetch('/api/client-ip')` in parallel and read our own
 * route handler's view of the same headers: a second round trip for a second-hand answer to a
 * question the response in hand had already settled. Absent or unreadable, the code is drawn
 * without an address — which is what legacy shows before its own lookup returns, and the panel
 * works either way.
 */

export type QrSignInStatus = 'preparing' | 'ready' | 'error'

/** A frame is only a session if it carries one — the room forwards whatever the gateway sent. */
function asTokenResponse(payload: unknown): TokenResponse | null {
    if (!payload || typeof payload !== 'object') return null
    const candidate = payload as Partial<TokenResponse>
    return typeof candidate.access_token === 'string' ? (candidate as TokenResponse) : null
}

export function useQrSignIn() {
    const { signInWithQrSession } = useAuth()
    const [status, setStatus] = useState<QrSignInStatus>('preparing')
    const [qrText, setQrText] = useState<string | null>(null)
    /** Bumped by `retry`; the effect keys on it, so a new attempt is a fresh token and room. */
    const [attempt, setAttempt] = useState(0)

    /*
     * `attempt` is a **trigger**, not a read: the body deliberately never looks at it. Nothing else
     * in the dependency list changes on a retry, so dropping it would leave `retry()` doing nothing
     * at all — and the failure state it is the only way out of would be permanent.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
    useEffect(() => {
        let cancelled = false
        let room: DeviceRoomHandle | null = null
        const controller = new AbortController()

        setStatus('preparing')
        setQrText(null)

        const fail = () => {
            if (cancelled) return
            room?.close()
            room = null
            setStatus('error')
        }

        void (async () => {
            /*
             * `v1/device-links/` is one of the endpoints that identifies a signed-out browser by
             * its fingerprint alone, so the id has to exist before the call rather than settle
             * afterwards. Cached after the first visit, so this is normally free.
             */
            await initDeviceInfo()
            /*
             * The signal is what the mint is aborted *by* — it used to hang off the parallel IP
             * fetch, and dropping that would have left the controller in the cleanup aborting
             * nothing. A panel closed mid-mint should not leave a link the backend created and
             * nobody will ever redeem.
             */
            const link = await authApi.createDeviceLink(controller.signal)
            if (cancelled) return

            const token = link?.payload?.token
            if (!token || !link.ws_channel) {
                fail()
                return
            }

            room = openDeviceRoom({
                channel: link.ws_channel,
                onLinked: payload => {
                    const session = asTokenResponse(payload)
                    if (!session) return
                    /*
                     * A rejection here lands in `signInErrorKey` — the account limit, or a `/me`
                     * that would not load — and there is no caller left to reject to, since this
                     * promise starts on a websocket frame. But it must still reach `fail`.
                     *
                     * **The code on screen is spent by now.** The phone has redeemed the link, so
                     * the picture is a dead code that still looks live: scanning it again does
                     * nothing, for ever, and the panel would sit there insisting. `fail` swaps it
                     * for the retry that mints a new one. The *reason* is not lost — the panel
                     * suppresses its own generic sentence while `signInErrorKey` is set and lets
                     * `AuthErrorMessage` say what actually happened.
                     */
                    void signInWithQrSession(session).catch(fail)
                },
                onUnavailable: fail,
            })

            // Only now is there something listening behind the code.
            setQrText(deviceLinkQrText({ token, ip: link.payload.ip }))
            setStatus('ready')
        })().catch(fail)

        return () => {
            cancelled = true
            controller.abort()
            room?.close()
        }
    }, [attempt, signInWithQrSession])

    const retry = useCallback(() => setAttempt(n => n + 1), [])

    return { status, qrText, retry }
}
