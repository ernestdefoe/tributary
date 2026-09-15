import app from 'flarum/forum/app';
import { override } from 'flarum/common/extend';

/**
 * Keep a parent post's reply count true without a page reload.
 *
 * 🚨 THE BUG THIS FIXES, reported by ClaudiusH: reply to a post in a thread and
 * the "3 replies" toggle does not appear on the post you answered. Reload the
 * page and it is there.
 *
 * The cause is not in the panel. `BranchPanel` is rendered when
 * `post.tributaryReplyCount() > 0`, and that attribute is computed by the
 * server — so the PARENT post sitting in the client store still says the count
 * it had when the page loaded. Nothing refetches it, because nothing has any
 * reason to: from the store's point of view the only thing that happened is
 * that a new post arrived.
 *
 * 🚨 Fixed at the STORE rather than in the composer, and that is the whole
 * point of the choice.
 *
 * The composer is one of several ways a reply appears. It is also the only one
 * anybody thinks of — so a fix there works when you post and silently does not
 * when somebody ELSE posts and flarum/realtime pushes it into the page. Both
 * paths end at `Store.pushObject`, so hooking it fixes the case that was
 * reported and the case nobody has reported yet, which on a threading
 * extension is the one that matters: watching a conversation branch in front
 * of you is most of the appeal.
 *
 * See the note in [[convoro_live_content_seam]]: content arriving without a
 * refresh gets none of the decoration a page load would have given it.
 */
export default function watchForReplies() {
  override('flarum/common/Store', 'pushObject', function (original, data) {
    /*
     * 🚨 Whether the post is NEW is decided BEFORE it is pushed.
     *
     * pushObject is called for every object in every payload, including
     * re-fetches of a post the store already has — opening a branch refetches
     * its rows, and scrolling the stream refetches whole pages. Incrementing
     * on every push would inflate the count every time somebody scrolled past.
     */
    const isNewPost = data?.type === 'posts' && !this.getById('posts', data.id);

    const pushed = original(data);

    if (!isNewPost || !pushed) return pushed;

    const parentId = data?.attributes?.tributaryParentId;

    if (!parentId) return pushed;

    const parent = this.getById('posts', String(parentId));

    /*
     * A parent that is not in the store needs nothing: it is not on screen, so
     * there is no stale count to correct, and it will be fetched with the
     * right number whenever the reader scrolls to it.
     */
    if (!parent) return pushed;

    parent.pushAttributes({
      tributaryReplyCount: (parent.tributaryReplyCount() || 0) + 1,
    });

    return pushed;
  });
}
