<?php

namespace ErnestDefoe\Tributary;

use Flarum\Api\Context;
use Flarum\Api\Resource\PostResource;
use Flarum\Api\Schema;
use Flarum\Extend;
use Flarum\Post\Post;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->css(__DIR__.'/less/forum.less'),

    new Extend\Locales(__DIR__.'/locale'),

    (new Extend\Model(Post::class))
        ->belongsTo('tributaryParent', Post::class, 'tributary_parent_id'),

    (new Extend\ApiResource(PostResource::class))
        ->fields(fn () => [
            /*
             * 🚨 `writableOnCreate()`, and the SAVER is the single writer.
             *
             * Two separate traps meet here.
             *
             * Flarum 2 rejects any request whose body carries a field that is
             * DECLARED but not writable — "Field [x] is not writable", 403, on
             * every reply anybody posts. So declaring it read-only just to get
             * it serialised would break posting outright.
             *
             * And `->save()` rather than `->set()` because a saver both
             * suppresses the default property assignment (so an unvalidated
             * id can never reach the column) AND runs after the post exists —
             * which is the only moment `discussion_id` is reliably populated,
             * and the same-discussion check is the one that keeps a reply from
             * pointing at a post in a conversation the writer cannot see.
             *
             * There is no `creating()` on this extender; that method does not
             * exist.
             */
            Schema\Integer::make('tributaryParentId')
                ->property('tributary_parent_id')
                ->nullable()
                ->writableOnCreate()
                ->save(function (Post $post, mixed $value, Context $context) {
                    $parentId = resolve(Parentage::class)->resolve($value, $post, $context->getActor());

                    if ($parentId === null) {
                        return;
                    }

                    $post->tributary_parent_id = $parentId;
                    $post->save();
                }),

            /*
             * How many replies this post has, so the stream can offer to open
             * a branch without asking per post.
             *
             * 🚨 Read-only and never sent by the client, so it is safe to
             * declare — the trap above only bites fields the browser echoes
             * back, and nothing in the composer sends a reply count.
             */
            Schema\Integer::make('tributaryReplyCount')
                ->get(fn (Post $post, Context $context) => resolve(ReplyCounts::class)
                    ->for($post, $context->getActor())),
        ]),

    (new Extend\Routes('api'))
        ->get('/tributary/posts/{id}/branch', 'tributary.branch', Api\Controller\BranchController::class),

    (new Extend\Console())
        ->command(Console\BackfillCommand::class),
];
