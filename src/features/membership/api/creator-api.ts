import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type MembershipChannel, membershipChannelSchema } from './types'

/**
 * The creator being paid, by slug — `core/v3/channel/channels/{slug}/`.
 *
 * One public GET, for one screen: the webview checkout's header, which has to name and picture the
 * space before anybody types a card number. Legacy's `membershipDetails` makes exactly this call for
 * exactly this reason (`ChannelModel.getChannel`), beside its tier fetch.
 *
 * ## Why this feature calls it rather than `features/channel`
 *
 * Because that feature's barrel is not reachable from here, and would be the wrong thing to reach for
 * even if it were.
 *
 * - **It would close a cycle.** `features/channel` imports `@features/membership` (the space action
 *   row's `BecomeAMemberButton`). Importing its barrel back is the module cycle
 *   `features/membership/index.ts` warns about at length — ESM resolves one by handing a side a
 *   half-initialised module, which surfaces as `undefined is not a function` at render.
 * - **It would drag a page into a checkout.** That barrel exports `ChannelView`, `MyChannelProvider`,
 *   the edit-profile screens and the image cropper. This screen is inside a `/app/*` webview with no
 *   session at all; six fields do not justify that module graph.
 * - **The DTO is already ours.** `membershipChannelSchema` exists precisely so the two features do not
 *   depend on each other's shapes — see its own note. The channels endpoint returns a superset of it,
 *   and `looseObject` keeps the rest without modelling it.
 *
 * So this is a **second reader of a public endpoint**, not a second owner of it: nothing here writes,
 * and `features/channel` remains the place that knows what a `Channel` is.
 *
 * ## No account scope, on purpose
 *
 * The webview has no bearer (the native host owns the session — `docs/WEBVIEW.md`), and this payload
 * is a public profile. So no `accountId` is threaded through and the ETag store files it under its
 * anonymous scope, which is correct: everybody sees the same space.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

export const creatorApi = {
    /**
     * The space, or `null` when the payload cannot be read.
     *
     * `null` rather than a throw: the header is not what the screen is for. A creator that fails to
     * load costs a picture and a name — the handle from the URL stands in — where a *thrown* error
     * would take down a checkout that is otherwise perfectly able to complete.
     *
     * Legacy strips `@` before building this path and so does this: our slugs never carry one, but a
     * value taken off a URL would pass it straight through. The result is encoded either way (DoD §8).
     */
    async getCreator({
        slug,
        signal,
    }: {
        slug: string
        signal?: AbortSignal
    }): Promise<MembershipChannel | null> {
        if (!slug) return null
        const body = await api.get<unknown>(
            `v3/channel/channels/${encodeURIComponent(slug.replaceAll('@', ''))}/`,
            undefined,
            { signal },
        )
        const parsed = membershipChannelSchema.safeParse(body)
        return parsed.success ? parsed.data : null
    },
}
