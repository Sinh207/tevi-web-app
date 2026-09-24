/**
 * Side-effect stylesheet imports from packages that ship CSS without type declarations.
 *
 * `@byteplus/veplayer`'s `package.json` maps `./live/style` to a `.css` file and nothing else, so
 * TypeScript cannot resolve it and the import is an error without this. The declaration is the
 * whole of what is needed: a side-effect import has no binding to type.
 *
 * ⚠ **Do not widen this to a wildcard** (`declare module '*.css'`). Next already types the app's
 * own CSS-module imports, and a wildcard here would silence a genuinely missing stylesheet
 * anywhere in the tree.
 */
declare module '@byteplus/veplayer/live/style'
