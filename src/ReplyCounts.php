<?php

namespace ErnestDefoe\Tributary;

use Flarum\Post\Post;
use Flarum\User\User;

/**
 * How many replies sit under each post in a discussion, as THIS person sees
 * them.
 *
 * 🚨 The WHOLE branch, not just the direct answers.
 *
 * The number labels a control that opens the whole branch, so counting only
 * direct children means "1 reply" expands to show two — and a number that
 * disagrees with what it opens is worse than no number, because the reader
 * stops trusting the rest of the page too.
 *
 * 🚨 Counted per request, never stored in a column. A denormalised counter
 * would be one number for everybody, and the number is not the same for
 * everybody: a reply hidden by a moderator, or in a discussion somebody cannot
 * open, must not be counted for them.
 *
 * 🚨 And it is ONE query per discussion per request. The obvious
 * implementation asks the database per post, which is fifty queries to draw a
 * page of a busy thread; and counting descendants in SQL would want a
 * recursive CTE, which rules out every MariaDB before 10.2 for no gain. One
 * flat fetch of (id, parent) and a walk in PHP is cheaper and portable.
 */
class ReplyCounts
{
    /** @var array<int, array<int, int>> discussion id => [post id => replies beneath it] */
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
        $parents = Post::query()
            ->whereVisibleTo($actor)
            ->where('discussion_id', $discussionId)
            ->whereNotNull('tributary_parent_id')
            ->pluck('tributary_parent_id', 'id');

        /** @var array<int, list<int>> $children */
        $children = [];

        foreach ($parents as $id => $parent) {
            $children[(int) $parent][] = (int) $id;
        }

        $counts = [];
        $memo = [];

        foreach (array_keys($children) as $parent) {
            $counts[$parent] = $this->beneath($parent, $children, $memo);
        }

        return $counts;
    }

    /**
     * Everything below one post, however deep.
     *
     * 🚨 Memoised, and guarded against a cycle. The column is nullable and
     * points at the same table, so one bad backfill or a hand-edited row makes
     * a loop — and an unguarded walk turns that into a hung request rather
     * than a wrong number. Depth is not capped here on purpose: the cap in
     * Parentage governs how far replies INDENT, not how many exist.
     *
     * @param array<int, list<int>> $children
     * @param array<int, int>       $memo
     * @param array<int, true>      $seen
     */
    private function beneath(int $post, array $children, array &$memo, array $seen = []): int
    {
        if (isset($memo[$post])) {
            return $memo[$post];
        }

        if (isset($seen[$post])) {
            return 0;
        }

        $seen[$post] = true;
        $total = 0;

        foreach ($children[$post] ?? [] as $child) {
            $total += 1 + $this->beneath($child, $children, $memo, $seen);
        }

        return $memo[$post] = $total;
    }
}
