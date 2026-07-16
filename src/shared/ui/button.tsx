import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cn } from '@shared/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
    "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
        variants: {
            // Variants mirror the Figma "Button" component (Primary / Secondary /
            // Ghost / Accent / Destructive) via the --btn-* design tokens.
            variant: {
                default:
                    'bg-(--btn-primary-bg) text-(--btn-primary-text) hover:bg-(--btn-primary-bg-hover) disabled:bg-(--btn-primary-bg-disabled) disabled:text-(--btn-primary-text-disabled)',
                accent: 'bg-(--btn-accent-bg) text-(--btn-accent-text) hover:bg-(--btn-accent-bg-hover) disabled:bg-(--btn-accent-bg-disabled) disabled:text-(--btn-accent-text-disabled)',
                secondary:
                    'border-(--btn-secondary-border) bg-(--btn-secondary-bg) text-(--btn-secondary-text) hover:bg-(--btn-secondary-bg-hover) disabled:bg-(--btn-secondary-bg-disabled) disabled:text-(--btn-secondary-text-disabled)',
                ghost: 'bg-(--btn-ghost-bg) text-(--btn-ghost-text) hover:bg-(--btn-ghost-bg-hover) disabled:text-(--btn-ghost-text-disabled)',
                destructive:
                    'bg-(--btn-destructive-bg) text-(--btn-destructive-text) hover:bg-(--btn-destructive-bg-hover) disabled:bg-(--btn-destructive-bg-disabled) disabled:text-(--btn-destructive-text-disabled)',
                outline:
                    'border-border bg-background text-foreground hover:bg-muted disabled:opacity-50',
                link: 'text-(--text-link) underline-offset-4 hover:underline disabled:opacity-50',
            },
            size: {
                default:
                    'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2',
                xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
                sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
                lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2',
                icon: 'size-8',
                'icon-xs':
                    "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
                'icon-sm':
                    'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
                'icon-lg': 'size-9',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
)

function Button({
    className,
    variant = 'default',
    size = 'default',
    ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
    return (
        <ButtonPrimitive
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    )
}

export { Button, buttonVariants }
