import { Skeleton } from '@shared/ui/skeleton'

/**
 * The screen's shape before the state lands: pill, the 180px badge track, the title and its
 * sentence, the estimate card, the FAQ heading and six rows. Each block is reserved at its real
 * height so nothing moves when the data arrives. Hook-free, so `loading.tsx` can mount it.
 */
export function SpaceTierSkeleton() {
    return (
        <div aria-hidden className="flex flex-col items-center gap-4 pb-4">
            <Skeleton w={110} h={22} className="mt-2 rounded-full" />
            <div className="flex h-[180px] w-full items-center justify-center">
                <Skeleton w={160} h={160} className="rounded-full" />
            </div>
            <div className="flex w-full flex-col items-center gap-2">
                <Skeleton w={120} h={40} />
                <Skeleton w={300} h={18} />
                <Skeleton w={220} h={18} />
            </div>
            <div className="flex h-[108px] w-full flex-col items-center justify-center gap-2 rounded-xl bg-(--background-surface)">
                <Skeleton w={140} h={16} />
                <Skeleton w={180} h={32} />
            </div>
            <div className="flex w-full flex-col">
                <div className="px-4 pt-3 pb-2">
                    <Skeleton w={48} h={20} />
                </div>
                <div className="flex flex-col rounded-xl bg-(--background-surface) px-4 py-1">
                    {Array.from({ length: 6 }, (_, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
                        <div key={i} className="flex h-12 items-center">
                            <Skeleton w={i % 2 ? 200 : 240} h={18} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
