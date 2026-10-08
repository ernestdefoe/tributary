<?php

namespace ErnestDefoe\Tributary;

use Flarum\Api\Context;
use Flarum\Api\Resource\DiscussionResource;
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
             * 🚨 `writableOnCreate()`, and a SETTER that validates.
             *
             * Two separate traps meet here.
             *
             * Flarum 2 rejects any request whose body carries a field that is
             * DECLARED but not writable — "Field [x] is not writable", 403, on
             * every reply anybody posts. So declaring it read-only just to get
             * it serialised would break posting outright.
             *
             * And `->set()` with the check inside it, because a setter runs
             * BEFORE the post is saved. It used to be a saver, which runs
             * after: a refused parent then answered 422 while the reply had
             * already been posted, so the writer saw an error, tried again,
             * and posted twice. The custom setter also replaces the default
             * property assignment, so an unvalidated id never reaches the
             * column. `discussion_id` is already set by then (core's
             * discussion relationship is set first), which the
             * same-discussion check needs.
             *
             * There is no `creating()` on this extender; that method does not
             * exist.
             */
            Schema\Integer::make('tributaryParentId')
                ->property('tributary_parent_id')
                ->nullable()
                ->writableOnCreate()
                ->set(function (Post $post, mixed $value, Context $context) {
                    $post->setAttribute(
                        'tributary_parent_id',
                        resolve(Parentage::class)->resolve($value, $post, $context->getActor())
                    );
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
                /*
                 * 🚨 Not on the discussion LIST. Its first, last and most
                 * relevant posts come from twenty different discussions, and
                 * the counts are loaded per discussion, so the list paid one
                 * reply-tree query per row for a number nothing there shows.
                 * The thread's own request carries the counts its stream uses.
                 */
                ->visible(fn (Post $post, Context $context) => ! $context->listing(DiscussionResource::class))
                ->get(fn (Post $post, Context $context) => resolve(ReplyCounts::class)
                    ->for($post, $context->getActor(), $context->request)),
        ]),

    (new Extend\Routes('api'))
        ->get('/tributary/posts/{id}/branch', 'tributary.branch', Api\Controller\BranchController::class),

    (new Extend\Console())
        ->command(Console\BackfillCommand::class),
];
