# Tributary

**Branching replies for Flarum 2.** A reply remembers the post it answered, so a long discussion stops being one flat column of people talking past each other.

---

## What it adds

**"In reply to Jane"** above a post, with a few words of what it answered, linking up to it. This is the cheapest part and the most valuable: even if nobody ever opens a branch, knowing which of the forty posts above this one it is answering is most of what threading is for.

**"3 replies"** under a post, opening the whole branch in place — indented, in reading order, with the count reflecting only what *you* are allowed to see.

**A Reply action on every post** that records the parent. It sits alongside Flarum's own quote-reply rather than replacing it; people who quote are not doing it wrong, and the composer says which post it is answering while you write.

## What it deliberately does not do

**It does not rebuild the post stream as a tree.** Flarum's stream is paginated, virtualised and permalinked by post number. A tree fights all three, and breaks worst on exactly the long discussions that need threading most. The stream stays as it is; a post with answers can open them underneath itself.

## Old posts

Threading works from the moment you install it. For what came before, there is an opt-in guess:

```bash
php flarum tributary:backfill --dry-run
```

It reads Flarum's own reply-mention data, refuses anything that crosses a discussion or points forward in time, and never overwrites a parent that is already set.

**Expect a low hit rate, and do not be alarmed by it.** Measured on two real forums before this was written: one had that data for **35 of 585 comments (6%)**, the other for **0 of 452**. A WYSIWYG editor drops the binding when it converts a quote, and imported posts never had one. That is why the extension writes its own link from install forward and treats the mention table as a hint, not a foundation.

## What it costs to run

One nullable column on `posts`, indexed. Reply counts are one grouped query per discussion per page — not one per post, and not a stored counter, because a counter would be the same number for everybody and a reply hidden by a moderator must not be counted for someone who cannot see it.

A branch is loaded breadth-first, one query per level, capped at six levels of indent and fifty replies per request.

## Permissions and safety

A reply can only answer a post **in the same discussion**, and only one the writer can actually see. Both are enforced on the server, on every post, regardless of what the browser sends.

Deleting a post does **not** delete the replies to it — the answers usually outlive the question, and a cascade there would let one moderator action remove a branch of a conversation.

## Install

```bash
composer require ernestdefoe/tributary
php flarum migrate && php flarum cache:clear
```

## Licence

MIT.
