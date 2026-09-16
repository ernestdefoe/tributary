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

const { ancestorsToIncrement } = await import('../src/forum/countNewReply.js');

/**
 * A store of posts, each with an optional parent, as the override sees it:
 * one lookup for "do I have this post", one for "what is its parent".
 */
function store(tree) {
  return {
    has: (id) => Object.prototype.hasOwnProperty.call(tree, String(id)),
    parentOf: (id) => tree[String(id)],
  };
}

/** The ids a payload should bump, given a store shaped like `tree`. */
const bump = (payload, tree) => {
  const s = store(tree);

  return ancestorsToIncrement(payload, s.has, s.parentOf);
};

/** One post in a payload. */
const reply = (id, parentId) => ({
  type: 'posts',
  id: String(id),
  attributes: parentId ? { tributaryParentId: parentId } : {},
});

test('a newly created reply counts against its parent', () => {
  const payload = { data: reply(50, 10) };

  assert.deepEqual(bump(payload, {10: null}), ['10']);
});

test('🚨 a PAGE of history does not count — the server already counted it', () => {
  /*
   * The 1.0.2 regression, exactly. Three replies to post 10 arriving in one
   * list, alongside a server count that already includes all three. Counting
   * them again is how "3 replies" rendered as "5" and then "7".
   */
  const payload = { data: [reply(41, 10), reply(42, 10), reply(43, 10)] };

  assert.deepEqual(bump(payload, {10: null}), []);
});

test('🚨 a reload does not double the count', () => {
  // One reply exists. The server sends it in the stream; its parent's count
  // already says 1. Nothing may be added, or the toggle reads "2 replies".
  const payload = { data: [reply(50, 10)] };

  assert.deepEqual(bump(payload, {10: null}), []);
});

test('opening a branch does not count the replies it loads', () => {
  const payload = { data: [reply(60, 10), reply(61, 60)] };

  assert.deepEqual(bump(payload, {10: null, 60: null}), []);
});

test('a post already in the store is a re-fetch, not a new reply', () => {
  // Saving an edit returns the post as a single resource. It is not new.
  const payload = { data: reply(50, 10) };

  assert.deepEqual(bump(payload, {10: null, 50: null}), []);
});

test('a reply whose parent is not on screen is left alone', () => {
  const payload = { data: reply(50, 10) };

  assert.deepEqual(bump(payload, {}), []);
});

test('an ordinary unthreaded reply counts against nothing', () => {
  const payload = { data: reply(50, null) };

  assert.deepEqual(bump(payload, {10: null}), []);
});

test('non-post resources are ignored', () => {
  const payload = { data: { type: 'discussions', id: '1', attributes: {} } };

  assert.deepEqual(bump(payload, {10: null}), []);
});

test('an empty or malformed payload is survivable', () => {
  // pushPayload is on the path of every API response in the forum. Throwing
  // here would take down far more than a reply count.
  for (const p of [undefined, null, {}, { data: null }, { data: undefined }]) {
    assert.deepEqual(bump(p, {10: null}), []);
  }
});

test("ClaudiusH's first report: three replies, then one more, reads 4 and not 7", () => {
  let count = 3;
  const tree = { 10: null, 41: 10, 42: 10, 43: 10 };

  const apply = (payload) => {
    count += bump(payload, tree).length;
  };

  apply({ data: [reply(41, 10), reply(42, 10), reply(43, 10)] });
  assert.equal(count, 3, 'loading the page must not change the count');

  apply({ data: reply(44, 10) });
  assert.equal(count, 4, 'posting one reply adds exactly one');

  count = 4;
  apply({ data: [reply(41, 10), reply(42, 10), reply(43, 10), reply(44, 10)] });
  assert.equal(count, 4, 'reloading must not double it');
});

test("🚨 ClaudiusH's second report: a nested reply bumps EVERY post above it", () => {
  /*
   * The 1.0.3 gap. A count is the whole branch, so a reply two levels down is
   * inside two branches: post 10's and post 20's. 1.0.3 returned only the
   * immediate parent, so the pill on 20 moved and the pill on 10 did not.
   *
   *   10  <- thread start
   *   └ 20
   *     └ 30   <- the new reply answers 20
   */
  const tree = { 10: null, 20: 10 };

  assert.deepEqual(bump({ data: reply(30, 20) }, tree), ['20', '10']);
});

test('three levels deep bumps all three, nearest first', () => {
  const tree = { 10: null, 20: 10, 30: 20 };

  assert.deepEqual(bump({ data: reply(40, 30) }, tree), ['30', '20', '10']);
});

test('the walk stops at the edge of what is on screen', () => {
  // 20 is loaded, its parent 10 is not — 10 will arrive with the right number
  // whenever the reader scrolls to it, and guessing on its behalf would be the
  // double-count bug all over again.
  const tree = { 20: 999 };

  assert.deepEqual(bump({ data: reply(30, 20) }, tree), ['20']);
});

test('🚨 a looping parent chain cannot hang the tab', () => {
  /*
   * These ids come from the browser store, not from the server's own checks.
   * A cycle — a bad backfill, a hand-crafted payload — would spin the walk for
   * ever inside a redraw, which is a frozen tab rather than a wrong number.
   */
  const tree = { 10: 20, 20: 10 };

  const ids = bump({ data: reply(30, 20) }, tree);

  assert.deepEqual(ids, ['20', '10']);
});
