'use client'

import { Icon, type IconSize } from '@shared/ui/icon'
import { useMemo, useState } from 'react'

export interface GlyphEntry {
    name: string
    /** Alternate weights Figma actually drew for this glyph. */
    weights: string[]
}

const SIZES: IconSize[] = [16, 18, 20, 24]
const WEIGHT_FILTERS = ['all', 'filled', 'light', 'duotone', 'duotone-line'] as const
type WeightFilter = (typeof WEIGHT_FILTERS)[number]

/**
 * Dev-only sprite browser. Tiles render through a raw `<use>` against the full
 * sprite at `/dev/icons/sprite` — the names arrive as runtime strings, and the
 * shipped subset only carries glyphs the app actually references. The strip at
 * the top uses the real `<Icon>`, so it reads from that subset instead and
 * doubles as a check that the build wired it up.
 */
export function IconGallery({ glyphs }: { glyphs: GlyphEntry[] }) {
    const [query, setQuery] = useState('')
    const [weight, setWeight] = useState<WeightFilter>('all')
    const [size, setSize] = useState<IconSize>(24)
    const [copied, setCopied] = useState<string | null>(null)

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        return glyphs.filter(
            g => (!q || g.name.includes(q)) && (weight === 'all' || g.weights.includes(weight)),
        )
    }, [glyphs, query, weight])

    const suffix = weight === 'all' ? '' : `--${weight}`

    async function copy(name: string) {
        await navigator.clipboard.writeText(name)
        setCopied(name)
        setTimeout(() => setCopied(c => (c === name ? null : c)), 1200)
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Component check — real <Icon />, one per weight, literal names. */}
            <section className="flex flex-col gap-3 rounded-xl bg-background-surface p-4 shadow-sm">
                <h2 className="type-caption-label-strong text-text-subtitle">
                    &lt;Icon /&gt; component check
                </h2>
                <div className="flex flex-wrap items-center gap-6 text-icon-default">
                    <Icon name="angle-left" size={24} title="default weight" />
                    <Icon name="heart" weight="filled" size={24} className="text-text-error" />
                    <Icon name="nsfw" weight="light" size={24} />
                    <Icon name="badge-check" weight="duotone" size={24} />
                    <Icon name="level-hexagon" weight="duotone-line" size={24} />
                    <span className="type-caption-meta text-text-body">
                        default · filled · light · duotone · duotone-line
                    </span>
                </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Filter by name…"
                    className="type-body-default h-9 min-w-56 flex-1 rounded-lg border border-separator-default bg-background-surface px-3 text-text-title outline-none placeholder:text-text-placeholder focus-visible:border-(--input-border-focus)"
                />
                <select
                    value={weight}
                    onChange={e => setWeight(e.target.value as WeightFilter)}
                    className="type-dense-default h-9 rounded-lg border border-separator-default bg-background-surface px-2 text-text-title"
                >
                    {WEIGHT_FILTERS.map(w => (
                        <option key={w} value={w}>
                            {w}
                        </option>
                    ))}
                </select>
                <div className="flex items-center gap-1">
                    {SIZES.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSize(s)}
                            className={`type-caption-label h-9 rounded-lg px-3 ${
                                s === size
                                    ? 'bg-background-segment-focus text-text-title shadow-xs'
                                    : 'text-text-body'
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            <p className="type-caption-meta text-text-body">
                {shown.length} of {glyphs.length} glyphs · click a tile to copy its name
            </p>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                {shown.map(g => (
                    <button
                        key={g.name}
                        type="button"
                        onClick={() => copy(g.name)}
                        title={g.name}
                        className="flex flex-col items-center gap-2 rounded-lg bg-background-surface p-3 text-icon-default transition-colors hover:bg-background-subtle"
                    >
                        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative — the
                            button is already named by the visible glyph name below it. */}
                        <svg width={size} height={size} aria-hidden focusable="false">
                            <use href={`/dev/icons/sprite#${g.name}${suffix}`} />
                        </svg>
                        <span className="type-caption-meta w-full truncate text-text-body">
                            {copied === g.name ? 'copied' : g.name}
                        </span>
                    </button>
                ))}
            </div>

            {shown.length === 0 && (
                <p className="type-body-default py-12 text-center text-text-body">
                    No glyph matches “{query}”. Do not substitute a similar shape — ask for the icon
                    to be added to the design system.
                </p>
            )}
        </div>
    )
}
