'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { Icon } from '@shared/ui/icon'
import type { Program } from '../api/types'

/**
 * "View <program> →" — the chip that opens the mini app's own page.
 *
 * ## The URL is vetted
 *
 * `program.url` is server-supplied and goes into an `href`, which is the sink `safeExternalUrl`
 * exists for: a `javascript:` value there runs as the visitor, on our origin, with their session.
 * Legacy hands it straight to `window.open`.
 *
 * ## It renders nothing without a URL
 *
 * Legacy renders the chip regardless and makes it inert (`cursor: default`, click returns early), so
 * a program with no page shows an affordance that looks pressable and is not. Here no link means no
 * chip — the program's name is already on the screen above it.
 *
 * ## The name is interpolated, not concatenated
 *
 * Legacy does `t('View [%s]').split('[%s]')[0]` and then appends a bold `<span>`, which hard-codes
 * the name *after* the verb — wrong for any language that puts it first. `<Trans>`-free equivalent
 * here: the key takes `{{name}}` and the whole string is the link's text, so word order is the
 * translator's.
 */
export function ViewProgramChip({ program }: { program: Program | null }) {
    const { t } = useTranslation()

    const href = safeExternalUrl(program?.url)
    if (!href) return null

    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className={[
                'inline-flex items-center gap-1 rounded-(--radius-fill) ps-3 pe-2 py-1',
                'type-dense-default text-(--text-title)',
                'bg-(--background-subtle) shadow-[inset_0_0_0_1px_var(--separator-strong)]',
                'transition-colors hover:bg-(--button-secondary-bg-hover)',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
            ].join(' ')}
        >
            <span className="truncate">
                {t('affiliate_view_program', { name: program?.name ?? '' })}
            </span>
            {/* Mirrored in RTL — the arrow means "onward", which is leftward there. */}
            <Icon name="arrow-right" size={16} className="flex-none rtl:-scale-x-100" />
        </a>
    )
}
