/**
 * Which post the composer is currently answering.
 *
 * 🚨 Module-level, not on a component. The composer is mounted once and
 * outlives every post on the page: a reply started from post #4 has to survive
 * the reader scrolling away, the post stream re-rendering, and the composer
 * being minimised and reopened. State attached to the post that was clicked
 * dies on the first redraw that removes it from the DOM.
 *
 * 🚨 It carries the DISCUSSION id as well as the post id, and the composer
 * checks both before sending. Without that, starting a reply in one discussion
 * and finishing it in another attaches the post to a parent in a conversation
 * it is not part of — which the server refuses, so the reader gets a failure
 * they cannot explain instead of an ordinary reply.
 */
let parent = null;

export function setParent(discussionId, postId, displayName) {
  parent = { discussionId, postId, displayName };
}

export function getParent() {
  return parent;
}

export function clearParent() {
  parent = null;
}
