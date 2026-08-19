/**
 * The eight colours the account drawer paints its 32px row tiles with.
 *
 * A module of its own so the drawer's sub-screens can reach the same tokens
 * without importing the drawer — which would be a cycle, since the drawer renders
 * them.
 */
export const TILE = {
    indigo: 'var(--accents-indigo-active)',
    success: 'var(--accents-success-active)',
    warning: 'var(--accents-warning-active)',
    error: 'var(--accents-error-active)',
    zinc: 'var(--zinc-500)',
    primary: 'var(--primary-600)',
    title: 'var(--text-title)',
} as const
