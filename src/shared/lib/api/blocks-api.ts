import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'

/**
 * Blocking and unblocking an account — the two writes, and nothing else.
 *
 * ## Why these two are here and the blocked-accounts list is not
 *
 * They were in `features/channel/api/channel-api.ts`, beside the space page that was the only place
 * offering them. Blocking is an **account-level** action rather than a channel-page one, and the
 * second surface that offers it is a post's overflow menu and a comment's — `features/post`, which
 * may not import `features/channel` because the dependency between them runs channel → post. The
 * alternative was a second copy of the path, and this pair is the wrong pair to copy: the two halves
 * disagree about their identifier (see below), so a copy would have to carry that warning too, and
 * the copy that omits it is the one that "fixes" a call site on a guess.
 *
 * The **list** of blocked accounts stays in `features/channel`: it is `/settings/blocked-accounts`'s
 * own paging, its own row type and its own cache surgery, all owned by one screen. The seam is
 * "a write any surface can invoke" against "a list one screen renders", which is a real line rather
 * than a tidy one.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

export const blocksApi = {
    /** Blocks are keyed by **user** id (`channel.owner_id`), not channel id. */
    blockUser(userId: string) {
        return api.post('v3/channel/my-channel/blocks/', { user_id: userId })
    },

    /**
     * ⚠ **The path segment is not the same identifier `blockUser` posts**, or at least the two
     * shipped clients disagree about whether it is — see B23.
     *
     * The channel page passes `channel.owner_id` (a user id); legacy's blocked-accounts screen,
     * the only place in either app that lists blocks, passes the **block record's** id. Both
     * end up here, so the parameter is named for what the endpoint sees rather than for what
     * either caller thinks it is sending, and neither call site is "fixed" to match the other
     * on a guess. Whichever is wrong is wrong at the call site, not here.
     */
    unblockUser(blockOrUserId: string) {
        return api.del(`v3/channel/my-channel/blocks/${encodeURIComponent(blockOrUserId)}/`)
    },
}
