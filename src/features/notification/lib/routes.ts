/**
 * The inbox's URL, named once because two other features link to it.
 *
 * `features/navigation` owns the bell — in the mobile top bar and in the desktop rail — and both
 * point here. A string literal in either would keep type-checking and keep rendering after this
 * page moves; it would just 404, which is the failure mode that reaches production.
 *
 * **Legacy's path, singular, unchanged** (`pages/notification`). It reads like it should be
 * `/notifications`, and it is not being renamed: the mobile apps deep-link to it, push
 * notifications land on it, and the cutover is same-origin, so every one of those links resolves
 * straight through. A rename buys a nicer URL and loses all of them.
 */
export const NOTIFICATION_PATH = '/notification'
