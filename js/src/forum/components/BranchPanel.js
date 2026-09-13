import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import humanTime from 'flarum/common/helpers/humanTime';

import { branchFor } from '../branches';

/**
 * "3 replies" under a post, and the branch it opens.
 *
 *
 * 🚨 The branch is drawn INSIDE the post stream, in place, rather than as a
 * modal or a separate page. A reply belongs under the thing it answers; moving
 * it somewhere else to read it is how threading becomes a feature people try
 * once.
 */
export default class BranchPanel extends Component {
  /**
   * 🚨 Called `branch`, NOT `state`. Mithril owns `state` on a component
   * instance and assigns to it; a getter here with no setter turns that
   * assignment into "Cannot read properties of undefined" from inside the
   * renderer, which takes the whole post stream down and looks like a theme
   * bug because that is whose file is at the top of the trace.
   *
   * The state itself lives in the module, keyed by post id — see ../branches.js.
   * Held on `this`, it is thrown away by the next redraw and the toggle looks
   * dead: the click lands, `open` is set, and the instance that knew about it
   * no longer exists by the time anything is drawn.
   */
  get branch() {
    return branchFor(this.attrs.post.id());
  }

  view() {
    const post = this.attrs.post;
    const count = post.tributaryReplyCount();
    const state = this.branch;

    return (
      <div className="Tributary-branch">
        <button
          className={'Tributary-branchToggle' + (state.open ? ' is-open' : '')}
          type="button"
          aria-expanded={state.open ? 'true' : 'false'}
          onclick={() => this.toggle()}
        >
          <i className={`fas fa-caret-${state.open ? 'down' : 'right'}`} aria-hidden="true" />
          {app.translator.trans('ernestdefoe-tributary.forum.reply_count', { count })}
        </button>

        {state.open ? this.body() : null}
      </div>
    );
  }

  body() {
    const { rows, hasMore, loading } = this.branch;

    if (rows === null) {
      return (
        <div className="Tributary-branchLoading">
          <LoadingIndicator display="inline" size="small" />
        </div>
      );
    }

    if (!rows.length) {
      return <div className="Tributary-branchEmpty">{app.translator.trans('ernestdefoe-tributary.forum.branch_empty')}</div>;
    }

    return (
      <div className="Tributary-branchList">
        {rows.map((row) => (
          <div
            className="Tributary-reply"
            key={row.id}
            /*
              🚨 The indent is a CSS custom property rather than a nested DOM
              tree. Real nesting means one wrapper element per level, which on
              a deep branch is a tower of divs that every theme has to style
              and that pushes the text into a column two words wide on a
              phone. A flat list that indents by a number is one element per
              reply, and the cap lives in one place.
            */
            style={`--tributary-depth: ${row.depth}`}
          >
            <div className="Tributary-replyHead">
              {/*
                🚨 Hand-rolled, NOT core's avatar() and humanTime() helpers.
                Those take Flarum MODELS and call methods on them —
                `user.displayName()`, `date.getTime()`. These rows are plain
                objects from this extension's own endpoint, so the helpers
                throw "… is not a function" while the tree is being built. The
                branch then never renders and the spinner spins for ever, and
                the only console error names whichever bundle happens to be
                last in the stack — a theme, in our case. It looked exactly
                like a dead feature for an hour.
              */}
              {row.user?.avatarUrl ? (
                <img className="Tributary-replyAvatar" src={row.user.avatarUrl} alt="" />
              ) : (
                <span className="Tributary-replyAvatar Tributary-replyAvatar--blank">
                  {(row.user?.displayName || '?').charAt(0).toUpperCase()}
                </span>
              )}

              <a
                className="Tributary-replyAuthor"
                href={row.user ? app.route('user', { username: row.user.username }) : '#'}
              >
                {row.user ? row.user.displayName : app.translator.trans('core.lib.username.deleted_text')}
              </a>

              <a className="Tributary-replyTime" href={this.permalink(row)}>
                {humanTime(new Date(row.createdAt))}
              </a>
            </div>

            <div className="Tributary-replyBody Post-body" oncreate={(v) => this.paint(v, row)} />
          </div>
        ))}

        {hasMore ? (
          <Button className="Button Button--link Tributary-more" loading={loading} onclick={() => this.load(true)}>
            {app.translator.trans('ernestdefoe-tributary.forum.load_more')}
          </Button>
        ) : null}
      </div>
    );
  }

  /**
   * 🚨 The post HTML is written straight into the element rather than through
   * Mithril. It is server-rendered output from the forum's own formatter —
   * already sanitised, and containing markup Mithril would have to re-parse
   * into vnodes on every redraw for no benefit.
   */
  paint(vnode, row) {
    vnode.dom.innerHTML = row.contentHtml || '';
  }

  permalink(row) {
    const post = this.attrs.post;

    return app.route.discussion(post.discussion(), row.number);
  }

  /**
   * 🚨 Bumping `post.freshness` is what actually makes any of this appear.
   *
   * `AbstractPost` keeps a SubtreeRetainer and returns false from
   * `onbeforeupdate` unless the post's freshness, its author's freshness or
   * its own loading flag changed. Anything rendered inside a post is therefore
   * frozen from the post's point of view: the state updates, the request goes
   * out, the rows come back, `m.redraw()` runs — and the page does not move.
   * It looks precisely like a dead button and logs nothing.
   *
   * Freshness is the value core itself bumps when a post changes, so using it
   * is the supported way to say "this post needs drawing again". A nested
   * `m.mount` also seems like an answer and is not: Flarum's redraw does not
   * reach a root it did not create.
   */
  redraw() {
    const post = this.attrs.post;

    post.freshness = Date.now();

    m.redraw();
  }

  toggle() {
    const state = this.branch;

    state.open = !state.open;

    if (state.open && state.rows === null) {
      this.load();
    } else {
      this.redraw();
    }
  }

  load(more = false) {
    const state = this.branch;

    state.loading = true;

    if (more) state.page++;

    return app
      .request({
        method: 'GET',
        url: `${app.forum.attribute('apiUrl')}/tributary/posts/${this.attrs.post.id()}/branch`,
        params: { page: state.page },
      })
      .then((response) => {
        const rows = response.data || [];

        state.rows = more ? (state.rows || []).concat(rows) : rows;
        state.hasMore = !!response.hasMore;
      })
      .catch((e) => {
        console.error('[tributary] could not load the branch:', e);
        state.rows = state.rows || [];
      })
      .then(() => {
        state.loading = false;
        this.redraw();
      });
  }
}
