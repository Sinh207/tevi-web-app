import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { type GlyphEntry, IconGallery } from './icon-gallery'

export const metadata: Metadata = { title: 'Icons', robots: { index: false, follow: false } }

const WEIGHTS = ['filled', 'light', 'duotone', 'duotone-line']

/** Dev-only sprite browser: `pnpm dev` then open /dev/icons. 404s in production. */
export default async function IconsPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    const sprite = await readFile(join(process.cwd(), 'design-system/tevi-icons.svg'), 'utf8')
    const ids = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]))

    const glyphs: GlyphEntry[] = [...ids]
        .filter(id => !id.includes('--'))
        .sort()
        .map(name => ({ name, weights: WEIGHTS.filter(w => ids.has(`${name}--${w}`)) }))

    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-text-title">Tevi icons</h1>
                <p className="type-dense-default text-text-body">
                    {glyphs.length} glyphs from{' '}
                    <code className="type-dense-emphasis">design-system/tevi-icons.svg</code>. Use{' '}
                    <code className="type-dense-emphasis">
                        &lt;Icon name="…" size=&#123;20&#125; /&gt;
                    </code>{' '}
                    from <code className="type-dense-emphasis">@shared/ui/icon</code> — glyphs paint
                    with <code className="type-dense-emphasis">currentColor</code>.
                </p>
            </header>
            <IconGallery glyphs={glyphs} />
        </main>
    )
}
