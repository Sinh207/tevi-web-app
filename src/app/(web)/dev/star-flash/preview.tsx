'use client'

import { StarChangeFlash } from '@features/balance'
import { eventBus } from '@shared/lib/event-bus'
import { AppBarStarIcon } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'

/**
 * The Star flash, driven by the bus directly.
 *
 * It is otherwise unreachable on a dev machine: it needs a real account **and** a live
 * `balance_change` frame from the gateway. Emitting the same event by hand exercises the real
 * component — the animation, the `key` that restarts it, both directions and the reduced-motion path.
 * Only the socket that would normally emit it is stubbed out.
 */
export function StarFlashPreview() {
    const fire = (delta: number) => eventBus.emit('balance:star-changed', { delta })

    return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-semibold text-(--text-title)">Star flash</h1>
                <p className="type-body-default text-(--text-body)">
                    The amount that drifts off the balance when it moves. Press twice quickly — the
                    second must restart the animation, not freeze on the first.
                </p>
            </header>

            {/*
             * A stand-in for the real end-rail pill, with **the same structure** — the point being
             * where the flash lands. `relative` is on the wrapper around the balance, not on the
             * capsule: the flash centres itself in its positioning context, so a `relative` capsule
             * would drop the number under "Get App" instead of under the figure that moved.
             */}
            <div
                data-testid="pill"
                className="flex w-fit items-center gap-2 rounded-(--radius-fill) bg-(--background-surface) py-1 ps-3 pe-2 shadow-md"
            >
                <span data-testid="balance" className="relative flex flex-none items-center gap-1">
                    <AppBarStarIcon />
                    <span className="type-body-strong text-(--text-title)">186,640</span>
                    <StarChangeFlash />
                </span>
                <span className="type-body-strong text-(--text-title)">Get App</span>
                <span aria-hidden className="h-6 w-px flex-none bg-(--separator-default)" />
                <span
                    aria-hidden
                    className="size-10 flex-none rounded-full bg-(--background-subtle)"
                />
            </div>

            <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => fire(-120)}>
                    Spend 120
                </Button>
                <Button variant="secondary" onClick={() => fire(-1)}>
                    Spend 1
                </Button>
                <Button variant="accent" onClick={() => fire(500)}>
                    Add 500
                </Button>
                <Button variant="ghost" onClick={() => fire(12345)}>
                    Add 12,345
                </Button>
            </div>
        </main>
    )
}
