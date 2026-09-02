/**
 * The two session constants that the Edge runtime is allowed to know.
 *
 * This module exists purely so `middleware.ts` can name the cookie without
 * importing `session.ts` — that module reaches for `node:crypto` and the Postgres
 * pool, neither of which exists on the Edge, and a single `import` of a string
 * constant is enough to drag the whole graph in and fail the build.
 *
 * Nothing here may import anything. That is the entire point.
 */

export const SESSION_COOKIE = 'billflow_session'

export const SESSION_TTL_DAYS = 30

export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60
