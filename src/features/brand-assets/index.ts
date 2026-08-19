/**
 * Brand assets — the public press kit: logo pack, "Support me on Tevi" buttons, palette.
 *
 * Public surface for the rest of the app. Nothing outside this feature imports from
 * `content/` or `components/` directly (see the boundary rules in CLAUDE.md).
 */

export { BrandAssetsView } from './components/brand-assets-view'
export { BRAND_CONTAINER } from './components/brand-panel'
export {
    BRAND_COLORS,
    BRAND_PAIRINGS,
    type BrandButtonAsset,
    type BrandColor,
    type BrandDownload,
    type BrandLogoPreview,
    BUTTON_ASSETS,
    BUTTON_PACK,
    buttonAssetUrl,
    LOGO_PACK,
    LOGO_PACK_CONTENTS,
    LOGO_PREVIEWS,
} from './content/brand-assets'
