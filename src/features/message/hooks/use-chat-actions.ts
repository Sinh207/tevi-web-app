'use client'

import { useSocketEvent } from '@features/realtime'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_ACTION, type ChatAction, parseChatActionFrame } from '../api/types'

/**
 * How long an indicator outlives its last frame. The sender's client repeats `TYPING` while the
 * reader types and sends `NONE` when they stop — but a sender who closes the tab mid-word sends no
 * `NONE` at all, and legacy's list then says "Typing…" on that row until reload. Six seconds is
 * comfortably longer than any client's repeat interval and short enough that a stale one clears
 * before anyone reads it twice.
 */
export const CHAT_ACTION_TTL_MS = 6_000

/**
 * Who is typing (or uploading a photo) in which conversation, from `change_chat_action`.
 *
 * This is the one socket payload the feature **reads**, and it is not an exception to the "signal,
 * never a source" rule so much as outside it: no query owns "typing", the socket is its only source,
 * and it is worthless a few seconds later. So it lives in component state with a timeout, and is
 * never written to the query cache.
 */
export function useChatActions(): ReadonlyMap<string, ChatAction> {
    const [actions, setActions] = useState<ReadonlyMap<string, ChatAction>>(() => new Map())
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

    const clear = useCallback((conversationId: string) => {
        timers.current.delete(conversationId)
        setActions(previous => {
            if (!previous.has(conversationId)) return previous
            const next = new Map(previous)
            next.delete(conversationId)
            return next
        })
    }, [])

    useSocketEvent('change_chat_action', payload => {
        const frame = parseChatActionFrame(payload)
        if (!frame) return
        const pending = timers.current.get(frame.conversationId)
        if (pending) clearTimeout(pending)

        if (frame.action === CHAT_ACTION.none) {
            clear(frame.conversationId)
            return
        }
        setActions(previous => {
            if (previous.get(frame.conversationId) === frame.action) return previous
            return new Map(previous).set(frame.conversationId, frame.action)
        })
        timers.current.set(
            frame.conversationId,
            setTimeout(() => clear(frame.conversationId), CHAT_ACTION_TTL_MS),
        )
    })

    /*
     * A message landing ends the indicator too — the text it was announcing has arrived. Frames are
     * not ordered against each other, so this is what stops "Typing…" sitting under the message it
     * produced for the rest of the TTL.
     */
    useSocketEvent('new_message', payload => {
        const conversationId =
            payload && typeof payload === 'object' && 'conversation_id' in payload
                ? String((payload as { conversation_id: unknown }).conversation_id ?? '')
                : ''
        if (!conversationId) return
        const pending = timers.current.get(conversationId)
        if (pending) clearTimeout(pending)
        clear(conversationId)
    })

    useEffect(() => {
        const pending = timers.current
        return () => {
            for (const timer of pending.values()) clearTimeout(timer)
            pending.clear()
        }
    }, [])

    return actions
}
