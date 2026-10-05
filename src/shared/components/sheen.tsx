import { PREMIUM_SHEEN } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'

/**
 * **The glare across a call to action** — a white band sweeping the surface on `PREMIUM_SHEEN`'s
 * timing, so every offer in the app catches the light on one clock.
 *
 * The caller's element carries `relative overflow-hidden`; this fills it (`inset-0`) and starts at
 * `opacity-0`, which the keyframe lifts — see `tevi-premium-sheen`. Content above it should be
 * `relative` so the band passes *under* the label.
 *
 * Three strengths, as literal classes (Tailwind cannot see an interpolated one): `soft` for a
 * violet accent, `bright` for a gold or gradient surface, `brightest` for the one recurring offer
 * the eye should land on first.
 */
const STRENGTH = {
    soft: 'bg-[linear-gradient(100deg,transparent_38%,rgba(255,255,255,0.22)_50%,transparent_62%)]',
    bright: 'bg-[linear-gradient(100deg,transparent_38%,rgba(255,255,255,0.25)_50%,transparent_62%)]',
    brightest:
        'bg-[linear-gradient(100deg,transparent_38%,rgba(255,255,255,0.28)_50%,transparent_62%)]',
} as const

export function Sheen({ strength = 'soft' }: { strength?: keyof typeof STRENGTH }) {
    return (
        <span
            aria-hidden
            className={cn(
                'pointer-events-none absolute inset-0 opacity-0',
                STRENGTH[strength],
                PREMIUM_SHEEN,
            )}
        />
    )
}
