import { MenuDrawer, MenuProvider } from '@features/navigation'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CurrencyScreenPreview } from './currency-preview'

export const metadata: Metadata = { title: 'Left Bar', robots: { index: false, follow: false } }

/** Dev-only Left Bar preview: `pnpm dev` then open /dev/left-bar. 404s in production. */
export default function LeftBarPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-6 p-6">
            <header className="flex max-w-2xl flex-col gap-1">
                <h1 className="type-title-t1-bold text-text-title">Left Bar</h1>
                <p className="type-dense-default text-text-body">
                    Figma 3626:26373 — the account drawer, 342 wide. An assembly over{' '}
                    <code className="type-dense-emphasis">Card</code>,{' '}
                    <code className="type-dense-emphasis">FieldLabel</code>,{' '}
                    <code className="type-dense-emphasis">Avatar</code>,{' '}
                    <code className="type-dense-emphasis">Badge</code> and the{' '}
                    <code className="type-dense-emphasis">List</code> row parts. In the app it is
                    the rail's Menu entry — open it there to see the panel, slide and dismiss, none
                    of which are in the DS contract.
                </p>
                <ul className="type-caption-meta flex list-disc flex-col gap-1 ps-5 text-text-body">
                    <li>
                        Power Ups is the only list with a border, and it is a gradient hairline
                        (Primary 500 → Accents/Yellow) — only the first stop is bound in Figma.
                    </li>
                    <li>
                        The first five lists carry 8px of vertical padding and the last four carry
                        none. Nothing in the file explains the split; it is reproduced as-is.
                    </li>
                    <li>
                        Tevi Coin · Mini App Center · Tevi features are dropped: all three are
                        authored with a raster app mark and the DS ships one placeholder PNG for the
                        three of them. Tevi Premium kept its row and took the sprite's{' '}
                        <code>premium</code> glyph.
                    </li>
                    <li>
                        Presentation follows the <code>My Star — Desktop</code> comp: a{' '}
                        <code>basic</code> profile card rather than the DS gradient, a bordered
                        balance card, a chevron on every row, and 24 of top padding instead of the
                        DS's 64 mobile status-bar inset.
                    </li>
                </ul>
            </header>
            {/*
             * The drawer is a screen stack in a frame that gives it its height (see
             * `app-side.tsx`), so a preview has to stand in for both: `MenuProvider`
             * because `view` and `open` live there, and a fixed box because the stack's
             * screens are absolutely positioned and would otherwise collapse to nothing.
             */}
            <MenuProvider>
                <div className="h-[720px] w-[342px] overflow-hidden outline outline-(--separator-default)">
                    <MenuDrawer />
                </div>
            </MenuProvider>

            <section className="flex flex-col gap-3">
                <header className="flex max-w-2xl flex-col gap-1">
                    <h2 className="type-title-t2-semibold text-text-title">Change currency</h2>
                    <p className="type-dense-default text-text-body">
                        Pushed from the balance card's own currency control, as legacy's{' '}
                        <code className="type-dense-emphasis">BtnCurrency</code> opens a dialog from
                        that spot. Neither the DS nor legacy has a search here; the endpoint answers
                        with ~150 rows, so the field and its ranking are the app's own (see{' '}
                        <code className="type-dense-emphasis">searchCurrencies</code>). Above is the
                        drawer as an anonymous visitor sees it — the list needs a real account,
                        which is why this preview runs on a fixture.
                    </p>
                </header>
                <CurrencyScreenPreview />
            </section>
        </main>
    )
}
