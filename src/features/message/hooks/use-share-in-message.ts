'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { apiErrorText } from '@shared/lib/api/error-message'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { forgetConversationCache, messageApi, messageKeys } from '../api/message-api'
import type { Conversation } from '../api/types'

/**
 * The text a share puts in a conversation: what the reader typed, a line break, the link.
 *
 * **The three shipped clients disagree here, and this is legacy web's** (**B113**): iOS sends the
 * link first and the text after a blank line, Android joins them with one space. Text-first matches
 * the order the reader composed it in and Android's order; the newline keeps the link on a line of
 * its own, which is what the message bubble turns into a card.
 */
export function shareMessageText(typed: string, link: string): string {
    return [typed.trim(), link].filter(Boolean).join('\n')
}

/** Who a toast names — the conversation's other side, never empty. */
function recipientName(conversation: Conversation, fallback: string): string {
    const recipient = conversation.recipient
    return recipient?.name || recipient?.channel_slug || fallback
}

/** Legacy trims a failed name to 20 characters so a toast stays one line. */
function trimName(name: string): string {
    return name.length > 20 ? `${name.slice(0, 20)}…` : name
}

export interface UseShareInMessageResult {
    selected: Conversation[]
    isSelected: (id: string) => boolean
    toggle: (conversation: Conversation) => void
    isSending: boolean
    /** Resolves to whether at least one conversation received it. */
    send: (typed: string) => Promise<boolean>
}

/**
 * The selection and the fan-out send behind the share sheet's "Send in message".
 *
 * ## One request per conversation
 *
 * `send_message` takes one `conversation_id`; all three clients send in parallel, one request each.
 * `allSettled`, so one refusal (a block, an unpublished space) does not cost the others theirs.
 *
 * ## A partial failure keeps what failed, and only that
 *
 * Legacy web's rule, and the one worth keeping over both apps': iOS closes the sheet before the
 * requests finish and shows only the first error; Android aborts the batch on the first HTTP error,
 * so a reader cannot tell who got it. Here —
 *
 * - **any success** closes the sheet (the reader sees the toast naming who got it, and a second one
 *   naming who did not);
 * - **no success** keeps the sheet open with the same recipients and the typed text, so Send can be
 *   pressed again as it stands.
 *
 * The link is resolved **once** per press, before the fan-out, so every conversation gets the same
 * one and the link service counts one share.
 *
 * ## The account is the one that pressed
 *
 * `activeId` is read when Send is pressed and passed to every request, so switching account while
 * the requests are in flight cannot post a share as somebody else.
 */
export function useShareInMessage({
    resolveLink,
    onSent,
}: {
    resolveLink: () => Promise<string>
    onSent: () => void
}): UseShareInMessageResult {
    const { t } = useTranslation()
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    const [selected, setSelected] = useState<Conversation[]>([])
    const [isSending, setIsSending] = useState(false)

    const isSelected = useCallback((id: string) => selected.some(row => row.id === id), [selected])

    const toggle = useCallback((conversation: Conversation) => {
        setSelected(rows =>
            rows.some(row => row.id === conversation.id)
                ? rows.filter(row => row.id !== conversation.id)
                : [...rows, conversation],
        )
    }, [])

    const send = useCallback(
        async (typed: string) => {
            if (selected.length === 0 || isSending) return false
            const recipients = selected
            const accountId = activeId
            setIsSending(true)
            try {
                const text = shareMessageText(typed, await resolveLink())
                const results = await Promise.allSettled(
                    recipients.map(conversation =>
                        messageApi.sendMessage({
                            conversationId: conversation.id,
                            text,
                            accountId,
                        }),
                    ),
                )

                const sent: Conversation[] = []
                const failed: { conversation: Conversation; error: unknown }[] = []
                results.forEach((result, index) => {
                    const conversation = recipients[index] as Conversation
                    if (result.status === 'fulfilled') sent.push(conversation)
                    else failed.push({ conversation, error: result.reason })
                })

                const fallback = t('message_inactive_user')
                if (sent.length > 0) {
                    const name = recipientName(sent[0] as Conversation, fallback)
                    toast.success(
                        sent.length === 1
                            ? t('share_dm_sent_to', { name })
                            : t('share_dm_sent_to_others', { name, count: sent.length - 1 }),
                        { id: 'share-dm-sent' },
                    )
                    // Every list that shows these conversations now has a new latest line.
                    await forgetConversationCache(accountId)
                    queryClient.invalidateQueries({ queryKey: messageKeys.all })
                }

                const [first] = failed
                if (first) {
                    const name = trimName(recipientName(first.conversation, fallback))
                    toast.error(
                        // One refusal can carry the API's own reason ("You can't message this
                        // space") — API_ERRORS.md. Several are named, not explained.
                        failed.length === 1
                            ? (apiErrorText(first.error) ?? t('share_dm_failed_to', { name }))
                            : t('share_dm_failed_to_others', { name, count: failed.length - 1 }),
                        { id: 'share-dm-failed' },
                    )
                }

                if (sent.length > 0) {
                    onSent()
                    return true
                }
                setSelected(failed.map(row => row.conversation))
                return false
            } finally {
                setIsSending(false)
            }
        },
        [activeId, isSending, onSent, queryClient, resolveLink, selected, t],
    )

    return { selected, isSelected, toggle, isSending, send }
}
