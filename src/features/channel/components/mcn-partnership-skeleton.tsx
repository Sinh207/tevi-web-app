import { Skeleton } from '@shared/ui/skeleton'

/**
 * `/mcn-partnership` while `my-channel/` is still in flight — and the **same** component the route's
 * `loading.tsx` renders, so the streaming gap and the in-screen wait are one picture rather than two
 * that shift into each other.
 *
 * It draws the two cards that are always there (the network, the split) and the contact line, in
 * their real geometry: a 48px avatar over two lines, then a header rule over two centred figures. The
 * pending-departure banner is deliberately **not** drawn — most creators have none, so sketching one
 * would promise a block that usually never arrives.
 *
 * No hooks, so it renders on the server.
 *
 * ## ⚠ Every height here is a **prop**, never a class
 *
 * `Skeleton` always writes `height` as an **inline style** (`h ?? '12px'`), and an inline style beats
 * a utility class. So this file's `<Skeleton className="h-4" />` was a **12px** bar, and `size-12`
 * for the avatar was 48 wide × 12 tall: the whole skeleton was one row height, whatever it said.
 * Measured at 390×844 against the screen it stands in for: **290px against 384** — the stack jumped
 * 94px as the data landed, which is the layout shift a skeleton exists to prevent. It is 384 against
 * 384 now.
 *
 * ## The bars stay 12px; the **rows** carry the real heights
 *
 * That is `shared/ui/skeleton.tsx`'s own instruction, and the reason is in its note: 12px is the DS's
 * one placeholder shape (`AI/Skeleton` 92:19340), while a 16px line of `type-body-*` occupies **24**
 * once `--line-height-default` (1.5) is counted. Giving the bar the text's height would both invent a
 * shape the DS does not draw and still under-reserve the row. So `Line` reserves the line box and
 * puts the DS bar inside it, and only genuine blocks — the avatar, the chevron, the fee banner — take
 * an `h` of their own.
 *
 * The numbers, all read off the real components rather than guessed: card heading
 * `type-body-strong` 16 → **24**; the network name `type-body-default` 16 → **24** with the joined
 * date `type-dense-default` 14 → **21** under it and no gap between them; `Avatar size="large"` →
 * **48**; the chevron `Icon size={24}` → **24**; a share label 14 → **21** over
 * `type-title-t2-semibold` 20 → **30**, `gap-1` apart; the fee banner `p-2` around a 12px line → 8 +
 * **18** + 8 = **34**; the contact line 14 → **21**.
 */
export function McnPartnershipSkeleton() {
    return (
        <div className="flex flex-col gap-3 py-3">
            <Card>
                <CardHeader />
                <div className="flex items-center gap-3 p-3">
                    <Skeleton w={48} h={48} circle />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <Line h={24} w={160} />
                        <Line h={21} w={96} />
                    </div>
                    {/* The chevron's own 24, so the text column starts and ends where it really
                        does — a 20px stand-in moved the whole line by 4. */}
                    <Skeleton w={24} h={24} className="rounded-[var(--radius-sm)]" />
                </div>
            </Card>

            <Card>
                <CardHeader />
                <div className="flex items-center p-3">
                    <div className="flex flex-1 flex-col items-center gap-1">
                        <Line h={21} w={80} />
                        <Line h={30} w={56} />
                    </div>
                    <div className="h-8 w-px bg-(--separator-default)" />
                    <div className="flex flex-1 flex-col items-center gap-1">
                        <Line h={21} w={80} />
                        <Line h={30} w={56} />
                    </div>
                </div>
                <div className="px-3 pb-3">
                    {/* The fee banner is a block, not a line: it reserves the tinted box itself. */}
                    <Skeleton h={34} className="rounded-[var(--radius-lg)]" />
                </div>
            </Card>

            <div className="flex justify-center py-2">
                <Line h={21} w={192} />
            </div>
        </div>
    )
}

function Card({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
            {children}
        </div>
    )
}

function CardHeader() {
    return (
        <div className="border-(--separator-default) border-b p-3">
            <Line h={24} w={144} />
        </div>
    )
}

/**
 * One text row: the line box at its real height, with the DS's 12px bar centred in it.
 *
 * `style`, not `h-[24px]`, for the same reason the note above gives — the heights here are read off
 * `line-height: 1.5`, so most of them (21, 30) are not steps on any ramp, and one arbitrary-value
 * class beside two real ones reads as if the ramp had been consulted.
 */
function Line({ h, w }: { h: number; w: number }) {
    return (
        <div className="flex items-center" style={{ height: h }}>
            <Skeleton w={w} />
        </div>
    )
}
