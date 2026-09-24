// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { eventDetailSchema } from '../api/types'
import type { LiveChatState } from '../hooks/use-live-chat'
import type { LiveChatLine } from '../lib/live-message'
import { EventStudioChat, EventStudioChatStrip } from './event-studio-chat'

/**
 * **The two pieces of this column that only exist because of where the reader is scrolled.**
 *
 * The `16 new comments` pill — the comps' `Chat/Type7` — is the one variant of the twelve that a
 * fixture cannot show: it appears only for somebody who has scrolled *away* from the bottom while
 * the room kept talking, so `/dev/event` renders it exactly never however many lines are pushed in.
 * That is why it was missing for two revisions and why it is pinned here instead.
 *
 * jsdom lays nothing out, so `scrollHeight` / `clientHeight` are both 0 and every element reads as
 * "at the bottom". The geometry is therefore stubbed on the node — which is honest for this
 * assertion, because what is under test is the **arithmetic** (`lines.length - seenCount`) and its
 * reset, not the browser's scrolling.
 */
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) =>
            vars?.formatted ? `${vars.formatted} ${key}` : key,
    }),
}))

const event = eventDetailSchema.parse({ code: 'e1', status: 'LIVE', channel: { slug: 'ada' } })

const line = (text: string): LiveChatLine => ({
    kind: 'comment',
    user: { name: 'Ada' } as never,
    text,
    isMember: false,
})

function baseChat(lines: LiveChatLine[]): LiveChatState {
    return {
        lines,
        ccu: 12,
        canSend: true,
        isConnected: true,
        isSending: false,
        isBlocked: false,
        arrival: null,
        topStars: [],
        isLoadingTopStars: false,
        topStarsSelfIndex: -1,
        pinned: null,
        dismissPinned: () => {},
        justMuted: false,
        isChatOff: false,
        errorKey: null,
        chargedAt: null,
        send: async () => {},
    }
}

/**
 * Put the list somewhere other than the bottom, and tell React about it.
 *
 * `act` matters here rather than being ceremony: the handler's state update is not flushed until
 * something makes React work, so a scroll with no `rerender` after it asserts against the
 * *previous* render. That read as "scrolling back down does not clear the pill" — a product bug
 * that was not there.
 */
function scrollTo(offsetFromBottom: number) {
    const node = screen.getByTestId('event-studio-chat-list')
    Object.defineProperty(node, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(node, 'clientHeight', { value: 400, configurable: true })
    act(() => {
        node.scrollTop = 600 - offsetFromBottom
        node.dispatchEvent(new Event('scroll'))
    })
}

describe('the new-comments pill', () => {
    it('is absent while the reader is at the bottom', () => {
        const { rerender } = render(<EventStudioChat event={event} chat={baseChat([line('a')])} />)
        rerender(<EventStudioChat event={event} chat={baseChat([line('a'), line('b')])} />)
        expect(screen.queryByTestId('event-studio-chat-jump')).toBeNull()
    })

    it('counts what arrived after the reader scrolled away', () => {
        const { rerender } = render(<EventStudioChat event={event} chat={baseChat([line('a')])} />)
        scrollTo(300)
        rerender(
            <EventStudioChat event={event} chat={baseChat([line('a'), line('b'), line('c')])} />,
        )
        expect(screen.getByTestId('event-studio-chat-jump').textContent).toBe(
            '2 event_studio_chat_new_comments',
        )
    })

    /**
     * ⚠ The count is **since the reader left the bottom**, not since the column mounted. Counting
     * from mount would show a number that never stops growing for somebody reading back through a
     * long broadcast.
     */
    it('clears when the reader scrolls back down', () => {
        const { rerender } = render(<EventStudioChat event={event} chat={baseChat([line('a')])} />)
        scrollTo(300)
        rerender(<EventStudioChat event={event} chat={baseChat([line('a'), line('b')])} />)
        expect(screen.queryByTestId('event-studio-chat-jump')).not.toBeNull()

        scrollTo(0)
        expect(screen.queryByTestId('event-studio-chat-jump')).toBeNull()
    })

    /* 24px of slack: one line from the bottom is still the bottom. */
    it('treats a reader just short of the bottom as being at it', () => {
        const { rerender } = render(<EventStudioChat event={event} chat={baseChat([line('a')])} />)
        scrollTo(10)
        rerender(<EventStudioChat event={event} chat={baseChat([line('a'), line('b')])} />)
        expect(screen.queryByTestId('event-studio-chat-jump')).toBeNull()
    })
})

/**
 * The header is one row in the comps, and drew as two here for two revisions — a `Live chat`
 * title, a `settings` gear and a `#666` rule, all three read off a `visible: false` group that an
 * earlier revision of the design had already deleted.
 */
describe('the header', () => {
    it('draws no title, no gear and no rule', () => {
        render(<EventStudioChat event={event} chat={baseChat([])} />)
        expect(screen.queryByTestId('event-studio-chat-settings')).toBeNull()
        expect(screen.queryByText('event_studio_chat_title')).toBeNull()
    })

    it('offers no collapse control unless the stage owns one', () => {
        const { rerender } = render(<EventStudioChat event={event} chat={baseChat([])} />)
        expect(screen.queryByTestId('event-studio-chat-collapse')).toBeNull()

        rerender(<EventStudioChat event={event} chat={baseChat([])} onCollapse={() => {}} />)
        expect(screen.queryByTestId('event-studio-chat-collapse')).not.toBeNull()
    })

    /* `Header/No data` is a state, not a blank — it was drawing nothing at all. */
    it('prompts for the first gift when the board is empty, and skeletons before it is known', () => {
        const { rerender } = render(<EventStudioChat event={event} chat={baseChat([])} />)
        expect(screen.queryByTestId('event-studio-leaderboard-empty')).not.toBeNull()

        rerender(
            <EventStudioChat event={event} chat={{ ...baseChat([]), isLoadingTopStars: true }} />,
        )
        expect(screen.queryByTestId('event-studio-leaderboard-loading')).not.toBeNull()
        expect(screen.queryByTestId('event-studio-leaderboard-empty')).toBeNull()
    })
})

/**
 * **The composer, and the three things it says without being asked.**
 *
 * The placeholder is the only channel this field has: it is disabled in four different situations
 * and looks identical in all of them. Two of legacy's five sentences were missing, and the one
 * that mattered was `Connecting...` — a reader whose socket has not come up otherwise sees an
 * inert box still inviting a message.
 */
describe('the composer', () => {
    it('stops at the 250 characters legacy stops at', () => {
        render(<EventStudioChat event={event} chat={baseChat([])} />)
        expect(screen.getByTestId('event-studio-chat-input').getAttribute('maxlength')).toBe('250')
    })

    it('says which refusal it is, in the order they outrank each other', () => {
        const base = baseChat([])
        const { rerender } = render(<EventStudioChat event={event} chat={base} />)
        const field = () => screen.getByTestId('event-studio-chat-input')
        expect(field().getAttribute('placeholder')).toBe('event_studio_chat_placeholder')

        rerender(
            <EventStudioChat
                event={event}
                chat={{ ...base, isConnected: false, canSend: false }}
            />,
        )
        expect(field().getAttribute('placeholder')).toBe('event_studio_chat_connecting')

        rerender(<EventStudioChat event={event} chat={{ ...base, isSending: true }} />)
        expect(field().getAttribute('placeholder')).toBe('event_studio_chat_sending')

        // A muted reader outranks a wire that is down: the wire will come back and the mute
        // will not.
        rerender(
            <EventStudioChat
                event={event}
                chat={{ ...base, isConnected: false, isBlocked: true }}
            />,
        )
        expect(field().getAttribute('placeholder')).toBe('event_studio_chat_blocked')
    })
})

/**
 * **`Right menu/Type=Ended`.** The header goes, the composer is replaced by a disabled pill, and
 * the transcript stays — the one deliberate departure from the frame, which hides that too.
 */
describe('once the broadcast has ended', () => {
    it('drops the header and the composer for the pill, and keeps what was said', () => {
        render(<EventStudioChat event={event} chat={baseChat([line('bye')])} hasEnded />)

        expect(screen.queryByTestId('event-studio-chat-ended')).not.toBeNull()
        expect(screen.queryByTestId('event-studio-chat-input')).toBeNull()
        expect(screen.queryByTestId('event-studio-ccu')).toBeNull()
        expect(screen.queryByTestId('event-studio-leaderboard-empty')).toBeNull()
        expect(screen.queryByText('bye')).not.toBeNull()
    })
})

/** `Header/Active=False, Type=Colapse` — the other half of the fold, which had no half at all. */
describe('the folded strip', () => {
    it('keeps counting while the column is away', () => {
        render(
            <EventStudioChatStrip
                event={event}
                chat={{ ...baseChat([]), ccu: 7500 }}
                onExpand={() => {}}
            />,
        )
        expect(screen.getByTestId('event-studio-chat-strip-ccu').textContent).toBe('7.5k')
        expect(screen.queryByTestId('event-studio-chat-expand')).not.toBeNull()
    })
})
