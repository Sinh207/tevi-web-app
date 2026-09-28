'use client'

import type { Channel } from '@features/channel'
import { ChannelEmptyState } from '@features/channel'
import {
    ChatHeader,
    ChatWall,
    ConversationRow,
    ConversationSkeleton,
    DEV_CHANNEL,
    MESSAGE_ART,
    MessageComposer,
    MessageThreadView,
    messageFixtures,
    threadFixtures,
    toConversationView,
} from '@features/message/dev'
import { useTranslation } from '@shared/i18n/use-translation'
import { useEffect, useState } from 'react'

/** The interactive half of `/dev/messages`. Nothing is requested; Delete only logs. */
export function MessagesPreview() {
    const { t, currentLanguage } = useTranslation()
    /* The clock is read after mount: fixtures dated from the server's `Date.now()` would print a
       different "4 min. ago" than the client's and fail hydration. The real list never renders
       rows on the server — there is no SSR bearer — so it has no such problem. */
    const [now, setNow] = useState<number | null>(null)
    useEffect(() => setNow(Date.now()), [])
    if (now === null) return null
    const rows = messageFixtures(now)

    return (
        <>
            <section className="flex flex-col gap-2">
                <h2 className="type-subheading-strong text-(--text-title)">Rows</h2>
                <div className="w-full max-w-[390px] overflow-hidden rounded-[var(--radius-xl)] bg-(--background-surface)">
                    <ul className="list-none">
                        {rows.map((row, index) => (
                            <ConversationRow
                                key={row.id}
                                conversationId={row.id}
                                view={toConversationView(row, now)}
                                rule={index > 0}
                                chatAction={row.id === 'typing' ? 'TYPING' : undefined}
                                active={row.id === 'read-mine-seen'}
                                locale={currentLanguage}
                                now={now}
                                onOpen={() => undefined}
                                onDelete={() => console.info('delete', row.id)}
                            />
                        ))}
                    </ul>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-subheading-strong text-(--text-title)">Conversation</h2>
                <ThreadPreview now={now} locale={currentLanguage} />
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-subheading-strong text-(--text-title)">Walls</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {(
                        [
                            'follow',
                            'member',
                            'first',
                            'blocked-me',
                            'i-blocked',
                            'inactive',
                        ] as const
                    ).map(kind => (
                        <div key={kind} className="rounded-[var(--radius-xl)] bg-(--background)">
                            <ChatWall
                                kind={kind}
                                channel={DEV_CHANNEL as unknown as Channel}
                                onWave={() => undefined}
                            />
                        </div>
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-subheading-strong text-(--text-title)">Loading</h2>
                <div className="w-full max-w-[390px] overflow-hidden rounded-[var(--radius-xl)] bg-(--background-surface)">
                    <ConversationSkeleton count={3} />
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[var(--radius-xl)] bg-(--background-surface) py-8">
                    <ChannelEmptyState
                        art={MESSAGE_ART.empty}
                        title={t('message_empty_title')}
                        body={t('message_empty_body')}
                    />
                </div>
                <div className="rounded-[var(--radius-xl)] bg-(--background-surface) py-8">
                    <ChannelEmptyState
                        art={MESSAGE_ART.noResults}
                        title={t('message_search_empty_title')}
                        body={t('message_search_empty_body')}
                    />
                </div>
            </section>
        </>
    )
}

/**
 * The thread and composer over fixtures. The composer is a stand-in with the real one's shape and
 * local state only — typing, Reply and Edit all work, and nothing is sent.
 */
function ThreadPreview({ now, locale }: { now: number; locale: string }) {
    const messages = threadFixtures(now)
    const [text, setText] = useState('')
    const [replyTo, setReplyTo] = useState<(typeof messages)[number] | null>(null)
    const [editing, setEditing] = useState<(typeof messages)[number] | null>(null)
    const limit = 500
    const composer = {
        text,
        setText,
        limit,
        overLimit: text.trim().length > limit,
        canSend: text.trim() !== '',
        replyTo,
        editing,
        startReply: (m: (typeof messages)[number]) => {
            setEditing(null)
            setReplyTo(m)
        },
        startEdit: (m: (typeof messages)[number]) => {
            setReplyTo(null)
            setEditing(m)
            setText(m.text ?? '')
        },
        cancel: () => {
            setReplyTo(null)
            setEditing(null)
        },
        submit: () => setText(''),
        sendText: () => undefined,
        pending: [],
        retry: () => undefined,
        discard: () => undefined,
        remove: async () => true,
    }

    return (
        <div className="flex h-[640px] w-full max-w-[640px] flex-col overflow-hidden rounded-[var(--radius-xl)] bg-(--background-surface)">
            <ChatHeader channel={DEV_CHANNEL as unknown as Channel} online chatAction="TYPING" />
            <MessageThreadView
                channel={DEV_CHANNEL as unknown as Channel}
                messages={messages}
                pending={[
                    {
                        localId: 'local-1',
                        text: 'On my way…',
                        replyTo: null,
                        createdAt: now,
                        status: 'sending',
                    },
                    {
                        localId: 'local-2',
                        text: 'This one failed',
                        replyTo: null,
                        createdAt: now,
                        status: 'failed',
                    },
                ]}
                isOwn={m => m.sender?.alias === '1'}
                hasOlder={false}
                isFetchingOlder={false}
                loadOlder={() => undefined}
                locale={locale}
                onReply={composer.startReply}
                onEdit={composer.startEdit}
                onDelete={() => undefined}
                onCopy={() => undefined}
                onInline={() => undefined}
                onRetry={() => undefined}
                onDiscard={() => undefined}
            />
            <MessageComposer composer={composer} />
        </div>
    )
}
