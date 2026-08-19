import { IDENTIFICATION_CONTAINER, IdentityOutcome } from '@features/identification'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Identification outcomes',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the two identity-verification end screens: `pnpm dev`, then open
 * /dev/identification. 404s in production (`proxy.ts` stops the request; the `notFound()`
 * below is the belt to that braces).
 *
 * It exists because these two screens are otherwise **unreachable without a real Sumsub
 * submission**: `/identification` shows the intro unless the account has an approved or
 * pending LEVEL_2 submission, so a design pass on them meant either faking an API response or
 * verifying an identity. Both states are pure props, so both render here honestly — this is a
 * preview, not a mock: it renders the shipped component with the shipped copy.
 *
 * What it cannot show is the Sumsub frame itself. That is someone else's iframe and needs a
 * live applicant session.
 */
export default function DevIdentificationPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Identification outcomes</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/identification` — the pending and verified screens, in the same 612px
                    column the page gives them.
                </p>
            </header>

            {(['pending', 'verified'] as const).map(state => (
                <section key={state} className="flex flex-col gap-2">
                    <h2 className="type-micro-overline text-(--text-body)">state="{state}"</h2>
                    {/* No frame of its own — the screen brings a panel from md up. */}
                    <div className={IDENTIFICATION_CONTAINER}>
                        <IdentityOutcome state={state} />
                    </div>
                </section>
            ))}
        </main>
    )
}
