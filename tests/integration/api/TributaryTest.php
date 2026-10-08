<?php

namespace ErnestDefoe\Tributary\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Post\Post;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use PHPUnit\Framework\Attributes\Test;

/**
 * Discussion 1:   1 ─┬─ 2 ── 3
 *                    ├─ 4
 *                    └─ 5 (the admin's, hidden)
 *                 6 (no parent)
 * Discussion 2:   20.   Discussion 3 is hidden, with post 30.
 */
class TributaryTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ernestdefoe-tributary');

        $post = fn (int $id, int $discussion, int $number, ?int $parent = null, array $extra = []) => $extra + [
            'id' => $id, 'discussion_id' => $discussion, 'number' => $number, 'created_at' => Carbon::now()->subHour(),
            'user_id' => 2, 'type' => 'comment', 'content' => "<t><p>Post $id</p></t>", 'tributary_parent_id' => $parent,
        ];

        $this->prepareDatabase([
            User::class => [$this->normalUser()],
            Discussion::class => [
                ['id' => 1, 'title' => 'Tree', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 1, 'comment_count' => 5],
                ['id' => 2, 'title' => 'Elsewhere', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 20, 'comment_count' => 1],
                ['id' => 3, 'title' => 'Hidden', 'created_at' => Carbon::now(), 'user_id' => 1, 'first_post_id' => 30, 'comment_count' => 1, 'hidden_at' => Carbon::now()],
            ],
            Post::class => [
                $post(1, 1, 1),
                $post(2, 1, 2, 1),
                $post(3, 1, 3, 2),
                $post(4, 1, 4, 1),
                $post(5, 1, 5, 1, ['user_id' => 1, 'hidden_at' => Carbon::now(), 'hidden_user_id' => 1]),
                $post(6, 1, 6),
                $post(20, 2, 1),
                $post(30, 3, 1, null, ['user_id' => 1]),
            ],
        ]);
    }

    private function reply(mixed $parent, int $actor = 1): array
    {
        $attributes = ['content' => 'An answer'];
        if ($parent !== 'omit') {
            $attributes['tributaryParentId'] = $parent;
        }

        $response = $this->send($this->request('POST', '/api/posts', [
            'authenticatedAs' => $actor,
            'json' => ['data' => [
                'type' => 'posts',
                'attributes' => $attributes,
                'relationships' => ['discussion' => ['data' => ['type' => 'discussions', 'id' => '1']]],
            ]],
        ]));

        return [$response->getStatusCode(), json_decode((string) $response->getBody(), true)];
    }

    /** Run a request and return the queries it made. */
    private function queriesOf(callable $request): array
    {
        $this->app();
        $this->database()->flushQueryLog();
        $this->database()->enableQueryLog();
        $request();
        $this->database()->disableQueryLog();

        return array_column($this->database()->getQueryLog(), 'query');
    }

    private function branch(int $root, ?int $actor = null, int $page = 0): array
    {
        $response = $this->send(
            $this->request('GET', "/api/tributary/posts/$root/branch", $actor ? ['authenticatedAs' => $actor] : [])
                ->withQueryParams(['page' => $page])
        );

        return [$response->getStatusCode(), json_decode((string) $response->getBody(), true)];
    }

    #[Test]
    public function a_reply_remembers_the_post_it_answered()
    {
        [$status, $body] = $this->reply(4);

        $this->assertSame(201, $status, json_encode($body));
        $this->assertSame(4, $body['data']['attributes']['tributaryParentId']);
        $this->assertSame(4, (int) $this->database()->table('posts')->where('id', $body['data']['id'])->value('tributary_parent_id'));
    }

    #[Test]
    public function a_reply_to_the_discussion_has_no_parent()
    {
        foreach (['omit', null, 0, ''] as $parent) {
            [$status, $body] = $this->reply($parent);

            $this->assertSame(201, $status, var_export($parent, true));
            $this->assertNull($body['data']['attributes']['tributaryParentId']);
        }
    }

    #[Test]
    public function a_reply_cannot_answer_a_post_elsewhere_missing_or_unseen()
    {
        // As a member: post 5 is hidden from them.
        $cases = [
            20 => 'A reply can only answer a post in the same discussion.',
            999 => 'That post is not here any more.',
            5 => 'That post is not available.',
            'abc' => null,
        ];

        foreach ($cases as $parent => $why) {
            [$status, $body] = $this->reply($parent, 2);

            $this->assertSame(422, $status, (string) $parent);
            $this->assertSame('/data/attributes/tributaryParentId', $body['errors'][0]['source']['pointer'] ?? null, (string) $parent);
            if ($why) {
                $this->assertSame($why, $body['errors'][0]['detail'], (string) $parent);
            }
        }

        $this->assertSame(0, $this->database()->table('posts')->where('content', 'like', '%An answer%')->count(), 'A refused reply is not posted anyway');
    }

    #[Test]
    public function reply_counts_cover_the_whole_branch_as_the_viewer_sees_it()
    {
        $counts = function (?int $actor) {
            $response = $this->send(
                $this->request('GET', '/api/posts', $actor ? ['authenticatedAs' => $actor] : [])->withQueryParams(['filter' => ['discussion' => 1]])
            );
            $this->assertSame(200, $response->getStatusCode());

            $out = [];
            foreach (json_decode((string) $response->getBody(), true)['data'] as $item) {
                if ($item['type'] === 'posts') {
                    $out[(int) $item['id']] = $item['attributes']['tributaryReplyCount'];
                }
            }
            ksort($out);

            return $out;
        };

        $queries = $this->queriesOf(fn () => $this->assertSame([1 => 3, 2 => 1, 3 => 0, 4 => 0, 6 => 0], $counts(null), 'The hidden reply is neither shown nor counted'));
        $this->assertCount(1, array_filter($queries, fn ($q) => str_contains($q, 'tributary_parent_id') && str_contains($q, 'not null')), 'One reply-tree query for the page, not one per post');
        $this->assertSame([1 => 4, 2 => 1, 3 => 0, 4 => 0, 5 => 0, 6 => 0], $counts(1), 'A moderator sees and counts it');
    }

    #[Test]
    public function reply_counts_are_left_off_the_discussion_list()
    {
        $response = $this->send($this->request('GET', '/api/discussions')->withQueryParams(['include' => 'firstPost,lastPost']));
        $this->assertSame(200, $response->getStatusCode());

        foreach (json_decode((string) $response->getBody(), true)['included'] as $item) {
            if ($item['type'] === 'posts') {
                $this->assertArrayNotHasKey('tributaryReplyCount', $item['attributes']);
            }
        }
    }

    #[Test]
    public function a_branch_reads_in_order_with_depth()
    {
        [$status, $body] = $this->branch(1);

        $this->assertSame(200, $status);
        $this->assertSame([[2, 1, 1], [3, 2, 2], [4, 1, 1]], array_map(fn ($p) => [$p['id'], $p['depth'], $p['parentId']], $body['data']));
        $this->assertSame(3, $body['total']);
        $this->assertFalse($body['hasMore']);
        $this->assertSame('<p>Post 2</p>', $body['data'][0]['contentHtml']);
        $this->assertSame('normal', $body['data'][0]['user']['username']);
        $this->assertFalse($body['data'][0]['canEdit'], 'A guest cannot edit');

        [, $body] = $this->branch(1, 1);
        $this->assertSame([2, 3, 4, 5], array_column($body['data'], 'id'), 'A moderator also sees the hidden reply');
    }

    #[Test]
    public function a_branch_under_a_post_the_viewer_cannot_see_is_not_found()
    {
        [$status] = $this->branch(30);
        $this->assertSame(404, $status, 'In a hidden discussion');

        [$status] = $this->branch(5, 2);
        $this->assertSame(404, $status, 'A hidden post');

        [$status] = $this->branch(999);
        $this->assertSame(404, $status);
    }

    #[Test]
    public function a_long_branch_comes_fifty_at_a_time_without_a_query_per_post()
    {
        $this->app();
        $rows = [];
        for ($id = 100; $id < 160; $id++) {
            $rows[] = ['id' => $id, 'discussion_id' => 1, 'number' => $id, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>x</p></t>', 'tributary_parent_id' => 6];
        }
        $this->database()->table('posts')->insert($rows);

        $queries = $this->queriesOf(function () use (&$status, &$body) {
            [$status, $body] = $this->branch(6);
        });
        $this->assertLessThan(15, count($queries), 'A fixed number of queries, not one or more per post');
        $this->assertSame(200, $status);
        $this->assertCount(50, $body['data']);
        $this->assertTrue($body['hasMore']);
        $this->assertSame(60, $body['total']);

        [, $body] = $this->branch(6, null, 1);
        $this->assertSame(range(150, 159), array_column($body['data'], 'id'));
        $this->assertFalse($body['hasMore']);
    }
}
