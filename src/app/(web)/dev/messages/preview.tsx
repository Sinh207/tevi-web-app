'use client'

import { ChannelEmptyState } from '@features/channel'
import {
    ConversationRow,
    ConversationSkeleton,
    MESSAGE_ART,
    messageFixtures,
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
