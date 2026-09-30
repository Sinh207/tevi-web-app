'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { apiErrorText } from '@shared/lib/api/error-message'
import { useWebConfig } from '@shared/lib/remote-config'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { gateOf, messageApi } from '../api/message-api'
import { CHAT_ACTION, type ChatMessage, type ConversationGate } from '../api/types'
import { messageText, type PendingMessage } from '../lib/message-thread'

/**
 * How often "typing" is re-sent while the reader keeps typing. Receivers expire an indicator after
 * `CHAT_ACTION_TTL_MS` (6s) without a repeat, so this must stay under it. Legacy sends `TYPING` once
 * per burst and relies on `NONE` to end it, which a closed tab never sends.
 */
export const TYPING_REPEAT_MS = 4_000

/** Legacy's Get started message — the whole of a first conversation's opening line. */
export const WAVE = '👋👋👋'

export interface UseComposerResult {
    text: string
    setText: (value: string) => void
    limit: number
    overLimit: boolean
    canSend: boolean
    replyTo: ChatMessage | null
    editing: ChatMessage | null
    startReply: (message: ChatMessage) => void
    startEdit: (message: ChatMessage) => void
    cancel: () => void
    submit: () => void
    /** Send a message with no draft involved — Get started's wave. */
    sendText: (value: string) => void
    pending: PendingMessage[]
    retry: (localId: string) => void
    discard: (localId: string) => void
    remove: (message: ChatMessage, both: boolean) => Promise<boolean>
    /** The field lost focus — the other side stops seeing "typing". */
    onBlur: () => void
}

/**
 * The composer and every write a conversation makes: send, edit, reply, delete, and the typing
 * signal.
 *
 * ## A sent message is pending until the server returns it
 *
 * Legacy builds a fake message (`temp_…`) inside its message state, then swaps it for the server's
 * copy by searching that state for the temp id — keyed by the date *it* computed, so a send that
 * crosses midnight is never found and stays "processing" forever. Here a send lives in `pending`,
 * which is not the query cache at all, and leaves it when the server's copy is `put` into the
 * thread. A failure stays in `pending` with Retry / Discard rather than vanishing.
 *
 * ## Edits and deletes wait for the server
 *
 * Both change what the *other* person sees, so neither is optimistic: an edit that failed silently
 * would show the reader a sentence their correspondent never received.
 */
export function useComposer({
    conversationId,
    onMessage,
    onDropped,
    onChanged,
    onGate,
}: {
    conversationId: string
    /** The server's copy of a sent or edited message. */
    onMessage: (message: ChatMessage) => void
    /** A message the server confirmed deleted. */
    onDropped: (id: string) => void
    /** Anything that changes the conversation's preview in the list. */
    onChanged: () => void
    /**
     * A write was refused with one of the messenger's wall codes (`C001`, `MSG002`, …) — the room
     * swaps the composer for that wall. Both apps do this on a send, not only on open: a block or a
     * lapsed membership is only found out when the next message bounces.
     */
    onGate?: (gate: ConversationGate) => void
}): UseComposerResult {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const limit = useWebConfig().directMessage.limitCharacters

    const [text, setTextState] = useState('')
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
    const [editing, setEditing] = useState<ChatMessage | null>(null)
    const [pending, setPending] = useState<PendingMessage[]>([])
    const [busy, setBusy] = useState(false)

    const trimmed = text.trim()
    const overLimit = trimmed.length > limit
    const canSend = trimmed !== '' && !overLimit && !busy

    /* ---------------------------------------------------------------- typing */

    const lastTyping = useRef(0)
    const typingSent = useRef(false)

    const signal = useCallback(
        (action: (typeof CHAT_ACTION)[keyof typeof CHAT_ACTION]) => {
            if (!conversationId) return
            messageApi.sendChatAction(conversationId, action, activeId).catch(() => undefined)
        },
        [activeId, conversationId],
    )

    const stopTyping = useCallback(() => {
        if (!typingSent.current) return
        typingSent.current = false
        lastTyping.current = 0
        signal(CHAT_ACTION.none)
    }, [signal])

    const setText = useCallback(
        (value: string) => {
            setTextState(value)
            const has = value.trim() !== '' && value.trim().length <= limit
            if (!has) {
                stopTyping()
                return
            }
            const now = Date.now()
            if (!typingSent.current || now - lastTyping.current > TYPING_REPEAT_MS) {
                typingSent.current = true
                lastTyping.current = now
                signal(CHAT_ACTION.typing)
            }
        },
        [limit, signal, stopTyping],
    )

    // Leaving the conversation mid-word ends the indicator on the other side.
    useEffect(() => stopTyping, [stopTyping])

    /* ---------------------------------------------------------------- send */

    const deliver = useCallback(
        async (item: PendingMessage) => {
            try {
                const message = await messageApi.sendMessage({
                    conversationId,
                    text: item.text,
                    replyToId: item.replyTo?.id ?? null,
                    accountId: activeId,
                })
                if (!message) throw new Error('empty')
                onMessage(message)
                setPending(list => list.filter(row => row.localId !== item.localId))
                onChanged()
            } catch (error) {
                setPending(list =>
                    list.map(row =>
                        row.localId === item.localId ? { ...row, status: 'failed' } : row,
                    ),
                )
                const gate = gateOf(error)
                if (gate) {
                    // The wall explains it; a toast saying the same thing would be twice.
                    onGate?.(gate)
                    return
                }
                /*
                 * The API's own sentence where it sent one ("You can't message this space"), ours
                 * otherwise — API_ERRORS.md. The failed bubble stays with its Retry.
                 */
                toast.error(apiErrorText(error) ?? t('message_error_send'), { id: 'message-send' })
            }
        },
        [activeId, conversationId, onChanged, onGate, onMessage, t],
    )

    const sendText = useCallback(
        (value: string) => {
            const body = value.trim()
            if (!body || !conversationId) return
            const item: PendingMessage = {
                localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                text: body,
                replyTo,
                createdAt: Date.now(),
                status: 'sending',
            }
            setPending(list => [...list, item])
            setReplyTo(null)
            deliver(item)
        },
        [conversationId, deliver, replyTo],
    )

    const submit = useCallback(async () => {
        if (!canSend) return
        stopTyping()
        if (editing) {
            setBusy(true)
            try {
                const message = await messageApi.editMessage(editing.id, trimmed, activeId)
                if (message) onMessage(message)
                setEditing(null)
                setTextState('')
                onChanged()
            } catch (error) {
                const gate = gateOf(error)
                if (gate) onGate?.(gate)
                else
                    toast.error(apiErrorText(error) ?? t('message_error_edit'), {
                        id: 'message-edit',
                    })
            } finally {
                setBusy(false)
            }
            return
        }
        sendText(trimmed)
        setTextState('')
    }, [activeId, canSend, editing, onChanged, onGate, onMessage, sendText, stopTyping, t, trimmed])

    const retry = useCallback(
        (localId: string) => {
            const item = pending.find(row => row.localId === localId)
            if (item?.status !== 'failed') return
            setPending(list =>
                list.map(row => (row.localId === localId ? { ...row, status: 'sending' } : row)),
            )
            deliver({ ...item, status: 'sending' })
        },
        [deliver, pending],
    )

    const discard = useCallback((localId: string) => {
        setPending(list => list.filter(row => row.localId !== localId))
    }, [])

    /* ---------------------------------------------------------------- reply / edit / delete */

    const startReply = useCallback((message: ChatMessage) => {
        setEditing(null)
        setReplyTo(message)
    }, [])

    const startEdit = useCallback((message: ChatMessage) => {
        setReplyTo(null)
        setEditing(message)
        setTextState(messageText(message) ?? '')
    }, [])

    const cancel = useCallback(() => {
        if (editing) setTextState('')
        setEditing(null)
        setReplyTo(null)
    }, [editing])

    const remove = useCallback(
        async (message: ChatMessage, both: boolean) => {
            try {
                await messageApi.deleteMessage(message.id, both, activeId)
                onDropped(message.id)
                onChanged()
                if (editing?.id === message.id) cancel()
                return true
            } catch (error) {
                const gate = gateOf(error)
                if (gate) onGate?.(gate)
                else {
                    toast.error(apiErrorText(error) ?? t('message_error_delete_message'), {
                        id: 'message-delete',
                    })
                }
                return false
            }
        },
        [activeId, cancel, editing?.id, onChanged, onDropped, onGate, t],
    )

    return {
        text,
        setText,
        limit,
        overLimit,
        canSend,
        replyTo,
        editing,
        startReply,
        startEdit,
        cancel,
        submit,
        sendText,
        pending,
        retry,
        discard,
        remove,
        /* iOS sends NONE on `textViewDidEndEditing`; without it a reader who clicks away mid-word
           shows "typing" for the rest of the other side's expiry. */
        onBlur: stopTyping,
    }
}
