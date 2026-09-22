import type { Post } from '@features/post'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'

/**
 * The media grid's tile — three across, square, matching legacy's layout.
 *
 * ## The post card that used to live here is gone
 *
 * `ChannelThreadPlaceholder` stood in for a real post "until `features/post` lands", and said in
 * writing that it would be **deleted rather than refactored**. It has been: the posts tab now
 * renders `PostCard`, and `ChannelThread` — the three-field stub it drew — is gone from
 * `api/types.ts` with it. Only the media tile remains, and it is no longer a placeholder either:
 * the rows carry real images now.
 *
 * `21` items per page is why the grid is three-wide: seven complete rows, so the last one is never a
 * ragged tile or two (see `CHANNEL_FIRST_PAGE`).
 */
export function ChannelMediaTile({
    post,
    className,
}: {
    /** Omitted by the skeleton, which draws the same box with nothing in it. */
    post?: Post
    className?: string
}) {
    /*
     * A media row's thumbnail, in the order the payload offers one: the post's first image, then a
     * video's poster, then the cover. A row that has none still draws the box — the grid's rhythm is
     * three across, and a missing tile would shift every tile after it.
     */
    const src =
        post?.images?.[0]?.thumb ??
        post?.images?.[0]?.uri ??
        post?.video?.thumbnail ??
        post?.cover_image?.uri ??
        null

    return (
        <div
            data-card-id={post?.id}
            className={cn(
                'relative flex aspect-square items-center justify-center overflow-hidden bg-(--background-segment) text-(--icon-secondary)',
                className,
            )}
        >
            {src ? (
                <Image
                    src={src}
                    alt=""
                    fill
                    /* Three across inside a 612 column, so a tile is never wider than ~204px on
                       desktop and a third of the viewport below it. */
                    sizes="(max-width: 612px) 33vw, 204px"
                    className="object-cover"
                />
            ) : (
                <Icon name="image-gallery" size={24} />
            )}
        </div>
    )
}
