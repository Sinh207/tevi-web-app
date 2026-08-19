import type { ComponentPropsWithoutRef } from 'react'

/**
 * Logo — the Tevi app mark, ported from the design system's `.tevi-navbar__logo`
 * slot (Figma navbar 3626:26349).
 *
 * Authored on a 48 grid: rounded square r12 filled Primary 500, mark in White.
 * The DS keeps it inline rather than in the icon sprite because it is a brand
 * asset with fixed colours — it does not follow `currentColor` and it does not
 * flip between light and dark, since `--primary-500` is the one step of the
 * ramp that does not invert.
 *
 * The DS uses it at 48 (navbar) and 32 (left-bar brand tile). Both keep the
 * 4:1 size-to-radius ratio, which the fixed viewBox preserves automatically.
 *
 * There is no wordmark in the design system — the "Tevi" lettering elsewhere in
 * the app is live text in the Chella brand font, not an asset.
 */
export interface LogoProps extends Omit<ComponentPropsWithoutRef<'svg'>, 'children'> {
    /** Rendered edge length in px. The DS draws it at 48 and 32. */
    size?: number
    /** Accessible name; pass `null` when a nearby label already names it. */
    title?: string | null
}

export function Logo({ size = 48, title = 'Tevi', ...props }: LogoProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role={title ? 'img' : undefined}
            aria-label={title ?? undefined}
            aria-hidden={title ? undefined : true}
            focusable="false"
            {...props}
        >
            <rect width="48" height="48" rx="12" fill="var(--primary-500)" />
            <path
                d="M26.2682 26.5076V20.6909C26.2682 20.4807 26.5001 20.3533 26.6775 20.466L31.1781 23.3243C31.3523 23.4349 31.5747 23.435 31.749 23.3246L33.9345 21.9402C34.0995 21.8356 34.0996 21.5949 33.9347 21.4902L17.8819 11.2954C16.6329 10.5022 15 11.3994 15 12.879C15 12.9827 15.053 13.0792 15.1405 13.1348L22.5108 17.8201C22.6647 17.9179 22.7578 18.0875 22.7578 18.2698V28.5446C22.7578 28.7547 22.9897 28.8821 23.1671 28.7695L26.0209 26.9574C26.1749 26.8597 26.2682 26.69 26.2682 26.5076Z"
                fill="var(--white)"
            />
            <path
                d="M18.5103 31.6245C18.5103 32.0448 18.9743 32.2996 19.3291 32.0742L34.7462 22.2763C34.8637 22.2016 35.0137 22.2015 35.1313 22.276C36.3557 23.0517 36.3563 24.8376 35.1325 25.6141L17.6087 36.7329C16.4778 37.4504 15 36.638 15 35.2988V14.4428C15 14.2326 15.2319 14.1052 15.4093 14.2178L18.2631 16.0299C18.4171 16.1276 18.5103 16.2973 18.5103 16.4797V31.6245Z"
                fill="var(--white)"
            />
        </svg>
    )
}
