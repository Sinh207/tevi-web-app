// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateAction } from './use-create-action'

/**
 * The claims here are about **which option means what**, and every one of them fails silently.
 *
 * - Only `event` is app-only. Posting is not: legacy's web composer exists and works, so a `post`
 *   row wired to the app prompt would be a *false statement* about where posting happens — and it
 *   would look completely correct on screen. That is the bug this file exists to hold shut, and it
 *   is the one this feature actually shipped in its first pass.
 * - `post` opens the **composer**, and does it through the store rather than by rendering a dialog:
 *   both navigation shells are in the DOM at once, so a dialog rendered from this hook would be two
 *   dialogs with two drafts. It also closes the options surface first — the composer's backdrop
 *   would otherwise land on the list it came from.
 * - The gate is on the `post` row, not the surface: a guest gets the menu, and the login dialog
 *   only once they pick Create a post — legacy's shape. `event` stays ungated, as in legacy.
 * - `GetAppDialog`'s `title` and `body` are **optional and fall back** to the generic "Get the Tevi
 *   app" copy, so a renamed key does not throw, does not log, and does not render an empty dialog:
 *   it renders a different, plausible one that says nothing about live events.
 */

const openLoginDialog = vi.hoisted(() => vi.fn())
const openComposer = vi.hoisted(() => vi.fn())
const authed = vi.hoisted(() => ({ value: true }))

vi.mock('@features/post', () => ({ openPostComposer: () => openComposer() }))

// Mirrors the real `useRequireAuth`: run the callback for an account, raise the dialog otherwise.
vi.mock('@features/auth', () => ({
    useRequireAuth:
        () =>
        (cb: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
            if (!authed.value) {
                openLoginDialog()
                return
            }
            cb(...a)
        },
}))

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))

function renderHook() {
    let api!: ReturnType<typeof useCreateAction>
    function Probe() {
        api = useCreateAction()
        return null
    }
    render(<Probe />)
    return {
        read: () => api,
        run: (fn: (a: typeof api) => void) => act(() => fn(api)),
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    authed.value = true
})

describe('useCreateAction', () => {
    it('offers post then event, and nothing else', () => {
        expect(
            renderHook()
                .read()
                .options.map(o => o.key),
        ).toEqual(['post', 'event'])
    })

    it('opens the composer from the post option, and never the app prompt', () => {
        const probe = renderHook()
        const post = probe.read().options.find(o => o.key === 'post')
        expect(post?.label).toBe('nav_create_post')

        probe.run(a => a.options.find(o => o.key === 'post')?.onSelect?.())

        expect(openComposer).toHaveBeenCalledTimes(1)
        // Posting is not app-only. A prompt here would be a false statement about where it happens.
        expect(probe.read().appPrompt.open).toBe(false)
    })

    /** Sequential, not stacked — the composer's backdrop must not land on the list behind it. */
    it('closes the options surface as the composer opens', () => {
        const probe = renderHook()
        probe.run(a => a.onOpenChange(true))
        expect(probe.read().open).toBe(true)

        probe.run(a => a.options.find(o => o.key === 'post')?.onSelect?.())
        expect(probe.read().open).toBe(false)
    })

    it('opens the app prompt from the event option only', () => {
        const probe = renderHook()
        expect(probe.read().appPrompt.open).toBe(false)

        probe.run(a => a.options.find(o => o.key === 'event')?.onSelect?.())

        expect(probe.read().appPrompt.open).toBe(true)
    })

    /** Sequential, not stacked — the prompt's backdrop must not land on the list behind it. */
    it('closes the options surface as the prompt opens', () => {
        const probe = renderHook()
        probe.run(a => a.onOpenChange(true))
        expect(probe.read().open).toBe(true)

        probe.run(a => a.options.find(o => o.key === 'event')?.onSelect?.())

        expect(probe.read().open).toBe(false)
        expect(probe.read().appPrompt.open).toBe(true)
    })

    it('opens the options surface for an account and closes it again', () => {
        const probe = renderHook()
        probe.run(a => a.onOpenChange(true))
        expect(probe.read().open).toBe(true)
        expect(openLoginDialog).not.toHaveBeenCalled()

        probe.run(a => a.onOpenChange(false))
        expect(probe.read().open).toBe(false)
    })

    /** A guest here includes the anonymous session every visitor carries — `isAuthenticated` is
     *  `id && !anonymous`, which is what the mocked `useRequireAuth` stands in for. */
    it('opens the options surface for a guest, and raises login only from the post row', () => {
        authed.value = false
        const probe = renderHook()

        probe.run(a => a.onOpenChange(true))
        expect(probe.read().open).toBe(true)
        expect(openLoginDialog).not.toHaveBeenCalled()

        probe.run(a => a.options.find(o => o.key === 'post')?.onSelect?.())

        expect(openLoginDialog).toHaveBeenCalledTimes(1)
        expect(openComposer).not.toHaveBeenCalled()
        // Closed first — the login dialog's backdrop must not land on the list behind it.
        expect(probe.read().open).toBe(false)
    })

    it('opens the app prompt from the event row for a guest, without asking to sign in', () => {
        authed.value = false
        const probe = renderHook()

        probe.run(a => a.options.find(o => o.key === 'event')?.onSelect?.())

        expect(probe.read().appPrompt.open).toBe(true)
        expect(openLoginDialog).not.toHaveBeenCalled()
    })

    it('names both halves of the prompt copy, so neither falls back to the generic get-app text', () => {
        const { appPrompt } = renderHook().read()
        expect(appPrompt.title).toBe('nav_create_event_app_title')
        expect(appPrompt.body).toBe('nav_create_event_app_body')
    })
})
