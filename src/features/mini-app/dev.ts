/**
 * Internals for `/dev/mini-app` **only** — the dev harness needs to look at parts the barrel keeps
 * shut, and the barrel says why each is shut.
 *
 * Same pattern (and same rule) as `features/payment/dev.ts`: a `/dev/*` page is dev-only
 * (`proxy.ts` 404s the namespace in production, and each page calls `notFound()` as well), so this
 * file must never be imported by anything under `app/(web)/(main)`.
 */

export { MiniAppWindow } from './components/mini-app-window'
export { TopupConfirmDialog } from './components/topup-confirm-dialog'
export { miniAppCenterConfig } from './lib/center'
export { useMiniAppStore } from './store/mini-app-store'
