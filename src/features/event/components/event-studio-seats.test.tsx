// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LivePublisher } from '../api/live-types'
import { seatArrangement } from '../lib/seat-layout'
import { EventStudioSeats } from './event-studio-seats'

function publisher(id: string): LivePublisher {
    return {
        id,
        name: id,
        avatar: null,
        audio: true,
        video: true,
        is_host: id === 'p1',
        verified_tick_badge: null,
    }
}

const TWO = [publisher('p1'), publisher('p2')]

function grid(layout: string, publishers: LivePublisher[]) {
    return (
        <EventStudioSeats
            arrangement={seatArrangement({ layout, publisherCount: publishers.length })}
            publishers={publishers}
            videoUids={null}
        />
    )
}

describe('EventStudioSeats', () => {
    afterEach(cleanup)

    /*
     * The bug this pins: seats keyed on their grid area. `P3` and `L2` both draw two tiles, in
     * different areas, so a switch between them rebuilt every seat — and the `<div>` the SDK was
     * playing into went with it, which stopped the picture.
     */
    it('keeps each person’s mount node across a layout switch of the same tile count', () => {
        const { rerender } = render(grid('P3', TWO))
        const before = [document.getElementById('player-p1'), document.getElementById('player-p2')]
        expect(before.every(Boolean)).toBe(true)

        rerender(grid('L2', TWO))

        expect(document.getElementById('player-p1')).toBe(before[0])
        expect(document.getElementById('player-p2')).toBe(before[1])
    })

    it('keeps the node when the publishers reorder', () => {
        const { rerender } = render(grid('P3', TWO))
        const node = document.getElementById('player-p2')

        rerender(grid('P3', [TWO[1], TWO[0]]))

        expect(document.getElementById('player-p2')).toBe(node)
    })

    it('keeps the node when a co-host joins and the grid grows', () => {
        const { rerender } = render(grid('P3', TWO))
        const node = document.getElementById('player-p1')

        rerender(grid('P4', [...TWO, publisher('p3')]))

        expect(document.getElementById('player-p1')).toBe(node)
    })
})

describe('pressing a seat', () => {
    afterEach(cleanup)

    it('reports the publisher, and lights the seat whose card is open', () => {
        const onSelect = vi.fn()
        render(
            <EventStudioSeats
                arrangement={seatArrangement({ layout: 'P3', publisherCount: 2 })}
                publishers={TWO}
                videoUids={null}
                onSelectPublisher={onSelect}
                selectedId="p2"
            />,
        )
        const seats = screen.getAllByTestId('event-studio-seat-trigger')
        fireEvent.click(seats[0])
        expect(onSelect).toHaveBeenCalledWith(TWO[0])
        expect(seats.map(s => s.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    })

    it('is not pressable when nobody asked for a card', () => {
        render(grid('P3', TWO))
        expect(screen.queryByTestId('event-studio-seat-trigger')).toBeNull()
    })
})
