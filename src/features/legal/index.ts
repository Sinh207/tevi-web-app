/**
 * Legal / policy pages — static documents served on public routes.
 *
 * Public surface for the rest of the app. Nothing outside this feature imports from
 * `content/` or `components/` directly (see the boundary rules in CLAUDE.md).
 */

export { LegalDocumentBody } from './components/legal-document'
export { LEGAL_CONTAINER, LegalPageView } from './components/legal-page-view'
export { LegalToc, type LegalTocItem } from './components/legal-toc'
export { LETTER_CONTAINER, OpenLetterView } from './components/open-letter-view'
export { COMMUNITY_GUIDELINES } from './content/community-guidelines'
export { MODERATION_POLICY } from './content/moderation'
export { getOpenLetter } from './content/open-letter'
export { PRIVACY_POLICY_MINI_APP } from './content/privacy-mini-app'
export { PRIVACY_POLICY } from './content/privacy-policy'
export { PRIVACY_POLICY_PREMIUM } from './content/privacy-premium'
export { SAFETY_POLICY } from './content/safety'
export { TERMS_MINI_APP } from './content/terms-mini-app'
export { TERMS_OF_USE } from './content/terms-of-use'
export { TERMS_PREMIUM } from './content/terms-premium'
export type {
    LegalBlock,
    LegalDocument,
    LegalSection,
    Letter,
    LetterBlock,
} from './content/types'
