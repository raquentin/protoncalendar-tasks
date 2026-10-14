const path = require('path');
const fs = require('fs');
const { chromium, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..', '..');
const PROFILE_DIR = path.join(ROOT, '.auth', 'profile');
const CALENDAR_URL = 'https://calendar.proton.me/';

// channel 'chromium' is the new headless, which supports extensions
async function launchWithExtension({ headless = true } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chromium',
    headless,
    viewport: { width: 1400, height: 900 },
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
    ],
  });
}

const hasProfile = () => fs.existsSync(path.join(PROFILE_DIR, 'Default'));

async function openCalendar(context) {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(CALENDAR_URL);
  await page.waitForURL(/calendar\.proton\.me\/u\/\d+/, { timeout: 30_000 }).catch(() => {
    throw new Error('not logged in to proton; run `npm run auth` first');
  });
  await page.locator('.calendar-dayeventcell, [data-testid="calendar-view"], .calendar-row-heading').first()
    .waitFor({ timeout: 30_000 });
  await dismissOverlays(page);
  return page;
}

async function dismissOverlays(page) {
  await page.waitForTimeout(1500);
  for (let i = 0; i < 5; i++) {
    const spotlight = page.locator('.spotlight').first();
    if (!await spotlight.isVisible().catch(() => false)) break;
    const close = spotlight.locator('button').first();
    if (await close.count()) await close.click({ force: true }).catch(() => {});
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

// cleanup only ever touches pct-* events
const TEST_PREFIX = 'pct-';
const TEST_TITLE_RE = /^\s*(\[[\sxX-]*\]\s*)?pct-/;

async function createEvent(page, title, { allDay = false, date, daily = false } = {}) {
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  await page.locator('#event-title-input').fill(title);
  if (allDay) await page.locator('#event-allday-checkbox').check({ force: true });
  if (daily) {
    await page.locator('#event-frequency-input').click();
    await page.getByRole('button', { name: 'Every day', exact: true }).click();
  }
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    await page.locator('#event-date-input').fill(label);
    await page.locator('#event-date-input').press('Enter');
  }
  await page.getByTestId('create-event-modal:save').click();
  await page.locator('#event-title-input').waitFor({ state: 'detached' });
  await page.waitForTimeout(3000);
}

async function deleteTestEvents(page) {
  let deleted = 0;
  for (let i = 0; i < 20; i++) {
    const cells = page.locator('.calendar-dayeventcell, .calendar-eventcell')
      .filter({ hasText: TEST_PREFIX });
    let target = null;
    let title = null;
    for (const c of await cells.all()) {
      title = (await c.locator('.calendar-dayeventcell-title, .calendar-eventcell-title').textContent()).trim();
      if (TEST_TITLE_RE.test(title)) { target = c; break; }
    }
    if (!target) break;
    await target.locator('.calendar-dayeventcell-title, .calendar-eventcell-title').click();
    await page.getByTestId('event-popover:delete').click();
    const confirm = page.getByRole('button', { name: 'Delete', exact: true }).last();
    await confirm.waitFor();
    // "All events" is always last
    const scope = page.getByTestId('delete-recurring-popover:delete-option-radio');
    if (await scope.count()) await scope.last().check({ force: true });
    await confirm.click();
    await expect(page.locator('.calendar-dayeventcell-title, .calendar-eventcell-title')
      .filter({ hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }))
      .toHaveCount(0, { timeout: 15_000 });
    deleted++;
  }
  return deleted;
}

async function waitForSave(page) {
  await expect(page.locator('#proton-task-hide-modal')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#event-title-input')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(3000);
}

async function openPopup(context) {
  const page = await context.newPage();
  await page.goto('chrome://extensions');
  const id = await page.evaluate(() => new Promise((resolve) => chrome.management.getAll(
    (all) => resolve(all.find((e) => e.name === 'Proton Calendar Tasks').id))));
  await page.goto(`chrome-extension://${id}/popup.html`);
  return page;
}

module.exports = {
  TEST_PREFIX,
  openPopup,
  waitForSave,
  createEvent,
  deleteTestEvents, ROOT, PROFILE_DIR, CALENDAR_URL, launchWithExtension, hasProfile, openCalendar, dismissOverlays };
