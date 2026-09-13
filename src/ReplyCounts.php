<?php

namespace ErnestDefoe\Tributary;

use Flarum\Post\Post;
use Flarum\User\User;

/**
 * How many replies each post in a discussion has, as THIS person sees them.
 *
 * 🚨 Counted per request, not stored in a column.
 *
 * A denormalised counter would be one number for everybody, and the number is
 * not the same for everybody: a reply hidden by a moderator, or sitting in a
 * discussion somebody cannot open, must not be counted for them. A stored
 * counter would offer "3 replies", open to two, and look broken — and worse,
 * would quietly announce that a third exists.
 *
 * 🚨 And it is ONE query per discussion per request, not one per post. The
 * obvious implementation asks the database for each post on the page, which is
 * fifty queries to draw a page of a busy thread; a grouped count over an
 * indexed column is a single cheap query whatever the page size.
 */
class ReplyCounts
{
    /** @var array<int, array<int, int>> discussion id => [post id => replies] */
    private array $byDiscussion = [];

    public function for(Post $post, User $actor): int
    {
        $discussionId = (int) $post->discussion_id;

        if (! isset($this->byDiscussion[$discussionId])) {
            $this->byDiscussion[$discussionId] = $this->load($discussionId, $actor);
        }

        return (int) ($this->byDiscussion[$discussionId][(int) $post->id] ?? 0);
    }

    /**
     * @return array<int, int>
     */
    private function load(int $discussionId, User $actor): array
    {
        /*
         * 🚨 Column names only in the raw fragment — no table name goes near
         * it. Raw SQL passes through verbatim, so a table named here would
         * ignore the forum's table prefix and break on exactly the customer
         * installs nobody tests on.
         */
        return Post::query()
            ->whereVisibleTo($actor)
            ->where('discussion_id', $discussionId)
            ->whereNotNull('tributary_parent_id')
            ->groupBy('tributary_parent_id')
            ->selectRaw('tributary_parent_id as parent, COUNT(*) as total')
            ->pluck('total', 'parent')
            ->map(fn ($total) => (int) $total)
            ->all();
    }
}
