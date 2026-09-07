// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { canStartDragFrom } from './drag-origin'

let surface: HTMLElement

beforeEach(() => {
    document.body.innerHTML = `
        <div id="strip">
            <span id="background"></span>
            <div data-no-drag><span id="inside-no-drag"></span></div>
            <button id="tab"><span id="inside-button"></span></button>
        </div>
        <!-- What base-ui does with a popup: same React tree, different place in the document. -->
        <div id="portal"><div id="menuitem" role="menuitem">Reload page</div></div>
    `
    surface = document.querySelector<HTMLElement>('#strip')!
})

const at = (id: string) => document.querySelector(`#${id}`)

describe('canStartDragFrom', () => {
    it('allows a press on the surface itself', () => {
        expect(canStartDragFrom(surface, surface)).toBe(true)
        expect(canStartDragFrom(at('background'), surface)).toBe(true)
    })

    it('refuses a press that happened in a portal', () => {
        /*
         * The bug this file exists for. React propagates a portalled element's events along the
         * **React** tree, so the strip's `onPointerDown` really does run for a click on the ⋯ menu
         * — and the `setPointerCapture` that follows swallows the `click` the menu was waiting for.
         * Nothing about it looks like a drag bug: the symptom is a menu whose rows do nothing.
         */
        expect(canStartDragFrom(at('menuitem'), surface)).toBe(false)
    })

    it('refuses interactive children and anything opted out', () => {
        expect(canStartDragFrom(at('tab'), surface)).toBe(false)
        expect(canStartDragFrom(at('inside-button'), surface)).toBe(false)
        expect(canStartDragFrom(at('inside-no-drag'), surface)).toBe(false)
    })

    it('refuses a missing surface or a non-element target', () => {
        expect(canStartDragFrom(at('background'), null)).toBe(false)
        expect(canStartDragFrom(window, surface)).toBe(false)
        expect(canStartDragFrom(null, surface)).toBe(false)
    })
})
