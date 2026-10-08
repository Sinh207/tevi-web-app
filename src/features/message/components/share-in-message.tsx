'use client'

import { useAuth } from '@features/auth'
import type { ShareInMessageProps } from '@features/share'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { ScrollRow } from '@shared/components/scroll-row'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { VERIFIED_BADGE_CROWN } from '@shared/components/verified-badge-size'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Icon } from '@shared/ui/icon'
import { SearchBar } from '@shared/ui/search-bar'
import { Skeleton } from '@shared/ui/skeleton'
import {
    type KeyboardEvent,
    type ReactNode,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { CONVERSATION_FILTER, type Conversation } from '../api/types'
import { useConversationSearch } from '../hooks/use-conversation-search'
import { useConversations } from '../hooks/use-conversations'
import { type UseShareInMessageResult, useShareInMessage } from '../hooks/use-share-in-message'
import { type ConversationView, toConversationView } from '../lib/conversation-view'
import { DISC } from '../lib/disc'

/** Four lines of `type-body-default` plus the field's padding — the chat composer's bound. */
const MAX_FIELD_PX = 4 * 24 + 16

/**
 * A conversation that can receive a share: the other side still has an account, and neither side
 * has blocked the other. Legacy web filters inactive accounts out of its search; the apps filter
 * nothing and let the send fail. A recipient the reader can see but never reach is a toast waiting
 * to happen, so both are dropped here — the server still decides, this only stops offering the
 * ones it is certain to refuse.
 */
function sendable(conversation: Conversation): ConversationView | null {
    const view = toConversationView(conversation)
    return view.active && !view.blocked ? view : null
}

function sendableRows(rows: Conversation[]) {
    const out: { conversation: Conversation; view: ConversationView }[] = []
    for (const conversation of rows) {
        const view = sendable(conversation)
        if (view) out.push({ conversation, view })
    }
    return out
}

/**
 * "Send in message" — the share sheet's middle block, and its "Send to" step.
 *
 * Built here and handed to `features/share` through its slot (`lib/share-in-message.tsx` there
 * says why it cannot be an import). One component for both views, kept mounted by the sheet, so
 * the selection and the typed text carry over from the row to the search and back.
 *
 * **Real accounts only.** A guest has no inbox: nothing is fetched and nothing is drawn, and the
 * sheet is exactly what it was before this block existed.
 *
 * What it lists is the inbox the reader already has — `get_recent_conversations` for the row,
 * `search_conversation` for the step — under the same query keys `/messages` uses, so opening the
 * sheet after the inbox costs no request. None of the three clients can start a conversation from
 * here, and this one does not either: `start_conversation_with` is a space page's decision, with
 * its walls (`ChatWall`), not something to run silently for a share.
 */
export function ShareInMessage(props: ShareInMessageProps) {
    const { isAuthenticated } = useAuth()
    if (!isAuthenticated) return null
    return <ShareInMessageBody {...props} />
}

function ShareInMessageBody({
    view,
    onExpand,
    resolveLink,
    onSent,
    testScope: testId,
}: ShareInMessageProps) {
    const share = useShareInMessage({ resolveLink, onSent })
    const [text, setText] = useState('')

    const composer =
        share.selected.length > 0 ? (
            <ShareComposer
                text={text}
                onTextChange={setText}
                share={share}
                testId={testId}
                onSend={async () => {
                    // The text stays when nothing was delivered, so the same press can be repeated.
                    if (await share.send(text)) setText('')
                }}
            />
        ) : null

    return view === 'picker' ? (
        <PickerView share={share} composer={composer} testId={testId} />
    ) : (
        <RowView share={share} composer={composer} onExpand={onExpand} testId={testId} />
    )
}

/**
 * The block in the sheet: a heading, a "More" disc, the recent conversations as discs, and — once
 * one is picked — the message box.
 *
 * Legacy's geometry: a 64px column per conversation, a 48px avatar (legacy draws 45) with the
 * indigo tick at its bottom-end corner, the name and the handle under it. The row is a **scrolling
 * row**, not a carousel (`docs/DESIGN_SYSTEM.md` §10), on `ScrollRow`, which carries the arrows
 * legacy's Swiper drew.
 *
 * Draws nothing at all — not even the heading — when the inbox is empty or will not load: there is
 * nothing to pick, and "More" would open a search over nothing. iOS hides its row the same way.
 */
function RowView({
    share,
    composer,
    onExpand,
    testId,
}: {
    share: UseShareInMessageResult
    composer: ReactNode
    onExpand: () => void
    testId: string
}) {
    const { t } = useTranslation()
    const list = useConversations(CONVERSATION_FILTER.all)
    const rows = sendableRows(list.conversations)

    if (list.isError || (!list.isLoading && rows.length === 0)) return null

    return (
        <section data-testid={testId} aria-label={t('share_send_in_message')} className="contents">
            <div className="flex flex-col gap-3 pt-4 pb-3">
                <h3 className="type-dense-strong m-0 px-4 text-(--text-title)">
                    {t('share_send_in_message')}
                </h3>
                <ScrollRow
                    count={rows.length + 1}
                    label={t('share_send_in_message')}
                    arrowTop="24px"
                    trackClassName="snap-x scroll-px-4 items-start gap-4 px-4"
                >
                    <li className="flex-none snap-start">
                        <button
                            type="button"
                            data-testid={subTestId(testId, 'search')}
                            onClick={onExpand}
                            className={discButtonClass}
                        >
                            <span className="flex size-12 items-center justify-center rounded-full bg-(--background-segment) text-(--icon-default)">
                                <Icon name="search" size={24} aria-hidden />
                            </span>
                            <span className="type-caption-meta text-center text-(--text-subtitle)">
                                {t('share_more')}
                            </span>
                        </button>
                    </li>
                    {list.isLoading
                        ? Array.from({ length: 5 }, (_, index) => `share-disc-${index}`).map(
                              key => (
                                  <li
                                      key={key}
                                      className="flex w-16 flex-none flex-col items-center gap-1"
                                  >
                                      <Skeleton w={48} h={48} className="rounded-full" />
                                      <Skeleton w={48} h={12} />
                                  </li>
                              ),
                          )
                        : rows.map(({ conversation, view }) => {
                              const picked = share.isSelected(conversation.id)
                              return (
                                  <li key={conversation.id} className="flex-none snap-start">
                                      <button
                                          type="button"
                                          data-testid={subTestId(testId, 'item')}
                                          data-conversation-id={conversation.id}
                                          aria-pressed={picked}
                                          disabled={share.isSending}
                                          onClick={() => share.toggle(conversation)}
                                          className={discButtonClass}
                                      >
                                          <span className="relative flex">
                                              <AnimatedAvatar
                                                  size="large"
                                                  thumb={view.thumb}
                                                  avatarVideo={view.avatarVideo}
                                                  isPremium={view.premium}
                                                  alt=""
                                                  initials={initialsOf(view)}
                                                  className={cn(
                                                      picked &&
                                                          'ring-2 ring-(--accents-indigo-active)',
                                                  )}
                                              />
                                              {picked && <PickedTick />}
                                          </span>
                                          <span className="flex w-full min-w-0 flex-col items-center">
                                              <span className="type-caption-meta w-full truncate text-center text-(--text-title)">
                                                  {view.name}
                                              </span>
                                              <span className="type-caption-meta w-full truncate text-center text-(--text-subtitle)">
                                                  @{view.slug}
                                              </span>
                                          </span>
                                      </button>
                                  </li>
                              )
                          })}
                </ScrollRow>
            </div>
            {composer}
            {/* The slab under this block — drawn here because only this block knows it drew. */}
            <div className="h-1 flex-none bg-(--background-segment)" aria-hidden />
        </section>
    )
}

const discButtonClass = cn(
    'flex w-16 cursor-pointer flex-col items-center gap-1 rounded-(--radius-md) border-0 bg-transparent p-0',
    'transition-opacity duration-150 hover:opacity-85 disabled:cursor-default disabled:opacity-60',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
)

/** Legacy's 18px indigo disc with a check, over the avatar's bottom-end corner. */
function PickedTick() {
    return (
        <span className="absolute -bottom-0.5 -end-0.5 flex size-[18px] items-center justify-center rounded-full border border-solid border-(--background-surface) bg-(--accents-indigo-active) text-white">
            <Icon name="check" size={16} className="size-3" aria-hidden />
        </span>
    )
}

function initialsOf(view: ConversationView) {
    return view.name ? view.name.slice(0, 2).toUpperCase() : undefined
}

/**
 * The "Send to" step: a search over the reader's conversations, the list with a checkbox per row,
 * and the message box pinned under it once something is picked.
 *
 * One list rather than legacy's two (a "Selected" strip above a "Send to" list that drops whatever
 * is picked): a row that jumps out of the list when pressed is a row the reader has to find again to
 * undo, and both apps keep it in place with a tick. The selection is still the sheet's one, so what
 * was picked in the row is checked here.
 */
function PickerView({
    share,
    composer,
    testId,
}: {
    share: UseShareInMessageResult
    composer: ReactNode
    testId: string
}) {
    const { t } = useTranslation()
    const list = useConversations(CONVERSATION_FILTER.all)
    const search = useConversationSearch()

    const searching = !search.isIdle
    const rows = sendableRows(searching ? search.results : list.conversations)
    const isLoading = searching ? search.isLoading : list.isLoading
    const isError = searching ? search.isError : list.isError

    const { hasNextPage, isFetchingNextPage, loadMore } = list
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        rootMargin: '200px',
        enabled: !searching && hasNextPage && !isFetchingNextPage,
    })
    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    return (
        <section data-testid={subTestId(testId, 'panel')} className="flex min-h-0 flex-col">
            <div className="p-4 pb-2">
                <SearchBar
                    data-testid={subTestId(testId, 'input')}
                    value={search.search}
                    onValueChange={search.setSearch}
                    label={t('share_search_conversations')}
                    clearLabel={t('message_search_clear')}
                />
            </div>

            <div className="min-h-[240px] flex-1">
                {isLoading ? (
                    <ul className="m-0 list-none p-0" aria-busy="true">
                        {Array.from({ length: 6 }, (_, index) => `share-row-${index}`).map(key => (
                            <li key={key} className="flex items-center gap-3 px-4 py-2">
                                <Skeleton w={48} h={48} className="flex-none rounded-full" />
                                <span className="flex flex-col gap-1.5">
                                    <Skeleton w={140} h={14} />
                                    <Skeleton w={90} h={12} />
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : isError ? (
                    <PickerNote
                        title={t('message_error_title')}
                        body={t('message_error_body')}
                        action={
                            <Button
                                data-testid={subTestId(testId, 'retry')}
                                variant="secondary"
                                size="small"
                                onClick={() => (searching ? search.retry() : list.refetch())}
                            >
                                {t('common_retry')}
                            </Button>
                        }
                    />
                ) : rows.length === 0 ? (
                    searching ? (
                        <PickerNote
                            title={t('message_search_empty_title')}
                            body={t('message_search_empty_body')}
                        />
                    ) : (
                        <PickerNote title={t('share_no_conversations')} />
                    )
                ) : (
                    <ul data-testid={subTestId(testId, 'list')} className="m-0 list-none p-0 pb-2">
                        {rows.map(({ conversation, view }) => (
                            <li key={conversation.id}>
                                <PickerRow
                                    view={view}
                                    picked={share.isSelected(conversation.id)}
                                    disabled={share.isSending}
                                    onToggle={() => share.toggle(conversation)}
                                    testId={subTestId(testId, 'option')}
                                    conversationId={conversation.id}
                                />
                            </li>
                        ))}
                        {!searching && hasNextPage && <div ref={sentinelRef} className="h-px" />}
                    </ul>
                )}
            </div>

            {composer && (
                <div className="sticky bottom-0 z-10 bg-(--background-surface)">{composer}</div>
            )}
        </section>
    )
}

/**
 * One conversation in the picker — a `<label>` round a checkbox, so the whole band toggles it and a
 * screen reader hears a checkbox named after the space.
 */
function PickerRow({
    view,
    picked,
    disabled,
    onToggle,
    testId,
    conversationId,
}: {
    view: ConversationView
    picked: boolean
    disabled: boolean
    onToggle: () => void
    testId?: string
    conversationId: string
}) {
    const id = useId()
    return (
        <label
            htmlFor={id}
            className={cn(
                'flex cursor-pointer items-center gap-3 px-4 py-2',
                'transition-colors duration-150 hover:bg-(--background-segment)',
                disabled && 'cursor-default opacity-60',
            )}
        >
            <AnimatedAvatar
                size="large"
                thumb={view.thumb}
                avatarVideo={view.avatarVideo}
                isPremium={view.premium}
                alt=""
                initials={initialsOf(view)}
            />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1">
                    <span className="type-dense-strong truncate text-(--text-title)">
                        {view.name}
                    </span>
                    <VerifiedBadge image={view.verifiedImage} size="dense" />
                    {view.premium && (
                        <PremiumBadge size={VERIFIED_BADGE_CROWN.dense} className="flex-none" />
                    )}
                </span>
                <span className="type-caption-meta truncate text-(--text-subtitle)">
                    @{view.slug}
                </span>
            </span>
            <Checkbox
                id={id}
                variant="rounded"
                checked={picked}
                disabled={disabled}
                onChange={onToggle}
                data-testid={testId}
                data-conversation-id={conversationId}
            />
        </label>
    )
}

function PickerNote({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p className="type-body-strong m-0 text-(--text-title)">{title}</p>
            {body && (
                <p className="type-dense-default m-0 max-w-[400px] text-(--text-subtitle)">
                    {body}
                </p>
            )}
            {action}
        </div>
    )
}

/**
 * The message box and Send — legacy's grey band with a white pill and a white Send disc.
 *
 * Enter sends and Shift+Enter is a new line, except while an IME is composing (Telex, Pinyin and
 * Hangul commit a candidate with Enter) — the chat composer's rule, for the same reason.
 *
 * The limit is the chat's own (`directMessage.limitCharacters`), counted on what the reader typed:
 * the link is appended after, and is not theirs to shorten. Past it the counter goes red and Send
 * holds, rather than the text being cut — the chat composer's rule too.
 */
function ShareComposer({
    text,
    onTextChange,
    share,
    onSend,
    testId,
}: {
    text: string
    onTextChange: (value: string) => void
    share: UseShareInMessageResult
    onSend: () => void
    testId: string
}) {
    const { t } = useTranslation()
    const limit = useWebConfig().directMessage.limitCharacters
    const field = useRef<HTMLTextAreaElement>(null)
    const length = text.trim().length
    const overLimit = length > limit
    const canSend = !share.isSending && !overLimit

    // biome-ignore lint/correctness/useExhaustiveDependencies: `text` is the trigger — the effect measures the DOM the new text produced.
    useLayoutEffect(() => {
        const node = field.current
        if (!node) return
        node.style.height = 'auto'
        node.style.height = `${Math.min(node.scrollHeight, MAX_FIELD_PX)}px`
    }, [text])

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        if (canSend) onSend()
    }

    return (
        <div className="flex items-end gap-3 bg-(--background-segment) px-4 py-3">
            <div
                className={cn(
                    'flex min-w-0 flex-1 flex-col rounded-(--radius-lg) bg-(--background-surface) px-4',
                    overLimit && 'ring-1 ring-(--text-error)',
                )}
            >
                <textarea
                    ref={field}
                    data-testid={subTestId(testId, 'message')}
                    rows={1}
                    value={text}
                    onChange={event => onTextChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={t('message_composer_placeholder')}
                    aria-label={t('message_composer_placeholder')}
                    aria-invalid={overLimit || undefined}
                    className="block max-h-[112px] min-w-0 resize-none overflow-y-auto border-0 bg-transparent py-3 type-body-default text-(--text-title) outline-none [field-sizing:content] placeholder:text-(--text-placeholder)"
                />
                {length > limit * 0.9 && (
                    <span
                        role={overLimit ? 'alert' : undefined}
                        className={cn(
                            '-mt-1 self-end pb-1 type-caption-meta',
                            overLimit ? 'text-(--text-error)' : 'text-(--text-placeholder)',
                        )}
                    >
                        {overLimit ? t('message_limit_exceeded', { limit }) : `${length}/${limit}`}
                    </span>
                )}
            </div>
            <Button
                data-testid={subTestId(testId, 'submit')}
                variant="ghost"
                size="large"
                iconOnly
                disabled={!canSend}
                aria-busy={share.isSending || undefined}
                aria-label={t('message_send')}
                onClick={onSend}
                className={cn(DISC, 'mb-0.5 size-11 flex-none shadow-none')}
            >
                <Icon name="send" weight="filled" size={24} className="size-6 rtl:-scale-x-100" />
            </Button>
        </div>
    )
}
