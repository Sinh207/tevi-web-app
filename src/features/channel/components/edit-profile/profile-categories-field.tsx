'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useChannelCategories } from '../../hooks/use-profile-options'

/**
 * What the space is about — a set of toggle chips, not a dropdown.
 *
 * ## Why chips rather than legacy's multi-select
 *
 * Legacy uses MUI's `<Select multiple>`: a closed box that has to be opened to find out what is
 * in it, renders the choices as chips *inside* the trigger, and on a phone covers the screen with
 * a scrolling menu. The set here is on the order of fifteen short words — small enough to show at
 * once, which turns "open the menu, scroll, tap, close, verify" into one tap.
 *
 * It is also the version this design system can actually draw: the DS ships no Dropdown or Select
 * (`components.md`), so a select would be either a native `<select multiple>` — which no platform
 * renders acceptably — or an invented component. Chips are `<button aria-pressed>`, which is a
 * real control with real semantics and no new primitive.
 *
 * ## Failure is quiet on purpose
 *
 * An empty list renders as "no categories available" and the rest of the form keeps working. This
 * is one optional field out of seven; taking the screen down because its options did not load
 * would be the wrong trade, and `useChannelCategories` documents the same reasoning from the data
 * side.
 */
export function ProfileCategoriesField({
    selected,
    onChange,
    disabled,
}: {
    selected: string[]
    onChange: (next: string[]) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const { categories, isLoading } = useChannelCategories()

    const toggle = (name: string) => {
        onChange(
            selected.includes(name)
                ? selected.filter(value => value !== name)
                : // Appended, not sorted: `buildChannelPatch` compares the list positionally, so
                  // re-ordering it on every tap would report the field as changed when it is not.
                  [...selected, name],
        )
    }

    return (
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="type-dense-strong pb-1.5 text-(--text-body)">
                {t('profile_categories')}
            </legend>

            {isLoading ? (
                <div className="flex flex-wrap gap-2" aria-busy="true">
                    {[72, 96, 64, 88, 80].map((width, index) => (
                        <Skeleton
                            key={width}
                            w={width}
                            h={32}
                            delay={index * 160}
                            className="rounded-[var(--radius-fill)]"
                        />
                    ))}
                </div>
            ) : categories.length === 0 ? (
                <p className="type-caption-meta text-(--text-subtitle)">
                    {t('profile_categories_unavailable')}
                </p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {categories.map(name => {
                        const active = selected.includes(name)
                        return (
                            <button
                                data-testid="channel-profile-category"
                                data-option-value={name}
                                key={name}
                                type="button"
                                // `aria-pressed`, not `aria-selected`: these are independent
                                // toggles, not options in a listbox, and only one of the two is
                                // announced correctly outside a `listbox` role.
                                aria-pressed={active}
                                disabled={disabled}
                                onClick={() => toggle(name)}
                                className={cn(
                                    'type-caption-meta flex h-8 items-center gap-1 rounded-[var(--radius-fill)] px-3',
                                    'border transition-colors',
                                    'disabled:cursor-not-allowed disabled:opacity-60',
                                    active
                                        ? 'border-transparent bg-(--accents-indigo-bg-active) text-(--accents-indigo-active)'
                                        : 'border-(--button-secondary-border) bg-(--button-ghost-bg) text-(--text-body) hover:bg-(--background-segment)',
                                )}
                            >
                                {active && <Icon name="check" size={16} aria-hidden />}
                                {name}
                            </button>
                        )
                    })}
                </div>
            )}

            <p className="type-caption-meta min-h-4 text-(--text-subtitle)">
                {t('profile_categories_hint')}
            </p>
        </fieldset>
    )
}
