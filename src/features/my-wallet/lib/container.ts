/**
 * `/my-wallet`'s content column — 612px from `md`, full width below it, 16px inset at every width.
 *
 * Identical to `MY_STAR_CONTAINER` and duplicated deliberately: a feature may not reach into another
 * feature's internals, and a layout constant is not worth widening a barrel for. That file carries the
 * full reasoning (why 612 is a literal, why the inset stays below `md`, and which comp behaviour is
 * deferred); the same applies here.
 */
export const MY_WALLET_CONTAINER = 'mx-auto w-full px-4 md:max-w-[612px] md:px-0'
