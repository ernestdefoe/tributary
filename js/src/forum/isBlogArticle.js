import app from 'flarum/forum/app';

/**
 * Is this discussion a FriendsOfFlarum blog article?
 *
 * 🚨 Why Tributary cares: the article is not a message in a conversation.
 *
 * On a blog article the first post IS the article, and every comment under it
 * is already an answer to it — so "Reply in thread" there offers to record a
 * parent link that says nothing, and puts a threading control on a piece of
 * writing rather than on a remark. Reported by ClaudiusH, who noted it works
 * correctly on the comments themselves.
 *
 * 🚨 The test is fof/blog's own, deliberately.
 *
 * A blog article is a discussion carrying one of the configured blog tags, or
 * a child of one — that is how `js/src/forum/utils/discussionRouting.ts`
 * decides where a discussion's URL points, and a different answer here would
 * mean this extension disagreeing with the blog about what a blog post is.
 *
 * Two details copied along with it:
 *
 *   - `tags()` returns FALSE, not an empty array, when the relationship has
 *     not been loaded (fof/blog's issue #170), so it cannot be mapped over
 *     without the guard.
 *   - a tag's PARENT counts. A forum with a "Blog" parent tag and children
 *     for each topic tags its articles with the child only.
 *
 * With fof/blog absent, `blogTags` is undefined and this is false, which is
 * the answer that leaves every other forum exactly as it was.
 */
export default function isBlogArticle(discussion) {
  if (!discussion) return false;

  /*
   * The relationship fof/blog hangs off an article. Checked first because it
   * is definitive and needs no settings: if the article has meta, it is an
   * article. `typeof` rather than a truthiness check because the method only
   * exists when fof/blog has registered it.
   */
  if (typeof discussion.blogMeta === 'function' && discussion.blogMeta()) {
    return true;
  }

  const blogTags = app.forum.attribute('blogTags');

  if (!Array.isArray(blogTags) || !blogTags.length) return false;

  const tags = (discussion.tags() || []).filter(Boolean);

  return tags.some((tag) => {
    const parent = tag.parent && tag.parent();

    return blogTags.indexOf(tag.id()) >= 0 || (parent && blogTags.indexOf(parent.id()) >= 0);
  });
}
