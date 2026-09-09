import { describe, expect, it } from 'vitest'
import { normalizeChannel } from '../api/types'
import {
    buildChannelManifest,
    CHANNEL_ICON_SIZES,
    type ChannelManifestIcon,
    channelManifestPath,
    shouldServeChannelManifest,
} from './channel-manifest'

function channel(overrides: Record<string, unknown> = {}) {
    const parsed = normalizeChannel({
        id: 1,
        owner_id: 9,
        slug: 'ada',
        name: 'Ada',
        description: 'Writes about looms.',
        privacy: 'public',
        ...overrides,
    })
    if (!parsed) throw new Error('fixture failed to parse')
    return parsed
}

const icons = (): ChannelManifestIcon[] =>
    CHANNEL_ICON_SIZES.map(size => ({ size, src: `https://proxy/${size}x${size}/avatar.png` }))

describe('channelManifestPath', () => {
    it('hangs off the space, with the @ back on', () => {
        expect(channelManifestPath('ada')).toBe('/@ada/manifest.webmanifest')
    })
})

describe('shouldServeChannelManifest', () => {
    /**
     * The claim with a consequence that outlives the session: a manifest becomes a label and a
     * picture on somebody's home screen, and no gate inside the app can take that back. The route
     * answers the **site** manifest instead, so the icon still leads somewhere true.
     */
    it('refuses to name an NSFW space', () => {
        expect(shouldServeChannelManifest(channel({ is_nsfw: true }))).toBe(false)
    })

    it('serves an ordinary space', () => {
        expect(shouldServeChannelManifest(channel())).toBe(true)
    })

    /**
     * Both of these are deliberately still installable — their walls name the creator in both
     * apps, so there is nothing here the page does not already say. Pinned so that "suspended
     * spaces are installable" reads as a decision rather than as something nobody thought about;
     * the docblock carries the argument.
     */
    it('does not withhold a suspended or non-public space, which is a decision', () => {
        expect(shouldServeChannelManifest(channel({ is_suspended: true }))).toBe(true)
        expect(shouldServeChannelManifest(channel({ privacy: 'protected' }))).toBe(true)
        expect(shouldServeChannelManifest(channel({ privacy: 'unpublished' }))).toBe(true)
    })
})

describe('buildChannelManifest', () => {
    /**
     * The app's identity, so editing `start_url` later cannot split an existing install off from
     * the manifest that describes it. Left unset, a browser derives identity from `start_url`.
     */
    it('pins the app identity to the space, not to the start URL', () => {
        const manifest = buildChannelManifest(channel(), icons())
        expect(manifest.id).toBe('/@ada')
        expect(manifest.id).not.toBe(manifest.start_url)
    })

    /**
     * **The claim this file exists for.** Legacy's `start_url` is the instruction screen, which
     * makes an installed space open "here is how to install this" — its own code tries to navigate
     * away from that on launch, to a host no env file in the repository sets. So an installed space
     * opens the space. If this assertion is ever relaxed, read `channelStartUrl`'s comment first:
     * the alternative is a home-screen icon that leads nowhere.
     */
    it('launches an installed space at the space, not at the instructions', () => {
        expect(buildChannelManifest(channel(), icons()).start_url).toBe('/@ada?startapp')
        expect(buildChannelManifest(channel(), icons()).start_url).not.toContain('addToHomeScreen')
    })

    it('names the icon after the space, and falls back to the slug', () => {
        expect(buildChannelManifest(channel(), icons()).name).toBe('Ada')
        expect(buildChannelManifest(channel(), icons()).short_name).toBe('Ada')
        expect(buildChannelManifest(channel({ name: null }), icons()).name).toBe('ada')
    })

    /**
     * The scope is declared rather than left to the default, which would be the manifest's own
     * directory (`/@ada/`) — a directory that does not contain the start URL, so a browser would
     * discard it through an error path in its parser. It also keeps the installed app from opening
     * `/premium` and the legal pages in a separate browser tab.
     */
    it('scopes the installed app to the whole site', () => {
        expect(buildChannelManifest(channel(), icons()).scope).toBe('/')
        const start = buildChannelManifest(channel(), icons()).start_url ?? ''
        expect(start.startsWith('/')).toBe(true)
    })

    it('carries the platform shell — display and both OS-painted colours', () => {
        const manifest = buildChannelManifest(channel(), icons())
        expect(manifest.display).toBe('standalone')
        expect(manifest.theme_color).toBe('#501BC0')
        // The splash the OS paints before any CSS runs; `app/manifest.test.ts` pins it to
        // `--zinc-100` in globals.css, and this is the same constant.
        expect(manifest.background_color).toBe('#f4f4f5')
    })

    /**
     * Android **prefers** a maskable icon, so declaring only Tevi's would put the Tevi mark on
     * every installed space — the opposite of the point. Each size therefore appears twice.
     */
    it('declares the avatar for both purposes, at every size', () => {
        const entries = buildChannelManifest(channel(), icons()).icons ?? []
        expect(entries).toHaveLength(CHANNEL_ICON_SIZES.length * 2)
        for (const size of CHANNEL_ICON_SIZES) {
            const forSize = entries.filter(icon => icon.sizes === `${size}x${size}`)
            expect(forSize.map(icon => icon.purpose)).toEqual(['any', 'maskable'])
        }
    })

    /**
     * `type` is left off on purpose: the proxy answers `image/webp` whatever the source was, and a
     * browser may filter an icon by its declared type *before* fetching it. Legacy declares
     * `image/png` on the same URLs.
     */
    it('claims no MIME type it cannot guarantee', () => {
        for (const icon of buildChannelManifest(channel(), icons()).icons ?? []) {
            expect(icon.type).toBeUndefined()
        }
    })

    /** A space with no avatar still installs with an icon rather than a blank square. */
    it('falls back to the brand icons when no avatar could be resolved', () => {
        const entries = buildChannelManifest(channel(), []).icons ?? []
        expect(entries.length).toBeGreaterThan(0)
        expect(entries.every(icon => icon.src.startsWith('/icons/'))).toBe(true)
        expect(entries.some(icon => icon.purpose === 'maskable')).toBe(true)
    })

    /**
     * Legacy declares two screenshots that are the avatar announced at 1920×1080 and 1080×1920 —
     * dimensions it does not have. Chrome checks and drops the whole list, so the honest manifest
     * has none until there are real ones to commit.
     */
    it('declares no screenshots', () => {
        expect(buildChannelManifest(channel(), icons()).screenshots).toBeUndefined()
    })

    it('describes the space with the same sentence the page and the OG tags use', () => {
        expect(buildChannelManifest(channel(), icons()).description).toBe('Writes about looms.')
        expect(buildChannelManifest(channel({ description: null }), icons()).description).toBe(
            'Ada on Tevi',
        )
    })
})
