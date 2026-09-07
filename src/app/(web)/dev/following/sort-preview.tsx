'use client'

import { FOLLOWED_ORDERINGS, type FollowedOrdering } from '@features/channel'
import { FilterMenu } from '@shared/components/filter-menu'
import { Icon } from '@shared/ui/icon'
import { ListHeader, ListHeaderAction, ListHeaderTitle } from '@shared/ui/list'
import { useState } from 'react'

/**
 * The ordering control, in the header it actually sits in.
 *
 * It is on the page because the shipped screen only draws it over a **non-empty** follow list, so
 * it is unreachable without an account that follows somebody — and because it is a combination this
 * repo has used once before and never with text: `FilterMenu` at `variant="compact"` with a
 * *supplied* trigger, which is how base-ui merges `onClick` / `aria-haspopup` / `aria-expanded` onto
 * an element the caller owns (`/dev/my-membership` does the same with a `BarIconButton`).
 *
 * The labels are the English ones rather than `t()` — this page is dev-only and never localised, and
 * hard-coding them here keeps the preview from depending on the locale the browser happens to be in.
 */
const LABELS: Record<FollowedOrdering, string> = {
    '-last_activity_at': 'Last activity',
    '-follows__created_at': 'Last follow',
}

export function FollowingSortPreview() {
    const [ordering, setOrdering] = useState<FollowedOrdering>(FOLLOWED_ORDERINGS[0])
    const options = FOLLOWED_ORDERINGS.map(value => ({ key: value, label: LABELS[value] }))
    const label = `Sort by ${LABELS[ordering].toLowerCase()}`

    return (
        <div className="bg-(--background-surface) md:rounded-[var(--radius-xl)]">
            {/* Name plus control, matching the shipped row — see `following-view.tsx` for why the
                word repeats the bar's on purpose. `h3` here rather than the `h2` it ships as: this
                page's own sections are already `h2`. */}
            <ListHeader>
                <ListHeaderTitle as="h3">Following</ListHeaderTitle>
                <ListHeaderAction>
                    <FilterMenu
                        variant="compact"
                        options={options}
                        value={ordering}
                        onChange={key => setOrdering(key as FollowedOrdering)}
                        triggerLabel={label}
                        trigger={
                            <button
                                type="button"
                                className="type-dense-default flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-(--text-title) outline-none focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                            >
                                {label}
                                <Icon name="angle-down" size={16} className="flex-none" />
                            </button>
                        }
                    />
                </ListHeaderAction>
            </ListHeader>
            <p className="type-caption-meta p-4 text-(--text-body)">
                Applied: <code>{ordering}</code>
            </p>
        </div>
    )
}
