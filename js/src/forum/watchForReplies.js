import { override } from 'flarum/common/extend';

import { parentToIncrement } from './countNewReply';

/**
 * Keep a parent post's reply count true without a page reload.
 *
 * 🚨 THE BUG THIS FIXES, reported by ClaudiusH: reply to a post in a thread and
 * the "3 replies" toggle does not appear on the post you answered. Reload the
 * page and it is there.
 *
 * The cause is not in the panel. `BranchPanel` is rendered when
 * `post.tributaryReplyCount() > 0`, and that attribute is computed by the
 * server on every serialize — so the PARENT post sitting in the client store
 * still says the count it had when the page loaded. Nothing refetches it,
 * because nothing has any reason to: from the store's point of view the only
 * thing that happened is that a new post arrived.
 *
 * 🚨 Hooked at `pushPayload`, NOT `pushObject`, and 1.0.3 exists because I got
 * that wrong.
 *
 * Both the composer and a realtime push end in the store, which is why the
 * store is the right place — a fix in the composer works when you post and
 * silently does not when somebody else does, and watching a branch grow in
 * front of you is most of the appeal of a threading extension.
 *
 * But it has to be hooked at the level where "the server is handing me one new
 * post" is still distinguishable from "the server is handing me a page of
 * history". `pushPayload` still knows: a single resource against an array.
 * `pushObject` does not, and incrementing there double-counted every reply the
 * server had already counted. See countNewReply for the arithmetic that went
 * wrong.
 *
 * 🚨 Incrementing a server-computed number is only ever safe for a post the
 * server had not yet seen when it computed it. That is the invariant; if a
 * future change cannot honour it, refetch the parent instead of guessing.
 */
export default function watchForReplies() {
  override('flarum/common/Store', 'pushPayload', function (original, payload) {
    const parentId = parentToIncrement(payload, (id) => !!this.getById('posts', id));

    const result = original(payload);

    if (!parentId) return result;

    const parent = this.getById('posts', parentId);

    // Re-checked after the push: the payload may itself have been what put the
    // parent in the store, and it arrived carrying a fresh count of its own.
    if (!parent) return result;

    parent.pushAttributes({
      tributaryReplyCount: (parent.tributaryReplyCount() || 0) + 1,
    });

    return result;
  });
}
