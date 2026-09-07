import type { Appearance } from '@stripe/stripe-js'

/**
 * The design system, handed to Stripe Elements.
 *
 * ## Why anything has to be handed over at all
 *
 * Every card field is an **iframe on `js.stripe.com`**. It cannot see this document's stylesheet, so
 * `var(--text-title)` means nothing inside it: custom properties do not cross an origin boundary.
 * The Appearance API is the only channel, and it takes **resolved values** — which is why this file
 * reads the computed values off the document rather than passing token names through.
 *
 * Legacy ships no appearance at all, so its card form is Stripe's default light theme: white fields
 * with black text, on Tevi's dark surface, in a dark-mode session.
 *
 * ## Read at mount, and again when the theme flips
 *
 * The Zinc and Primary ramps invert between modes (`docs/DESIGN_SYSTEM.md`), so the same token name
 * resolves to a different colour per theme. The caller passes `isDark` and re-renders on a theme
 * change; `@stripe/react-stripe-js` forwards a changed `appearance` to the live Elements instance
 * without remounting it, so nothing that has been typed is lost.
 */

/**
 * Fallbacks, used when a token cannot be read — a server render, a test, or `document` not yet
 * painted. **Both modes are listed** rather than one set of "safe greys": a dark session that fell
 * back to light values would draw exactly the mismatch this file exists to prevent, which is the
 * failure that ships silently. Values are the light/dark resolutions of the tokens beside them in
 * `globals.css`.
 */
const FALLBACKS = {
    light: {
        surface: '#ffffff',
        title: '#09090b',
        body: '#71717a',
        placeholder: '#a1a1aa',
        separator: '#e4e4e7',
        accent: '#501bc0',
        danger: '#ff3636',
    },
    dark: {
        surface: '#18181b',
        title: '#fafafa',
        body: '#a1a1aa',
        placeholder: '#71717a',
        separator: '#3f3f46',
        accent: '#8a4fe3',
        danger: '#ff5a5a',
    },
} as const

/** One custom property's computed value, or the fallback. Never an empty string. */
function token(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
    const value = styles?.getPropertyValue(name)?.trim()
    return value ? value : fallback
}

export interface StripeAppearanceOptions {
    isDark: boolean
    /**
     * The element whose computed style carries the tokens. `document.documentElement` in the app;
     * a styled node in a test, which is the only way to assert this file without a browser — jsdom
     * resolves a custom property only where it is actually declared.
     */
    root?: Element | null
}

/**
 * The `appearance` object for `<Elements>`.
 *
 * `theme` is `night` in dark mode because it changes Stripe's *own* defaults — the bits no variable
 * covers, such as the dropdown chrome and the icon set. Setting only the variables leaves a light
 * dropdown opening out of a dark field.
 */
export function stripeAppearance({ isDark, root }: StripeAppearanceOptions): Appearance {
    const fallback = isDark ? FALLBACKS.dark : FALLBACKS.light
    const styles =
        root && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
            ? window.getComputedStyle(root)
            : null

    const surface = token(styles, '--background-surface', fallback.surface)
    const title = token(styles, '--text-title', fallback.title)
    const body = token(styles, '--text-body', fallback.body)
    const placeholder = token(styles, '--text-placeholder', fallback.placeholder)
    const separator = token(styles, '--separator-default', fallback.separator)
    const accent = token(styles, '--button-accent-bg', fallback.accent)
    const danger = token(styles, '--text-error', fallback.danger)

    return {
        theme: isDark ? 'night' : 'stripe',
        variables: {
            colorPrimary: accent,
            colorBackground: surface,
            colorText: title,
            colorTextSecondary: body,
            colorTextPlaceholder: placeholder,
            colorDanger: danger,
            // The DS has one radius for inputs (`--radius-md`, 8px) and no `--radius-*` value is
            // mode-dependent, so this one is a constant rather than a token read.
            borderRadius: '8px',
            spacingUnit: '4px',
            // Inter is loaded by the app; inside the iframe Stripe can only be *told* the family, so
            // it falls back to the system stack rather than fetching a font we do not control.
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSizeBase: '14px',
        },
        rules: {
            '.Input': { border: `1px solid ${separator}`, boxShadow: 'none' },
            '.Input:focus': { border: `1px solid ${accent}`, boxShadow: 'none' },
            '.Input--invalid': { border: `1px solid ${danger}`, boxShadow: 'none' },
            '.Label': { color: body, fontWeight: '500' },
            '.Tab': { border: `1px solid ${separator}`, boxShadow: 'none' },
            '.Tab--selected': { border: `1px solid ${accent}`, boxShadow: 'none' },
        },
    }
}
