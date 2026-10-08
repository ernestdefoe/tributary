<?php

namespace ErnestDefoe\Tributary\Api\Controller;

use ErnestDefoe\Tributary\Parentage;
use Flarum\Http\RequestUtil;
use Flarum\Post\CommentPost;
use Flarum\Post\Post;
use Flarum\User\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Everything said in answer to one post.
 *
 * 🚨 This is the whole reason the extension is worth having, and the reason it
 * does NOT try to rebuild Flarum's post stream as a tree. The stream is
 * paginated, virtualised and permalinked by post number; turning it into a
 * tree fights every one of those and breaks on the long discussions that need
 * threading most. Instead the stream stays exactly as it is, and a post with
 * answers can open them in place.
 */
class BranchController implements RequestHandlerInterface
{
    /**
     * 🚨 A ceiling on one request, not on a branch. A thread that ran to four
     * hundred replies is exactly the thread somebody wants to read, but it is
     * not something to serialise in one response — the rest is fetched as the
     * reader goes.
     */
    private const PER_PAGE = 50;

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $rootId = (int) ($request->getAttribute('routeParameters')['id'] ?? 0);
        $page = max(0, (int) ($request->getQueryParams()['page'] ?? 0));

        $root = Post::query()->whereVisibleTo($actor)->find($rootId);

        if (! $root) {
            throw new ModelNotFoundException();
        }

        $rows = $this->descendants($root, $actor);

        $slice = array_slice($rows, $page * self::PER_PAGE, self::PER_PAGE + 1);
        $more = count($slice) > self::PER_PAGE;
        $slice = array_slice($slice, 0, self::PER_PAGE);

        // 🚨 Rendered AFTER the page is cut, never before. Rendering is the
        // expensive part — the formatter and the edit check run per post — and
        // presenting the whole branch first meant a 400-reply branch rendered
        // 400 posts to send 50.
        return new JsonResponse([
            'data' => array_map(fn (array $row) => $this->present($row[0], $row[1], $actor), $slice),
            'hasMore' => $more,
            'page' => $page,
            'total' => count($rows),
        ]);
    }

    /**
     * The whole branch under a post, flattened into reading order.
     *
     * 🚨 Returned FLAT with a depth on each row, not as nested JSON. Nested
     * JSON has to be walked to be rendered, cannot be paginated without
     * cutting a subtree in half, and forces the client to re-implement the
     * ordering. A flat list in reading order with a depth number draws in one
     * pass and slices anywhere.
     *
     * 🚨 Loaded breadth-first in ONE query per level, never per post. A
     * recursive per-post fetch is the classic way to turn a popular thread
     * into a hundred queries, and depth is capped so a cycle in the data
     * cannot spin here.
     *
     * @return list<array{0: CommentPost, 1: int}> each post with its depth, in reading order
     */
    private function descendants(Post $root, User $actor): array
    {
        $ordered = [];
        $level = [(int) $root->id];
        $children = [];

        for ($depth = 1; $depth <= Parentage::MAX_DEPTH && $level; $depth++) {
            // Comments only: an event post ("renamed the discussion") has no
            // content to render and can never be anyone's reply.
            $posts = CommentPost::query()
                ->where('type', CommentPost::$type)
                ->whereVisibleTo($actor)
                ->whereIn('tributary_parent_id', $level)
                ->with('user')
                ->orderBy('id')
                ->get();

            if ($posts->isEmpty()) {
                break;
            }

            foreach ($posts as $post) {
                // Every reply in a branch is in the root's discussion, so they
                // share its ONE model: the edit check reads the discussion and
                // its tags, and a lazy load per post was two queries each.
                if ((int) $post->discussion_id === (int) $root->discussion_id) {
                    $post->setRelation('discussion', $root->discussion);
                }

                $children[(int) $post->getAttribute('tributary_parent_id')][] = $post;
            }

            $level = $posts->map(fn (Post $p) => (int) $p->id)->all();
        }

        // Walk it back into the order a person reads: each reply, then
        // everything said in answer to that reply, before the next sibling.
        $walk = function (int $parentId, int $depth) use (&$walk, &$ordered, $children) {
            foreach ($children[$parentId] ?? [] as $post) {
                $ordered[] = [$post, $depth];
                $walk((int) $post->id, $depth + 1);
            }
        };

        $walk((int) $root->id, 1);

        return $ordered;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(CommentPost $post, int $depth, User $actor): array
    {
        return [
            'id' => (int) $post->id,
            'number' => (int) $post->number,
            'depth' => min($depth, Parentage::MAX_DEPTH),
            'parentId' => (int) $post->getAttribute('tributary_parent_id'),
            'createdAt' => $post->created_at?->toIso8601String(),

            /*
             * 🚨 `contentHtml`, never the raw content. The raw text is
             * Markdown or BBCode depending on the forum's formatter, and a
             * branch that renders it raw shows people their own asterisks.
             * This is the same HTML the stream renders.
             */
            'contentHtml' => $post->formatContent(),

            'user' => $post->user ? [
                'id' => (int) $post->user->id,
                'username' => $post->user->username,
                'displayName' => $post->user->display_name,
                'avatarUrl' => $post->user->avatar_url,
            ] : null,

            'canEdit' => $actor->can('edit', $post),
        ];
    }
}
