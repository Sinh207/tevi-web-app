/**
 * `lottie-web`'s ESM builds ship no `.d.ts` of their own — only the UMD entry points do.
 *
 * The UMD entry is the one this app may **not** import: its `module.exports = factory()` sits
 * inside an `&&` expression, so a bundler finds no top-level CJS export and the dynamic import
 * resolves to an empty namespace. `lottie-animation.tsx` carries the full note.
 *
 * Declared as the narrow surface that file actually drives rather than `any`, so a typo in a method
 * name is still a compile error.
 */
declare module 'lottie-web/build/player/esm/lottie_light.min.js' {
    type LottieAnimationItem = {
        isLoaded: boolean
        destroy: () => void
        goToAndStop: (value: number, isFrame?: boolean) => void
        playSegments: (segments: [number, number], forceFlag?: boolean) => void
        addEventListener: (name: string, handler: () => void) => void
    }

    const lottie: {
        loadAnimation: (params: {
            container: Element
            renderer: 'svg'
            loop: boolean
            autoplay: boolean
            /** The parsed JSON. lottie-web mutates it, so hand each player its own copy. */
            animationData: unknown
        }) => LottieAnimationItem
    }

    export default lottie
}
