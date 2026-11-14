const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
let browser;

after(async () => {
  if (browser) await browser.close();
});

function buildHtml() {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const icons = fs.readFileSync(path.join(root, 'icons.js'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'main.js'), 'utf8').replaceAll('</script', '<\\/script');
  // The plugin entry is an ES module that imports the generated icon module.
  // Inline both as a classic script: drop the import statement and the export
  // keywords so the two modules share one scope.
  const bundled = `${icons}\n${js}`
    .replace(/^\s*import\s+[^;]+;\s*$/gm, '')
    .replace(/export\s+(const|function)\s+/g, '$1 ');
  return fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<link rel="stylesheet" href="./style.css">', `<style>${css}</style>`)
    .replace(
      '<script type="module" src="./main.js"></script>',
      `<script>${bundled}</script>`
    );
}

async function openPlugin({ commits, refs, failLog, staleCursorOnce } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const html = buildHtml();
  await page.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:740px"></iframe>');
  await page.evaluate(
    ({ html, commits, refs, failLog, staleCursorOnce }) => {
      const log = commits || [
        { hash: 'aaa', subject: 'First commit', author: 'Ada', parents: ['ccc'], refs: ['main'], onHead: true },
        { hash: 'bbb', subject: 'Second commit', author: 'Bob', parents: ['ccc'], refs: [], onHead: false },
        { hash: 'ccc', subject: 'Root commit', author: 'Ada', parents: [], refs: [], onHead: true },
      ];
      const refsPayload = refs || { branches: ['main', 'feature'], remotes: ['origin/main'], tags: [] };
      window.gitLogCalls = [];
      window.addEventListener('message', event => {
        const message = event.data;
        if (message?.method) window.gitLogCalls.push(message);
        if (!message || !message.method) return;
        if (message.method === 'git:log' && staleCursorOnce && !window.__staleSent) {
          window.__staleSent = true;
          event.source.postMessage(
            { jsonrpc: '2.0', id: message.id, error: { code: -32001, message: 'stale', data: { code: 'GIT_STALE_CURSOR' } } },
            '*'
          );
          return;
        }
        if (message.method === 'git:log' && failLog) {
          event.source.postMessage(
            { jsonrpc: '2.0', id: message.id, error: { code: -32001, message: failLog } },
            '*'
          );
          return;
        }
        let result = {};
        if (message.method === 'git:refs') result = refsPayload;
        if (message.method === 'git:log') {
          result = message.params.cursor
            ? { commits: [{ hash: 'ddd', subject: 'Older commit', author: 'Ada', parents: [], refs: [], onHead: true }], nextCursor: null, tip: 'aaa' }
            : { commits: log, nextCursor: 'next-page', tip: 'aaa' };
        }
        if (message.method === 'git:commit') {
          result = {
            commit: {
              hash: message.params.hash,
              subject: 'First commit',
              author: 'Ada',
              date: '2026-01-01T00:00:00Z',
              parents: ['ccc'],
              refs: ['main'],
              body: 'Body text',
              files: [{ status: 'M', path: 'src/file.js' }],
            },
          };
        }
        event.source.postMessage({ jsonrpc: '2.0', id: message.id, result }, '*');
      });
      document.querySelector('iframe').srcdoc = html;
    },
    { html, commits: commits || null, refs: refs || null, failLog: failLog || null, staleCursorOnce: staleCursorOnce || false }
  );
  const frame = page.frameLocator('iframe');
  return { page, frame, errors };
}

test('renders history, branches, files and details', async () => {
  browser = await chromium.launch({ headless: true });
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  // A tree exposes its folder nodes and its leaf branches as tree items.
  assert.equal(await frame.locator('.branch-leaf').count(), 3);
  assert.equal(await frame.getByRole('treeitem').count(), 6);
  assert.equal(await frame.getByRole('row').count() >= 3, true);

  await frame.getByText('First commit', { exact: true }).click();
  await frame.getByText('src/file.js').waitFor();
  await frame.getByText('Body text').waitFor();

  assert.deepEqual(errors, []);
  await page.close();
});

test('pages with Load more and keeps earlier rows', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Load more' }).click();
  await frame.getByText('Older commit', { exact: true }).waitFor();
  await frame.getByText('First commit', { exact: true }).waitFor();

  assert.deepEqual(errors, []);
  await page.close();
});

test('filters branches and reports when nothing matches', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  await frame.getByRole('searchbox', { name: 'Filter branches' }).fill('feature');
  assert.equal(await frame.locator('.branch-leaf').count(), 1);
  await frame.getByRole('searchbox', { name: 'Filter branches' }).fill('nothing-matches');
  await frame.getByText('No branches match.').waitFor();

  assert.deepEqual(errors, []);
  await page.close();
});

test('moves the selection with the keyboard', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  await frame.getByRole('grid', { name: 'Commit log' }).focus();
  await page.keyboard.press('End');
  assert.equal(await frame.getByRole('row', { selected: true }).count(), 1);
  await page.keyboard.press('Home');
  assert.equal(await frame.getByRole('row', { selected: true }).count(), 1);

  assert.deepEqual(errors, []);
  await page.close();
});

test('dims commits that are not on HEAD and can turn the dimming off', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('Second commit', { exact: true }).waitFor();
  assert.equal(await frame.locator('.row.dim').count(), 1);
  await frame.getByRole('button', { name: 'Dim commits not on HEAD' }).click();
  assert.equal(await frame.locator('.row.dim').count(), 0);

  assert.deepEqual(errors, []);
  await page.close();
});

test('opens a context menu on a commit row', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  await frame.getByText('First commit', { exact: true }).click({ button: 'right' });
  await frame.getByRole('menuitem', { name: 'Copy hash' }).waitFor();
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, []);
  await page.close();
});

test('resizes the branch pane with the keyboard', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  const separator = frame.getByRole('separator', { name: 'Resize branches pane' });
  await separator.focus();
  const before = await separator.getAttribute('aria-valuenow');
  await page.keyboard.press('ArrowRight');
  const after = await separator.getAttribute('aria-valuenow');
  assert.notEqual(before, after);

  assert.deepEqual(errors, []);
  await page.close();
});

test('shows the host error message when the request is denied', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin({ failLog: 'GIT_WORKSPACE_DENIED: No project workspace is bound' });

  await frame.getByText('GIT_WORKSPACE_DENIED: No project workspace is bound').waitFor();

  assert.deepEqual(errors, []);
  await page.close();
});

test('opens the filter panel and applies the branch filter', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  assert.equal(await frame.locator('#filter-panel').isVisible(), false);
  await frame.getByRole('button', { name: 'Branch', exact: true }).click();
  assert.equal(await frame.locator('#filter-panel').isVisible(), true);
  await frame.getByRole('searchbox', { name: 'Filter by branch' }).fill('feature');
  await page.waitForTimeout(400);
  await frame.getByRole('button', { name: 'Clear' }).click();
  await page.waitForTimeout(400);

  assert.deepEqual(errors, []);
  await page.close();
});

test('toggles the sort order and the regular expression switch', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  const sort = frame.getByRole('button', { name: 'Toggle sort order' });
  assert.equal(await sort.getAttribute('aria-pressed'), 'false');
  await sort.click();
  await page.waitForTimeout(400);
  assert.equal(await sort.getAttribute('aria-pressed'), 'true');

  const regex = frame.getByRole('button', { name: 'Use regular expression' });
  await regex.click();
  await page.waitForTimeout(400);
  assert.equal(await regex.getAttribute('aria-pressed'), 'true');

  assert.deepEqual(errors, []);
  await page.close();
});

test('collapses and restores the branch pane', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  const collapse = frame.getByRole('button', { name: 'Collapse branch panel' });
  await collapse.click();
  assert.equal(await collapse.getAttribute('aria-pressed'), 'true');
  await collapse.click();
  assert.equal(await collapse.getAttribute('aria-pressed'), 'false');

  assert.deepEqual(errors, []);
  await page.close();
});

test('renders the icon buttons with accessible names', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  for (const name of ['Toggle sort order', 'Use regular expression', 'Dim commits not on HEAD', 'Go to the HEAD commit', 'Refresh history']) {
    assert.equal(await frame.getByRole('button', { name }).count(), 1, name);
  }
  assert.equal(await frame.locator('button svg.icon').count() >= 5, true);

  assert.deepEqual(errors, []);
  await page.close();
});

test('reverses the display order without refetching', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  const before = await frame.locator('.row .subject-text').allTextContents();
  await frame.getByRole('button', { name: 'Toggle sort order' }).click();
  await page.waitForTimeout(400);
  const after = await frame.locator('.row .subject-text').allTextContents();
  assert.deepEqual(after, before.slice().reverse());

  assert.deepEqual(errors, []);
  await page.close();
});

test('shows a short timestamp with the full stamp in the tooltip', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin({
    commits: [
      { hash: 'aaa', subject: 'First commit', author: 'Ada', date: '2026-11-13T20:13:19+07:00', parents: [], refs: [], onHead: true },
    ],
  });

  await frame.getByText('First commit', { exact: true }).waitFor();
  const date = frame.locator('.row .date').first();
  assert.equal(await date.textContent(), '2026-11-13 20:13');
  assert.equal(await date.getAttribute('title'), '2026-11-13T20:13:19+07:00');

  assert.deepEqual(errors, []);
  await page.close();
});


test('merge parents occupy distinct lanes and retain both descendants', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin({ commits: [
    { hash: 'aaaa', subject: 'Merge', parents: ['bbbb', 'cccc'] },
    { hash: 'bbbb', subject: 'First parent', parents: ['dddd'] },
    { hash: 'cccc', subject: 'Second parent', parents: ['dddd'] },
    { hash: 'dddd', subject: 'Base', parents: [] },
  ] });
  await frame.getByText('Merge', { exact: true }).waitFor();
  const paths = await frame.locator('#commit-aaaa svg path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  const firstCircle = await frame.locator('#commit-bbbb circle').getAttribute('cx');
  const secondCircle = await frame.locator('#commit-cccc circle').getAttribute('cx');
  assert.notEqual(firstCircle, secondCircle);
  assert.deepEqual(errors, []);
  await page.close();
});

test('branch filter sends entered branch to the host', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame } = await openPlugin();
  await frame.getByText('First commit', { exact: true }).waitFor();
  await frame.getByRole('button', { name: 'Branch', exact: true }).click();
  await frame.getByRole('searchbox', { name: 'Filter by branch' }).fill('feature');
  await page.waitForFunction(() => window.gitLogCalls.some(call => call.method === 'git:log' && call.params.ref === 'feature'));
  await page.close();
});

test('exposes the tree and grid roles the review requires', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  assert.equal(await frame.locator('[role="tree"]').count(), 1);
  assert.equal(await frame.locator('[role="treeitem"]').count() > 0, true);
  assert.equal(await frame.locator('[role="grid"]').count(), 1);
  assert.equal(await frame.locator('[role="row"]').count() > 0, true);
  assert.equal(await frame.locator('[role="gridcell"]').count() > 0, true);
  assert.equal(await frame.locator('[role="columnheader"]').count(), 5);
  assert.equal(await frame.locator('#grid').getAttribute('aria-rowcount'), '4');
  assert.equal(await frame.locator('[aria-hidden="true"]').count() > 0, true);

  assert.deepEqual(errors, []);
  await page.close();
});

test('moves focus inside the context menu and closes it with Escape', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin();

  await frame.getByText('First commit', { exact: true }).waitFor();
  await frame.getByText('First commit', { exact: true }).click({ button: 'right' });
  const items = frame.getByRole('menuitem');
  assert.equal(await items.count(), 3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#menu').isVisible(), false);

  assert.deepEqual(errors, []);
  await page.close();
});

test('shows the HEAD branch in the tree', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin({ commits: [
    { hash: 'aaa', subject: 'First commit', author: 'Ada', date: '2026-01-01T00:00:00Z', parents: [], refs: ['HEAD -> main'], onHead: true },
  ] });

  await frame.getByText('First commit', { exact: true }).waitFor();
  await frame.locator('.tree-head').waitFor({ timeout: 5000 });
  assert.match(await frame.locator('.tree-head').textContent(), /HEAD \(main\)/);

  assert.deepEqual(errors, []);
  await page.close();
});

test('restarts the history when the host reports a stale cursor', async () => {
  browser = browser || (await chromium.launch({ headless: true }));
  const { page, frame, errors } = await openPlugin({ staleCursorOnce: true });

  await frame.getByText('First commit', { exact: true }).waitFor({ timeout: 15000 });
  // The plugin must ask for the first page again instead of keeping the stale cursor.
  await page.waitForFunction(
    () => (window.gitLogCalls || []).filter((call) => call.method === 'git:log').length >= 2,
    null,
    { timeout: 15000 }
  );
  const calls = await page.evaluate(() => (window.gitLogCalls || []).filter((call) => call.method === 'git:log'));
  const last = calls[calls.length - 1];
  assert.equal(last.params.cursor, undefined);

  assert.deepEqual(errors, []);
  await page.close();
});
