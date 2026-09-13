# Tributary

**Branching replies for Flarum 2.**

A long discussion is one flat column. Somebody answers the fourth post, thirty posts later somebody answers *that*, and by the time you arrive there are four conversations interleaved and no way to tell which is which. Tributary gives a reply a memory of what it was answering.

![A discussion with reply chips and branch toggles](screenshots/thread.png)

---

## Three things, and deliberately no more

### "In reply to Jane"

Above any threaded post, with a few words of what it answered, linking up to it.

This is the cheapest part of the extension and the most valuable. Even if nobody ever opens a branch, knowing which of the forty posts above this one it is answering is most of what threading is actually for.

### "6 replies"

Under a post, opening the whole branch **in place** — indented, in reading order, however deep it goes.

![The branch opened under the first post](screenshots/branch-open.png)

The count is the whole branch, not just the direct answers, because the number labels a control that opens the whole branch. A "1 reply" that expands into two is a number that disagrees with what it opens, and a reader who catches that stops trusting the rest of the page.

It is also **counted as you see it**: a reply hidden by a moderator is not counted for somebody who cannot see it.

### "Reply in thread"

A reply action on every post that records the parent.

It sits **alongside** Flarum's own Reply rather than replacing it — people who quote are not doing it wrong — and it is labelled differently on purpose, because two buttons a centimetre apart with the same word on them is a coin toss. While you write, the composer says which post you are answering, with one click to change your mind.

---

## What it deliberately does not do

**It does not rebuild the post stream as a tree.**

Flarum's stream is paginated, virtualised, and permalinked by post number. A tree fights all three, and it breaks worst on exactly the long discussions that need threading most — the ones where the tree would have to load a thousand posts to know where the tenth one goes.

So the stream stays exactly as it is, in the order things were said, and a post that has answers can open them underneath itself. Nothing about a flat discussion changes, and nothing about it gets slower.

---

## Old posts

Threading works from the moment you install it. For everything that came before, there is an opt-in guess:

```bash
php flarum tributary:backfill --dry-run
```

It reads Flarum's own reply-mention data, refuses any link that crosses a discussion or points forward in time, and never overwrites a parent that is already set. Drop `--dry-run` to write.

**Expect a low hit rate, and do not be alarmed by it.** Measured on two real forums before this was built: one had that data for **35 of 585 comments (6%)**, the other for **0 of 452**. A WYSIWYG editor drops the `#p123` binding when it converts a quote, and imported posts never had one.

That measurement is the reason the extension writes its own link from install forward and treats the mention table as a hint rather than a foundation. A threading product built on that data would look fine on the developer's forum and do nothing on yours.

---

## What it costs to run

One nullable, indexed column on `posts`. The overwhelming majority of rows stay null, because replying to the discussion rather than to a person is the normal case and has to stay the cheap one.

**Reply counts are one grouped query per discussion per page** — not one per post, and not a stored counter. A counter would be the same number for everybody, which is wrong the moment a reply is hidden from someone.

**A branch loads breadth-first, one query per level**, capped at six levels of indent and fifty replies per request. The cap is on the drawing, not on the data: nothing is refused for being deep, but past six levels a reply on a phone would be a column two words wide.

---

## Permissions and safety

A reply can only answer a post **in the same discussion**, and only one the author can actually see. Both are enforced on the server for every post, whatever the browser sends — otherwise a reply could point at a post in a private discussion and quietly advertise that it exists.

**Deleting a post does not delete the replies to it.** The answers usually outlive the question, and a cascade there would let one moderation action remove a branch of a conversation.

---

## Install

```bash
composer require ernestdefoe/tributary
php flarum migrate && php flarum cache:clear
```

Nothing to configure. There are no settings, because there is nothing here an admin should have to decide.

---

## Compatibility

Flarum **2.0+**, PHP **8.3+**. No dependency on any other extension — `tributary:backfill` reads flarum/mentions' table if it is there and says so plainly if it is not.

## Licence

[MIT](LICENSE).
