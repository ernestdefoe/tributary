/**
 * What each branch has loaded, and whether it is open.
 *
 * 🚨 Module-level and keyed by post id, NOT fields on the component.
 *
 * `CommentPost.content()` is called on every redraw and returns a fresh vnode,
 * and the post stream rebuilds its children as the reader scrolls. A component
 * that keeps `open` and `rows` on `this` therefore loses both the moment
 * anything else on the page redraws — which, on a live forum, is constantly.
 * The symptom is a toggle that visibly receives the click and does nothing:
 * `open` is set to true, the redraw the click triggers throws the instance
 * away, and the new one starts closed again.
 *
 * Keyed by post id rather than by component so a branch that was open stays
 * open when the reader scrolls away and back.
 */
const branches = new Map();

export function branchFor(postId) {
  const key = String(postId);

  if (!branches.has(key)) {
    branches.set(key, { open: false, loading: false, rows: null, hasMore: false, page: 0 });
  }

  return branches.get(key);
}

/**
 * 🚨 Cleared when the reader leaves the discussion. Without this, reading a
 * hundred long threads in one sitting keeps every branch of every one of them
 * in memory for the life of the tab.
 */
export function forgetBranches() {
  branches.clear();
}
