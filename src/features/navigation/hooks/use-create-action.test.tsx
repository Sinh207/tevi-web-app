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
 * - `post` carries **no** `onSelect`, which is how every surface knows to dim it. Give it one and
 *   the row becomes a live button to nothing.
 * - The gate is on the surface, not the rows: a guest gets the login dialog and no menu. The rail's
 *   `+` is on every desktop page, so this is one of the most-pressed controls in the app.
 * - `GetAppDialog`'s `title` and `body` are **optional and fall back** to the generic "Get the Tevi
 *   app" copy, so a renamed key does not throw, does not log, and does not render an empty dialog:
 *   it renders a different, plausible one that says nothing about live events.
 */

const openLoginDialog = vi.hoisted(() => vi.fn())
const authed = vi.hoisted(() => ({ value: true }))

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

    it('leaves the post option without an action, which is what dims its row', () => {
        const post = renderHook()
            .read()
            .options.find(o => o.key === 'post')
        expect(post?.onSelect).toBeUndefined()
        expect(post?.label).toBe('nav_create_post')
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
    it('raises the login dialog for a guest, and opens nothing', () => {
        authed.value = false
        const probe = renderHook()

        probe.run(a => a.onOpenChange(true))

        expect(openLoginDialog).toHaveBeenCalledTimes(1)
        expect(probe.read().open).toBe(false)
        expect(probe.read().appPrompt.open).toBe(false)
    })

    it('names both halves of the prompt copy, so neither falls back to the generic get-app text', () => {
        const { appPrompt } = renderHook().read()
        expect(appPrompt.title).toBe('nav_create_event_app_title')
        expect(appPrompt.body).toBe('nav_create_event_app_body')
    })
})
