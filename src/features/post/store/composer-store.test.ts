import { beforeEach, describe, expect, it } from 'vitest'
import { openPostComposer, usePostComposerStore } from './composer-store'

/**
 * A collection's *Create post* opens the composer with that collection picked. The preset is a
 * one-off input, so the thing worth pinning is that it does **not** outlive the opening it came
 * with — a plain *Create a post* afterwards must not file the post into the last collection.
 */
describe('composer preset', () => {
    beforeEach(() => usePostComposerStore.setState({ isOpen: false, preset: {} }))

    it('carries the collection an opener names', () => {
        openPostComposer({ collectionIds: ['c1'] })
        expect(usePostComposerStore.getState()).toMatchObject({
            isOpen: true,
            preset: { collectionIds: ['c1'] },
        })
    })

    it('is replaced by the next plain open', () => {
        openPostComposer({ collectionIds: ['c1'] })
        usePostComposerStore.getState().setOpen(false)
        openPostComposer()
        expect(usePostComposerStore.getState().preset).toEqual({})
    })

    it('is dropped when the composer closes', () => {
        openPostComposer({ collectionIds: ['c1'] })
        usePostComposerStore.getState().setOpen(false)
        expect(usePostComposerStore.getState().preset).toEqual({})
    })
})
