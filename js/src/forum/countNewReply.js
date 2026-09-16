/**
 * Does this payload represent a reply that has just been CREATED?
 *
 * 🚨 Split out of watchForReplies so it can be tested without a Store, a
 * Mithril or a browser — because the bug it exists to prevent is a wrong
 * NUMBER, which renders perfectly and is only caught by arithmetic.
 *
 * @param {object} payload            a JSON:API payload as Store.pushPayload gets it
 * @param {(id: string) => boolean} storeHasPost
 * @returns {string|null} the parent post id to increment, or null
 */
export function parentToIncrement(payload, storeHasPost) {
  const data = payload?.data;

  /*
   * 🚨 THE WHOLE FIX IS THIS LINE, and the regression it repairs was mine.
   *
   * `Store.pushPayload` passes a single object for a single-resource response
   * — creating a post, or realtime pushing one — and an ARRAY for every list:
   * a page of the post stream, a branch being opened, a scroll backwards.
   *
   * 1.0.2 hooked `pushObject`, one level down, where that difference has
   * already been flattened away and a post loaded from history is
   * indistinguishable from a post written a second ago. It incremented on
   * both. The server had already counted the historical ones, so every reply
   * was counted twice: a thread with three replies read "5", one more reply
   * took it to "7", and a brand new thread said "1 replies" until you
   * reloaded and it became "2". Reported by ClaudiusH.
   *
   * An array here means the server is telling us what already exists, and
   * what already exists is already in the count it sent with it.
   */
  if (!data || Array.isArray(data)) return null;

  if (data.type !== 'posts') return null;

  /*
   * Already in the store means this is a re-fetch of something we have —
   * saving an edit, or a permalink to a post already on screen. The count
   * that arrived with it is current; nothing to add.
   */
  if (data.id != null && storeHasPost(String(data.id))) return null;

  const parentId = data.attributes?.tributaryParentId;

  if (!parentId) return null;

  /*
   * A parent that is not in the store needs nothing: it is not on screen, so
   * there is no stale count to correct, and it will be fetched with the right
   * number whenever the reader scrolls to it.
   */
  return storeHasPost(String(parentId)) ? String(parentId) : null;
}
