/**
 * Screenshots for the README.
 *
 * Run against the dev forum, which carries the demo discussion:
 *
 *   TRIBUTARY_TOKEN=… node tools/shots.mjs
 *
 * 🚨 Signed in with a remember cookie rather than a typed password: the token
 * is minted on the server, used, and deleted there. Nothing in this file, and
 * nothing in the shell history, is a credential.
 *
 * 🚨 The branch is OPENED before the shot and the script waits for the replies
 * to be in the DOM. A screenshot of a closed "6 replies" button proves
 * nothing — the whole product is what happens after the click.
 */
import puppeteer from '../../gridiron-nation/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 🚨 Not a hard-coded Windows path. This script is run from whichever machine
 * is to hand, and a path that only exists on one of them turns "regenerate the
 * README shots" into "first port the script", which is how a README ends up
 * showing a version of the UI that shipped three changes ago.
 */
const CHROME =
  process.env.CHROME ||
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  }[process.platform] ||
  '/usr/bin/google-chrome';
const BASE = process.env.TRIBUTARY_BASE || 'https://dev.ernestdefoe.online';
const TOKEN = process.env.TRIBUTARY_TOKEN || '';
const PATH_ = process.env.TRIBUTARY_PATH || '/d/24';
const OUT = `${dirname(fileURLToPath(import.meta.url))}/../screenshots`;

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 2 },
  args: ['--hide-scrollbars', '--force-color-profile=srgb'],
});

const page = await browser.newPage();

/*
 * 🚨 The colour scheme is PINNED, not inherited from whichever machine is
 * running this.
 *
 * theme-toggle honours `prefers-color-scheme`, and headless Chrome reports
 * whatever the host OS is set to — so the same script produced dark shots on
 * the Windows box and light ones on the Mac, and "regenerate the README
 * screenshots after a one-line CSS fix" silently reskinned the whole README.
 */
await page.emulateMediaFeatures([
  { name: 'prefers-color-scheme', value: process.env.SHOTS_THEME || 'dark' },
]);

if (TOKEN) {
  await page.setCookie({
    name: 'flarum_remember',
    value: TOKEN,
    domain: new URL(BASE).hostname,
    path: '/',
    httpOnly: true,
    secure: true,
  });
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(name, { open = false, clip = null, height = 1400 } = {}) {
  await page.goto(`${BASE}${PATH_}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.Tributary-branchToggle', { timeout: 20000 });
  await settle(1200);

  if (open) {
    // 🚨 A real click, not `.click()` on the element from outside Mithril's
    // event system — a synthetic one does not run the handler.
    const toggle = await page.$('.Tributary-branchToggle');

    await toggle.click();
    await page.waitForSelector('.Tributary-reply', { timeout: 15000 });
    await settle(900);
  }

  /*
   * 🚨 The viewport is measured from the content. A fixed height leaves the
   * shot ending in a field of empty background, which is what makes a project
   * page look unfinished.
   */
  const measured = await page.evaluate(() => {
    const last = [...document.querySelectorAll('.PostStream-item')].pop();
    const bottom = last ? last.getBoundingClientRect().bottom + window.scrollY : document.body.scrollHeight;

    return Math.ceil(bottom + 24);
  });

  await page.setViewport({
    width: 1280,
    height: Math.min(height, Math.max(600, measured)),
    deviceScaleFactor: 2,
  });

  await settle(500);

  /*
   * 🚨 Clipped to the conversation, not the whole browser window.
   *
   * A full-page shot of a dev forum carries that forum's sidebar, its other
   * extensions and its unread counts — none of which is what this README is
   * showing, and all of which a reader has to look past. The clip is measured
   * from the post stream itself so it stays right whatever the theme does.
   */
  const box = clip ?? (await page.evaluate((max) => {
    const stream = document.querySelector('.PostStream');

    if (!stream) return null;

    const r = stream.getBoundingClientRect();
    const pad = 20;

    return {
      x: Math.max(0, Math.floor(r.left - pad)),

      // 🚨 No padding ABOVE. The discussion title sits just over the stream,
      // and a few pixels of headroom catches the bottom half of it — which
      // looks like a broken crop rather than a deliberate one.
      y: Math.max(0, Math.floor(r.top + window.scrollY)),
      width: Math.ceil(r.width + pad * 2),
      height: Math.ceil(Math.min(r.height + pad * 2, max)),
    };
  }, height));

  await page.screenshot({ path: `${OUT}/${name}.png`, clip: box ?? undefined });
  console.log(`  wrote ${name}.png`);
}

await shoot('thread', { height: 1250 });
await shoot('branch-open', { open: true, height: 1250 });

await browser.close();
console.log('done');
