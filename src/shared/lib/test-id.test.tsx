// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextField } from '../components/field'
import { subTestId } from './test-id'

/**
 * The `data-testid` mechanism, not the catalog — `testid-catalog.test.ts` guards the contract.
 *
 * These render, which most tests in this directory do not, because the two claims worth pinning are
 * both about *where an attribute lands* and neither can be stated in a comment:
 *
 * 1. `TextField` has two layout arms — bare, and a bordered box when there is a `prefix` or
 *    `suffix` — and the **bare id must be on the `<input>` in both**. Otherwise a locator that types
 *    into a field breaks the day a designer adds a clear button, which is the whole reason the
 *    layout is arranged this way.
 * 2. A composite given no testid must emit **no** `data-testid` at all, rather than
 *    `undefined-error`. `subTestId` returns `undefined` for exactly that, and a regression would put
 *    a fleet of `undefined-*` ids into the published catalog.
 *
 * Plain DOM assertions, not `jest-dom`: this repo installs no matcher package and has no
 * `setupFiles`, so `toBeInTheDocument` does not exist here.
 */

const testId = (root: HTMLElement, id: string) => root.querySelector(`[data-testid="${id}"]`)

describe('subTestId', () => {
    it('appends the part', () => {
        expect(subTestId('channel-unpublish', 'confirm')).toBe('channel-unpublish-confirm')
    })

    it('passes undefined through, so an untagged component emits nothing', () => {
        expect(subTestId(undefined, 'confirm')).toBeUndefined()
    })

    it('composes, which is what makes three levels of nesting cost one prop each', () => {
        const search = subTestId('my-wallet-currency', 'search')
        expect(subTestId(search, 'clear')).toBe('my-wallet-currency-search-clear')
    })
})

describe('TextField', () => {
    it('puts the bare id on the input and derives the furniture', () => {
        const { container } = render(
            <TextField data-testid="auth-email" label="Email" hint="We never share it." />,
        )

        expect(testId(container, 'auth-email')?.tagName).toBe('INPUT')
        expect(testId(container, 'auth-email-label')?.textContent).toBe('Email')
        expect(testId(container, 'auth-email-hint')?.textContent).toBe('We never share it.')
        expect(testId(container, 'auth-email-field')).not.toBeNull()
        expect(testId(container, 'auth-email-message')).not.toBeNull()
        // The hint and the error share one line, and only one of them is ever present.
        expect(testId(container, 'auth-email-error')).toBeNull()
    })

    it('keeps the bare id on the input in the affix arm too', () => {
        const { container } = render(
            <TextField data-testid="channel-username" label="Username" prefix="@" />,
        )

        // The property that matters: same locator, different markup.
        expect(testId(container, 'channel-username')?.tagName).toBe('INPUT')
        expect(testId(container, 'channel-username-affix')).not.toBeNull()
        expect(testId(container, 'channel-username-prefix')?.textContent).toBe('@')
    })

    it('exposes the error line, which is how a suite asserts invalid', () => {
        const { container } = render(
            <TextField data-testid="auth-email" label="Email" error="That is not an email." />,
        )

        const error = testId(container, 'auth-email-error')
        expect(error?.textContent).toBe('That is not an email.')
        // Assertable by role as well — the testid does not replace the a11y wiring.
        expect(error?.getAttribute('role')).toBe('alert')
        expect(testId(container, 'auth-email')?.getAttribute('aria-invalid')).toBe('true')
        expect(testId(container, 'auth-email-hint')).toBeNull()
    })

    it('emits no data-testid at all when it was given none', () => {
        const { container } = render(<TextField label="Email" hint="Anything" />)
        expect(container.querySelectorAll('[data-testid]')).toHaveLength(0)
    })
})
