import { create } from 'zustand'

/**
 * The floating chat window's state — legacy's `DirectMessageProvider` (`isEnlarged`, `isOpenChat`
 * and the chat room's channel), as UI state only. What is *in* the window is server state and stays
 * in TanStack Query; this holds whether it is open and which conversation it shows.
 *
 * Zustand rather than a context for the reason the mini-app player is: the openers are everywhere
 * (a space's Send message, a post's) and the renderer is one place, so a provider would re-render
 * every page that can open a chat whenever the window changed.
 *
 * `slug` is the conversation's space, not a conversation id — the same key the route uses, so
 * "open in full" is `conversationPath(slug)` and the room is found the way `/@{slug}/messages` finds
 * it.
 */
interface ChatPopupState {
    /**
     * A window is on screen to open into — set by `ChatPopup` while it is mounted **and** the
     * viewport is wide enough to draw it. The openers read this rather than re-deriving where the
     * window lives, so a page without one (a phone, Messages itself) navigates instead.
     */
    hosted: boolean
    setHosted: (hosted: boolean) => void
    /** The window is open (legacy's "enlarged"); closed it is only its title bar. */
    expanded: boolean
    /** The conversation shown over the list, or `null` for the list itself. */
    slug: string | null
    setExpanded: (expanded: boolean) => void
    /** Open the window on one conversation — a space's Send message. */
    openRoom: (slug: string) => void
    /** Back to the list, keeping the window open. */
    closeRoom: () => void
    reset: () => void
}

export const useChatPopupStore = create<ChatPopupState>(set => ({
    hosted: false,
    setHosted: hosted => set({ hosted }),
    expanded: false,
    slug: null,
    setExpanded: expanded => set({ expanded }),
    openRoom: slug => set({ expanded: true, slug }),
    closeRoom: () => set({ slug: null }),
    reset: () => set({ expanded: false, slug: null }),
}))
