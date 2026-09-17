import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

/**
 * "In reply to <somebody>" above a post, linking up to the post it answered.
 *
 * 🚨 The single most valuable thing this extension draws, and the cheapest.
 * Even with no branch ever opened, knowing which of the forty posts above this
 * one it is answering is most of what threading is for.
 */
export default class ReplyingTo extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    this.failed = false;

    /*
     * 🚨 Looked up in the STORE first, and in `oninit`, not `oncreate`.
     *
     * The store is usually enough: the parent is nearly always another post on
     * the same page, already loaded by the post stream. Fetching
     * unconditionally would put one request per threaded post on every page
     * load — the surest way to make a forum feel slower the moment this is
     * installed.
     *
     * 🚨 And it has to happen BEFORE the first render. This ran in `oncreate`,
     * which Mithril calls after the view has already been drawn, and the
     * store-hit path set `this.parent` and returned WITHOUT a redraw — so the
     * component kept drawing its loading state until something unrelated
     * happened to redraw the page. On a quiet discussion nothing ever did, and
     * the spinner simply stayed there for ever. Reading the store in `oninit`
     * means the common case renders correctly the first time and never shows a
     * spinner at all.
     */
    const id = String(this.attrs.post.tributaryParentId());

    this.parent = app.store.getById('posts', id) || null;
  }

  oncreate(vnode) {
    super.oncreate(vnode);

    // Already had it from the store; nothing to fetch and nothing to redraw.
    if (this.parent) return;

    const id = String(this.attrs.post.tributaryParentId());

    app.store
      .find('posts', id)
      .then((post) => {
        this.parent = post;
        m.redraw();
      })
      .catch(() => {
        // A parent that has since been deleted or hidden is a normal state,
        // not an error worth showing anybody.
        this.failed = true;
        m.redraw();
      });
  }

  view() {
    if (this.failed) return null;

    const parent = this.parent;

    if (!parent) {
      return (
        <div className="Tributary-replyingTo Tributary-replyingTo--loading">
          <LoadingIndicator display="inline" size="small" />
        </div>
      );
    }

    const user = parent.user();

    return (
      <a
        className="Tributary-replyingTo"
        href={app.route.post(parent)}
        onclick={(e) => {
          // Let a modified click open a new tab, as any link should.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

          e.preventDefault();
          m.route.set(app.route.post(parent));
        }}
      >
        <i className="fas fa-reply Tributary-replyingTo-icon" aria-hidden="true" />
        {app.translator.trans('ernestdefoe-tributary.forum.in_reply_to', {
          // 🚨 Never a placeholder named `user`: Flarum's translator singles
          // that name out and calls displayName() on whatever it is given.
          username: user ? user.displayName() : app.translator.trans('core.lib.username.deleted_text'),
        })}
        <span className="Tributary-replyingTo-excerpt">{excerpt(parent)}</span>
      </a>
    );
  }
}

/**
 * A few words of the post being answered.
 *
 * 🚨 Taken from the RENDERED html and stripped, not from the raw content —
 * which is Markdown or BBCode depending on the forum, and would show people
 * their own asterisks and bbcode tags in the chip.
 */
function excerpt(post) {
  const html = post.contentHtml() || '';
  const el = document.createElement('div');

  el.innerHTML = html;

  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();

  return text.length > 90 ? text.slice(0, 88) + '…' : text;
}
