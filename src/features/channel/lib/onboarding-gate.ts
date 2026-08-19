/**
 * Whether an account has to create a space before it may use the app.
 *
 * ## Why this is a gate at all
 *
 * A Tevi account without a channel cannot do anything: posting, streaming, messaging and earning are
 * all *the channel's*. Legacy encodes that as a hard fork in `MyChannelProvider` — it renders
 * `<CreateMyChannel/>` **instead of the entire app** — and that is a product rule, not an
 * implementation detail. Which is why the check lives in a provider near auth rather than inside the
 * channel screens: every route needs the answer.
 *
 * ## Three things legacy gets wrong, all of them here as explicit cases
 *
 * Legacy: `isLoading ? null : isCreateMyChannel ? <CreateMyChannel/> : children`.
 *
 * 1. **`isLoading ? null` blanks the whole app** while `my-channel/` is in flight — on every cold
 *    load, for every user, including the overwhelming majority who *have* a channel. Nothing else in
 *    this codebase blocks the tree on a session request (`isBootstrapping` is not consumed by any UI),
 *    so reproducing it would make this the first thing to do so. Here `'unknown'` means **render the
 *    app**: the brand-new account that briefly sees it before onboarding takes over is a rare case,
 *    and a flash for them beats a blank frame for everyone.
 * 2. **Any non-200/404 pushes to `/500`** (`getMyChannel`'s `else` branch), so a transient 5xx on one
 *    endpoint takes the entire app to an error page. `'unknown'` covers that too — an error means we
 *    do not know, and "we do not know" must never be treated as "you have no channel".
 * 3. **Anonymous is not considered.** Legacy's `isAuthenticated` excludes anonymous sessions so they
 *    fall through, but only as a side effect of that definition. Stated outright here, because the app
 *    always keeps a session: most visitors are anonymous and must never be asked to create a space.
 */
export type OnboardingGate =
    /** No real account, or we do not know yet. Render the app. */
    | 'open'
    /** The account has a channel. Render the app. */
    | 'ready'
    /** The account is real and demonstrably has no channel. Render onboarding instead of the app. */
    | 'needs-channel'

export interface OnboardingGateInput {
    /** Excludes anonymous, in both this app and legacy. */
    isAuthenticated: boolean
    /** `undefined` while unknown, `null` for "no channel", a channel when there is one. */
    myChannel: { slug: string } | null | undefined
    /** A request is still in flight, or has not started. */
    isLoading: boolean
    /** The lookup failed. Distinct from "no channel", and must not gate. */
    isError: boolean
    /**
     * Routes the gate must never replace.
     *
     * `/login` and `/signup` are how you *become* the account being checked. `/app/*` is the mobile
     * app's webview namespace: the native app owns its own onboarding, and swapping a legal-text
     * screen inside a WebView for a create-space prompt would be a bug the app team could not even
     * navigate out of. Legacy avoids this by accident of where it mounts the provider; being explicit
     * means it survives someone moving the provider.
     */
    isExemptRoute: boolean
}

export function onboardingGate({
    isAuthenticated,
    myChannel,
    isLoading,
    isError,
    isExemptRoute,
}: OnboardingGateInput): OnboardingGate {
    if (isExemptRoute) return 'open'
    // Anonymous and signed-out visitors are the common case and cost nothing.
    if (!isAuthenticated) return 'open'
    if (myChannel) return 'ready'
    // Not yet known, or the request failed — either way, not proof of absence.
    if (isLoading || isError || myChannel === undefined) return 'open'
    return 'needs-channel'
}

/** The route roots `onboardingGate` must not interrupt. */
const EXEMPT_ROOTS = ['/login', '/signup', '/app'] as const

/**
 * Matched on a **path boundary**, not as a bare prefix.
 *
 * `startsWith('/login')` also matches `/logins`, and `startsWith('/app')` matches `/application` and
 * `/apps` — so a creator whose page happened to live under one of those names would silently skip a
 * gate that is supposed to be unconditional. A test pins all three.
 */
export function isOnboardingExemptPath(pathname: string): boolean {
    return EXEMPT_ROOTS.some(root => pathname === root || pathname.startsWith(`${root}/`))
}
