# Changelog

Tributary — branching replies for Flarum 2, giving a reply a memory of what it
was answering without rebuilding the post stream as a tree.

Every entry links to its full release notes, which carry the reasoning and, for
the bugs, what actually went wrong.

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

[v1.0.2]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.2
[v1.0.1]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.1
[v1.0.0]: https://github.com/ernestdefoe/tributary/releases/tag/v1.0.0
