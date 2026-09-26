/**
 * `@ffmpeg/ffmpeg`'s **prebuilt UMD bundle** has no declarations of its own.
 *
 * The package ships types for its ESM entry, and that entry is the one this repo cannot use —
 * `shared/lib/ffmpeg.ts`'s header has the account. So the deep import is declared `unknown` here
 * and narrowed at the one call site, which is better than the two alternatives: `any` would let a
 * typo through silently, and re-declaring the package's whole surface would be a second copy of an
 * API this app touches five members of.
 */
declare module '@ffmpeg/ffmpeg/dist/ffmpeg.min.js' {
    const bundle: unknown
    export default bundle
}
