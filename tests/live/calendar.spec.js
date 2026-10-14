// read-only unless PCT_LIVE_WRITE=1, which creates and deletes pct-* events
const { test: base, expect } = require('@playwright/test');
const {
  launchWithExtension, hasProfile, openCalendar, createEvent, deleteTestEvents, waitForSave, openPopup, TEST_PREFIX,
} = require('./launch');

const test = base.extend({
  extContext: [async ({}, use) => {
    const context = await launchWithExtension({ headless: !process.env.HEADED });
    await use(context);
    await context.close();
  }, { scope: 'worker' }],
  page: async ({ extContext }, use) => {
    await use(await openCalendar(extContext));
  },
});

test.skip(!hasProfile(), 'no saved proton login; run `npm run auth` first');

const ANY_CELL = '.calendar-dayeventcell, .calendar-eventcell';
const ANY_TITLE = '.calendar-dayeventcell-title, .calendar-eventcell-title';

test('task events get checkboxes', async ({ page }) => {
  const tasks = page.locator(`:is(${ANY_CELL})[data-task-processed]`);
  await page.waitForTimeout(1000);
  test.skip(await tasks.count() === 0, 'no [ ]/[x] events in view');
  for (const task of await tasks.all()) {
    await expect(task.locator('.proton-task-checkbox')).toHaveCount(1);
    await expect(task.locator(ANY_TITLE)).not.toHaveText(/^\s*\[/);
  }
});

test.describe('writes', () => {
  test.skip(!process.env.PCT_LIVE_WRITE, 'set PCT_LIVE_WRITE=1 to create and modify real events');

  test.afterEach(async ({ page }) => {
    await page.keyboard.press('Escape');
    await deleteTestEvents(page);
  });

  for (const kind of ['all-day', 'timed']) {
    test(`toggling a ${kind} task auto-saves and survives a reload`, async ({ page }) => {
      const text = `${TEST_PREFIX}${kind}-${Date.now()}`;
      await createEvent(page, `[ ] ${text}`, { allDay: kind === 'all-day' });

      const cellFor = () => page.locator(ANY_CELL)
        .filter({ has: page.locator(ANY_TITLE, { hasText: new RegExp(`^${text}$`) }) });
      await expect(cellFor()).toHaveAttribute('data-task-state', 'todo', { timeout: 15_000 });

      for (const expected of ['done', 'todo']) {
        await cellFor().locator('.proton-task-checkbox').click();
        await expect(cellFor()).toHaveAttribute('data-task-state', expected);
        await expect(cellFor()).toHaveAttribute('data-task-saved-state', expected, { timeout: 15_000 });
        await expect(cellFor()).not.toHaveClass(/proton-task-needs-click/);
        // flips on proton's preview, before the request goes out
        await waitForSave(page);

        await page.reload();
        await expect(cellFor()).toHaveAttribute('data-task-state', expected, { timeout: 30_000 });
      }
    });
  }

  test('hide completed setting from the popup hides [x] events', async ({ page, extContext }) => {
    const text = `${TEST_PREFIX}hide-${Date.now()}`;
    await createEvent(page, `[x] ${text}`, { allDay: true });
    const cellFor = () => page.locator(ANY_CELL)
      .filter({ has: page.locator(ANY_TITLE, { hasText: new RegExp(`^${text}$`) }) });
    await expect(cellFor()).toBeVisible({ timeout: 15_000 });

    const popup = await openPopup(extContext);
    const toggle = popup.locator('#hideCompleted');
    try {
      await toggle.check();
      await expect(cellFor()).toBeHidden();
      await toggle.uncheck();
      await expect(cellFor()).toBeVisible();
    } finally {
      await toggle.uncheck();
      await popup.close();
    }
  });

  test('carry over moves unfinished past tasks to today', async ({ page }) => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const firstDay = await page.locator('.calendar-grid-heading').first().getAttribute('aria-label');
    test.skip(new Date(firstDay.replace(/(\d+)(st|nd|rd|th)/, '$1')).toDateString() === now.toDateString(),
      'today is the first day of the week, so yesterday is not in view');

    const stamp = Date.now();
    const names = [`${TEST_PREFIX}carry-allday-${stamp}`, `${TEST_PREFIX}carry-timed-${stamp}`];
    await createEvent(page, `[ ] ${names[0]}`, { allDay: true, date: iso(yesterday) });
    await createEvent(page, `[-] ${names[1]}`, { date: iso(yesterday) });

    const button = page.locator('#proton-task-carry');
    await expect(button).toHaveText(/^Carry over · \d+$/, { timeout: 15_000 });
    await button.click();
    const panel = page.locator('.proton-task-carry-panel');
    for (const row of await panel.locator('li').all()) {
      const text = await row.textContent();
      if (!names.some((n) => text.includes(n))) await row.getByRole('checkbox').uncheck();
    }
    await panel.getByRole('button', { name: 'Move 2 to today' }).click();
    await expect(panel.getByRole('status')).toHaveText('Moved 2 tasks.', { timeout: 60_000 });
    await waitForSave(page);

    await page.reload();
    const dateOf = (name) => page.locator(ANY_CELL)
      .filter({ has: page.locator(ANY_TITLE, { hasText: new RegExp(`^${name}$`) }) })
      .evaluate((cell) => (cell.querySelector('time')?.textContent
        || cell.closest('[data-testid="calendar-week-day-view:weekday-column"]')?.getAttribute('aria-label')));
    const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const todayLong = now.toLocaleDateString('en-US', { month: 'long' }) + ' ' + now.getDate();
    for (const name of names) {
      await expect.poll(() => dateOf(name), { timeout: 30_000 }).toMatch(new RegExp(`${todayLabel}|${todayLong}(st|nd|rd|th)`));
    }
    await expect(page.locator(ANY_CELL).filter({ hasText: names[1] })).toHaveAttribute('data-task-state', 'doing');
  });

  test('ticking a recurring task only changes that occurrence', async ({ page }) => {
    const name = `${TEST_PREFIX}daily-${Date.now()}`;
    await createEvent(page, `[ ] ${name}`, { allDay: true, daily: true });
    const occurrences = () => page.locator(ANY_CELL)
      .filter({ has: page.locator(ANY_TITLE, { hasText: new RegExp(`^${name}$`) }) });
    await expect(occurrences().nth(1)).toBeVisible({ timeout: 15_000 });
    const count = await occurrences().count();

    await occurrences().first().locator('.proton-task-checkbox').click();
    await expect(occurrences().first()).toHaveAttribute('data-task-saved-state', 'done', { timeout: 15_000 });
    await waitForSave(page);

    await page.reload();
    await expect(occurrences()).toHaveCount(count, { timeout: 30_000 });
    await expect(occurrences().first()).toHaveAttribute('data-task-state', 'done');
    for (let i = 1; i < count; i++) {
      await expect(occurrences().nth(i)).toHaveAttribute('data-task-state', 'todo');
    }
  });
});

