import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SensitiveSpacePreview } from './preview'

export const metadata: Metadata = {
    title: 'Sensitive space',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for a **sensitive space with its gate unanswered**: `pnpm dev`, then
 * `/dev/space-sensitive`. 404s in production, like every `/dev/*` page.
 *
 * ## Why it needs a harness
 *
 * The state depends on three things at once — the space is flagged `is_nsfw`, the account's filtering
 * setting, and a per-space consent in `localStorage` — so reaching it on a real page means finding a
 * flagged space, being signed in, and *not* having agreed to it before. The moment you look at it once
 * and press the button, it is gone for that account and that space. That is a screen nobody can
 * compare against anything by browsing, which is how the old arrangement kept its faked-up page for
 * as long as it did.
 *
 * It renders the **real** `ChannelHeader` and `ChannelNsfwGate` — the same components the page uses —
 * so what you see is what a visitor sees, minus the tabs that this state does not draw.
 */
export default function SensitiveSpaceDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return <SensitiveSpacePreview />
}
