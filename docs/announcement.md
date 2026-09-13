<!--
  The discuss.flarum.org announcement for Tributary.

  🚨 Title (the disclosure goes in the TITLE, not the body):
      Tributary - Branching replies for Flarum 2 (Built using AI)

  🚨 Tags: Extension (primary), 2.x (secondary).

  🚨 This is the OPENING post only. A new version is announced as a REPLY to
  this thread — never an edit of it — because an edit is invisible to everyone
  following along, and the bump is the entire point of announcing.
-->

A long discussion is one flat column. Somebody answers the fourth post, thirty posts later somebody answers *that*, and by the time you arrive there are four conversations interleaved and no way to tell which is which.

**Tributary gives a reply a memory of what it was answering.**

![A discussion with reply chips and branch toggles](https://raw.githubusercontent.com/ernestdefoe/tributary/main/screenshots/thread.png)

## Three things, and deliberately no more

**"In reply to Jane"** above any threaded post, with a few words of what it answered, linking up to it. This is the cheapest part of the extension and the most valuable — even if nobody ever opens a branch, knowing which of the forty posts above this one it is answering is most of what threading is actually for.

**"6 replies"** under a post, opening the whole branch in place — indented, in reading order, however deep it goes.

![The branch opened under the first post](https://raw.githubusercontent.com/ernestdefoe/tributary/main/screenshots/branch-open.png)

The count is the whole branch, not just the direct answers, because the number labels a control that opens the whole branch. And it is counted as *you* see it: a reply hidden by a moderator is not counted for somebody who cannot see it.

**"Reply in thread"** on every post, recording the parent. It sits alongside Flarum's own Reply rather than replacing it — people who quote are not doing it wrong — and it is labelled differently on purpose, because two buttons a centimetre apart with the same word on them is a coin toss.

## What it deliberately does not do

**It does not rebuild the post stream as a tree.** Flarum's stream is paginated, virtualised, and permalinked by post number; a tree fights all three, and it breaks worst on exactly the long discussions that need threading most — the ones where the tree would have to load a thousand posts to know where the tenth one goes.

So the stream stays as it is, in the order things were said, and a post that has answers can open them underneath itself. Nothing about a flat discussion changes, and nothing about it gets slower.

## Posts that came before

```
php flarum tributary:backfill --dry-run
```

It reads flarum/mentions' reply data, refuses any link that crosses a discussion or points forward in time, and never overwrites a parent that is already set.

**Expect a low hit rate.** Measured on two real forums before this was built: one had that data for 35 of 585 comments (6%), the other for 0 of 452. A WYSIWYG editor drops the `#p123` binding when it converts a quote, and imported posts never had one. That measurement is the reason the extension writes its own link from install forward and treats the mention table as a hint rather than a foundation — threading built on that data would look fine on the developer's forum and do nothing on yours.

## What it costs to run

One nullable, indexed column on `posts`, null for the overwhelming majority of rows. Reply counts are one grouped query per discussion per page — not one per post, and not a stored counter, because a counter would be the same number for everybody and that is wrong the moment a reply is hidden from someone. A branch loads breadth-first, one query per level, capped at six levels of indent and fifty replies per request; the cap is on the drawing, not on the data.

A reply can only answer a post in the same discussion, and only one its author can actually see — both enforced on the server whatever the browser sends. And **deleting a post does not delete the replies to it**: the answers usually outlive the question.

## Install

```
composer require ernestdefoe/tributary
php flarum migrate && php flarum cache:clear
```

Nothing to configure. There are no settings, because there is nothing here an admin should have to decide.

Flarum **2.0+**, PHP **8.3+**. No dependency on any other extension.

---

## Links

- **GitHub:** <https://github.com/ernestdefoe/tributary>
- **Packagist:** <https://packagist.org/packages/ernestdefoe/tributary>
- **Bug reports:** <https://github.com/ernestdefoe/tributary/issues>
- **Support forum:** <https://ernestdefoe.online/d/99>
- **Licence:** [MIT](https://github.com/ernestdefoe/tributary/blob/main/LICENSE)
