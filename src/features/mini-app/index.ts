/**
 * The mini-app player — **third-party applications, framed inside Tevi.**
 *
 * A mini app is somebody else's web app (a game, a shop, a mini-service) that a creator attaches to
 * their space. The native apps host them in a WebView and talk to them over a JS bridge; this
 * feature is the **third implementation of that same contract**, for the web. The protocol is not
 * ours to design — it is `docs/MINI_APP.md`, ported from legacy's `MINIAPP_INTEGRATION.md`, and
 * every action name in `lib/protocol.ts` is a string some shipped mini app already sends.
 *
 * ```
 * MiniAppHost              app/session-providers.tsx — renders nothing until an app is opened
 *   useMiniApp()           open · openCenter · close · isOpen        ← the front door
 *   OpenMiniAppButton      a space's "Open", for the viewer action row
 *   MiniAppWindow          the floating/full-screen player (dynamically imported)
 *     MiniAppFrame × n     one live iframe per tab, each with its own bridge
 * ```
 *
 * ## Opening an app is one call, and it is the only supported way
 *
 * ```tsx
 * const { open } = useMiniApp()
 * open({ id, name, url, iconUrl, shareableUrl })   // a loose shape; vetted inside
 * ```
 *
 * `open` composes `useRequireAuth` (a mini app runs *for* an account and spends its Star) and vets
 * the URL through `shared/lib/safe-url` before it can reach an `iframe src`. That vetting is why the
 * player takes a loose input rather than a `MiniAppConfig`: the vetted type is only constructible in
 * `lib/app-config.ts`, so a call site cannot assemble one and skip the check.
 *
 * ## The three primitives, and which one owns what
 *
 * Stated here because this feature touches all three and the boundaries are where a player like
 * this usually goes wrong (CLAUDE.md's "three communication primitives"):
 *
 * | | owner | why |
 * |---|---|---|
 * | tabs, window rect, minimise | **Zustand** (`store/mini-app-store.ts`) | pure UI state, read by openers everywhere and rendered in one place |
 * | the per-app token, purchases, deposits | **TanStack Query** (`api/mini-app-api.ts`) | server state; the token is deduplicated by `fetchQuery`, and every write invalidates `balanceKeys.all` |
 * | "the reader needs Star" | **event bus** (`payment:star-purchase-requested`) | the sheet lives in `features/payment`, which imports `features/balance`; announcing avoids closing a barrel cycle |
 *
 * No socket. A mini app's own realtime traffic is its business, inside its own frame.
 *
 * ## What this feature will not do
 *
 * - **Trust the frame.** Options arriving from an app are parsed by zod (`api/types.ts`) and the
 *   request body is rebuilt field by field; a price the app states is never sent. The backend is the
 *   authority on price and balance.
 * - **Answer nothing.** Every action the bridge handles posts exactly one reply, including failures
 *   and unknown actions. Legacy leaves four paths silent, and a silent path is an app stuck on its
 *   loading screen.
 * - **Confuse a frame for its neighbour.** Messages are matched on `event.source ===
 *   iframe.contentWindow`, not just origin — two tabs of the same app share an origin.
 *
 * ## Where the rest of it is written down
 *
 * `docs/MINI_APP.md` — the wire contract, the divergences from native, and what a partner has to
 * do. **B82** in `docs/BACKEND_QUESTIONS.md` — what this client is guessing at: the app token's
 * lifetime, whether the deposit endpoint reports insufficient funds the way `purchase/` does, which
 * envelope shipped apps actually speak, and whether the set of framable hosts can ever be known.
 */

export { miniAppKeys } from './api/mini-app-api'
export { MiniAppHost } from './components/mini-app-host'
/**
 * The space action-row entry. Takes a structural channel shape rather than `Channel`, so this
 * feature does not depend on `features/channel`'s types — see the component.
 */
export { OpenMiniAppButton } from './components/open-mini-app-button'
/**
 * `useMiniApp` is the front door (above). `useMiniAppCoversScreen` is for the **app shell only**:
 * the mobile tab bar hides while a mini app covers the screen, because the bar is `z-50` and the
 * player must stay under 50 so the dialogs it raises are above it. That hook's own doc has the
 * reasoning, and it is the whole reason a layering detail is exported at all.
 */
/**
 * Entering a space that *is* a mini app opens it. Called by `features/channel`'s viewer action row,
 * which is also what gates it — see the hook.
 */
export { useAutoOpenMiniApp } from './hooks/use-auto-open-mini-app'
export { useMiniApp, useMiniAppCoversScreen } from './hooks/use-mini-app'
export type { MiniAppChannelLike, MiniAppConfig, MiniAppConfigInput } from './lib/app-config'
/**
 * Whether a space has a usable mini app. Exported because `features/channel`'s action row reads it
 * to decide the rest of the row — a space that leads with its app drops its membership and donate
 * buttons — and it must be the *same* rule the button and the player use.
 */
export { hasMiniApp, miniAppFromChannel } from './lib/app-config'

/**
 * Deliberately **not** exported: `miniAppApi`, `useMiniAppStore`, the bridge, and every component
 * below `MiniAppHost`.
 *
 * The store is the sharp one. Exporting it would let any screen write tab state — and the rules
 * that make the player coherent (dedup, the tab cap, un-minimising on open, freezing a frame's URL
 * for its lifetime) live in `useMiniApp` and `lib/tabs.ts`, not in the setters. A caller reaching
 * past them gets a second, worse player. `useMiniApp` is the whole surface; `dev.ts` opens up the
 * rest for the dev harness only.
 */
