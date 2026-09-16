/**
 * Which posts' reply counts a payload should bump.
 *
 * 🚨 Split out of watchForReplies so it can be tested without a Store, a
 * Mithril or a browser — because the bug it exists to prevent is a wrong
 * NUMBER, which renders perfectly and is only caught by arithmetic.
 *
 * 🚨 ANCESTORS, plural, and that is the 1.0.4 fix.
 *
 * A Tributary count is the whole BRANCH beneath a post, not its direct
 * answers — that is what the toggle promises and what the server computes. So
 * a reply three levels down is inside three different branches and belongs in
 * three different counts. 1.0.3 incremented only the immediate parent, so the
 * post you answered updated and everything above it silently did not, which
 * ClaudiusH reported as "the first pill updates but not the one a level up".
 *
 * @param {object} payload            a JSON:API payload as Store.pushPayload gets it
 * @param {(id: string) => boolean} storeHasPost
 * @param {(id: string) => (string|number|null|undefined)} parentOf
 *        the tributaryParentId of a post already in the store
 * @returns {string[]} post ids to increment, nearest ancestor first
 */
export function ancestorsToIncrement(payload, storeHasPost, parentOf) {
  const data = payload?.data;

  /*
   * 🚨 `Store.pushPayload` passes a single object for a single-resource
   * response — creating a post, or realtime pushing one — and an ARRAY for
   * every list: a page of the post stream, a branch being opened, a scroll
   * backwards.
   *
   * 1.0.2 hooked `pushObject`, one level down, where that difference has
   * already been flattened away and a post loaded from history is
   * indistinguishable from a post written a second ago. It incremented on
   * both, so every reply was counted twice. An array here means the server is
   * telling us what already exists, and what already exists is already in the
   * count it sent with it.
   */
  if (!data || Array.isArray(data)) return [];

  if (data.type !== 'posts') return [];

  /*
   * Already in the store means this is a re-fetch of something we have —
   * saving an edit, or a permalink to a post already on screen. The count
   * that arrived with it is current; nothing to add.
   */
  if (data.id != null && storeHasPost(String(data.id))) return [];

  const first = data.attributes?.tributaryParentId;

  if (!first) return [];

  const out = [];
  const seen = new Set();
  let id = String(first);

  /*
   * 🚨 `seen` is not defensive programming for its own sake. These ids come
   * from posts in the browser's store, and a chain that loops — from a bad
   * backfill, or a payload crafted by hand — would spin this loop for ever and
   * hang the tab on a redraw. The server refuses to create a cycle; this does
   * not assume the browser only ever holds what the server created.
   */
  while (id && !seen.has(id)) {
    seen.add(id);

    /*
     * A post that is not in the store needs nothing, and the walk stops there
     * rather than continuing: it is not on screen, so there is no stale count
     * to correct, and it will be fetched with the right number whenever the
     * reader scrolls to it. Its own ancestors are off screen too, for the same
     * reason — the store holds a contiguous window of a discussion.
     */
    if (!storeHasPost(id)) break;

    out.push(id);

    const next = parentOf(id);

    id = next ? String(next) : null;
  }

  return out;
}
