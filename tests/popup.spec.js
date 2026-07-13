const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..');          // extension root (manifest.json here)
const TOKENS_MD = path.join(EXT, 'test-tokens.md');

// Pull a token out of test-tokens.md by the heading it lives under, so the
// suite always uses freshly-generated (non-expired) tokens.
function readToken(nameSubstr) {
  const md = fs.readFileSync(TOKENS_MD, 'utf8');
  const idx = md.indexOf(nameSubstr);
  if (idx === -1) throw new Error(`No test-token section matching "${nameSubstr}"`);
  const m = md.slice(idx).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (!m) throw new Error(`No JWT found under "${nameSubstr}"`);
  return m[0];
}

let ctx, extId;

test.beforeAll(async () => {
  ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    colorScheme: 'light',                           // deterministic syntax colors
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      // Headless (new mode — required for the MV3 service worker) unless HEADED=1,
      // which opens a real window for debugging (e.g. `HEADED=1 npx playwright test`).
      ...(process.env.HEADED ? [] : ['--headless=new']),
    ],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  extId = new URL(sw.url()).host;
});

test.afterAll(async () => { await ctx?.close(); });

// Each test gets its own popup page; closed after the test.
let page;
test.afterEach(async () => { await page?.close(); page = undefined; });

async function openAndDecode(tokenName) {
  page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  // Isolate each test: the popup auto-restores history / a pending token on open,
  // which would hide #jwt-input. Clear persisted state and reload for a clean slate.
  await page.evaluate(async () => {
    localStorage.clear();
    try { await chrome.storage.local.clear(); } catch (_) {}
  });
  await page.reload();
  await expect(page.locator('#jwt-input')).toBeVisible();
  await page.fill('#jwt-input', readToken(tokenName));
  await page.locator('#jwt-input').press('Control+Enter');   // input alone won't decode
  await expect(page.locator('#payload-claims-visual')).toBeVisible();
  return page;
}

test('renders the payload tree with scalar + chip claims (Okta)', async () => {
  const p = await openAndDecode('Okta');
  const visual = p.locator('#payload-claims-visual');
  await expect(visual).toContainText('sub');
  await expect(visual).toContainText('groups');
  await expect(visual.locator('.claim-chip')).toContainText(['Everyone', 'Admins']);
});

test('recurses into nested objects (Keycloak realm_access / resource_access)', async () => {
  const p = await openAndDecode('Keycloak');
  const visual = p.locator('#payload-claims-visual');

  // Top-level nested object claims are present…
  await expect(visual.locator('.claim-key', { hasText: 'realm_access' })).toBeVisible();
  await expect(visual.locator('.claim-key', { hasText: 'resource_access' })).toBeVisible();

  // …and recurse: realm roles as chips.
  await expect(visual.locator('.claim-chip', { hasText: 'offline_access' })).toBeVisible();

  // Object-of-objects: resource_access → acme-webapp → roles → [viewer, editor].
  await expect(visual.locator('.claim-node-key', { hasText: 'acme-webapp' })).toBeVisible();
  await expect(visual.locator('.claim-chip', { hasText: 'viewer' })).toBeVisible();
  await expect(visual.locator('.claim-chip', { hasText: 'editor' })).toBeVisible();
});

test('flags privileged roles, leaves normal ones neutral (Keycloak)', async () => {
  const p = await openAndDecode('Keycloak');
  const visual = p.locator('#payload-claims-visual');

  // "admin" (realm role) → privileged tint + bold.
  await expect(visual.locator('.claim-chip.privileged', { hasText: 'admin' })).toBeVisible();

  // "viewer" is a normal role → not privileged.
  await expect(visual.locator('.claim-chip', { hasText: 'viewer' }))
    .not.toHaveClass(/privileged/);

  // Current matcher is admin / superuser / *-admin only — nothing else qualifies here.
  await expect(visual.locator('.claim-chip.privileged')).toHaveCount(1);
});

test('single-element arrays render as chips, same as multi-element (Firebase)', async () => {
  // identities.email = ["jane@example.com"] → a chip pill, same treatment as a
  // multi-element array. No special bracketed group anywhere.
  const fb = await openAndDecode('Firebase');
  const fbVisual = fb.locator('#payload-claims-visual');
  await expect(fbVisual.locator('.claim-chip', { hasText: 'jane@example.com' })).toBeVisible();
  await expect(fb.locator('.claim-chips.array-chips')).toHaveCount(0);
});

test('timestamps render stacked with epoch copy value (Okta)', async () => {
  const p = await openAndDecode('Okta');
  const date = p.locator('#payload-claims-visual .claim-date').first();
  await expect(date).toBeVisible();
  await expect(date.locator('.lt-date')).toBeVisible();      // date line
  await expect(date.locator('.lt-time').first()).toBeVisible(); // time line
  expect(await date.getAttribute('data-copy-value')).toMatch(/^\d+$/); // raw epoch
  expect(await date.getAttribute('title')).toBeTruthy();     // full formatted date on hover
});

test('claim tooltip is keyboard-reachable and Escape-dismissable (Okta)', async () => {
  const p = await openAndDecode('Okta');
  const tip = p.locator('#tooltip-container');

  await p.locator('#payload-claims-visual .claim-key.tooltip', { hasText: 'iss' }).first().focus();
  await expect(tip).toHaveClass(/show/);

  await p.keyboard.press('Escape');
  await expect(tip).not.toHaveClass(/show/);
});

test('global JSON toggle dumps nested objects as raw JSON (Keycloak)', async () => {
  const p = await openAndDecode('Keycloak');

  await p.locator('.view-switch-btn[data-target="payload"][data-view="json"]').click();
  const json = p.locator('#payload-claims-json');
  await expect(json).toBeVisible();
  await expect(p.locator('#payload-claims-visual')).toBeHidden();
  await expect(json).toContainText('realm_access');
  await expect(json).toContainText('resource_access');   // nested object included

  // …and back to Visual.
  await p.locator('.view-switch-btn[data-target="payload"][data-view="visual"]').click();
  await expect(p.locator('#payload-claims-visual')).toBeVisible();
});

test('boolean claim uses the type color, not error red (Cognito email_verified)', async () => {
  const p = await openAndDecode('Cognito');
  const key = p.locator('#payload-claims-visual .claim-key', { hasText: 'email_verified' }).first();
  await expect(key).toBeVisible();
  await expect(key).toHaveClass(/boolean/);
  await expect(key).toHaveCSS('color', 'rgb(192, 38, 211)');   // --syntax-boolean magenta, not red
});

test('About section — manifest version, header-version navigation, and links', async () => {
  const p = await openAndDecode('Google');   // the header version is present in every view

  // The header version is a clickable affordance that jumps to About in Settings.
  await p.click('#app-version');
  await expect(p.locator('#settings-view')).toBeVisible();
  await expect(p.locator('#about-section')).toBeVisible();

  // Version is read from the manifest (not hardcoded).
  const version = await p.evaluate(() => chrome.runtime.getManifest().version);
  await expect(p.locator('#about-version')).toHaveText(`v${version}`);

  // Link rows point at the right URLs and open in a new tab safely.
  const repo = 'https://github.com/hradecek/jotscope';
  const links = {
    'View source': repo,
    'Report an issue': `${repo}/issues/new`,
    'Report a security issue': `${repo}/security/policy`,
    'License': `${repo}/blob/main/LICENSE`,
  };
  await expect(p.locator('#about-section a.about-row')).toHaveCount(4);
  for (const [label, href] of Object.entries(links)) {
    const row = p.locator('#about-section a.about-row', { hasText: label });
    await expect(row).toHaveAttribute('href', href);
    await expect(row).toHaveAttribute('target', '_blank');
    await expect(row).toHaveAttribute('rel', 'noopener noreferrer');
  }

  // License links to the repo's LICENSE but keeps its "MIT" value visible.
  await expect(p.locator('#about-section a.about-row', { hasText: 'License' }).locator('.about-row-value')).toHaveText('MIT');
});
