import { create } from 'zustand'

/**
 * Is the post composer open?
 *
 * ## Why a store rather than local state in the control that opens it
 *
 * The same reason `features/mini-app` gives for its window: **the openers are everywhere and the
 * renderer is one place.** Two navigation shells offer *Create a post* — the rail's `+` above `md`
 * and the tab bar's FAB below it — and both are in the DOM at once (`docs/TEST_IDS.md` §5 states
 * that plainly, which is why their testids differ). State held in `useCreateAction` would be one
 * copy per shell, so the composer would mount twice: two dialogs, two drafts, two sets of object
 * URLs, and whichever one base-ui focused would be a coin toss.
 *
 * A context would work and would re-render every consumer of it on open; a store re-renders only
 * what subscribes. Nothing else about the composer is in here — the **draft** is the dialog's own
 * state, because it dies with the dialog and nothing outside needs to read it. This holds one
 * boolean, which is the whole of what two shells and one renderer have to agree on.
 *
 * It is UI state, so Zustand is correct per `CLAUDE.md`'s first rule: nothing here is server data.
 */
/**
 * What the opener already knows about the post — today, only which collections it goes in.
 *
 * A collection's *Create post* opens the composer with that collection picked, which is legacy's
 * `PostForm collectionId`. The composer reads this **once, as it opens**, into its own draft; it is
 * not a second copy of the draft, and it is cleared by the next plain `open()`.
 */
export interface PostComposerPreset {
    collectionIds?: string[]
}

interface PostComposerState {
    isOpen: boolean
    preset: PostComposerPreset
    open: (preset?: PostComposerPreset) => void
    close: () => void
    setOpen: (open: boolean) => void
}

export const usePostComposerStore = create<PostComposerState>(set => ({
    isOpen: false,
    preset: {},
    open: (preset = {}) => set({ isOpen: true, preset }),
    close: () => set({ isOpen: false }),
    setOpen: (isOpen: boolean) => set(isOpen ? { isOpen } : { isOpen, preset: {} }),
}))

/**
 * Open the composer from outside React.
 *
 * `useCreateAction` builds its rows as plain objects during render, so the `onSelect` it hands out
 * is a callback with no hook context of its own. Reading the store imperatively is what lets that
 * row stay a value rather than becoming a component.
 */
export function openPostComposer(preset?: PostComposerPreset) {
    usePostComposerStore.getState().open(preset)
}
