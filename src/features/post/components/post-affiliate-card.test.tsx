// @vitest-environment jsdom
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { normalizePost } from '../api/types'

/**
 * The promote card opens the program's mini app **in this tab**: a Tevi referral link is a
 * client-side link to the program's space, which opens its app on arrival. Two things are pinned
 * because neither shows up as a failure anywhere else:
 *
 * - the **query survives** — `utm_campaign` is read off the page URL that opens the app, and it is
 *   what credits the promoter, so dropping it loses the commission with nothing on screen to say so;
 * - a link to **any other host** is not turned into an in-app path, and keeps the vetted new tab.
 */

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a href={href} data-next-link="" {...props}>
            {children}
        </a>
    ),
}))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('@features/balance', () => ({ useCurrency: () => ({}) }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))

const { PostAffiliateCard } = await import('./post-attachments')

function postWith(referral: string | null) {
    const parsed = normalizePost({
        id: '1',
        channel: {
            id: 7,
            promote: { referral_url: referral, app_name: 'WC2026', app_icon_url: null },
        },
    })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

function trigger() {
    return document.querySelector<HTMLAnchorElement>('[data-testid="post-card-trigger"]')
}

describe('PostAffiliateCard', () => {
    it('opens a Tevi referral link in this tab, query and all', () => {
        render(
            <PostAffiliateCard
                post={postWith('https://tevi.com/@wc2026?utm_campaign=ada-42&x=1')}
                testId="post-card"
            />,
        )
        const link = trigger()
        expect(link?.hasAttribute('data-next-link')).toBe(true)
        expect(link?.getAttribute('href')).toBe('/@wc2026?utm_campaign=ada-42&x=1')
        expect(link?.getAttribute('target')).toBeNull()
    })

    it('keeps the new tab for any other host', () => {
        render(
            <PostAffiliateCard post={postWith('https://ref.example.com/x')} testId="post-card" />,
        )
        const link = trigger()
        expect(link?.hasAttribute('data-next-link')).toBe(false)
        expect(link?.getAttribute('target')).toBe('_blank')
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('draws nothing for a link that is not http(s)', () => {
        render(<PostAffiliateCard post={postWith('javascript:alert(1)')} testId="post-card" />)
        expect(trigger()).toBeNull()
    })
})
