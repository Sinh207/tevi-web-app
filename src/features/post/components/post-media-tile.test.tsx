// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePost, type Post } from '../api/types'

/**
 * A Media tile is a picture that does one of **three** things when pressed, and every one of them
 * looks the same before the press. The claim worth pinning is which one — a tile that opened the
 * lightbox on a sensitive post would show the reader, sharp, the thing their setting hides.
 *
 * Auth, the router, the unlock flow and the lightbox are mocked: what is under test is the tile's
 * routing between them, and each of those has its own tests.
 */

const auth = { signedIn: true }
const openLogin = vi.fn()
const push = vi.fn()
const unlockPress = vi.fn()

vi.mock('@features/auth', () => ({
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!auth.signedIn) {
                openLogin()
                return
            }
            cb(...args)
        },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('../hooks/use-post-unlock', () => ({
    usePostUnlock: () => ({ press: unlockPress, step: 'idle', price: null }),
}))
vi.mock('./post-unlock-dialogs', () => ({ PostUnlockDialogs: () => null }))
vi.mock('./post-media-lightbox', () => ({
    PostMediaLightbox: ({ video }: { video: unknown }) => (
        <div data-testid="lightbox" data-video={video ? 'yes' : 'no'} />
    ),
}))

const { PostMediaTile } = await import('./post-media-tile')

function post(overrides: Record<string, unknown>): Post {
    const parsed = normalizePost({
        id: 'p1',
        shareable_url: 'https://tevi.com/@alice/post/abc',
        channel: { id: '1', slug: 'alice' },
        ...overrides,
    })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

const IMAGE = { images: [{ uri: 'https://cdn/a.jpg' }] }

function press() {
    fireEvent.click(screen.getByTestId('post-media-tile'))
}

beforeEach(() => {
    auth.signedIn = true
    openLogin.mockClear()
    push.mockClear()
    unlockPress.mockClear()
})
afterEach(cleanup)

describe('PostMediaTile', () => {
    it('is an anchor to the post, so the grid stays crawlable', () => {
        render(<PostMediaTile post={post(IMAGE)} />)
        expect(screen.getByTestId('post-media-tile').getAttribute('href')).toBe('/@alice/post/abc')
    })

    it('opens the lightbox on an open post, without navigating', () => {
        render(<PostMediaTile post={post(IMAGE)} />)
        press()
        expect(screen.getByTestId('lightbox').dataset.video).toBe('no')
        expect(push).not.toHaveBeenCalled()
    })

    it('opens the clip when the post has a video and no images', () => {
        render(
            <PostMediaTile post={post({ video: { playback: { hls: 'https://cdn/v.m3u8' } } })} />,
        )
        press()
        expect(screen.getByTestId('lightbox').dataset.video).toBe('yes')
    })

    it('asks a guest to sign in instead', () => {
        auth.signedIn = false
        render(<PostMediaTile post={post(IMAGE)} />)
        press()
        expect(openLogin).toHaveBeenCalledOnce()
        expect(screen.queryByTestId('lightbox')).toBeNull()
    })

    it('runs the unlock flow on a locked post', () => {
        render(
            <PostMediaTile
                post={post({
                    product_id: 'prod-1',
                    price: 10,
                    viewer: 'STARGAZERS',
                    need_unlock_package: true,
                })}
            />,
        )
        press()
        expect(unlockPress).toHaveBeenCalledOnce()
        expect(screen.queryByTestId('lightbox')).toBeNull()
    })

    /**
     * The divergence from legacy, which opens its slide viewer here. The reader's sensitive-content
     * setting is applied on the post page and nowhere in a grid cell.
     */
    it('sends a sensitive post to its page rather than showing it', () => {
        render(<PostMediaTile post={post({ ...IMAGE, marked_nsfw: true })} />)
        press()
        expect(push).toHaveBeenCalledWith('/@alice/post/abc')
        expect(screen.queryByTestId('lightbox')).toBeNull()
    })

    it('leaves a modified press to the browser', () => {
        render(<PostMediaTile post={post(IMAGE)} />)
        fireEvent.click(screen.getByTestId('post-media-tile'), { metaKey: true })
        expect(screen.queryByTestId('lightbox')).toBeNull()
    })
})
