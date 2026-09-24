/**
 * What each `data-testid` scope names, for the catalog QC reads.
 *
 * A testid's **first segment is its screen attribution** — that is the whole reason the grammar
 * mandates a scope (`shared/lib/test-id.ts`). This file says what each scope is and how it reaches a
 * reader; it deliberately does **not** list routes, because the routes are derivable and a
 * hand-maintained list of them would be wrong within a sprint. `scripts/build-testid-catalog.mjs`
 * walks the import graph from every `page.tsx` and writes the real route set into the catalog, so
 * the attribution QC reads is recomputed on every run rather than remembered.
 *
 * Three kinds, and each one owes something different:
 *
 * - `screen` — a feature that a page mounts. Its routes are derived. It may *also* carry a
 *   `mountedBy` when it owns something global as well: `auth` owns `/login` and the sign-in dialog.
 * - `webview` — the same, but under `/app/*`: no shell, no session unless the screen mounts its own,
 *   and driven inside the native app (`docs/WEBVIEW.md`).
 * - `shared` — present on many routes or raised over them (the shell, a dialog another feature
 *   opens). These owe a `mountedBy`, because "which screen is this on" has no answer and pretending
 *   otherwise is how a catalog starts lying. The guard asserts the path exists.
 *
 * A scope missing from here is a **lint failure**, not a default: a surface cannot come into
 * existence by somebody typing a string in a component. Adding one is a line here.
 *
 * `src/shared/ui/**` never appears: a primitive rendered by thirty screens cannot be attributed to
 * one, so it receives a testid and never authors one. `scripts/check-testids.mjs` enforces that.
 *
 * Neither do `features/balance`, `features/permission` or `features/realtime`. The last two are
 * providers with no components; `balance` renders only `StarChangeFlash`, which is an animation —
 * the balance a test actually reads is the App Bar's, and that belongs to `navigation`. A surface
 * that can never hold an id would just be a heading over an empty table in the catalog.
 */

export type TestIdSurfaceKind = 'screen' | 'webview' | 'shared'

export type TestIdSurface = {
    kind: TestIdSurfaceKind
    /** What a QC engineer would call it. Shown as the section heading in `testids/CATALOG.md`. */
    label: string
    /**
     * The file that puts this surface on screen regardless of route.
     *
     * **Required for `shared`**, and checked to exist — it is the answer to "why does this id appear
     * on a route that has nothing to do with it". Allowed on a `screen` too, and `auth` is why: it
     * owns `/login` *and* the sign-in dialog, the account switcher and the splash, which
     * `session-providers.tsx` mounts everywhere. Stating only the routes would have told QC the
     * splash lives on four pages when it is on all forty.
     */
    mountedBy?: string
}

export const TESTID_SURFACES: Record<string, TestIdSurface> = {
    // ---- Features a page mounts -------------------------------------------------------------
    analytics: { kind: 'screen', label: 'Dashboard analytics' },
    auth: {
        kind: 'screen',
        label: 'Sign in, sign up, password — and the global sign-in dialog and splash',
        mountedBy: 'src/app/session-providers.tsx',
    },
    'brand-assets': { kind: 'screen', label: 'Brand assets' },
    channel: { kind: 'screen', label: 'Channel / space, following, profile settings' },
    earnings: { kind: 'screen', label: 'Earnings report' },
    /**
     * One live event's page — `/@{slug}/event/{code}`.
     *
     * Distinct from `channel`, which owns the surfaces that *advertise* a stream (the space's Live
     * tab, the Live-now strip, the Following row). This scope is the stream's own page: the details
     * card, the host row, the access panel and the age gate.
     */
    event: { kind: 'screen', label: 'A live event — details, access and the app hand-off' },
    'gift-code': { kind: 'screen', label: 'Redeem gift code' },
    identification: { kind: 'screen', label: 'Identity verification (KYC)' },
    legal: { kind: 'screen', label: 'Legal documents' },
    membership: { kind: 'screen', label: 'Memberships' },
    'my-star': {
        kind: 'screen',
        label: 'Star balance and ledger, and choosing who to gift Star to',
    },
    monetization: { kind: 'screen', label: 'Monetization hub and its method screens' },
    'my-wallet': { kind: 'screen', label: 'Wallet' },
    notification: { kind: 'screen', label: 'Notifications' },
    payment: { kind: 'screen', label: 'Buy Star, cards, checkout' },
    payout: { kind: 'screen', label: 'Payout tracking' },
    premium: {
        kind: 'screen',
        label: 'Tevi Premium — plans, benefits, billing portal, and gifting Premium to someone',
    },
    search: { kind: 'screen', label: 'Search' },
    'star-transfer': { kind: 'screen', label: 'Star transfer' },

    // ---- Webview-only screens --------------------------------------------------------------
    'privacy-settings': {
        kind: 'webview',
        label: 'Privacy settings (webview)',
        mountedBy: 'src/app/app/privacy-settings/page.tsx',
    },

    // ---- The app's own boundaries --------------------------------------------------------
    /**
     * `error.tsx`, `global-error.tsx`, `not-found.tsx` — the frames React shows when a route or the
     * root layout throws. Not a feature and not a screen: they replace whatever was there.
     */
    app: {
        kind: 'shared',
        label: 'Error and not-found boundaries',
        mountedBy: 'src/app/error.tsx',
    },

    // ---- Present on many routes, or raised over them ---------------------------------------
    /**
     * The shell. Five surfaces, and **four of them are in the DOM at once** — the rail is
     * `hidden md:flex`, the top bar and tab bar are `md:hidden`, and the drawer is mounted `inert`
     * on every route. So the leaf names never overlap between them; see `docs/TEST_IDS.md`.
     */
    navigation: {
        kind: 'shared',
        label: 'Shell — rail, top bar, tab bar, account drawer, end rail',
        mountedBy: 'src/app/(web)/(main)/layout.tsx',
    },
    donation: {
        kind: 'shared',
        label: 'Donate — button and dialogs, on a channel',
        mountedBy: 'src/features/channel/components/channel-viewer-actions.tsx',
    },
    affiliate: {
        kind: 'shared',
        label: 'Affiliate programme entry and dialog',
        mountedBy: 'src/features/my-star/components/my-star-view.tsx',
    },
    campaign: {
        kind: 'shared',
        label: 'Promo banners',
        mountedBy: 'src/features/navigation/components/end-rail/app-end-rail.tsx',
    },
    'mini-app': {
        kind: 'shared',
        label: 'Mini-app player — window, tabs, top-up',
        mountedBy: 'src/app/session-providers.tsx',
    },
    nsfw: {
        kind: 'shared',
        label: 'Sensitive-content gate',
        mountedBy: 'src/features/channel/components/channel-view.tsx',
    },
    /**
     * The share sheet — raised **over** a screen rather than being one, so it owes a `mountedBy`
     * like its neighbours here.
     *
     * Four surfaces raise it and `channel-top-bar.tsx` is named because it is the one on every
     * space: the others are the follow-requests empty state, an event's kebab menu and the donation
     * support card (`features/share/index.ts` lists them). Its ids therefore turn up on any route
     * that can show a space or a donation offer.
     */
    share: {
        kind: 'shared',
        label: 'Share sheet — link preview, QR step, channel row',
        mountedBy: 'src/features/channel/components/channel-top-bar.tsx',
    },
}
