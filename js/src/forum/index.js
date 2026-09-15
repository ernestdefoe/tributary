import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import Button from 'flarum/common/components/Button';
import Model from 'flarum/common/Model';
import Post from 'flarum/common/models/Post';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import extractText from 'flarum/common/utils/extractText';
import watchForReplies from './watchForReplies';

import BranchPanel from './components/BranchPanel';
import ReplyingTo from './components/ReplyingTo';
import { setParent, getParent, clearParent } from './state';
import { forgetBranches, branchFor } from './branches';

/*
 * 🚨 Every extend() below names a module PATH rather than an imported
 * component. CommentPost and ReplyComposer are code-split in Flarum 2, so an
 * `import` at the top of this file resolves to a registry lookup that runs
 * before the chunk exists — `extend(undefined.prototype, …)` then takes the
 * whole forum bundle down, not just this extension.
 */
app.initializers.add('ernestdefoe-tributary', () => {
  /*
   * 🚨 Registered first, because it overrides the STORE and everything below
   * reads from it. A reply arriving — posted here or pushed in by
   * flarum/realtime — has to update the count on the post it answers, or the
   * "3 replies" toggle does not appear until the page is reloaded.
   */
  watchForReplies();

  Post.prototype.tributaryParentId = Model.attribute('tributaryParentId');
  Post.prototype.tributaryReplyCount = Model.attribute('tributaryReplyCount');

  /*
   * The reply action on a post. Core's own Reply quotes into the composer;
   * this records which post is being answered.
   *
   * 🚨 Added to the post's controls rather than replacing core's Reply. People
   * who quote are not doing it wrong, and an extension that takes over the
   * button everybody already knows is an extension that gets uninstalled.
   */
  extend('flarum/forum/components/CommentPost', 'actionItems', function (items) {
    const post = this.attrs.post;

    if (!post || post.isHidden() || !app.session.user) return;

    const discussion = post.discussion();

    if (!discussion || !discussion.canReply()) return;

    items.add(
      'tributaryReply',
      Button.component(
        {
          className: 'Button Button--link Tributary-replyButton',
          icon: 'fas fa-code-branch',
          onclick: () => reply(post),
        },
        app.translator.trans('ernestdefoe-tributary.forum.reply_to')
      ),
      5
    );
  });

  /*
   * "In reply to …" above a post, and the branch toggle below it.
   */
  extend('flarum/forum/components/CommentPost', 'content', function (items) {
    const post = this.attrs.post;

    if (!post || !Array.isArray(items)) return;

    /*
     * 🚨 `content()`, not `view()`. Extending view() means reaching into the
     * returned vnode's children array and shoving things into it, which works
     * until core changes the wrapper element or another extension gets there
     * first. content() is a plain array the component already intends to
     * render.
     */
    if (post.tributaryParentId()) {
      items.unshift(<ReplyingTo post={post} />);
    }

    if (post.tributaryReplyCount() > 0) {
      items.push(<BranchPanel post={post} />);
    }
  });

  /*
   * 🚨 The parent has to reach the SERVER, and the composer is the only place
   * that knows it. Overriding `data()` is the one seam that survives every
   * other extension adding its own attributes, because it adds to whatever the
   * previous implementation returned rather than replacing it.
   */
  override('flarum/forum/components/ReplyComposer', 'data', function (original) {
    const data = original();
    const parent = getParent();

    if (parent && parent.discussionId === this.attrs.discussion?.id()) {
      data.tributaryParentId = parseInt(parent.postId, 10);
    }

    return data;
  });

  /*
   * 🚨 The composer has to SAY what it is answering.
   *
   * Without this the only difference between "reply to the discussion" and
   * "reply to Jane" is which button was clicked thirty seconds ago, and the
   * reader has no way to check and no way to change their mind. A threading
   * extension whose threading is invisible at the moment of writing is one
   * that produces wrongly-attached replies and gets blamed for it.
   */
  extend('flarum/forum/components/ReplyComposer', 'headerItems', function (items) {
    const parent = getParent();

    if (!parent || parent.discussionId !== this.attrs.discussion?.id()) return;

    items.add(
      'tributaryAnswering',
      <div className="Tributary-answering">
        <i className="fas fa-code-branch Tributary-branchIcon" aria-hidden="true" />
        {app.translator.trans('ernestdefoe-tributary.forum.answering', {
          username: parent.displayName,
        })}
        <button
          className="Tributary-answering-cancel"
          type="button"
          title={extractText(app.translator.trans('ernestdefoe-tributary.forum.answering_cancel'))}
          onclick={() => {
            clearParent();
            m.redraw();
          }}
        >
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>,
      -10
    );
  });

  // A composer that has been sent, or thrown away, must not leave the next
  // reply silently attached to an old post.
  extend('flarum/forum/components/ReplyComposer', 'onsubmit', () => clearParent());
  extend('flarum/common/components/Composer', 'hide', () => clearParent());

  // Leaving a discussion drops every branch it had open, so reading a long
  // evening of threads does not accumulate all of them in memory.
  extend('flarum/forum/components/DiscussionPage', 'onremove', () => forgetBranches());
});

/**
 * Open the composer as an answer to one post.
 *
 * 🚨 Through core's own `replyAction`, never by constructing a ReplyComposer.
 * That one call already handles the log-in prompt for a guest, the "you cannot
 * reply" case, an existing draft in the composer, and the composer being
 * minimised — all of which an extension that news up its own composer has to
 * reimplement and will get wrong.
 */
function reply(post) {
  const discussion = post.discussion();

  setParent(discussion.id(), post.id(), post.user()?.displayName());

  return DiscussionControls.replyAction
    .call(discussion, true)
    .catch(() => clearParent());
}
