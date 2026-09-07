'use client'

import {
    type SearchChannel,
    SearchChannelRow,
    SearchFollowingStrip,
    SearchRecentsList,
} from '@features/search'
import { Button } from '@shared/ui/button'
import { useState } from 'react'

/**
 * The interactive half of `/dev/search`.
 *
 * It exists for the reason `BlockedAccountsPreview` does, plus one that is specific to a server
 * page: **an event handler cannot cross the server→client boundary at all.** Passing
 * `onOpen={() => undefined}` to `SearchChannelRow` from `page.tsx` is not a lint nit — the flight
 * payload cannot serialise a function, so the section throws at render and the page comes back
 * with the boundary's fallback where the rows should be. It returned HTTP 200 while doing it,
 * which is how this reaches a review.
 *
 * So every section that takes a callback lives here, and the callbacks do something real rather
 * than being `() => undefined`: the recents list is state, so removing and clearing can actually
 * be watched, and opening a row prints what the real screen would have recorded as a recent.
 */

/** The panel the real screen wraps every state in — repeated so the states read in context. */
const PANEL = 'overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]'

export function SearchPreview({
    rows,
    following,
    recents: initialRecents,
}: {
    rows: SearchChannel[]
    /** Enough tiles to overflow the strip — the worst case a one-character term produces, and the
        only state in which the arrows exist at all. */
    following: SearchChannel[]
    recents: string[]
}) {
    const [recents, setRecents] = useState(initialRecents)
    /** What the real screen would have written to Recents — the `commit` a press stands for. */
    const [opened, setOpened] = useState<string | null>(null)

    return (
        <>
            <Section title="following strip — scrolls; arrows on a fine pointer, and only when there is travel left">
                <SearchFollowingStrip
                    channels={following}
                    onOpen={() => setOpened('a following tile')}
                />
            </Section>

            {/* The common case: a term that matches two of the spaces you follow. No overflow, so
                no arrows and no chrome — the state a preview built only from the worst case hides. */}
            <Section title="following strip — a strip that fits">
                <SearchFollowingStrip
                    channels={following.slice(0, 2)}
                    onOpen={() => setOpened('a following tile')}
                />
            </Section>

            <Section title="result rows">
                <ul className="list-none">
                    {rows.map((channel, index) => (
                        <SearchChannelRow
                            key={channel.slug}
                            channel={channel}
                            rule={index > 0}
                            /*
                             * The row is a real anchor to `/@{slug}` and none of these fixtures
                             * is a space that exists, so a press will leave for a 404 — which is
                             * the honest preview of a link. `onOpen` fires first, and what it
                             * prints below is the term the real screen records at that moment.
                             */
                            onOpen={() => setOpened(channel.slug)}
                            enterDelay={index * 40}
                        />
                    ))}
                </ul>
            </Section>

            <p className="type-dense-default px-4 text-(--text-body)">
                last opened (the term the real screen would record):{' '}
                <span className="text-(--text-title)">{opened ?? '—'}</span>
            </p>

            <Section title="recents — live">
                {recents.length > 0 ? (
                    <SearchRecentsList
                        recents={recents}
                        onPick={term => setOpened(term)}
                        onForget={term => setRecents(list => list.filter(t => t !== term))}
                        onClear={() => setRecents([])}
                    />
                ) : (
                    <div className="flex items-center justify-between p-4">
                        <span className="type-dense-default text-(--text-body)">
                            cleared — the real screen shows the idle prompt here
                        </span>
                        <Button
                            variant="ghost"
                            size="small"
                            onClick={() => setRecents(initialRecents)}
                        >
                            Reset
                        </Button>
                    </div>
                )}
            </Section>
        </>
    )
}

/** The 612 column is applied by the page around this, so the sections only own the panel. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            {/* `px-4` is the panel's own inset — the page deliberately has none, so the label
                lines up with the panel content rather than with the window edge. */}
            <h2 className="type-micro-overline px-4 text-(--text-body)">{title}</h2>
            <div className={PANEL}>{children}</div>
        </section>
    )
}
