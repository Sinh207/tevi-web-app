import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SplashPreview } from './preview'

export const metadata: Metadata = {
    title: 'Splash',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for the splash cover: `pnpm dev`, then `/dev/splash`. 404s in production.
 *
 * The real one is on screen for the length of the session bootstrap — a few tens of milliseconds
 * on a warm cache — and `useSplashState` raises it exactly once per page load, so there is no
 * way to ask for it a second time. That is why the lock-up, the fade and the dark-mode fill had
 * nowhere to be looked at until this page: the same reason `/dev/onboarding` exists.
 *
 * What to check here: light and dark, `prefers-reduced-motion` (the fade should not run at all),
 * and a narrow viewport — the cover is `fixed`, so it is one of the few things in the app that
 * cannot be scrolled away from if it overflows.
 */
export default function SplashDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return <SplashPreview />
}
