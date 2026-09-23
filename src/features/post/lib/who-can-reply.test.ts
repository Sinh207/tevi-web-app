import { describe, expect, it } from 'vitest'
import { normalizePost, type Post } from '../api/types'
import {
    mayReply,
    type ReplyAudience,
    replyAudience,
    replyAudienceNotice,
    showsReplyAudienceNotice,
} from './who-can-reply'

function post(overrides: Record<string, unknown> = {}): Post {
    const parsed = normalizePost({ id: 'p1', reply_allowed: true, can_reply: true, ...overrides })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

describe('replyAudience — six wire values, and this client knew one', () => {
    it.each([
        ['FOLLOWERS', 'followers'],
        ['PAID_USERS', 'paid-users'],
        ['FOLLOWINGS', 'followings'],
        ['VERIFIED_SPACES', 'verified-spaces'],
        ['MENTIONED_SPACES', 'mentioned-spaces'],
        ['NONE', 'none'],
    ] as [string, ReplyAudience][])('reads %s', (wire, expected) => {
        expect(replyAudience(post({ reply_allowed_user: wire }))).toBe(expected)
    })

    /** Both spellings have been seen on the wire; a silent mismatch hides the whole notice. */
    it('is case-insensitive', () => {
        expect(replyAudience(post({ reply_allowed_user: 'paid_users' }))).toBe('paid-users')
        expect(replyAudience(post({ reply_allowed_user: '  Followers  ' }))).toBe('followers')
    })

    /**
     * Measured: 20 posts in a row all carried the field (18 `FOLLOWERS`, 2 `PAID_USERS`), and the
     * iOS enum has no "everyone" case at all. So this is the answer to a payload neither client has
     * seen — not to the ordinary post, which is followers-only.
     */
    it('treats an absent audience as everyone', () => {
        expect(replyAudience(post())).toBe('everyone')
        expect(replyAudience(post({ reply_allowed_user: '' }))).toBe('everyone')
    })

    /**
     * An audience added after this build is **not** a restriction to describe. Making up a sentence
     * for it would put invented words on screen; `can_reply` still governs the box either way.
     */
    it('treats an unknown audience as everyone rather than inventing a sentence', () => {
        expect(replyAudience(post({ reply_allowed_user: 'SUPERFANS' }))).toBe('everyone')
    })

    /**
     * The creator's switch wins. Legacy sets `NONE` alongside it, but a payload that carries only
     * `reply_allowed: false` still means replies are off.
     */
    it("reads the creator's switch as 'none', whatever the audience says", () => {
        expect(replyAudience(post({ reply_allowed: false }))).toBe('none')
        expect(replyAudience(post({ reply_allowed: false, reply_allowed_user: 'FOLLOWERS' }))).toBe(
            'none',
        )
    })
})

describe('replyAudienceNotice — two of the six offer a way in', () => {
    it('offers Follow on a followers-only post', () => {
        expect(replyAudienceNotice('followers')).toEqual({
            descriptionKey: 'who_can_reply_followers',
            action: 'follow',
        })
    })

    /**
     * Two labels, which is iOS's behaviour and not legacy web's. Legacy says "unlock" for both, so
     * a reader who can already read the post is offered the chance to buy it again.
     */
    it('offers to unlock a members-only post the reader cannot read yet', () => {
        expect(replyAudienceNotice('paid-users', { locked: true })).toEqual({
            descriptionKey: 'who_can_reply_paid_users',
            action: 'unlock',
        })
    })

    it('offers membership when the reader can read the post but may not reply', () => {
        expect(replyAudienceNotice('paid-users', { locked: false })).toEqual({
            descriptionKey: 'who_can_reply_paid_users',
            action: 'join',
        })
    })

    /** The default matters: a caller asking only about wording must not get the "locked" branch. */
    it('defaults to the membership offer when locked is not stated', () => {
        expect(replyAudienceNotice('paid-users')?.action).toBe('join')
    })

    /** There is no button that makes a reader verified, or mentioned in somebody else's post. */
    it.each(['followings', 'verified-spaces', 'mentioned-spaces', 'none'] as ReplyAudience[])(
        'states %s as fact, with no control',
        audience => {
            expect(replyAudienceNotice(audience)?.action).toBe('none')
        },
    )

    it('has nothing to say about an unrestricted post', () => {
        expect(replyAudienceNotice('everyone')).toBe(null)
    })
})

describe('showsReplyAudienceNotice', () => {
    /**
     * The order that matters: a reader who **may** reply never sees it, however restricted the post
     * is. A member of a members-only space gets the box, not a rule they already satisfy.
     */
    it('is silent for a reader who may reply, even on a restricted post', () => {
        expect(
            showsReplyAudienceNotice(post({ reply_allowed_user: 'PAID_USERS', can_reply: true })),
        ).toBe(false)
    })

    it('speaks for a reader who may not', () => {
        expect(
            showsReplyAudienceNotice(post({ reply_allowed_user: 'PAID_USERS', can_reply: false })),
        ).toBe(true)
        expect(
            showsReplyAudienceNotice(post({ reply_allowed_user: 'FOLLOWERS', can_reply: false })),
        ).toBe(true)
    })

    it('speaks when the creator has closed replies', () => {
        expect(showsReplyAudienceNotice(post({ reply_allowed: false }))).toBe(true)
    })

    /**
     * The author is never told who may reply to their own post — they set the rule. On a post whose
     * replies they closed, `can_reply` is false for them too, so without the owner guard every
     * author gets lectured about their own switch. iOS guards the same way.
     */
    it('stays silent for the post owner, including on their own closed post', () => {
        expect(
            showsReplyAudienceNotice(
                post({ is_owner: true, reply_allowed_user: 'FOLLOWERS', can_reply: false }),
            ),
        ).toBe(false)
        expect(showsReplyAudienceNotice(post({ is_owner: true, reply_allowed: false }))).toBe(false)
    })

    /**
     * `can_reply: false` with no audience named — the backend refusing for a reason the payload
     * does not carry. An empty panel says less than no panel.
     */
    it('stays silent when the payload names no reason', () => {
        expect(showsReplyAudienceNotice(post({ can_reply: false }))).toBe(false)
        expect(
            showsReplyAudienceNotice(post({ can_reply: false, reply_allowed_user: 'SUPERFANS' })),
        ).toBe(false)
    })

    /**
     * A tombstone takes no replies for a reason that has nothing to do with its audience. Without
     * the explicit guard this is `true`, because `canReply` answers `false` for a deleted post —
     * which would put "you need to follow this space to reply" under something that is gone.
     */
    it('stays silent on a deleted post', () => {
        expect(
            showsReplyAudienceNotice(post({ deleted: true, reply_allowed_user: 'FOLLOWERS' })),
        ).toBe(false)
    })
})

/** A followed space, as the post payload carries it. */
const FOLLOWED = { channel: { id: 'ch-1', slug: 'alice', is_followed: true } }
const NOT_FOLLOWED = { channel: { id: 'ch-1', slug: 'alice', is_followed: false } }

describe('mayReply — the one permission iOS settles locally', () => {
    it("takes the backend's yes at face value", () => {
        expect(mayReply(post())).toBe(true)
    })

    /**
     * The case the branch exists for: the reader followed the space a moment ago, and the cached
     * `can_reply` has not caught up. iOS reads `channel.isFollowed` for exactly this.
     */
    it('lets a follower reply to a followers-only post despite a stale can_reply', () => {
        expect(
            mayReply(post({ ...FOLLOWED, can_reply: false, reply_allowed_user: 'FOLLOWERS' })),
        ).toBe(true)
    })

    it('still refuses a non-follower', () => {
        expect(
            mayReply(post({ ...NOT_FOLLOWED, can_reply: false, reply_allowed_user: 'FOLLOWERS' })),
        ).toBe(false)
        // No channel at all is not a follow.
        expect(
            mayReply(post({ channel: null, can_reply: false, reply_allowed_user: 'FOLLOWERS' })),
        ).toBe(false)
    })

    /** Following a space does not reopen replies its creator closed. */
    it("does not override the creator's switch", () => {
        expect(
            mayReply(
                post({
                    ...FOLLOWED,
                    reply_allowed: false,
                    can_reply: false,
                    reply_allowed_user: 'FOLLOWERS',
                }),
            ),
        ).toBe(false)
    })

    /**
     * The guard that keeps the branch narrow. Following a space says nothing about being a member,
     * being verified, or being mentioned — only `FOLLOWERS` is satisfiable by a follow.
     */
    it.each(['PAID_USERS', 'VERIFIED_SPACES', 'MENTIONED_SPACES', 'FOLLOWINGS', 'NONE'])(
        'does not let a follow stand in for %s',
        audience => {
            expect(
                mayReply(post({ ...FOLLOWED, can_reply: false, reply_allowed_user: audience })),
            ).toBe(false)
        },
    )

    it('never revives a deleted post', () => {
        expect(
            mayReply(
                post({
                    ...FOLLOWED,
                    deleted: true,
                    can_reply: false,
                    reply_allowed_user: 'FOLLOWERS',
                }),
            ),
        ).toBe(false)
    })
})

describe('the panel follows mayReply, not can_reply', () => {
    /** A follower being told to follow is the wrong sentence at a moment nothing can correct it. */
    it('stays silent for a follower on a followers-only post', () => {
        expect(
            showsReplyAudienceNotice(
                post({ ...FOLLOWED, can_reply: false, reply_allowed_user: 'FOLLOWERS' }),
            ),
        ).toBe(false)
    })

    it('still speaks to a non-follower', () => {
        expect(
            showsReplyAudienceNotice(
                post({ ...NOT_FOLLOWED, can_reply: false, reply_allowed_user: 'FOLLOWERS' }),
            ),
        ).toBe(true)
    })
})
