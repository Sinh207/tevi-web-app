import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * Text Field/Label — Figma "Text Field", the label row on its own.
 *
 * 4/16 padding over Dense Strong (14 Semi Bold), so it hugs to 29. It doubles as
 * the section heading above a list; the Left Bar resizes every instance to a fixed
 * 32, which is why `height` is a prop here rather than baked in.
 *
 * `data` is the optional right-hand value (a character count in a form, a unit in a
 * spec sheet) — Text/Subtitle against the label's Text/Body.
 */
export type FieldLabelProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
    children: ReactNode
    data?: ReactNode
}

function FieldLabel({ className, children, data, ...props }: FieldLabelProps) {
    return (
        <div
            data-slot="field-label"
            className={cn('type-dense-strong flex items-center gap-0 px-4 py-1', className)}
            {...props}
        >
            <span data-slot="field-label-text" className="min-w-0 flex-auto text-(--text-body)">
                {children}
            </span>
            {data !== undefined && (
                <span
                    data-slot="field-label-data"
                    className="flex-none text-(--text-subtitle)"
                >
                    {data}
                </span>
            )}
        </div>
    )
}

export { FieldLabel }
