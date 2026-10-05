/**
 * **The chat's emoji, with names** — the picker's grid and the `:` shortcode suggestions read the
 * same table, so an emoji can never be pickable and unsearchable or the other way round.
 *
 * Curated rather than the full Unicode set: `event-studio-chat.tsx`'s `EmojiButton` note says why
 * (legacy's `emoji-picker-react` is 40MB unpacked). Each entry carries **Slack-style English
 * shortcodes** — the convention every chat product has taught, and what a reader types from habit —
 * plus a few **Vietnamese keywords**, unaccented, because search folds diacritics: `cuoi`, `cười`
 * and `CƯỜI` all find 😂.
 */
export interface ChatEmoji {
    char: string
    /** The first name is the shortcode shown as `:name:`; the rest are search keywords. */
    names: readonly string[]
}

export const CHAT_EMOJI: readonly ChatEmoji[] = [
    { char: '😀', names: ['grinning', 'smile', 'happy', 'vui'] },
    { char: '😂', names: ['joy', 'laugh', 'lol', 'haha', 'cuoi'] },
    { char: '🥹', names: ['holding_back_tears', 'touched', 'cam_dong'] },
    { char: '😍', names: ['heart_eyes', 'love', 'yeu', 'me'] },
    { char: '😎', names: ['sunglasses', 'cool', 'ngau'] },
    { char: '🤔', names: ['thinking', 'hmm', 'suy_nghi'] },
    { char: '😮', names: ['open_mouth', 'wow', 'surprised', 'bat_ngo'] },
    { char: '😭', names: ['sob', 'cry', 'khoc'] },
    { char: '👍', names: ['thumbsup', '+1', 'like', 'ok', 'thich'] },
    { char: '👏', names: ['clap', 'applause', 'vo_tay'] },
    { char: '🙏', names: ['pray', 'thanks', 'please', 'cam_on'] },
    { char: '💪', names: ['muscle', 'strong', 'manh'] },
    { char: '🔥', names: ['fire', 'hot', 'lit', 'lua', 'chay'] },
    { char: '✨', names: ['sparkles', 'shine', 'lap_lanh'] },
    { char: '💯', names: ['100', 'perfect', 'tuyet'] },
    { char: '🎉', names: ['tada', 'party', 'celebrate', 'chuc_mung'] },
    { char: '❤️', names: ['heart', 'love', 'tim', 'yeu'] },
    { char: '💜', names: ['purple_heart', 'tim_tim'] },
    { char: '💔', names: ['broken_heart', 'sad', 'buon'] },
    { char: '🌹', names: ['rose', 'flower', 'hoa_hong'] },
    { char: '🎁', names: ['gift', 'present', 'qua'] },
    { char: '⭐', names: ['star', 'sao'] },
    { char: '👑', names: ['crown', 'king', 'queen', 'vuong_mien'] },
    { char: '🏆', names: ['trophy', 'win', 'cup', 'cup_vang'] },
    { char: '😅', names: ['sweat_smile', 'awkward', 'nguong'] },
    { char: '😴', names: ['sleeping', 'tired', 'ngu'] },
    { char: '🤯', names: ['exploding_head', 'mind_blown', 'soc'] },
    { char: '🥳', names: ['partying', 'birthday', 'sinh_nhat'] },
    { char: '😡', names: ['rage', 'angry', 'tuc_gian'] },
    { char: '🤝', names: ['handshake', 'deal', 'bat_tay'] },
    { char: '👀', names: ['eyes', 'look', 'nhin'] },
    { char: '🫶', names: ['heart_hands', 'love_you', 'thuong'] },
]

/** How many suggestions the strip shows. */
export const EMOJI_SUGGESTION_LIMIT = 8

/** Lowercase, accents folded (`đ` included), so `CƯỜI`, `cười` and `cuoi` are one query. */
export function foldForSearch(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/đ/g, 'd')
}

/**
 * **Is the caret inside a `:shortcode` the reader is typing** — and if so, where it starts.
 *
 * The colon only counts at the very start or after whitespace, which is what keeps `10:30`,
 * `https://` and `Note:` from opening anything. What follows it, up to the caret, has to be word
 * characters (letters in any script, digits, `_`, `+`, `-`): the moment it is not — a space, a `)`
 * of `:)`, a `D` of `:D` is still a letter, so `:D` filters to nothing and the strip simply has no
 * row — the suggestion is over. A bare `:` returns an empty query, which is the "show me some"
 * state.
 */
export function findColonQuery(
    value: string,
    caret: number,
): { start: number; query: string } | null {
    const before = value.slice(0, caret)
    const colon = before.lastIndexOf(':')
    if (colon === -1) return null
    if (colon > 0 && !/\s/.test(before[colon - 1])) return null
    const query = before.slice(colon + 1)
    if (!/^[\p{L}\p{N}_+-]*$/u.test(query)) return null
    return { start: colon, query }
}

/**
 * The emoji a query asks for, best first: an **exact** name, then a name that **starts with** the
 * query, then one that merely contains it — so `:heart` is ❤️ before 😍 (`heart_eyes`) — and the
 * table's own order breaks ties — it is ordered by how often a live
 * chat reaches for them, so an empty query is the popular row.
 */
export function searchChatEmoji(query: string, limit = EMOJI_SUGGESTION_LIMIT): ChatEmoji[] {
    const q = foldForSearch(query).replace(/-/g, '_')
    if (q === '') return CHAT_EMOJI.slice(0, limit)
    const ranked: { emoji: ChatEmoji; rank: number; index: number }[] = []
    CHAT_EMOJI.forEach((emoji, index) => {
        const names = emoji.names.map(foldForSearch)
        const rank = names.includes(q)
            ? 0
            : names.some(n => n.startsWith(q))
              ? 1
              : names.some(n => n.includes(q))
                ? 2
                : -1
        if (rank >= 0) ranked.push({ emoji, rank, index })
    })
    return ranked
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .slice(0, limit)
        .map(r => r.emoji)
}
