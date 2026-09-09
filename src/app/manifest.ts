import { brandManifestIcons, WEB_MANIFEST_SHELL } from '@shared/config/web-manifest'
import type { MetadataRoute } from 'next'

/**
 * The **site's** manifest, at `/manifest.webmanifest`.
 *
 * A creator's space serves its own instead — see
 * `app/(web)/(main)/(rail)/[slug]/manifest.webmanifest/route.ts` — so that installing a space
 * puts that space's name and picture on the home screen rather than ours. Everything the two
 * have in common lives in `shared/config/web-manifest.ts`; what is here is Tevi's identity.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Tevi',
        short_name: 'Tevi',
        description: 'A monetization platform for content creators.',
        start_url: '/',
        ...WEB_MANIFEST_SHELL,
        icons: brandManifestIcons(),
    }
}
