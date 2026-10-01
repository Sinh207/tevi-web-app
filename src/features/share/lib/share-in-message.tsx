'use client'

import { type ComponentType, createContext, type ReactNode, useContext } from 'react'

/**
 * The seam the "Send in message" block comes in through — **a slot, not an import.**
 *
 * The block is a messenger screen: the reader's conversations, the conversation search, the send
 * endpoint and the caches all three write to. That is `features/message`, and this feature cannot
 * import it: `features/message` imports `features/channel`, which imports this feature for the space
 * bar's Share, so the edge would close a barrel cycle — the `undefined is not a function` at render
 * time that `CLAUDE.md` describes, not a build error.
 *
 * So the dependency points the other way. This file declares what the sheet hands a block and what
 * it expects back; `features/message` builds a component to that shape; and `app/`, which composes
 * features and is the one place allowed to see both, puts it in the provider
 * (`app/session-providers.tsx`). The same flattening `ReplyDialogHost` does for the reader's avatar.
 *
 * **No provider, no block.** A `/app/*` webview mounts no session and so no provider, and the sheet
 * draws its link preview and channel row as before. The block itself decides whether the *reader*
 * can use it (a guest has no conversations); the sheet only decides whether there is one at all.
 */

export type ShareInMessageView = 'row' | 'picker'

export type ShareInMessageProps = {
    /**
     * `row` is the sheet's middle block — recent conversations as discs, a message box once one is
     * picked. `picker` is the full "Send to" step with the search, which the sheet enters when the
     * block asks for it (`onExpand`). One component in both, so the selection survives the switch.
     */
    view: ShareInMessageView
    /** The block wants the whole sheet — its "More" disc. The sheet moves to its picker step. */
    onExpand: () => void
    /**
     * The link to send, minted on the DM's own channel (`internal`). Resolves to the content's plain
     * URL if the link service will not answer, so a send never waits on attribution.
     */
    resolveLink: () => Promise<string>
    /** At least one conversation received the share. The sheet closes. */
    onSent: () => void
    /**
     * The base the block derives its test ids from (`subTestId(testScope, 'item')`), so it authors
     * no scope of its own. Not called `testId` on purpose: the sheet puts `share-dm` on the element
     * that wraps the block, which is where `pnpm testids` can see it — the testid linter reads JSX
     * statically and cannot follow a component that arrives through a context.
     */
    testScope: string
}

const ShareInMessageContext = createContext<ComponentType<ShareInMessageProps> | null>(null)

/** Mounted by `app/` with the component `features/message` exports. */
export function ShareInMessageProvider({
    component,
    children,
}: {
    component: ComponentType<ShareInMessageProps>
    children: ReactNode
}) {
    return <ShareInMessageContext value={component}>{children}</ShareInMessageContext>
}

/** The block, or `null` where nothing provides one. */
export function useShareInMessage(): ComponentType<ShareInMessageProps> | null {
    return useContext(ShareInMessageContext)
}
