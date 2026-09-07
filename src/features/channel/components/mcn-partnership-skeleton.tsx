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
 */
export function McnPartnershipSkeleton() {
    return (
        <div className="flex flex-col gap-3 py-3">
            <Card>
                <CardHeader />
                <div className="flex items-center gap-3 p-3">
                    <Skeleton className="size-12 rounded-[var(--radius-fill)]" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3.5 w-24" />
                    </div>
                    <Skeleton className="size-5 rounded-[var(--radius-sm)]" />
                </div>
            </Card>

            <Card>
                <CardHeader />
                <div className="flex items-center p-3">
                    <div className="flex flex-1 flex-col items-center gap-2">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-6 w-14" />
                    </div>
                    <div className="h-8 w-px bg-(--separator-default)" />
                    <div className="flex flex-1 flex-col items-center gap-2">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-6 w-14" />
                    </div>
                </div>
                <div className="px-3 pb-3">
                    <Skeleton className="h-9 w-full rounded-[var(--radius-lg)]" />
                </div>
            </Card>

            <div className="flex justify-center py-2">
                <Skeleton className="h-4 w-48" />
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
            <Skeleton className="h-5 w-36" />
        </div>
    )
}
