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

        foreach ($query->cursor() as $post) {
            $considered++;

            /*
             * The FIRST post it replied to, by id. A post that quotes three
             * people has three rows here and no way to say which one it was
             * answering; the earliest is the least surprising guess, and
             * guessing at all is why this is opt-in.
             */
            $parentId = $this->db->table('post_mentions_post')
                ->where('post_id', $post->id)
                ->orderBy('mentions_post_id')
                ->value('mentions_post_id');

            if (! $parentId) {
                continue;
            }

            $parent = Post::query()->find($parentId);

            if (! $parent || (int) $parent->discussion_id !== (int) $post->discussion_id) {
                $skipped++;

                continue;
            }

            // A post cannot answer something written after it.
            if ((int) $parent->id >= (int) $post->id) {
                $skipped++;

                continue;
            }

            $matched++;

            if (! $dry) {
                $post->tributary_parent_id = (int) $parent->id;
                $post->save();
            }

            if ($matched % 200 === 0) {
                $this->info("  … $matched so far");
            }
        }

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
