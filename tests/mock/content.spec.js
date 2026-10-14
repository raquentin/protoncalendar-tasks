const { test, expect } = require('@playwright/test');
const { loadCalendar, cell, saves, setSetting } = require('./helpers');

const EVENTS = [
  { id: 'todo', title: '[ ] write proofs' },
  { id: 'nospace', title: '[] no space' },
  { id: 'done', title: '[x] already done' },
  { id: 'doing', title: '[-] halfway' },
  { id: 'plain', title: 'dentist' },
];

test.describe('rendering', () => {
  test.beforeEach(({ page }) => loadCalendar(page, { events: EVENTS }));

  test('adds checkboxes to task events and strips the prefix', async ({ page }) => {
    for (const [id, text, state] of [
      ['todo', 'write proofs', 'todo'],
      ['nospace', 'no space', 'todo'],
      ['done', 'already done', 'done'],
      ['doing', 'halfway', 'doing'],
    ]) {
      const c = cell(page, id);
      await expect(c.locator('.proton-task-checkbox')).toHaveCount(1);
      await expect(c.locator('.calendar-dayeventcell-title')).toHaveText(text);
      await expect(c).toHaveAttribute('data-task-state', state);
    }
  });

  test('leaves non-task events alone', async ({ page }) => {
    const c = cell(page, 'plain');
    await expect(c.locator('.calendar-dayeventcell-title')).toHaveText('dentist');
    await expect(c.locator('.proton-task-checkbox')).toHaveCount(0);
  });

  test('done tasks are struck through', async ({ page }) => {
    const title = cell(page, 'done').locator('.calendar-dayeventcell-title');
    await expect(title).toHaveCSS('text-decoration-line', 'line-through');
  });

  test('checkbox exposes aria state', async ({ page }) => {
    await expect(cell(page, 'todo').locator('.proton-task-checkbox')).toHaveAttribute('aria-checked', 'false');
    await expect(cell(page, 'doing').locator('.proton-task-checkbox')).toHaveAttribute('aria-checked', 'mixed');
    await expect(cell(page, 'done').locator('.proton-task-checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  test('removes the checkbox when the event is renamed to a non-task', async ({ page }) => {
    await page.evaluate(() => window.__mock.rename('todo', 'not a task anymore'));
    const c = cell(page, 'todo');
    await expect(c.locator('.proton-task-checkbox')).toHaveCount(0);
    await expect(c.locator('.calendar-dayeventcell-title')).toHaveText('not a task anymore');
  });

  test('picks up a title changed from elsewhere', async ({ page }) => {
    await page.evaluate(() => window.__mock.rename('todo', '[x] write proofs'));
    await expect(cell(page, 'todo')).toHaveAttribute('data-task-state', 'done');
    await expect(cell(page, 'todo').locator('.calendar-dayeventcell-title')).toHaveText('write proofs');
  });
});

test.describe('auto-save', () => {
  test('clicking the checkbox saves without further interaction', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS });
    const c = cell(page, 'todo');
    await c.locator('.proton-task-checkbox').click();

    await expect(c).toHaveAttribute('data-task-state', 'done');
    await expect.poll(() => saves(page)).toEqual([{ id: 'todo', title: '[x] write proofs' }]);

    await expect(c).toHaveAttribute('data-task-saved-state', 'done');
    await expect(c.locator('.calendar-dayeventcell-title')).toHaveText('write proofs');
    await expect(page.locator('.modal-two, .eventpopover')).toHaveCount(0);
    await expect(page.locator('#proton-task-hide-modal')).toHaveCount(0);
  });

  test('unchecking a done task saves [ ]', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS });
    await cell(page, 'done').locator('.proton-task-checkbox').click();
    await expect.poll(() => saves(page)).toEqual([{ id: 'done', title: '[ ] already done' }]);
  });

  test('rapid double toggle does not save', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS });
    const box = cell(page, 'todo').locator('.proton-task-checkbox');
    await box.click();
    await box.click();
    await page.waitForTimeout(1500);
    expect(await saves(page)).toEqual([]);
    expect(await page.evaluate(() => window.__mock.popoverOpens)).toBe(0);
  });

  test('toggling two tasks saves both, one at a time', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS });
    await cell(page, 'todo').locator('.proton-task-checkbox').click();
    await cell(page, 'nospace').locator('.proton-task-checkbox').click();
    await expect.poll(() => saves(page), { timeout: 10_000 }).toEqual([
      { id: 'todo', title: '[x] write proofs' },
      { id: 'nospace', title: '[x] no space' },
    ]);
  });

  test('cycle setting goes through in progress', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS }, { cycleInProgress: true });
    const c = cell(page, 'todo');
    await c.locator('.proton-task-checkbox').click();
    await expect(c).toHaveAttribute('data-task-state', 'doing');
    await expect.poll(() => saves(page)).toEqual([{ id: 'todo', title: '[-] write proofs' }]);
  });

  test('keyboard toggles the focused checkbox', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS });
    await cell(page, 'todo').locator('.proton-task-checkbox').focus();
    await page.keyboard.press('Space');
    await expect.poll(() => saves(page)).toEqual([{ id: 'todo', title: '[x] write proofs' }]);
  });

  test('recurring events update just this occurrence', async ({ page }) => {
    await loadCalendar(page, { events: [{ id: 'r', title: '[ ] weekly', recurring: true }] });
    await cell(page, 'r').locator('.proton-task-checkbox').click();
    await expect.poll(() => saves(page)).toEqual([{ id: 'r', title: '[x] weekly' }]);
    expect(await page.evaluate(() => window.__mock.recurringScopes)).toEqual(['this']);
    await expect(page.locator('.modal-two')).toHaveCount(0);
    await expect(page.locator('#proton-task-hide-modal')).toHaveCount(0);
  });
});

test.describe('manual fallback', () => {
  // issue #1
  test.beforeEach(({ page }) => loadCalendar(page, { events: EVENTS, popoverMode: 'trusted' }));

  test('asks for a click when the popover cannot be opened, then saves', async ({ page }) => {
    const c = cell(page, 'todo');
    await c.locator('.proton-task-checkbox').click();
    await expect(c).toHaveClass(/proton-task-needs-click/, { timeout: 5000 });
    expect(await saves(page)).toEqual([]);

    await c.locator('.calendar-dayeventcell-title').click();
    await expect.poll(() => saves(page)).toEqual([{ id: 'todo', title: '[x] write proofs' }]);
    await expect(c).not.toHaveClass(/proton-task-needs-click/);
    await expect(c).toHaveAttribute('data-task-saved-state', 'done');
  });
});

test.describe('settings', () => {
  test('hide completed hides saved [x] events, all-day and timed', async ({ page }) => {
    await loadCalendar(page, { events: [...EVENTS, { id: 't', title: '[x] timed done', timed: true }] }, { hideCompleted: true });
    await expect(cell(page, 'done')).toBeHidden();
    await expect(cell(page, 't')).toBeHidden();
    for (const id of ['todo', 'nospace', 'doing', 'plain']) await expect(cell(page, id)).toBeVisible();
  });

  test('hide completed hides a task only after it is saved', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS }, { hideCompleted: true });
    const c = cell(page, 'todo');
    await c.locator('.proton-task-checkbox').click();
    await expect(c).toHaveAttribute('data-task-state', 'done');
    await expect(c).toBeVisible();
    await expect.poll(() => saves(page)).toEqual([{ id: 'todo', title: '[x] write proofs' }]);
    await expect(c).toBeHidden();
  });

  test('hide completed can be toggled from the popup without reloading', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS });
    await expect(cell(page, 'done')).toBeVisible();
    await setSetting(page, 'hideCompleted', true);
    await expect(cell(page, 'done')).toBeHidden();
    await setSetting(page, 'hideCompleted', false);
    await expect(cell(page, 'done')).toBeVisible();
  });

  test('autoSave off always waits for a click', async ({ page }) => {
    await loadCalendar(page, { events: EVENTS }, { autoSave: false });
    const c = cell(page, 'todo');
    await c.locator('.proton-task-checkbox').click();
    await expect(c).toHaveClass(/proton-task-needs-click/);
    expect(await page.evaluate(() => window.__mock.popoverOpens)).toBe(0);
  });
});

test.describe('timed events', () => {
  const TIMED = [
    { id: 't1', title: '[ ] standup', timed: true },
    { id: 't2', title: 'lunch', timed: true },
  ];

  test('get checkboxes and keep the time string', async ({ page }) => {
    await loadCalendar(page, { events: TIMED });
    const c = cell(page, 't1');
    await expect(c.locator('.proton-task-checkbox')).toHaveCount(1);
    await expect(c.locator('.calendar-eventcell-title')).toHaveText('standup');
    await expect(c.locator('.calendar-eventcell-timestring')).toHaveText('10:30pm - 11pm');
    await expect(cell(page, 't2').locator('.proton-task-checkbox')).toHaveCount(0);
  });

  test('auto-save works on the cell itself', async ({ page }) => {
    await loadCalendar(page, { events: TIMED });
    const c = cell(page, 't1');
    await c.locator('.proton-task-checkbox').click();
    await expect.poll(() => saves(page)).toEqual([{ id: 't1', title: '[x] standup' }]);
    await expect(c).toHaveAttribute('data-task-saved-state', 'done');
    await expect(c.locator('.calendar-eventcell-title')).toHaveCSS('text-decoration-line', 'line-through');
  });

  test('manual fallback works on timed cells', async ({ page }) => {
    await loadCalendar(page, { events: TIMED, popoverMode: 'trusted' });
    const c = cell(page, 't1');
    await c.locator('.proton-task-checkbox').click();
    await expect(c).toHaveClass(/proton-task-needs-click/, { timeout: 5000 });
    await c.locator('.calendar-eventcell-title').click();
    await expect.poll(() => saves(page)).toEqual([{ id: 't1', title: '[x] standup' }]);
  });
});
