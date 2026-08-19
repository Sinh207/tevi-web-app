// @vitest-environment jsdom
import { render as renderToDom } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Button, __rendersLink, __rendersNativeButton } from './button'

/**
 * `Button`'s **semantics**, not its looks — geometry and variants are verified in the browser and
 * against Figma, and this repo renders no component trees for their own sake.
 *
 * Both things pinned here are invisible from a screen. `nativeButton` guards a runtime warning that
 * only appears once a `render`-as-link button is actually rendered — it shipped broken in
 * `app/not-found.tsx` and stayed broken until a second call site put that page on screen. And the
 * role a link ends up with is only observable in the accessibility tree: the element navigates,
 * looks right and works with a mouse either way.
 *
 * The role assertions render for real. What they are checking is a **merge order** inside Base UI
 * (its `role`/`tabIndex` against ours against the caller's), and no amount of inspecting our own
 * arguments can tell you what came out the other end.
 */
describe('rendersNativeButton', () => {
    it('reports a real button as native', () => {
        expect(__rendersNativeButton(createElement('button'))).toBe(true)
    })

    /**
     * The case that produced the warning: `render={<Link href="/" />}` renders an `<a>`, so Base UI
     * must be told to synthesise button semantics rather than assume them.
     */
    it('reports any other element as not native', () => {
        expect(__rendersNativeButton(createElement('a'))).toBe(false)
        expect(__rendersNativeButton(createElement('div'))).toBe(false)
        expect(__rendersNativeButton(createElement('span'))).toBe(false)
        // A component (what `next/link` is) — not the string `'button'`, so not native.
        const Anchor = () => null
        expect(__rendersNativeButton(createElement(Anchor))).toBe(false)
    })

    /**
     * `undefined` rather than `false`, so `nativeButton ?? derive(...)` leaves Base UI's own default
     * (`true`) in place. Returning `false` here would strip native semantics from every ordinary
     * `<Button>` in the app — the exact bug this function exists to prevent, inverted.
     */
    it('declines to answer when there is nothing to inspect', () => {
        expect(__rendersNativeButton(undefined)).toBeUndefined()
        // A function `render` is opaque: those callers pass the flag themselves.
        expect(__rendersNativeButton(() => createElement('a'))).toBeUndefined()
    })
})

describe('rendersLink', () => {
    it('recognises an anchor and anything carrying an href', () => {
        expect(__rendersLink(createElement('a'))).toBe(true)
        // What `next/link` looks like from here: a component, identified by its `href`.
        const Anchor = () => null
        expect(__rendersLink(createElement(Anchor, { href: '/somewhere' }))).toBe(true)
    })

    it('does not mistake an ordinary render for one', () => {
        expect(__rendersLink(createElement('button'))).toBe(false)
        expect(__rendersLink(createElement('div'))).toBe(false)
        expect(__rendersLink(undefined)).toBe(false)
        expect(__rendersLink(() => createElement('a', { href: '/x' }))).toBe(false)
    })
})

describe('what a link-shaped Button actually emits', () => {
    const linkButton = (props = {}) =>
        renderToDom(
            createElement(Button, { render: createElement('a', { href: '/x' }), ...props }, 'go'),
        ).container.querySelector('a') as HTMLAnchorElement

    /**
     * The regression this exists for: Base UI stamps `role="button"` on every non-native button, so
     * ten `render={<Link/>}` call sites were announcing themselves as buttons and were invisible to
     * `getByRole('link')` — including in `e2e/not-found.spec.ts`, which is how it was found.
     */
    it('announces an anchor as a link', () => {
        const anchor = linkButton()
        expect(anchor.getAttribute('role')).toBe('link')
        expect(anchor.getAttribute('href')).toBe('/x')
    })

    /**
     * Why the role is *stated* and not just removed: `role={undefined}` passes this file — the key
     * survives in a client tree — and is silently dropped on the way to a server-rendered page,
     * where JSON has no way to carry it. The first version of this fix did exactly that.
     */
    it('states the role rather than clearing it, so it survives the server boundary', () => {
        const linkProps = { role: 'link' as const }
        expect(JSON.parse(JSON.stringify(linkProps))).toEqual(linkProps)
        expect(JSON.parse(JSON.stringify({ role: undefined }))).toEqual({})
    })

    /** The override is applied before the caller's props, so a deliberate role still wins. */
    it('yields to an explicit role', () => {
        expect(linkButton({ role: 'menuitem' }).getAttribute('role')).toBe('menuitem')
    })

    /** And nothing changes for the ordinary case, which is every other button in the app. */
    it('leaves a real button alone', () => {
        const { container } = renderToDom(createElement(Button, {}, 'press'))
        const button = container.querySelector('button') as HTMLButtonElement
        expect(button.getAttribute('type')).toBe('button')
        expect(button.getAttribute('role')).toBeNull()
    })
})
