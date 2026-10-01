'use client'

import type { Channel } from '@features/channel'
import { ChannelEmptyState } from '@features/channel'
import {
    ChatHeader,
    ChatPopupWindow,
    ChatRoomMenu,
    ChatWall,
    ConnectionStrip,
    ConversationRow,
    ConversationSkeleton,
    DEV_CHANNEL,
    DEV_CONVERSATION,
    DEV_SPACES,
    MESSAGE_ART,
    MessageComposer,
    MessageSettingsDialog,
    MessageThreadView,
    messageFixtures,
    ROOM_GROUND,
    threadFixtures,
    toConversationView,
    useSeedEmbedFixtures,
} from '@features/message/dev'
import { OpenMiniAppButton } from '@features/mini-app'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { type ReactNode, useEffect, useState } from 'react'

/** A committed image, the same one the fixtures use. */
const PHOTO = '/illustrations/no-live-events.png'

/**
 * The interactive half of `/dev/messages` — every state the inbox and a conversation can be in.
 * Nothing is sent: the cards read seeded fixtures (`useSeedEmbedFixtures`), the composer is a local
 * stand-in, and Delete only logs.
 */
export function MessagesPreview() {
    const { t, currentLanguage } = useTranslation()
    const seeded = useSeedEmbedFixtures()
    /* The clock is read after mount: fixtures dated from the server's `Date.now()` would print a
       different "4 min. ago" than the client's and fail hydration. The real list never renders
       rows on the server — there is no SSR bearer — so it has no such problem. */
    const [now, setNow] = useState<number | null>(null)
    useEffect(() => setNow(Date.now()), [])
    if (now === null) return null
    const rows = messageFixtures(now)

    return (
        <>
            <Section title="Rows">
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
            </Section>

            {/* Fixed in the corner, as on a real page, and like the real one only from `md`. Signed
                out it shows its guest state. */}
            <div className="hidden md:contents">
                <ChatPopupWindow />
            </div>

            <Section title="Header — presence and activity">
                <div className="flex w-full max-w-[640px] flex-col gap-2">
                    <HeaderCase label="Online, with the room's menu">
                        <ChatHeader
                            channel={DEV_SPACES.ada}
                            online
                            actions={
                                DEV_CONVERSATION && (
                                    <ChatRoomMenu
                                        channel={DEV_SPACES.ada}
                                        conversation={DEV_CONVERSATION}
                                        name="Ada Lovelace"
                                        onDelete={() => console.info('delete conversation')}
                                    />
                                )
                            }
                        />
                    </HeaderCase>
                    <HeaderCase label="Typing">
                        <ChatHeader channel={DEV_SPACES.ada} online chatAction="TYPING" />
                    </HeaderCase>
                    <HeaderCase label="Sending a photo">
                        <ChatHeader
                            channel={DEV_SPACES.ada}
                            online={false}
                            chatAction="UPLOADING_PHOTO"
                        />
                    </HeaderCase>
                    <HeaderCase label="Offline — the handle">
                        <ChatHeader channel={DEV_SPACES.ada} online={false} />
                    </HeaderCase>
                    <HeaderCase label="Suspended account">
                        <ChatHeader
                            channel={{ ...DEV_SPACES.ada, is_suspended: true }}
                            online={false}
                        />
                    </HeaderCase>
                    <HeaderCase label="Unknown space — the URL's slug">
                        <ChatHeader channel={null} slug="someone" online={false} />
                    </HeaderCase>
                </div>
            </Section>

            <Section title="Message settings">
                <SettingsPreview />
            </Section>

            <Section title="Connection">
                <div className="flex w-full max-w-[640px] flex-col gap-2 overflow-hidden rounded-[var(--radius-xl)]">
                    <ConnectionStrip kind="offline" />
                    <ConnectionStrip kind="connecting" />
                </div>
            </Section>

            <Section title="Conversation">
                {seeded ? (
                    <ThreadPreview now={now} locale={currentLanguage} />
                ) : (
                    <div className="h-[640px] w-full max-w-[640px] rounded-[var(--radius-xl)] bg-(--background-surface)" />
                )}
            </Section>

            <Section title="Walls">
                <div className="grid gap-4 md:grid-cols-2">
                    {(
                        [
                            'follow',
                            'member',
                            'first',
                            'blocked-me',
                            'i-blocked',
                            'inactive',
                            'unpublished',
                        ] as const
                    ).map(kind => (
                        <div key={kind} className="rounded-[var(--radius-xl)] bg-(--background)">
                            <ChatWall
                                kind={kind}
                                channel={DEV_CHANNEL as unknown as Channel}
                                onWave={() => undefined}
                                onDeleteConversation={() => console.info('delete conversation')}
                            />
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Loading">
                <div className="w-full max-w-[390px] overflow-hidden rounded-[var(--radius-xl)] bg-(--background-surface)">
                    <ConversationSkeleton count={3} />
                </div>
            </Section>

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

function SettingsPreview() {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-fit rounded-(--radius-fill) bg-(--background-surface) px-3 py-1 type-dense-strong text-(--text-title)"
            >
                Open message settings
            </button>
            <MessageSettingsDialog open={open} onOpenChange={setOpen} />
        </>
    )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h2 className="type-subheading-strong text-(--text-title)">{title}</h2>
            {children}
        </section>
    )
}

function HeaderCase({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="type-caption-meta text-(--text-body)">{label}</span>
            <div className="overflow-hidden rounded-[var(--radius-lg)]">{children}</div>
        </div>
    )
}

type Pending = Parameters<typeof MessageThreadView>[0]['pending'][number]

/** The two widths a conversation is drawn at: the 390px floating window, and the page's pane. */
const WIDTHS = [
    { id: 390, label: 'Popup · 390' },
    { id: 640, label: 'Page · 640' },
] as const

/**
 * The thread and composer over fixtures. The composer is a stand-in with the real one's shape and
 * local state only — typing, Reply and Edit work, the paperclip opens the real photo sheet, and a
 * send from the sheet lands in the thread as a pending photo message.
 */
function ThreadPreview({ now, locale }: { now: number; locale: string }) {
    const messages = threadFixtures(now)
    const [width, setWidth] = useState<(typeof WIDTHS)[number]['id']>(640)
    /* Ada's space, or one that is a mini app — the room then carries the app's Open button. */
    const [spaceSlug, setSpaceSlug] = useState<keyof typeof DEV_SPACES>('ada')
    const space = DEV_SPACES[spaceSlug]
    const [text, setText] = useState('')
    const [replyTo, setReplyTo] = useState<(typeof messages)[number] | null>(null)
    const [editing, setEditing] = useState<(typeof messages)[number] | null>(null)
    const [sent, setSent] = useState<Pending[]>([])
    const limit = 1000

    /* One of each pending state: text sending and failed, photos uploading and failed. */
    const pending: Pending[] = [
        {
            localId: 'local-1',
            text: 'On my way…',
            replyTo: null,
            createdAt: now,
            status: 'sending',
            files: [],
            previews: [],
        },
        {
            localId: 'local-2',
            text: 'This one failed',
            replyTo: null,
            createdAt: now,
            status: 'failed',
            files: [],
            previews: [],
        },
        {
            localId: 'local-3',
            text: 'Uploading three photos',
            replyTo: null,
            createdAt: now,
            status: 'sending',
            files: [],
            previews: [PHOTO, PHOTO, PHOTO],
        },
        {
            localId: 'local-4',
            text: '',
            replyTo: null,
            createdAt: now,
            status: 'failed',
            files: [],
            previews: [PHOTO],
        },
        ...sent,
    ]

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
        sendPhotos: (files: File[], caption: string) =>
            setSent(list => [
                ...list,
                {
                    localId: `local-sent-${list.length}`,
                    text: caption,
                    replyTo,
                    createdAt: Date.now(),
                    status: 'sending',
                    files,
                    previews: files.map(file => URL.createObjectURL(file)),
                },
            ]),
        setAttaching: (attaching: boolean) => console.info('UPLOADING_PHOTO', attaching),
        onBlur: () => undefined,
        pending,
        retry: () => undefined,
        discard: () => undefined,
        remove: async () => true,
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
                {(
                    [
                        { id: 'ada', label: 'Space · Ada' },
                        { id: 'arcade', label: 'Mini app · Arcade' },
                    ] as const
                ).map(option => (
                    <button
                        key={option.id}
                        type="button"
                        aria-pressed={spaceSlug === option.id}
                        onClick={() => setSpaceSlug(option.id)}
                        className={cn(
                            'rounded-(--radius-fill) px-3 py-1 type-dense-strong',
                            spaceSlug === option.id
                                ? 'bg-(--text-link) text-(--text-on-accent)'
                                : 'bg-(--background-surface) text-(--text-title)',
                        )}
                    >
                        {option.label}
                    </button>
                ))}
                {WIDTHS.map(option => (
                    <button
                        key={option.id}
                        type="button"
                        aria-pressed={width === option.id}
                        onClick={() => setWidth(option.id)}
                        className={cn(
                            'rounded-(--radius-fill) px-3 py-1 type-dense-strong',
                            width === option.id
                                ? 'bg-(--text-link) text-(--text-on-accent)'
                                : 'bg-(--background-surface) text-(--text-title)',
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <div
                className="@container flex h-[640px] max-w-full flex-col overflow-hidden rounded-[var(--radius-xl)] bg-(--background-surface)"
                style={{ ...ROOM_GROUND, width }}
            >
                <ChatHeader channel={space} online chatAction="TYPING" />
                <MessageThreadView
                    channel={space}
                    messages={messages}
                    pending={pending}
                    unreadFrom="l1"
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
                <MessageComposer
                    composer={composer}
                    leading={
                        <OpenMiniAppButton
                            channel={space}
                            size="medium"
                            iconOnly={text.trim() !== ''}
                            className="mb-1 flex-none"
                        />
                    }
                />
            </div>
        </div>
    )
}
