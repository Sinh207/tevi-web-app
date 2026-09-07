import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { PrivacySettingsScreen } from './screen'

/**
 * `/app/privacy-settings` — the mobile app's account privacy screen.
 *
 * Legacy's URL and legacy's contents (`../tevi-web-app/src/containers/app/privacySettings`):
 * who you are signed in as, the three `nsfw_settings` switches, and a way out. The path is
 * unchanged because the links to it live in shipped app builds, and the cutover is same-origin.
 *
 * No `canonical`: unlike `/app/privacy` this screen has no public twin — `/settings/*` on the
 * website covers a different set of settings and is not the same page. `noindex` still applies,
 * as it does to the whole namespace via `robots.ts`.
 *
 * Everything below is client code and has to be: `/me` is read and written **as this bearer**,
 * and there is no SSR bearer in this app by construction (`shared/lib/api/token.ts`).
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('privacy_settings_title'),
        robots: { index: false, follow: false },
    }
}

export default function AppPrivacySettingsPage() {
    return <PrivacySettingsScreen />
}
