/**
 * The arithmetic behind "7 replies".
 *
 * 🚨 These exist because the 1.0.2 regression rendered perfectly. Nothing threw,
 * nothing looked broken, the panel opened and the replies inside it were right
 * — the NUMBER on the toggle was simply wrong, and no amount of looking at the
 * page catches that. Only counting does.
 *
 * `node --test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { parentToIncrement } = await import('../src/forum/countNewReply.js');

/** A store containing the given post ids. */
const storeWith =
  (...ids) =>
  (id) =>
    ids.map(String).includes(String(id));

const reply = (id, parentId) => ({
  type: 'posts',
  id: String(id),
  attributes: parentId ? { tributaryParentId: parentId } : {},
});

test('a newly created reply counts against its parent', () => {
  const payload = { data: reply(50, 10) };

  assert.equal(parentToIncrement(payload, storeWith(10)), '10');
});

test('🚨 a PAGE of history does not count — the server already counted it', () => {
  /*
   * The 1.0.2 regression, exactly. Three replies to post 10 arriving in one
   * list, alongside a server count that already includes all three. Counting
   * them again is how "3 replies" rendered as "5" and then "7".
   */
  const payload = { data: [reply(41, 10), reply(42, 10), reply(43, 10)] };

  assert.equal(parentToIncrement(payload, storeWith(10)), null);
});

test('🚨 a reload does not double the count', () => {
  // One reply exists. The server sends it in the stream; its parent's count
  // already says 1. Nothing may be added, or the toggle reads "2 replies".
  const payload = { data: [reply(50, 10)] };

  assert.equal(parentToIncrement(payload, storeWith(10)), null);
});

test('opening a branch does not count the replies it loads', () => {
  const payload = { data: [reply(60, 10), reply(61, 60)] };

  assert.equal(parentToIncrement(payload, storeWith(10, 60)), null);
});

test('a post already in the store is a re-fetch, not a new reply', () => {
  // Saving an edit returns the post as a single resource. It is not new.
  const payload = { data: reply(50, 10) };

  assert.equal(parentToIncrement(payload, storeWith(10, 50)), null);
});

test('a reply whose parent is not on screen is left alone', () => {
  const payload = { data: reply(50, 10) };

  assert.equal(parentToIncrement(payload, storeWith()), null);
});

test('an ordinary unthreaded reply counts against nothing', () => {
  const payload = { data: reply(50, null) };

  assert.equal(parentToIncrement(payload, storeWith(10)), null);
});

test('non-post resources are ignored', () => {
  const payload = { data: { type: 'discussions', id: '1', attributes: {} } };

  assert.equal(parentToIncrement(payload, storeWith(10)), null);
});

test('an empty or malformed payload is survivable', () => {
  // pushPayload is on the path of every API response in the forum. Throwing
  // here would take down far more than a reply count.
  for (const p of [undefined, null, {}, { data: null }, { data: undefined }]) {
    assert.equal(parentToIncrement(p, storeWith(10)), null);
  }
});

test("ClaudiusH's thread: three replies, then one more, reads 4 and not 7", () => {
  /*
   * The whole reported sequence, as arithmetic.
   *
   * Load a thread whose parent the server says has 3 replies, then post a
   * fourth. Only the fourth is a create; the first three arrive as a list.
   */
  let count = 3;
  const store = storeWith(10, 41, 42, 43);

  const apply = (payload, has) => {
    if (parentToIncrement(payload, has)) count += 1;
  };

  apply({ data: [reply(41, 10), reply(42, 10), reply(43, 10)] }, store);
  assert.equal(count, 3, 'loading the page must not change the count');

  apply({ data: reply(44, 10) }, store);
  assert.equal(count, 4, 'posting one reply adds exactly one');

  // And a reload: the server now says 4, and the list must add nothing.
  count = 4;
  apply({ data: [reply(41, 10), reply(42, 10), reply(43, 10), reply(44, 10)] }, storeWith(10, 41, 42, 43, 44));
  assert.equal(count, 4, 'reloading must not double it');
});
