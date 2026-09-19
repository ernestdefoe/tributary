# Changelog

Tributary — branching replies for Flarum 2, giving a reply a memory of what it
was answering without rebuilding the post stream as a tree.

Every entry links to its full release notes, which carry the reasoning and, for
the bugs, what actually went wrong.

## [v1.0.6] — 2026-09-19

Four pieces of review from **@ClaudiusH**, all of them right.

### Fixed

- **"Reply in thread" was offered on a blog article itself.** On a
  FriendsOfFlarum blog post the first post IS the article, and every comment
  under it already answers it — so threading a reply to it recorded a parent
  that told nobody anything, and put a threading control on a piece of writing
  rather than on a remark. It is now offered on the comments only.

  The test is fof/blog's own: a discussion carrying one of the configured blog
  tags, or a child of one, which is how that extension decides where a
  discussion's URL points. Two details came with it — `tags()` returns `false`
  rather than an empty array when the relationship is not loaded, and a tag's
  PARENT counts, for forums with a "Blog" parent and a child per topic. With
  fof/blog absent the check is false and nothing changes.

- **The extension's own icon now matches the one in the forum.** v1.0.1
  flipped the branch glyph vertically, because Font Awesome draws
  `code-branch` as a merge and a threading extension means the opposite; the
  icon in the admin extension list kept pointing the old way.

### Changed

- **The branch is a real list.** `<ul>` and `<li>` rather than nested `<div>`
  elements, so a screen reader announces how many replies there are before
  reading them. The "show more" button moved out of the list, since a `<ul>`
  may only contain list items.

- **Each reply says how deep it is, out loud.** The indent draws the shape of
  a branch for anybody who can see it and nothing for anybody who cannot, so
  every row now carries a visually hidden line naming its level and who it
  answers.

  Not `aria-level`: that is defined for `heading`, `row`, `comment` and
  `associationlistitemkey`, and NOT for `listitem`, so on an `<li>` it is
  invalid ARIA that most screen readers ignore. Text needs no support at all,
  and can carry the fact that helps more than a number — the name of the
  person being answered.

- **The indent is driven by `data-depth`, not an inline style.** Six rules,
  generated from the same cap the server clamps to, so there is nothing to
  keep in step by hand.

  Not `attr(data-depth)`, which was the tidier suggestion: reading an
  attribute into anything but `content` is CSS Values 5, and Safari has it
  only in Technology Preview — the indent would simply not happen on an
  iPhone.

## [v1.0.5] — 2026-09-17

**The "in reply to" line showed a spinner that never resolved.** Reported by
**@ClaudiusH**.

### Fixed

- The parent post was looked up in the store from `oncreate`, which runs after
  the first render, and that path returned without asking for a redraw — so
  the component kept drawing its loading state until something unrelated
  redrew the page. On a quiet discussion nothing ever did.

  The lookup happens in `oninit` now, before the first draw, so a parent
  already on the page renders immediately and never shows a spinner at all.
  Only a real fetch reaches the loading state, and that path always redrew
  correctly.

## [v1.0.4] — 2026-09-16

**A nested reply only updated the post it answered.** Reported by **@ClaudiusH**.

### Fixed

- A Tributary count is the whole **branch** beneath a post, not its direct
  answers — so a reply three levels down belongs in three different counts.
  v1.0.3 bumped only the immediate parent, so the pill on the post you answered
  moved and every pill above it stayed stale until a reload.

  The walk now climbs the whole ancestor chain, stopping at the edge of what is
  loaded: a post that is not on screen has no stale number to correct and will
  arrive with the right one when the reader scrolls to it. The climb is also
  cycle-guarded — those ids come from the browser's store rather than from the
  server's own checks, and a loop would freeze the tab inside a redraw rather
  than merely printing a wrong number.

## [v1.0.3] — 2026-09-16

**Every reply was counted twice.** Reported by **@ClaudiusH**, and introduced by
the fix in v1.0.2 — if you are on v1.0.2, update.

### Fixed

- A thread with three replies read **"5 replies"**, adding one more took it to
  **"7"**, and a brand-new thread said "1 replies" until you reloaded and it
  became "2". The v1.0.2 fix hooked `Store.pushObject`, which is one level below
  the point where "the server is handing me one new post" is still
  distinguishable from "the server is handing me a page of history" — so it
  incremented on both, on top of a count the server had already included them
  in.

  It now hooks `Store.pushPayload`, where a single resource (a reply being
  created, or one pushed in live) is still distinct from an array (a page of the
  stream, a branch being opened). An array means the server is describing what
  already exists, and what already exists is already in the count that arrived
  with it.

  The live update from v1.0.2 is kept: reply to a post and the toggle still
  appears straight away, and still does when somebody else replies.

### Internal

- The counting decision is now a pure function with tests, including ClaudiusH's
  exact sequence as arithmetic, and CI runs them. A wrong count renders
  perfectly — the panel opens and the replies in it are right — so looking at
  the page never catches it.

## [v1.0.2] — 2026-09-15

**The reply count updates as you watch.** Two fixes, both reported by
**@ClaudiusH** on the [discussion topic](https://discuss.flarum.org/d/39856).

### Fixed

- **The reply count appeared only after a reload.** Reply to a post in a thread
  and the "3 replies" toggle now appears on the post you answered, straight
  away. The count is computed by the server, so the parent post already sitting
  in the browser still held the number it had at page load and nothing had
  reason to ask again. Fixed where replies *arrive* rather than in the composer,
  which means it also works when **somebody else** replies and the post is pushed
  into your page live — on a threading extension that is the case that matters
  most, since watching a conversation branch in front of you is most of the
  appeal.
- **The branch toggle was misaligned.** The caret beside "3 replies" stretched to
  the full height of the button instead of sitting centred beside its label. One
  missing line of CSS, and it read as a broken control.

## [v1.0.1] — 2026-09-14

**The composer pill, and an icon pointing the wrong way.** Both from
**ClaudiusH**'s feedback on the announcement thread.

### Fixed

- **The "Answering *somebody*" pill overlapped the discussion title.** Not merely
  flush against it — it covered the title's last letter. Flarum's composer header
  pulls each of its items four pixels left to swallow the whitespace between
  them, so anything an extension adds there starts underneath its neighbour.
  There was a second fault in the same box: the pill's own bottom margin hangs
  below the text baseline on an inline-block, lifting it about 7px above the
  title's line. The pill now has a real gap and sits centred on the title, and on
  a phone it keeps to its own full-width row.
- **The branch icon pointed the wrong way.** Read top to bottom, Font Awesome's
  `code-branch` is a *merge* — the side arm comes back into the trunk. Tributary
  means the opposite, so it is flipped, on the "Reply in thread" button as well
  as in the composer.
- README screenshots re-shot to match, and the shots no longer depend on the
  machine that takes them.
- A bare `#4` in generated text was parsed into a link to discussion 4.

## [v1.0.0] — 2026-09-13

First release.

### What it does

- **"In reply to Jane"** above any threaded post, with a few words of what it
  answered, linking up to it. The cheapest part of the extension and the most
  valuable — knowing which of the forty posts above this one it answers is most
  of what threading is actually for.
- **"6 replies"** under a post, opening the whole branch **in place** — indented,
  in reading order, however deep it goes. The count is the whole branch, not just
  the direct answers, and it is counted as *you* see it: a reply hidden by a
  moderator is not counted for somebody who cannot see it.
- **"Reply in thread"** on every post, recording the parent. It sits alongside
  Flarum's own Reply rather than replacing it, and is labelled differently on
  purpose.

### For posts that came before

`php flarum tributary:backfill --dry-run` reads flarum/mentions' reply data,
refuses any link that crosses a discussion or points forward in time, and never
overwrites a parent that is already set.

Expect a low hit rate. Measured on two real forums before this was built: one had
that data for 35 of 585 comments, the other for 0 of 452. That measurement is why
the extension writes its own link from install forward and treats the mention
table as a hint rather than a foundation.

### What it costs

One nullable, indexed column on `posts`, null for the overwhelming majority of
rows. Reply counts are one grouped query per discussion per page — not one per
post, and not a stored counter. A branch loads breadth-first, one query per
level, capped at six levels of indent and fifty replies per request; the cap is
on the drawing, not on the data.

### Safety

A reply can only answer a post in the same discussion, and only one its author
can actually see — both enforced on the server whatever the browser sends.
Deleting a post does **not** delete the replies to it: the answers usually
outlive the question.

[v1.0.6]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.6
[v1.0.5]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.5
[v1.0.4]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.4
[v1.0.3]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.3
[v1.0.2]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.2
[v1.0.1]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.1
[v1.0.0]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.0
