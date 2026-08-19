import type { LegalDocument } from './types'

/**
 * The Tevi Premium privacy policy, ported verbatim from the legacy app
 * (`tevi-web-app/src/containers/privacyPremium/components/content/index.js`).
 *
 * A **separate document**, not a variant of `PRIVACY_POLICY`: it is a shorter, newer,
 * GDPR-shaped policy covering the premium product (legal bases, definitions, deletion),
 * it has its own effective date, and legacy serves it on its own indexable URL. The two
 * share a renderer and nothing else.
 *
 * **English only, and deliberately not in `translation.json`** — same reasoning as the
 * main policy: the platform has no translated version, and legal copy is not ours to
 * paraphrase. Only the chrome (title, "last updated" line, contents heading) is i18n'd.
 *
 * Wording is unchanged, including its punctuation: the copy uses curly quotes and
 * non-breaking hyphens (U+2011) in "industry‑standard", "end‑to‑end", "non‑premium",
 * "Third‑Party" and friends. Do not "fix" those to ASCII hyphens — the ids and the copy
 * were both lifted as-is.
 *
 * Two legacy *rendering* defects are corrected, because they were markup rather than text:
 *
 *  1. Every bullet and every numbered item was one `<p>` of `<br/>`-separated lines
 *     prefixed with a literal "- " or "1. ". They are real lists here, so the numbered
 *     enumerations keep their numbering (`ordered`) and screen readers get a list.
 *  2. Section headings carried their own number in the text ("1. Terms and Definitions").
 *     The renderer numbers sections, so the titles hold the words only — and the numbers
 *     still come out 1–11, matching every link written against the legacy page.
 *
 * Definition-style items ("User:", "Basic account data:") gained a bold lead, which is
 * how the main policy already sets the same shape. No word moved.
 *
 * Section ids are the legacy ones — external links and the mobile app point at them.
 */
export const PRIVACY_POLICY_PREMIUM: LegalDocument = {
    effectiveDate: 'September 2025',
    intro: [
        {
            kind: 'paragraph',
            text: 'This Privacy Policy describes how Tevi.com (“Tevi”, “we”, “us”, “our”) collects, uses, shares, and safeguards your personal data. By using Tevi, you agree to the practices described here and to our Terms of Service.',
        },
    ],
    sections: [
        {
            id: 'terms-and-definitions',
            title: 'Terms and Definitions',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            lead: 'User: ',
                            text: 'Any individual (or their legal representative) who uses Tevi’s services.',
                        },
                        {
                            lead: 'Service: ',
                            text: 'All features, including free and premium, provided through Tevi.com or associated applications.',
                        },
                        {
                            lead: 'Personal Data / Personal Information: ',
                            text: 'Any information that identifies or can be used to identify you, either alone or in conjunction with other data.',
                        },
                        {
                            lead: 'Processing: ',
                            text: 'Any operation performed on Personal Data (collection, storage, use, modification, deletion, etc.).',
                        },
                    ],
                },
            ],
        },
        {
            id: 'general-provisions',
            title: 'General Provisions',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        { text: 'We comply with applicable data protection laws.' },
                        {
                            text: 'We collect and process only the Personal Data necessary to provide and improve our Service.',
                        },
                        {
                            text: 'We strive to be transparent about what data we collect, why we collect it, and how we use it.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'legal-grounds-for-processing',
            title: 'Legal Grounds for Processing Your Personal Data',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We process your Personal Data based on one or more of the following legal bases:',
                },
                {
                    kind: 'list',
                    ordered: true,
                    items: [
                        { text: 'Your consent (where you have given it).' },
                        {
                            text: 'Performance of a contract (e.g. providing services you have requested).',
                        },
                        { text: 'Compliance with legal obligations.' },
                        {
                            text: 'Our legitimate interests (e.g. security, fraud prevention, service improvement), provided these do not override your rights.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'what-personal-data-we-use',
            title: 'What Personal Data We Use',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We may collect, store, and process the following types of Personal Data:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            lead: 'Basic account data: ',
                            text: 'e.g. mobile number, profile name, profile picture, username.',
                        },
                        {
                            lead: 'Optional profile information: ',
                            text: 'e.g. birthday, biography, or other details you choose to provide.',
                        },
                        {
                            lead: 'Email address: ',
                            text: 'e.g. for password recovery, account verification, or notifications.',
                        },
                        {
                            lead: 'Messages, media, and attachments: ',
                            text: 'content of messages you send via cloud services.',
                        },
                        {
                            lead: 'Contacts and phone number: ',
                            text: 'if you allow, to help you connect with people who also use Tevi.',
                        },
                        {
                            lead: 'Location data: ',
                            text: 'if you share your location or enable location‑based features.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'how-we-keep-your-data-safe',
            title: 'How We Keep Your Data Safe',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'We use industry‑standard encryption for data in transit and at rest.',
                        },
                        {
                            text: 'Certain features (e.g. “secret chats”, end‑to‑end encryption) ensure that only the sender and recipient can decrypt message data.',
                        },
                        {
                            text: 'We retain your Personal Data only as long as necessary for the purposes outlined in this policy, or as required by law.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'how-we-process-your-personal-data',
            title: 'How We Process Your Personal Data',
            blocks: [
                { kind: 'paragraph', text: 'We use your data for the following purposes:' },
                {
                    kind: 'list',
                    ordered: true,
                    items: [
                        {
                            lead: 'Core services: ',
                            text: 'to deliver messaging, media sharing, account management, etc.',
                        },
                        {
                            lead: 'Security & safety: ',
                            text: 'to prevent abuse, spam, fraud; to detect and investigate unauthorized access or misuse.',
                        },
                        {
                            lead: 'Feature improvements: ',
                            text: 'to understand how features are used, to develop new features, and to improve overall experience.',
                        },
                        {
                            lead: 'Analytics & statistics: ',
                            text: 'including aggregated or anonymized data regarding usage.',
                        },
                        {
                            lead: 'Advertising / Monetization (if applicable): ',
                            text: 'for non‑premium users, we may show ads. If so, we may use device information, cookies, or interest data (in compliance with consent requirements).',
                        },
                    ],
                },
            ],
        },
        {
            id: 'sharing-of-your-personal-data',
            title: 'Sharing of Your Personal Data',
            blocks: [
                { kind: 'paragraph', text: 'We may share your Personal Data with:' },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Other users, when you communicate with them or share information.',
                        },
                        {
                            text: 'Third‑party service providers who help us with hosting, data storage, infrastructure, analytics, payment processing.',
                        },
                        {
                            text: 'Legal authorities, when required by law or to protect rights, property, or safety.',
                        },
                        {
                            text: 'Subsidiaries or related entities, where needed to provide or improve services.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'your-rights-concerning-your-personal-data',
            title: 'Your Rights Concerning Your Personal Data',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'Depending on your jurisdiction and applicable law, you may have the right to:',
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'Access a copy of your Personal Data we hold.' },
                        { text: 'Correct or update inaccurate or incomplete data.' },
                        { text: 'Delete your data (or your account) where applicable.' },
                        {
                            text: 'Restrict or object to certain processing (e.g. for profiling or advertising).',
                        },
                        { text: 'Port your data to another service provider.' },
                        { text: 'Withdraw consent at any time, where we rely on consent.' },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'You can generally exercise these rights via the settings in your Tevi account, or by contacting our support / privacy contact.',
                },
            ],
        },
        {
            id: 'deletion-of-data',
            title: 'Deletion of Data',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'You may delete your Tevi account. Doing so will generally remove your messages, contacts, media, and other personal content stored by us.',
                        },
                        {
                            text: 'Messages in “secret” or end‑to‑end encrypted contexts may be deleted from both ends, depending on feature settings.',
                        },
                        {
                            text: 'We may automatically delete inactive accounts or data after a period of non‑use (if our policies allow).',
                        },
                    ],
                },
            ],
        },
        {
            id: 'cookies-tracking-and-third-party-technologies',
            title: 'Cookies, Tracking, and Third‑Party Technologies',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'We may use cookies, device identifiers, or similar technologies to provide, secure, and improve our Service.',
                        },
                        {
                            text: 'For non‑premium users, if advertising is used, tracking or interest‑based data may be collected in compliance with law and consent.',
                        },
                        {
                            text: 'Third‑party tools (analytics, advertising platforms) will have their own policies; we encourage you to review them.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'transparency-and-updates',
            title: 'Transparency & Updates',
            blocks: [
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'We will update this Privacy Policy from time to time. Material changes will be communicated in advance (e.g. via email or in‑app notice) where required by law.',
                        },
                        {
                            text: 'We strive for transparency: if you have questions about how your data is used, you can contact us via: privacy@tevi.com.',
                        },
                    ],
                },
            ],
        },
    ],
}
