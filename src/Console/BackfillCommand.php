<?php

namespace ErnestDefoe\Tributary\Console;

use Flarum\Console\AbstractCommand;
use Flarum\Post\Post;
use Illuminate\Database\ConnectionInterface;
use Symfony\Component\Console\Input\InputOption;

/**
 * `php flarum tributary:backfill` — guess the parents of posts made before
 * this extension was installed, from Flarum's own reply-mention data.
 *
 * 🚨 This is a BACKFILL, and an optional one. The extension does not read
 * `post_mentions_post` at runtime and must never be built on it.
 *
 * Measured on two real forums before writing this: one had the mention row for
 * **35 of 585 comments (6%)**, the other for **0 of 452**. Both numbers are
 * explainable — a WYSIWYG editor drops the `#p123` binding when it converts a
 * quote, and imported posts never had one — and both are fatal to any design
 * that treats that table as the source of truth. A threading product writes
 * its own link from install forward; this is only a way to make the first day
 * look less empty.
 *
 * It is therefore conservative on purpose: it never overwrites a parent that
 * is already set, and it refuses any mention that crosses a discussion.
 */
class BackfillCommand extends AbstractCommand
{
    public function __construct(private ConnectionInterface $db)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->setName('tributary:backfill')
            ->setDescription('Guess reply parents for older posts from Flarum’s reply-mention data.')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Report what would change and write nothing')
            ->addOption('discussion', null, InputOption::VALUE_REQUIRED, 'Only this discussion id');
    }

    protected function fire(): int
    {
        $dry = (bool) $this->input->getOption('dry-run');
        $only = $this->input->getOption('discussion');

        if (! $this->db->getSchemaBuilder()->hasTable('post_mentions_post')) {
            $this->error('flarum/mentions is not installed, so there is nothing to read.');

            return 1;
        }

        $query = Post::query()
            ->whereNull('tributary_parent_id')
            ->where('type', 'comment')
            ->orderBy('id');

        if ($only) {
            $query->where('discussion_id', (int) $only);
        }

        $considered = 0;
        $matched = 0;
        $skipped = 0;

        /*
         * 🚨 A chunk at a time, three queries per chunk — never two per post.
         * A cursor with a lookup inside it was ~200k round-trips on a 100k-post
         * forum. By id, so rows this run fills in cannot shift the pages.
         */
        $query->select(['id', 'discussion_id'])->chunkById(500, function ($posts) use ($dry, &$considered, &$matched, &$skipped) {
            $considered += $posts->count();

            /*
             * The FIRST post each one replied to, by id. A post that quotes
             * three people has three rows here and no way to say which one it
             * was answering; the earliest is the least surprising guess, and
             * guessing at all is why this is opt-in.
             */
            $firstMention = $this->db->table('post_mentions_post')
                ->whereIn('post_id', $posts->modelKeys())
                ->groupBy('post_id')
                ->selectRaw('post_id, min(mentions_post_id) as parent_id')
                ->pluck('parent_id', 'post_id');

            if ($firstMention->isEmpty()) {
                return;
            }

            $parentDiscussion = Post::query()
                ->whereIn('id', $firstMention->unique()->values())
                ->pluck('discussion_id', 'id');

            /** @var array<int, list<int>> $link parent id => post ids to point at it */
            $link = [];

            foreach ($posts as $post) {
                $parentId = (int) ($firstMention[$post->id] ?? 0);

                if (! $parentId) {
                    continue;
                }

                // Same discussion only, and a post cannot answer something
                // written after it.
                if ((int) ($parentDiscussion[$parentId] ?? 0) !== (int) $post->discussion_id || $parentId >= (int) $post->id) {
                    $skipped++;

                    continue;
                }

                $link[$parentId][] = (int) $post->id;
                $matched++;

                if ($matched % 200 === 0) {
                    $this->info("  … $matched so far");
                }
            }

            if (! $dry) {
                foreach ($link as $parentId => $ids) {
                    Post::query()->whereIn('id', $ids)->whereNull('tributary_parent_id')
                        ->update(['tributary_parent_id' => $parentId]);
                }
            }
        });

        $this->info(sprintf(
            '%s %d of %d post(s); %d mention(s) refused as implausible.',
            $dry ? 'Would link' : 'Linked',
            $matched,
            $considered,
            $skipped
        ));

        if ($considered > 0 && $matched / max(1, $considered) < 0.1) {
            $this->info('');
            $this->info('That is a low hit rate, and a normal one — most forums simply do not');
            $this->info('have this data. Threading starts working properly from here forward.');
        }

        return 0;
    }
}
