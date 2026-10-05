// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NAME_SLOT, NameWithTick } from './name-with-tick'

const TICK = 'https://cdn.test/tick.png'

describe('NameWithTick', () => {
    afterEach(cleanup)

    it('puts the tick straight after the name, wherever the translation puts the name', () => {
        const { container } = render(
            <p>
                <NameWithTick
                    sentence={`${NAME_SLOT} has enabled paid chat`}
                    name="sinhpn"
                    tick={TICK}
                />
            </p>,
        )
        expect(container.textContent).toBe('sinhpn has enabled paid chat')
        const img = container.querySelector('img')
        expect(img).toBeTruthy()
        // The badge sits inside the name's own span, so it can never drift to the sentence's end.
        expect(img?.closest('span')?.textContent).toBe('sinhpn')
    })

    it('draws no tick for an unverified channel', () => {
        const { container } = render(
            <NameWithTick sentence={`Sending to ${NAME_SLOT}`} name="Ada" tick={null} />,
        )
        expect(container.textContent).toBe('Sending to Ada')
        expect(container.querySelector('img')).toBeNull()
    })

    it('falls back to the plain sentence when a translation lost the slot', () => {
        const { container } = render(
            <NameWithTick sentence="Sending to someone" name="Ada" tick={TICK} />,
        )
        expect(container.textContent).toBe('Sending to someone')
    })
})
