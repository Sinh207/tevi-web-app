import { MessagesShell } from '@features/message'

/**
 * Direct messages — `/messages` and `/@{slug}/messages` — share one frame, and it is a **layout**
 * so it survives navigating between them: the conversation list stays mounted (scroll, search,
 * folder) while the room pane beside it swaps. `MessagesShell` has the geometry and why each pane
 * scrolls on its own.
 *
 * A route group in `(main)` for the shell, and **outside `(rail)`**: the two panes run to 1504px,
 * so the end rail — pinned 22px past a 612 column — would land on the room pane. Its `[slug]` is a
 * sibling of the space page's `(rail)/[slug]`; both groups resolve the segment to the same name,
 * so the router sees one dynamic segment with two children, not two conflicting ones.
 */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
    return (
        <main className="flex flex-1 flex-col">
            <MessagesShell>{children}</MessagesShell>
        </main>
    )
}
