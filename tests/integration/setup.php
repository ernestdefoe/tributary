<?php

use Flarum\Testing\integration\Setup\SetupScript;
use Illuminate\Database\Capsule\Manager;
use Illuminate\Database\Schema\Blueprint;

require __DIR__.'/../../vendor/autoload.php';

$setup = new SetupScript();

$setup->run();

/*
 * Plus flarum/mentions' `post_mentions_post` table, which the backfill reads.
 * Created here, never in a test: on MySQL a CREATE TABLE commits the test's
 * open transaction, so its rows would leak into every later test.
 */
$tmp = $setup->tmpDir();
$config = (include "$tmp/config.php")['database'];

if ($config['driver'] === 'sqlite' && ! file_exists($config['database'])) {
    $config['database'] = "$tmp/{$config['database']}";
}

$capsule = new Manager();
$capsule->addConnection($config);
$capsule->getConnection()->getSchemaBuilder()->create('post_mentions_post', function (Blueprint $table) {
    $table->unsignedInteger('post_id');
    $table->unsignedInteger('mentions_post_id');
    $table->primary(['post_id', 'mentions_post_id']);
});
