// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { normalizePost } from '../api/types'
import { PostConversationProvider } from '../lib/author-conversation'

/**
 * *Send message* opens a conversation with the **post's space** — legacy's `BtnSendMain` — through
 * the slot `app/` fills with `features/message`'s `useOpenConversation`. Pinned here because the
 * slot is the whole wiring: without a provider the button must stay visibly unavailable rather than
 * swallow a press, and an owner must not be offered a conversation with themselves.
 */

vi.mock('@shared/components/lottie-animation', () => ({
    LottieAnimation: () => null,
    preloadLottie: () => {},
}))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))
vi.mock('@shared/lib/remote-config', () => ({
    useWebConfig: () => ({ post: { createPost: { quote: { isActive: false } } } }),
}))
vi.mock('../hooks/use-post-reaction', () => ({
    usePostReaction: () => ({ reacted: false, count: 0, toggle: () => {}, isPending: false }),
}))
vi.mock('../hooks/use-post-bookmark', () => ({
    usePostBookmark: () => ({ bookmarked: false, toggle: () => {}, isPending: false }),
}))

const { PostActions } = await import('./post-actions')

function post(overrides: Record<string, unknown> = {}) {
    const parsed = normalizePost({
        id: '1',
        channel: { id: 7, slug: 'ada' },
        reply_allowed: true,
        can_reply: true,
        ...overrides,
    })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

const send = () => document.querySelector<HTMLButtonElement>('[data-testid="post-card-submit"]')

describe('PostActions — Send message', () => {
    it('opens a conversation with the post’s space', () => {
        const open = vi.fn()
        render(
            <PostConversationProvider open={open}>
                <PostActions post={post()} testId="post-card" />
            </PostConversationProvider>,
        )
        expect(send()?.disabled).toBe(false)
        fireEvent.click(send() as HTMLButtonElement)
        expect(open).toHaveBeenCalledWith('ada')
    })

    it('stays drawn and disabled where nothing provides a conversation', () => {
        render(<PostActions post={post()} testId="post-card" />)
        expect(send()?.disabled).toBe(true)
    })

    it('is not offered on the reader’s own post', () => {
        render(
            <PostConversationProvider open={vi.fn()}>
                <PostActions post={post({ is_owner: true })} testId="post-card" />
            </PostConversationProvider>,
        )
        expect(send()).toBeNull()
    })
})
