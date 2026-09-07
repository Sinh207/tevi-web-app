import { env } from '@shared/config/env'
import type { MiniAppConfig } from './app-config'

/**
 * The **Mini App Center** — Tevi's own directory of mini apps, and the player's `+` tab.
 *
 * It is not a special case in the player: it is a mini app like any other, it speaks the same
 * bridge, and `executeLink` with `type: 'app'` is how a reader gets from a row in it to the app
 * that row names. That is why there is no "app picker" component in this feature — the picker is
 * this app, maintained by whoever maintains it, and it can add a row without a web deploy.
 *
 * ## The host per environment, and why it is not env config
 *
 * Two hosts, chosen exactly as legacy chooses them: the `.dev` one only in development, so
 * **staging points at the production Center**. That is deliberate on legacy's part — staging is
 * where the real directory is smoke-tested — and copying the rule is the point of writing it here.
 *
 * It is a constant rather than a `NEXT_PUBLIC_*` value because nothing about a deployment sets it:
 * there are two hosts, and which one applies is a function of the build. The right long-term home
 * is Firebase Remote Config (`shared/lib/remote-config`), next to the store links — the Center's
 * host is precisely the kind of platform value the team should be able to move without a deploy.
 * Moving it there is a schema change in that feature, so it is left as a note rather than done
 * halfway.
 */
const IS_DEV = env.NEXT_PUBLIC_ENV === 'development'

const CENTER_URL = IS_DEV ? 'https://miniapp-center.tevi.dev' : 'https://center.miniapp.tevi.so'

/**
 * The Center's own Tevi space, for the ⋯ menu's Share and "Visit Space" rows. Two different
 * slugs per environment, as legacy has them.
 */
const CENTER_SPACE_PATH = IS_DEV ? '/@miniapp' : '/@teviappscenter'

/**
 * The Center, as a tab config.
 *
 * **No `iconUrl`**, and that is a rule rather than a gap: legacy points it at a raster mark on
 * `static.tevicdn.com`, and `docs/STATIC_ASSETS.md` forbids fetching static art from a CDN — a
 * 64px tab icon is exactly the kind of small remote asset that rule exists to stop. The tab falls
 * back to the sprite's `grid-category` glyph, which is a real design-system asset and needs no
 * network at all. When the DS ships the Center's mark, commit it under `public/illustrations/` and
 * set it here.
 *
 * `id` is `null`: the Center is first-party and mints no app token. Legacy passes `appId: ''`,
 * which is the same statement in a shape that then has to be re-checked at every use.
 */
export function miniAppCenterConfig(name: string): MiniAppConfig {
    return {
        id: null,
        name,
        url: CENTER_URL,
        iconUrl: null,
        shareableUrl: `${env.NEXT_PUBLIC_BASE_URL}${CENTER_SPACE_PATH}`,
    }
}

/** `true` for the Center's own frame. The ⋯ menu offers **Settings** only there — see the menu. */
export function isMiniAppCenter(url: string | null | undefined): boolean {
    if (!url) return false
    try {
        return new URL(url).origin === new URL(CENTER_URL).origin
    } catch {
        return false
    }
}
