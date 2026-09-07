'use client'

import { MembershipCheckoutScreen } from '@features/membership'
import { Button } from '@shared/ui/button'
import { useCallback, useEffect, useRef, useState } from 'react'
import { installBridgeStub, removeBridgeStub } from './bridge-stub'

/**
 * The harness around the shipped screen: a slug, a package id, a Run button, and a log of every
 * message that crossed the stub.
 *
 * ## The order of the three things here matters
 *
 * `useMembershipCheckout` reads `hasNativeBridge()` **once, on its first render** — deliberately, so a
 * payment cannot change its mind halfway through because a handler was replaced. That makes the stub
 * an ordering problem: it has to be installed *before* the screen mounts, which is why the screen is
 * behind a `run` flag rather than rendered beside a "install stub" button.
 *
 * `key={runId}` on the screen is the other half. Pressing Run again must give a genuinely fresh
 * screen — new `useReducer`, new refs, new "mint the intent once" guard — and remounting is the only
 * way to get one. Without it a second run would sit on the first run's finished state.
 *
 * ## Surviving the 3DS hop, which is the path most worth testing
 *
 * `return_url` is built from `window.location.origin + pathname`, so under this harness the bank
 * sends the browser back to **`/dev/membership-checkout`** rather than to the real route — a fresh
 * document, with the run gone and the payment's secret sitting unread on the URL.
 *
 * So the last run is kept in `sessionStorage` and restored when the URL comes back carrying a payment
 * callback. The screen then does what it does on the real route: sees the secret on its first render,
 * mints nothing, and settles. Without this the one branch that cannot be reached any other way —
 * `RESUME` → `settling` → `succeeded` — is untestable outside a device.
 *
 * ## ⚠ Why this page lives under `/app/`, not `/dev/`
 *
 * It was at `/dev/membership-checkout` first, and that was wrong twice over. `/dev/*` is a `(web)`
 * route, so the website's whole session stack sits above it — including `PaymentProvider`, whose
 * `useCheckoutCallback` exists precisely to claim a returning payment. It **won every time**: it
 * settled the callback over HTTP and stripped the parameters before the screen could look, so the
 * resume branch silently never ran. Three attempts to win that race (an earlier effect, a
 * module-scope capture, a render-phase restore) each lost to a different part of React's and Next's
 * ordering.
 *
 * The deeper problem is that fighting it was the wrong goal: a harness that renders the screen inside
 * a provider stack the real route does not have is not testing the real screen. `/app/*` mounts no
 * session and no payment provider, which is exactly the environment
 * `/app/[channelSlug]/membership/[packageId]` runs in.
 */

/** The last `Run`, so a 3DS round trip can pick it back up. Session-scoped: it is a dev convenience. */
const LAST_RUN = 'tevi.dev.membership-checkout.last-run'

type Run = { slug: string; packageId: string }

function readLastRun(): Run | null {
    try {
        const raw = sessionStorage.getItem(LAST_RUN)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<Run>
        return parsed.slug && parsed.packageId
            ? { slug: parsed.slug, packageId: parsed.packageId }
            : null
    } catch {
        return null
    }
}
export function MembershipCheckoutHarness() {
    const [log, setLog] = useState<string[]>([])
    const logRef = useRef<HTMLPreElement | null>(null)

    const append = useCallback((line: string) => {
        setLog(lines => [...lines, line])
        /* Newest last, so the pane follows the exchange rather than making you scroll for it. */
        requestAnimationFrame(() => {
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
        })
    }, [])

    const [slug, setSlug] = useState('')
    const [packageId, setPackageId] = useState('')
    const [runId, setRunId] = useState(0)

    /**
     * Pick a 3DS round trip back up — **in an effect, and that is load-bearing twice over.**
     *
     * It reads `sessionStorage` and `window.location.search`, neither of which the server has. Doing
     * it in a lazy `useState` initialiser (the first thing tried) renders a *different* first frame on
     * the client than the one the server sent — a real hydration mismatch, caught by the Next overlay
     * on the Run button, whose label and `disabled` both flipped.
     *
     * An effect is still early enough for the ordering this harness exists to respect: the stub is
     * installed *before* `setRunId` commits, so the screen — which reads `hasNativeBridge()` once, on
     * its own first render — mounts into a world where a host is already listening.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount, by design
    useEffect(() => {
        if (!window.location.search.includes('payment_intent_client_secret')) return
        const last = readLastRun()
        if (!last) return

        installBridgeStub({ slug: last.slug, onExchange: append })
        setSlug(last.slug)
        setPackageId(last.packageId)
        setRunId(1)
    }, [])

    const run = () => {
        const next = { slug: slug.trim(), packageId: packageId.trim() }
        if (!next.slug || !next.packageId) return
        setLog([])
        try {
            sessionStorage.setItem(LAST_RUN, JSON.stringify(next))
        } catch {
            // A private window with storage disabled just loses the 3DS restore.
        }
        installBridgeStub({ slug: next.slug, onExchange: append })
        setRunId(id => id + 1)
    }

    const stop = () => {
        removeBridgeStub()
        try {
            sessionStorage.removeItem(LAST_RUN)
        } catch {
            // ignore
        }
        setRunId(0)
        setLog([])
    }

    return (
        <main className="flex flex-col gap-6 py-6">
            <header className="flex flex-col gap-1 px-6">
                <h1 className="type-title-t1-bold text-(--text-title)">
                    Membership checkout (webview)
                </h1>
                <p className="type-dense-default text-(--text-body)">
                    The shipped <code>/app/[channelSlug]/membership/[packageId]</code> screen, with
                    a stand-in for the native host. The stub answers the four bridge messages by
                    making the same backend calls the app would,{' '}
                    <strong>as the account you are signed in as here</strong> — so the tier, the
                    cards, the PaymentIntent and the settle are all real. Use a Stripe{' '}
                    <strong>test</strong> card (4242 4242 4242 4242) unless you mean to move money.
                </p>
                <p className="type-caption-meta text-(--text-subtitle)">
                    It does not prove the app&apos;s reply envelope — only a device does. See B85. A
                    3DS card sends the browser back <em>here</em> rather than to the real route; the
                    run is restored from <code>sessionStorage</code> so the settle still happens.
                </p>
            </header>

            <section className="flex flex-wrap items-end gap-3 px-6">
                <Field label="Channel slug" value={slug} onChange={setSlug} placeholder="ada" />
                <Field
                    label="Package id"
                    value={packageId}
                    onChange={setPackageId}
                    placeholder="123"
                />
                <Button variant="accent" size="medium" onClick={run} disabled={!slug || !packageId}>
                    {runId === 0 ? 'Run' : 'Restart'}
                </Button>
                {runId > 0 && (
                    <Button variant="secondary" size="medium" onClick={stop}>
                        Remove stub
                    </Button>
                )}
            </section>

            {runId > 0 && (
                <section className="flex flex-col gap-2">
                    <h2 className="type-micro-overline px-6 text-(--text-body)">
                        The screen — inside a phone-width frame, as the app presents it
                    </h2>
                    {/*
                     * A fixed frame rather than the full page: the real screen is `flex-1` inside the
                     * `/app/*` shell, and seeing it at 1440px would say nothing about the layout that
                     * ships. 390×780 is an iPhone 14 viewport.
                     */}
                    <div className="px-6">
                        <div className="flex h-[780px] w-[390px] flex-col overflow-hidden rounded-xl border border-(--separator-default) bg-(--background-default)">
                            <MembershipCheckoutScreen
                                key={runId}
                                slug={slug.trim()}
                                packageId={packageId.trim()}
                            />
                        </div>
                    </div>
                </section>
            )}

            {log.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h2 className="type-micro-overline px-6 text-(--text-body)">
                        Bridge traffic — <code>→</code> sent by the screen, <code>←</code> answered
                        by the stub
                    </h2>
                    <pre
                        ref={logRef}
                        className="mx-6 max-h-[280px] overflow-auto rounded-xl bg-(--background-surface) p-4 text-[12px] leading-5 text-(--text-body)"
                    >
                        {log.join('\n')}
                    </pre>
                </section>
            )}
        </main>
    )
}

function Field({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder: string
}) {
    return (
        <label className="flex flex-col gap-1">
            <span className="type-caption-meta text-(--text-subtitle)">{label}</span>
            <input
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder={placeholder}
                className="h-10 w-[200px] rounded-(--radius-md) border border-(--separator-default) bg-(--background-surface) px-3 text-(--text-title) outline-none focus-visible:border-(--button-accent-bg)"
            />
        </label>
    )
}
