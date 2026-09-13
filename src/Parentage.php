<?php

namespace ErnestDefoe\Tributary;

use Flarum\Foundation\ValidationException;
use Flarum\Post\Post;
use Flarum\User\User;

/**
 * Deciding whether one post may be recorded as the answer to another.
 *
 * All of it lives here rather than in the resource hook, because the same
 * rules have to hold for the backfill command, which has no request and no
 * actor in the ordinary sense.
 */
class Parentage
{
    /**
     * How deep a branch may go before replies stop indenting further.
     *
     * 🚨 A limit on the DRAWING, not on the data. Nothing is refused for being
     * deep — refusing a reply because a conversation got interesting is absurd
     * — but past this the indentation stops, because on a phone the eighth
     * level is a column two words wide. Reddit settles at a similar number for
     * the same reason.
     */
    public const MAX_DEPTH = 6;

    /**
     * Validate a proposed parent and return its id, or null for "no parent".
     *
     * @throws ValidationException
     */
    public function resolve(mixed $parentId, Post $reply, User $actor): ?int
    {
        if ($parentId === null || $parentId === '' || $parentId === 0 || $parentId === '0') {
            return null;
        }

        if (! is_numeric($parentId)) {
            throw new ValidationException(['tributaryParentId' => 'That is not a post.']);
        }

        $parent = Post::query()->find((int) $parentId);

        if (! $parent) {
            throw new ValidationException(['tributaryParentId' => 'That post is not here any more.']);
        }

        /*
         * 🚨 Same discussion, always. Without this check a reply can be
         * attached to a post in a discussion the actor cannot even see, and
         * the branch view would then happily render a post from somewhere
         * else inside this one — a visibility hole dressed up as a feature.
         */
        if ((int) $parent->discussion_id !== (int) $reply->discussion_id) {
            throw new ValidationException(['tributaryParentId' => 'A reply can only answer a post in the same discussion.']);
        }

        /*
         * 🚨 And the actor has to be able to SEE it. A post hidden by a
         * moderator, or in a discussion gated by tags, must not become a
         * parent — the reply would advertise its existence for ever.
         */
        if (! $parent->isVisibleTo($actor)) {
            throw new ValidationException(['tributaryParentId' => 'That post is not available.']);
        }

        return (int) $parent->id;
    }

    /**
     * How far down a branch a post sits, counted by walking up.
     *
     * 🚨 Capped by MAX_DEPTH + 1 iterations rather than trusting the data to
     * be a tree. The column is nullable and self-referencing; one bad backfill
     * or a hand-edited row makes a cycle, and an uncapped walk turns that into
     * a hung request rather than a wrong number.
     *
     * @param array<int, int|null> $parents post id => parent id, already loaded
     */
    public function depth(int $postId, array $parents): int
    {
        $depth = 0;
        $seen = [];

        while ($depth <= self::MAX_DEPTH) {
            $parent = $parents[$postId] ?? null;

            if ($parent === null || isset($seen[$parent])) {
                break;
            }

            $seen[$parent] = true;
            $postId = $parent;
            $depth++;
        }

        return $depth;
    }
}
