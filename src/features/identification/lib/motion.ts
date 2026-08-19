/**
 * The screen's entrance animations.
 *
 * Moved to `shared/lib/motion.ts` once a second feature needed the same two constants —
 * `features/*` may not import each other's internals, and copying a keyframe reference is
 * how two screens end up drifting to different curves. Re-exported rather than deleted so
 * this feature's call sites keep reading as local.
 */
export { RISE, riseDelay } from '@shared/lib/motion'
