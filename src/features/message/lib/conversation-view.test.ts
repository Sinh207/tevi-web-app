import { describe, expect, it } from 'vitest'
import { normalizeConversations } from '../api/types'
import { htmlToPreviewText, ONLINE_WINDOW_MS, toConversationView } from './conversation-view'

const NOW = Date.UTC(2026, 8, 28, 12)

function view(raw: Record<string, unknown>) {
    const [conversation] = normalizeConversations([{ id: 'c1', ...raw }])
    return toConversationView(conversation, NOW)
}

const recipient = {
    id: 7,
    active: true,
    name: 'Ada',
    channel_slug: 'ada',
    avatar: { thumb: 'https://img/ada.jpg' },
    is_premium: true,
}

describe('toConversationView', () => {
    it('reads the recipient for an active account', () => {
        const v = view({ recipient })
        expect(v).toMatchObject({ active: true, name: 'Ada', slug: 'ada', premium: true })
        expect(v.thumb).toBe('https://img/ada.jpg')
    })

    /* Legacy shows "Tevi user", a placeholder avatar and no link for a deleted or banned account —
       nothing of the account may leak through, including the premium gradient. */
    it('hides everything about an inactive account', () => {
        const v = view({ recipient: { ...recipient, active: false } })
        expect(v).toMatchObject({ active: false, name: null, slug: null, thumb: null })
        expect(v.premium).toBe(false)
    })

    it('is online within five minutes of last_online_at (ms), and not after', () => {
        expect(view({ recipient: { ...recipient, last_online_at: NOW - 60_000 } }).online).toBe(
            true,
        )
        expect(
            view({ recipient: { ...recipient, last_online_at: NOW - ONLINE_WINDOW_MS - 1 } })
                .online,
        ).toBe(false)
        expect(view({ recipient }).online).toBe(false)
    })

    it('reads last_online_at in seconds too', () => {
        const seconds = Math.floor((NOW - 30_000) / 1000)
        expect(view({ recipient: { ...recipient, last_online_at: seconds } }).online).toBe(true)
    })

    it('knows the latest message is mine only when both aliases are present and equal', () => {
        const mine = {
            me: { tevi_user_alias: 11 },
            latest_message: { id: 'm', sender: { alias: '11' } },
        }
        expect(view(mine).sentByMe).toBe(true)
        expect(view({ ...mine, me: {} }).sentByMe).toBe(false)
        expect(
            view({ me: {}, latest_message: { id: 'm', sender: {} } }).sentByMe,
            'two missing aliases are not a match',
        ).toBe(false)
    })

    it('is seen once anybody is in seen_by', () => {
        expect(view({ latest_message: { id: 'm', seen_by: { 7: true } } }).seen).toBe(true)
        expect(view({ latest_message: { id: 'm', seen_by: {} } }).seen).toBe(false)
    })

    it('is blocked from either side', () => {
        expect(view({ me: { blocking: true }, recipient }).blocked).toBe(true)
        expect(view({ recipient: { ...recipient, blocking: true } }).blocked).toBe(true)
    })

    it('prefers a photo, then text, then markdown, then stripped HTML', () => {
        expect(
            view({ latest_message: { id: 'm', text: 'hi', images: [{ url: 'https://p' }] } })
                .preview,
        ).toEqual({ kind: 'photo', thumb: 'https://p' })
        expect(
            view({ latest_message: { id: 'm', text: 'hi', html_text: '<b>x</b>' } }).preview,
        ).toEqual({
            kind: 'text',
            text: 'hi',
        })
        expect(
            view({ latest_message: { id: 'm', html_text: '<p>a &amp; b</p>' } }).preview,
        ).toEqual({
            kind: 'text',
            text: 'a & b',
        })
        expect(view({}).preview).toEqual({ kind: 'none' })
    })
})

describe('htmlToPreviewText', () => {
    /* The reason it exists: legacy writes this string into the DOM as markup. Here it is a text
       node, and this pins that nothing survives as a tag. */
    it('drops tags, including ones that would execute as markup', () => {
        expect(htmlToPreviewText('<img src=x onerror=alert(1)>hello<script>x</script>')).toBe(
            'hellox',
        )
    })

    it('turns line breaks into spaces and collapses whitespace', () => {
        expect(htmlToPreviewText('one<br/>two<br>  three')).toBe('one two three')
    })

    it('decodes &amp; last, so an escaped entity stays escaped', () => {
        expect(htmlToPreviewText('&amp;lt;')).toBe('&lt;')
    })
})
