import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemPreview,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * The list while its first page loads — the real row's geometry, so nothing moves when it lands: a
 * 64px disc in the 88px avatar column, the three text lines, and the time over the count on the end.
 *
 * Painted `--background-surface` like the real row. `ListUserItem`'s own `--background-listing` is
 * `--black` in Dark, i.e. a black stripe across the card.
 */
export function ConversationSkeleton({ count = 8 }: { count?: number }) {
    return (
        <ul data-testid="message-loading" aria-busy="true" className="list-none">
            {Array.from({ length: count }, (_, index) => `conversation-skeleton-${index}`).map(
                (key, index) => (
                    <li key={key}>
                        <ListUserItem className="bg-(--background-surface)">
                            <ListUserItemAvatar className="items-center">
                                <Skeleton circle w={64} h={64} delay={index * 160} />
                            </ListUserItemAvatar>
                            <ListUserItemContent>
                                {index > 0 && <ListRowRule />}
                                <ListUserItemPreview className="items-stretch">
                                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                                        <div className="flex h-6 items-center">
                                            <Skeleton w={140} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[14px] items-center">
                                            <Skeleton w={80} h={10} delay={index * 160} />
                                        </div>
                                        <div className="flex h-6 items-center">
                                            <Skeleton w="85%" delay={index * 160} />
                                        </div>
                                    </div>
                                    <div className="flex flex-none flex-col items-end justify-between py-0.5">
                                        <Skeleton w={44} h={12} delay={index * 160} />
                                        <Skeleton circle w={20} h={20} delay={index * 160} />
                                    </div>
                                </ListUserItemPreview>
                            </ListUserItemContent>
                        </ListUserItem>
                    </li>
                ),
            )}
        </ul>
    )
}
