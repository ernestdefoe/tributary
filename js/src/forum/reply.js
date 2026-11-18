import app from 'flarum/forum/app';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import { setParent, clearParent } from './state';

/**
 * Open the composer as an answer to one post.
 *
 * Shared by the "Reply in thread" post action and the same control on each
 * reply inside an open branch, so both open exactly the same composer. It
 * takes ids rather than a Post model because a branch row is a plain object
 * from this extension's own endpoint.
 *
 * 🚨 Through core's own `replyAction`, never by constructing a ReplyComposer.
 * That one call already handles the log-in prompt for a guest, the "you cannot
 * reply" case, an existing draft in the composer, and the composer being
 * minimised — all of which an extension that news up its own composer has to
 * reimplement and will get wrong.
 */
export default function reply(discussion, postId, displayName) {
  setParent(discussion.id(), postId, displayName);

  return DiscussionControls.replyAction.call(discussion, true).catch(() => clearParent());
}

/**
 * Whether the current reader may answer anything in this discussion.
 */
export function canReplyIn(discussion) {
  return !!app.session.user && !!discussion && discussion.canReply();
}
