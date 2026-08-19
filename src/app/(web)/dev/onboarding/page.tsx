import { CreateChannelGate } from '@features/channel/dev'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Create space',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for onboarding: `pnpm dev`, then `/dev/onboarding`. 404s in production.
 *
 * The real screen only renders for a **signed-in account with no space**, which is a state that
 * exists for about thirty seconds per user and cannot be reached on demand. That is how the first
 * version of it shipped as a prompt where legacy has a four-field form: nobody could look at it.
 *
 * The live validators still run here — they answer 401 without a session, which is itself the state
 * worth seeing, and intercepting them drives the happy path.
 */
export default function OnboardingPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return <CreateChannelGate />
}
