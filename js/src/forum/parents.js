import app from 'flarum/forum/app';

/*
 * The posts that threaded replies answer, fetched TOGETHER.
 *
 * 🚨 One request for a page, not one per reply. The store covers the common
 * case (the parent is on the same page), but a page opened near the end of a
 * long discussion is full of replies to posts far above it, and each
 * ReplyingTo asked for its own parent with `store.find('posts', id)` — ten
 * threaded replies on screen were ten requests, and two replies to the same
 * post asked for it twice.
 *
 * Every lookup made in the same tick is queued and sent as one
 * `/posts?filter[id]=…`; a parent that comes back missing (deleted, hidden,
 * not visible to this reader) is remembered so it is not asked for again.
 */

const BATCH = 50;
const pending = new Map(); // id -> list of { resolve, reject }
const missing = new Set();
let timer = null;

export function findParent(id) {
  id = String(id);

  const hit = app.store.getById('posts', id);
  if (hit) return Promise.resolve(hit);
  if (missing.has(id)) return Promise.reject(new Error('missing'));

  return new Promise((resolve, reject) => {
    if (!pending.has(id)) pending.set(id, []);
    pending.get(id).push({ resolve, reject });

    if (!timer) timer = setTimeout(flush, 0);
  });
}

function settle(ids, waiting) {
  ids.forEach((id) => {
    const post = app.store.getById('posts', id);

    if (!post) missing.add(id);

    (waiting.get(id) || []).forEach(({ resolve, reject }) => (post ? resolve(post) : reject(new Error('missing'))));
  });
}

function flush() {
  timer = null;

  const waiting = new Map(pending);
  pending.clear();

  const ids = [...waiting.keys()];

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);

    app.store
      .find('posts', { filter: { id: chunk.join(',') }, page: { limit: BATCH } })
      .catch(() => null)
      .then(() => settle(chunk, waiting));
  }
}
