import type { LegalDocument } from './types'

/**
 * Tevi's safety policy, ported from the legacy app
 * (`tevi-web-app/src/containers/safety/components/content/index.js`).
 *
 * **English only, and deliberately not in `translation.json`** — same reasoning as
 * `privacy-policy.ts`: the legacy page ships this text hardcoded in English at every
 * locale and it is not ours to paraphrase, so only the chrome (title, "last updated"
 * line, contents heading) goes through i18n.
 *
 * Wording is unchanged, including its typos ("Tevi hold these values", "Tevi believe
 * that both channel"). Two legacy *rendering* defects were fixed, both duplication
 * rather than text:
 *
 *  1. "Approach to Safety" printed "controls for the content they want to see." twice in
 *     a row inside its third paragraph. Kept once.
 *  2. "Channel - Level Safety" / "Viewer - Level Safety" carried the stray spaces JSX
 *     line-wrapping left in the heading. Set as "Channel-Level Safety" /
 *     "Viewer-Level Safety", which is how the section's own diagram and its
 *     "Service-Level Safety" sibling spell it.
 *
 * ⚠ **"Safety Philosophy" and "Community Guidelines (CGs)" carry byte-identical copy** —
 * the CG paragraphs are pasted under both headings in the legacy page, so the document
 * says the same two things twice, in sections 4 and 6. Reproduced as-is: replacing it
 * means writing new policy copy, which is Legal's call, not a port's. `safety.test.ts`
 * pins the duplication so that fixing it is a deliberate edit rather than an accident.
 *
 * Section ids are the legacy ones — external links and the mobile app point at them.
 */

const CG_FRAMEWORK = [
    {
        kind: 'paragraph',
        text: "Tevi's Community Guidelines provide the framework for ensuring the safety of our community. These guidelines establish the parameters for all user-generated content and activity on the platform. As such, clarity is of the utmost importance. To that end, we have continually improved the guidelines by adding descriptions and specific examples of prohibited behavior and content (as well as specific exceptions) whenever possible. We understand that Tevi's community culture is dynamic, and as such, we regularly review and refine our guidelines to ensure they remain relevant.",
    },
    {
        kind: 'paragraph',
        text: 'By communicating our expectations and updates to these standards, we help Tevi users understand the boundaries we have established and enable them to confidently express themselves within these limits. Additionally, clear and relevant Community Guidelines are essential for ensuring consistency in our enforcement actions.',
    },
] as const satisfies LegalDocument['intro']

export const SAFETY_POLICY: LegalDocument = {
    effectiveDate: '11 November 2024',
    intro: [
        {
            kind: 'paragraph',
            text: 'Tevi hold these values at the core of everything we do:',
        },
    ],
    sections: [
        {
            id: 'community-comes-first',
            title: 'Community Comes First',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'The community is the backbone of our platform, and we always prioritize its needs. We believe in having clear rules that are easy to understand and enforce, ensuring a positive and inclusive environment for all.',
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
            id: 'safety-is-personal',
            title: 'Safety Is Personal',
            blocks: [
                {
                    kind: 'paragraph',
                    text: "We set platform-wide standards for safety, but we also empower creators and moderators to go above and beyond and enforce rules that best suit their community's unique needs. At Tevi, we believe that everyone deserves a safe and secure environment, and we strive to ensure that every community feels supported and protected.",
                },
                {
                    kind: 'paragraph',
                    text: 'At Tevi, we prioritize safety above all else. We believe that safer communities are more empowered, leading to unique moments, experiences, and friendships that make our platform truly exceptional. Ensuring safety is a win-win for everyone involved.',
                },
                {
                    kind: 'paragraph',
                    text: 'We understand that feeling safe on our platform is essential, and we take our responsibility to make that happen seriously. Our approach to achieving this includes:',
                },
                {
                    kind: 'list',
                    items: [
                        {
                            text: 'Establishing clear and concise guidelines that prioritize the well-being of every Tevi user.',
                        },
                        {
                            text: 'Equipping communities with the necessary tools to create an experience that aligns with their values and standards.',
                        },
                        {
                            text: 'Engaging with the community to ensure that we are communicating changes and updates in a timely, consistent, and transparent manner.',
                        },
                    ],
                },
            ],
        },
        {
            // Legacy pastes the Community Guidelines copy here; see the note above.
            id: 'safety-philosophy',
            title: 'Safety Philosophy',
            blocks: [...CG_FRAMEWORK],
        },
        {
            id: 'approach-to-safety',
            title: 'Approach to Safety',
            blocks: [
                {
                    kind: 'paragraph',
                    text: "Tevi is a live streaming service that fosters community interaction around live, often temporary content. This unique platform requires a distinct approach to safety. While content moderation solutions that work for other services may not be as effective for Tevi, the needs of creators and communities that engage with Tevi's content vary widely.",
                },
                {
                    kind: 'paragraph',
                    text: 'To address these challenges, Tevi has developed a personalized approach to safety that balances consistent sitewide safety standards with channel-level personalization. This approach relies on the participation of all members of the Tevi ecosystem, including creators, moderators, viewers, and Tevi staff.',
                },
                {
                    kind: 'paragraph',
                    text: "Tevi's Community Guidelines (CGs) provide a foundation for safety, outlining prohibited behaviors that violate the platform's values. Creators and their volunteer moderators use customizable Tevi safety tools to ensure these standards are met within their channel, while also tailoring settings to the unique needs of their stream. Viewers can report users or behaviors that break the CGs and set additional controls for the content they want to see. Tevi's global Safety Operations team works around the clock to swiftly respond to user reports and mitigate harm.",
                },
                {
                    kind: 'paragraph',
                    text: 'Behind the scenes, proactive detection filters are continually updated, but Tevi prioritizes human involvement in all aspects of safety to stay ahead of bad actors and ensure accurate and fair Trust & Safety processes for community members. This "layered approach" to safety infrastructure comprises multiple components, from proactive detection filters to human review, which work together to provide a nimble and responsive sitewide safety experience while allowing creators to cultivate unique communities within their channels.',
                },
                {
                    kind: 'image',
                    /*
                     * A repo asset rather than legacy's CDN copy
                     * (`$STATIC_DOMAIN/web/web-landing/safety/approach-to-safety.jpeg?v1`),
                     * for three reasons: the figure is part of the policy and should version
                     * with the copy it illustrates; the bucket path does not exist on every
                     * host `NEXT_PUBLIC_STATIC_DOMAIN` can point at (`static.tevi.com` 404s
                     * it), so a remote src makes the diagram an environment-dependent
                     * silent failure; and a `remotePatterns` entry written as
                     * `new URL('https://host/**')` pins `search` to the empty string, so
                     * legacy's `?v1` alone would make `/_next/image` answer 400.
                     */
                    src: '/legal/approach-to-safety.jpeg',
                    /*
                     * The diagram is entirely text — four stacked tiers — so the whole of it
                     * goes in the alt rather than legacy's "Tevi - approach to safety",
                     * which told a screen reader nothing. It names the same four layers the
                     * sections below it describe.
                     */
                    alt: "Tevi's layered approach to safety, from the base up: Community Guidelines set content and behavior policies; service-level safety adds machine detection, user reporting, and review and enforcement; channel-level safety adds moderators, Mod View and AutoMod; viewer-level safety adds blocking, chat filters and content warnings.",
                    width: 1280,
                    height: 720,
                },
            ],
        },
        {
            id: 'community-guidelines-cgs',
            title: 'Community Guidelines (CGs)',
            blocks: [...CG_FRAMEWORK],
        },
        {
            id: 'service-level-safety',
            title: 'Service-Level Safety',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'To maintain the safety of our platform, we employ a combination of technology and operations which we refer to as service-level safety. This approach has three main components: machine detection, user reporting, and review and enforcement.',
                },
                {
                    kind: 'paragraph',
                    text: 'Machine Detection involves the use of advanced technologies to scan the content of the service and flag any material that violates our Community Guidelines. Examples of content that may be flagged include nudity, sexual content, gore, and extreme violence. While live-streaming presents a unique challenge for machine detection, we have invested in technologies that make it possible to detect and flag such content, and we are committed to improving them.',
                },
                {
                    kind: 'paragraph',
                    text: 'User Reporting is a crucial component of our service-level safety approach. We encourage our users to report any content that they believe violates our Community Guidelines. We have a team of experienced content moderation professionals who review these reports and take appropriate action.',
                },
                {
                    kind: 'paragraph',
                    text: 'Review and Enforcement involves our content moderation professionals reviewing reports of harmful behavior and taking appropriate action. Reports are prioritized based on severity, availability of evidence, and current volume. We also employ a team of investigators who work on the most egregious reports and collaborate with law enforcement when necessary.',
                },
                {
                    kind: 'paragraph',
                    text: 'We recognize that content moderation professionals are exposed to negative and disturbing content on a regular basis, and we take their health and safety seriously. We have invested in tools to reduce the harmful effects of certain content, such as showing potentially harmful videos in black-and-white or muted. We also provide programs and benefits to protect their mental well-being, including access to counselors and a supportive work environment that prioritizes employee wellness.',
                },
                {
                    kind: 'paragraph',
                    text: "Tevi believe that both channel and viewer safety are important, and we're committed to providing the necessary tools and features to ensure a positive and inclusive environment for all users.",
                },
            ],
        },
        {
            id: 'channel-level-safety',
            title: 'Channel-Level Safety',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We encourage creators to set their own standards of acceptable behavior for their communities while adhering to our Community Guidelines. Creators can appoint community moderators to monitor chat and enforce these standards, and these moderators can be easily identified by their green sword badge. To assist creators and their mods, we offer a suite of tools such as AutoMod, Chat Modes, account verification, Suspicious User Detection, and Mod View. These tools enable creators and mods to manage chat participation, filter unwanted messages, issue timeouts or permanent bans to problematic users.',
                },
            ],
        },
        {
            id: 'viewer-level-safety',
            title: 'Viewer-Level Safety',
            blocks: [
                {
                    kind: 'paragraph',
                    text: 'We provide viewers with features to customize their own safety experience. These include mature flags, chat filters, and the ability to block other users. These features give viewers control over the content and interactions they have across the platform.',
                },
            ],
        },
    ],
}
