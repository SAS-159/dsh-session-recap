/**
 * Host half of dsh-session-recap.
 *
 * The recap is derived from what the browser already holds: the Chat snapshot,
 * the `sessionStats` projection and the `tokenUsage` projection. Nothing is
 * persisted and nothing is sent back to the Host, so this half only needs to
 * exist for the bundle row.
 */
export function apply () {}
