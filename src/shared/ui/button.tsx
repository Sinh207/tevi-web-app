import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cn } from '@shared/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
import { isValidElement } from 'react'

/**
 * Button — Figma "Button" (28:18), ported 1:1 from the Tevi design system.
 *
 * Geometry is measured, not inferred:
 *   small  h28 · px 8  · gap 4 · 14/500 · icon 16
 *   medium h36 · px 16 · gap 4 · 14/500 · icon 18
 *   large  h48 · px 24 · gap 8 · 16/500 · icon 20
 * Icon-only keeps the height as a square: 28 / 36 / 48. Radius is 12 at every
 * size. Figma models Hover/Disabled as variants; here they are real CSS states.
 *
 * Labels never wrap — every Figma label node is WIDTH_AND_HEIGHT with
 * truncation disabled, so `whitespace-nowrap` is load-bearing.
 */
const buttonVariants = cva(
    'group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding leading-[1.5] font-medium whitespace-nowrap transition-[background-color,color,border-color] duration-[120ms] ease-out outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                primary:
                    'bg-(--button-primary-bg) text-(--button-primary-text) hover:not-disabled:bg-(--button-primary-bg-hover) disabled:bg-(--button-primary-bg-disabled) disabled:text-(--button-primary-text-disabled)',
                secondary:
                    'border-(--button-secondary-border) bg-(--button-secondary-bg) text-(--button-secondary-text) hover:not-disabled:bg-(--button-secondary-bg-hover) disabled:bg-(--button-secondary-bg-disabled) disabled:text-(--button-secondary-text-disabled)',
                ghost: 'bg-(--button-ghost-bg) text-(--button-ghost-text) hover:not-disabled:bg-(--button-ghost-bg-hover) disabled:bg-(--button-ghost-bg) disabled:text-(--button-ghost-text-disabled)',
                accent: 'bg-(--button-accent-bg) text-(--button-accent-text) hover:not-disabled:bg-(--button-accent-bg-hover) disabled:bg-(--button-accent-bg-disabled) disabled:text-(--button-accent-text-disabled)',
                destructive:
                    'bg-(--button-destructive-bg) text-(--button-destructive-text) hover:not-disabled:bg-(--button-destructive-bg-hover) disabled:bg-(--button-destructive-bg-disabled) disabled:text-(--button-destructive-text-disabled)',
            },
            size: {
                small: "h-7 gap-1 px-2 text-sm [&_svg:not([class*='size-'])]:size-4",
                medium: "h-9 gap-1 px-4 text-sm [&_svg:not([class*='size-'])]:size-[18px]",
                large: "h-12 gap-2 px-6 text-base [&_svg:not([class*='size-'])]:size-5",
            },
            iconOnly: {
                true: 'px-0',
            },
            fullWidth: {
                true: 'w-full',
            },
        },
        compoundVariants: [
            { iconOnly: true, size: 'small', className: 'w-7' },
            { iconOnly: true, size: 'medium', className: 'w-9' },
            { iconOnly: true, size: 'large', className: 'w-12' },
        ],
        defaultVariants: {
            variant: 'primary',
            size: 'medium',
        },
    },
)

/**
 * Whether the element `render` produces is a real `<button>`.
 *
 * Base UI's `nativeButton` defaults to `true`, and it means "the element you are substituting via
 * `render` is still a button". Hand it a `next/link` — which is how every "go somewhere" button in
 * this app is written — and it renders an `<a>` while believing it has a `<button>`, so it applies
 * native button semantics that do not exist there and logs:
 *
 * > *A component that acts as a button expected a native `<button>` because the `nativeButton` prop is
 * > true. Rendering a non-`<button>` removes native button semantics, which can impact forms and
 * > accessibility.*
 *
 * The warning is right, and the flag is real behaviour rather than a lint: on a non-button Base UI has
 * to add `role="button"` and synthesise Space/Enter activation itself, which it only does when told.
 *
 * Deriving it here rather than asking each call site to remember, because "remember to pass
 * `nativeButton={false}` whenever you pass `render`" is a rule that gets forgotten — it already had
 * been, in `app/not-found.tsx`, before any of this feature's call sites existed.
 *
 * Only a **React element** can be inspected. A function `render` (`render={props => <a {...props} />}`)
 * is opaque, so those callers still pass the flag themselves; an explicit `nativeButton` always wins.
 */
function rendersNativeButton(render: ButtonPrimitive.Props['render']): boolean | undefined {
    if (!isValidElement(render)) return undefined
    return render.type === 'button'
}

/**
 * Whether the element `render` produces is a **link** — an `<a>`, or a component given an `href`,
 * which is what `next/link` is.
 *
 * Base UI applies `role="button"` and `tabIndex={0}` to anything it is told is not a native button
 * (`useButton`, the non-native branch). On a `<div>` trigger that is exactly right: without them
 * assistive tech would announce nothing and the keyboard could not reach it. On an anchor with an
 * `href` it is a downgrade, and a silent one — the element still navigates, still looks identical,
 * and still works with a mouse:
 *
 * - a screen reader announces "button" for something that navigates, and the control disappears
 *   from the links list, which is how many people move around a page;
 * - `getByRole('link')` cannot find it, in tests *or* in an audit tool;
 * - the `tabIndex` is redundant, since an anchor with an `href` is already focusable.
 *
 * So a link render is given `role="link"` — its own implicit role, stated out loud.
 *
 * **Stated, rather than removed.** `role={undefined}` is the tidier fix and it works in a client
 * tree, where the key still exists and Base UI's merge lets it win. It does nothing at all on a
 * server-rendered page: most of these call sites are server components, and a prop whose value is
 * `undefined` does not cross the server→client boundary — the flight payload is JSON, and JSON
 * drops undefined-valued keys — so Base UI never sees the override and applies its own default.
 * That is exactly how this shipped: green in jsdom, `role="button"` in the built page, caught by
 * `e2e/not-found.spec.ts` rather than by the unit test above it. Only a real value crosses.
 *
 * The redundant `tabIndex={0}` Base UI adds is left alone for the same reason — it cannot be
 * removed across that boundary, and on an anchor with an `href` it changes nothing.
 *
 * Base UI keeps the rest of its behaviour, including its own link handling: `useButton` checks for
 * a real link on Space and clicks it, and that check reads the DOM element, not this role.
 *
 * Applied *before* the caller's props, so an explicit `role` still wins — a link that genuinely
 * acts as a button (opens a dialog, no navigation) can still say so.
 */
function rendersLink(render: ButtonPrimitive.Props['render']): boolean {
    if (!isValidElement(render)) return false
    return render.type === 'a' || (render.props as { href?: unknown })?.href != null
}

function Button({
    className,
    variant = 'primary',
    size = 'medium',
    iconOnly,
    fullWidth,
    render,
    nativeButton,
    ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={cn(buttonVariants({ variant, size, iconOnly, fullWidth, className }))}
            render={render}
            nativeButton={nativeButton ?? rendersNativeButton(render)}
            {...(rendersLink(render) ? { role: 'link' } : null)}
            {...props}
        />
    )
}

export { Button, buttonVariants }
/**
 * Exported for `button.test.tsx` only — underscored so they read as internal at a glance. Both
 * derivations are worth pinning: one guards a runtime-only warning, the other decides whether ten
 * navigating call sites are announced as links or as buttons.
 */
export { rendersNativeButton as __rendersNativeButton, rendersLink as __rendersLink }
