import type { LegalDocument } from './types'

/**
 * The Tevi moderation policy, ported verbatim from the legacy app
 * (`tevi-web-app/src/containers/moderation/components/content/index.js`).
 *
 * **English only, and deliberately not in `translation.json`** — same reasoning as
 * `community-guidelines.ts` and `privacy-policy.ts`: legacy ships this text hardcoded in
 * English at every locale, and a policy people are enforced against is not ours to
 * paraphrase. Only the page chrome goes through i18n.
 *
 * Wording is unchanged, including its slips, because this is the document that describes
 * how enforcement works and paraphrasing it changes what we have promised:
 *
 *  - "Managing Harrassments" is misspelled in the heading, and the id spells it that way
 *    too — the id is a live anchor, so it cannot be quietly fixed here.
 *  - "To block a user, click their username in your chat and select." and "To mute a user,
 *    simply click on their username within the chat and choose." both trail off: legacy
 *    named the menu item in a `<Typography>` that was never filled in.
 *
 * Four *rendering* differences from legacy, none of them text:
 *
 *  1. The five `h2[id]` anchors legacy scraped out of the DOM after mount become the five
 *     sections here, so the contents rail exists server-side. "Block users" was a
 *     `StyledTitle` with **no** id — legacy styled it identically to the section headings
 *     but it was never an anchor — so it is a `subheading` block and stays out of the rail.
 *  2. The opening paragraph sat above the first heading, so it is the document's `intro`.
 *  3. The reporting tip was a paragraph typed as "- Reporting Tip: …" — a bullet drawn with
 *     a hyphen. The label becomes a bold `lead` and the stray hyphen goes; it is punctuation
 *     standing in for markup, not copy.
 *  4. The renderer numbers the sections, so nothing carries a number in its title.
 *
 * Section ids are the legacy ones — external links and the mobile app point at them.
 * `transparency-consistency-trust` is also a section of the safety policy, which is fine:
 * anchors are scoped to their document.
 */
export const MODERATION_POLICY: LegalDocument = {
    effectiveDate: '11 November 2024',
    intro: [
        {
            kind: 'paragraph',
            text: 'At our core, we value a safe and inclusive community, and thus, any type of harassment, including hate raids, targeted attacks, or malicious spam, is strictly prohibited under our Community Guidelines. While we continue to develop new features to combat the harm caused by botting, raiding, and spamming, we want to draw attention to the existing tools that can help address these issues. Many Creators have already implemented these tactics and shared them with one another, and we want to make this information easily accessible to those who require it. You can access these settings through the Moderation Settings in Stream Manager.',
        },
    ],
    sections: [
        {
            id: 'chat-filters',
            title: 'Chat Filters',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'You can hide unwanted messages in any Chat across Tevi by setting Chat Filters. Chat Filters act as your own personal AutoMod and follow you from space to space.',
                },
                {
                    kind: 'paragraph',
                    text: 'You can set your global Chat Filters preferences directly from your Chat settings on any space. There are settings for Discrimination, Sexually Explicit Language, Hostility, and Profanity.',
                },
            ],
        },
        {
            id: 'transparency-consistency-trust',
            title: 'Transparency + Consistency = Trust',
            blocks: [
                {
                    kind: 'paragraph',
                    text: "We understand that trust is essential to building and growing communities. That's why we're committed to providing accurate and transparent information that's easy to understand, consistently delivered, and supported by reliable processes.",
                },
            ],
        },
        {
            id: 'managing-harrassments',
            title: 'Managing Harrassments',
            blocks: [
                { kind: 'subheading', text: 'Block users' },
                {
                    kind: 'paragraph',
                    text: "To fully eliminate a user's presence from your Tevi experience, you can opt to block them. Blocking a user on Tevi involves several actions:",
                },
                {
                    kind: 'list',
                    items: [
                        { text: 'Removing them from your list of followers.' },
                        { text: 'Prohibiting them from following you in the future.' },
                        {
                            text: "Filtering their messages out of the chats that you don't oversee.",
                        },
                    ],
                },
                {
                    kind: 'paragraph',
                    text: 'To block a user, click their username in your chat and select.',
                },
            ],
        },
        {
            id: 'chat-bans',
            title: 'Chat Bans',
            blocks: [
                {
                    kind: 'paragraph',
                    text: "As the owner of a space, you have the ability to mute a user in your chat. This action will prevent the individual from showing up in your list of chatters, and they won't be able to see or engage in the chat.",
                },
                {
                    kind: 'paragraph',
                    text: 'To mute a user, simply click on their username within the chat and choose.',
                },
            ],
        },
        {
            id: 'file-a-user-report',
            title: 'File a User Report',
            blocks: [
                {
                    kind: 'paragraph',
                    text: "If you suspect that a user is violating Tevi's Terms of Service or Community Guidelines, you have the option to file a user report. By reporting an account, you directly notify Tevi's safety team, which allows them to react swiftly and take appropriate action.",
                },
                {
                    kind: 'paragraph',
                    text: 'Tevi uses machine learning to help prevent harm before it happens. These algorithmic models are trained using the outcome of user reports, which makes reporting critical to improving the overall health of the Tevi community. Each report is sent to a member of our moderation team to review, so you can be assured that your report will be investigated.',
                },
                {
                    kind: 'paragraph',
                    lead: 'Reporting Tip: ',
                    text: 'Filing one detailed report is more effective than filing many generic reports. Mass or repeatedly reporting the same content will not increase the speed in which a report is investigated.',
                },
            ],
        },
    ],
}
