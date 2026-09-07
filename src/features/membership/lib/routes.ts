/**
 * Re-export of this feature's address, so files inside it reach the path where every other `lib/`
 * helper lives instead of having to know about the split.
 *
 * The definition is in `features/membership/routes.ts` — one level up, deliberately, because
 * `features/navigation` imports it and that file must stay free of any dependency on this feature's
 * components. See its own doc for the cycle that forces it.
 */

export { MY_MEMBERSHIP_PATH } from '../routes'
