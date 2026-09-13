<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/*
 * Which post a reply was answering.
 *
 * 🚨 A column on `posts`, not a side table. Every read of the stream needs the
 * parent of every post on the page; a side table makes that a join on the
 * hottest query in the forum for a single nullable integer. Flarum's own
 * extensions add columns here for exactly this reason.
 *
 * 🚨 Nullable, and the overwhelming majority of rows stay null. A reply to the
 * discussion rather than to a person is the normal case and must remain the
 * cheap one — nothing about this extension may make a flat discussion worse.
 *
 * 🚨 nullOnDelete, not cascade. Deleting a post must NEVER delete the replies
 * to it: the answers usually outlive the question, and a cascade here would
 * let one moderator action silently remove a branch of a conversation.
 */
return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('posts', 'tributary_parent_id')) {
            return;
        }

        $schema->table('posts', function (Blueprint $table) {
            $table->unsignedInteger('tributary_parent_id')->nullable()->default(null);

            // Reading a branch is "every post whose parent is this one", so
            // the index is on the parent, and carries id to keep the children
            // in posting order without a second sort.
            $table->index(['tributary_parent_id', 'id'], 'tributary_children');

            $table->foreign('tributary_parent_id')
                ->references('id')
                ->on('posts')
                ->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('posts', 'tributary_parent_id')) {
            return;
        }

        $schema->table('posts', function (Blueprint $table) {
            $table->dropForeign(['tributary_parent_id']);
            $table->dropIndex('tributary_children');
            $table->dropColumn('tributary_parent_id');
        });
    },
];
