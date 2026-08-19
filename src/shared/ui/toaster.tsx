'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { Icon } from './icon'
import { Loader } from './loader'

/**
 * The app's toast surface — sonner, dressed in Tevi's tokens.
 *
 * ## Ported from `mmg-web`, with its two substitutions
 *
 * The arrangement is that project's `components/ui/sonner.jsx`: a status **icon** on the left, a
 * medium 14px title, a 13px subtitle under it, and a per-status tint — background *and* border from
 * the same accent — so the kind of message reads before the words do. Sonner's own `richColors`
 * does something similar and is not used, there or here: it paints its own palette, and this app
 * has one.
 *
 * Two things are deliberately **not** copied:
 *
 * - **The glyphs.** `mmg-web` uses lucide (`OctagonXIcon`, `CircleCheckIcon`, …). This app's icons
 *   come from the DS sprite, and `shared/ui/alert.tsx` has already decided which glyph means which
 *   status. A toast and an alert saying the same thing with different shapes would be the drift
 *   `BarIconButton`'s note is about, so the mapping is imported from the same idea rather than
 *   invented twice.
 * - **The token names.** `--bg-elevated` / `--error-bg-active` there are `--background-elevated` /
 *   `--accents-error-bg-active` here. Same roles, this app's spellings.
 *
 * ## Why the classes carry `!`
 *
 * Sonner ships its own stylesheet and its selectors are more specific than a single utility class.
 * `!` is the escape hatch its own documentation points at, and it is confined to this file — one
 * component's worth of overrides rather than a global stylesheet fighting a library.
 */
export function Toaster(props: ToasterProps) {
    return (
        <Sonner
            className="toaster group"
            icons={{
                success: (
                    <Icon
                        name="check-circle"
                        weight="filled"
                        size={20}
                        className="text-(--accents-success-active)"
                    />
                ),
                info: (
                    <Icon
                        name="info-circle"
                        weight="filled"
                        size={20}
                        className="text-(--accents-indigo-active)"
                    />
                ),
                warning: (
                    <Icon
                        name="exclamation-triangle"
                        weight="filled"
                        size={20}
                        className="text-(--accents-warning-active)"
                    />
                ),
                error: (
                    <Icon
                        name="xmark-circle"
                        weight="filled"
                        size={20}
                        className="text-(--accents-error-active)"
                    />
                ),
                // The DS's own "working…" indicator rather than a spinning glyph — it is what
                // `Loader` exists for, and it already respects `prefers-reduced-motion`.
                loading: <Loader />,
            }}
            style={
                {
                    // The neutral toast — a plain `toast()` with no status. Elevated rather than
                    // surface: it floats over the page, which is what that token is for.
                    '--normal-bg': 'var(--background-elevated)',
                    '--normal-text': 'var(--text-title)',
                    '--normal-border': 'var(--separator-strong)',
                    '--border-radius': 'var(--radius-lg)',
                } as React.CSSProperties
            }
            toastOptions={{
                classNames: {
                    toast: '!rounded-xl !border !shadow-xl !px-4 !py-3.5 !gap-3 !items-center !font-sans',
                    title: '!type-dense-strong !text-(--text-title)',
                    description: '!type-caption-meta !mt-1 !text-(--text-subtitle)',
                    icon: '!m-0 !shrink-0',
                    /*
                     * The status tint: background from the accent's `-bg-active` step, border from
                     * the accent itself at 30% so the edge reads without becoming a second line of
                     * colour. The icon colours above are the same four accents, which is what makes
                     * the whole toast one statement rather than a coloured box with a glyph in it.
                     */
                    error: '!bg-(--accents-error-bg-active) !border-(--accents-error-active)/30',
                    success:
                        '!bg-(--accents-success-bg-active) !border-(--accents-success-active)/30',
                    warning:
                        '!bg-(--accents-warning-bg-active) !border-(--accents-warning-active)/30',
                    info: '!bg-(--accents-indigo-bg-active) !border-(--accents-indigo-active)/30',
                },
            }}
            {...props}
        />
    )
}
