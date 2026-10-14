const { test, expect } = require('@playwright/test');
const { loadCalendar, cell } = require('./helpers');

// today is 2026-10-14
const EVENTS = [
  { id: 'mon', title: '[ ] email landlord', date: '2026-10-12' },
  { id: 'tue', title: '[-] draft essay', date: '2026-10-13' },
  { id: 'tue-done', title: '[x] laundry', date: '2026-10-13' },
  { id: 'tue-plain', title: 'dentist', date: '2026-10-13' },
  { id: 'today', title: '[ ] today task', date: '2026-10-14' },
  { id: 'future', title: '[ ] future task', date: '2026-10-16' },
];

const carryButton = (page) => page.locator('#proton-task-carry');
const panel = (page) => page.locator('.proton-task-carry-panel');
const moves = (page) => page.evaluate(() => window.__mock.moves);

test('button counts unfinished tasks before today', async ({ page }) => {
  await loadCalendar(page, { events: EVENTS });
  await expect(carryButton(page)).toHaveText('Carry over · 2');
  await expect(page.locator('[data-testid="calendar-toolbar:today"] + #proton-task-carry')).toHaveCount(1);
});

test('no button when nothing is overdue', async ({ page }) => {
  await loadCalendar(page, { events: EVENTS.filter(e => !['mon', 'tue'].includes(e.id)) });
  await page.waitForTimeout(300);
  await expect(carryButton(page)).toHaveCount(0);
});

test('moves every overdue task to today', async ({ page }) => {
  await loadCalendar(page, { events: EVENTS });
  await carryButton(page).click();
  await expect(panel(page).locator('li')).toHaveText([/email landlord/, /draft essay/]);
  const move = panel(page).getByRole('button', { name: 'Move 2 to today' });
  await move.click();

  await expect.poll(() => moves(page), { timeout: 15_000 }).toEqual([
    { id: 'mon', from: '2026-10-12', to: '2026-10-14' },
    { id: 'tue', from: '2026-10-13', to: '2026-10-14' },
  ]);
  await expect(cell(page, 'tue')).toHaveAttribute('data-task-state', 'doing');
  await expect(cell(page, 'tue').locator('.calendar-dayeventcell-title')).toHaveText('draft essay');
  await expect(panel(page)).toHaveCount(0, { timeout: 5000 });
  await expect(carryButton(page)).toHaveCount(0);
  await expect(page.locator('.modal-two, .eventpopover')).toHaveCount(0);
});

test('only moves ticked tasks, to a chosen date', async ({ page }) => {
  await loadCalendar(page, { events: EVENTS });
  await carryButton(page).click();
  await panel(page).getByRole('checkbox').first().uncheck();
  await panel(page).locator('input[type="date"]').fill('2026-10-20');
  await panel(page).getByRole('button', { name: /^Move 1 to / }).click();

  await expect.poll(() => moves(page), { timeout: 10_000 }).toEqual([
    { id: 'tue', from: '2026-10-13', to: '2026-10-20' },
  ]);
  await expect(carryButton(page)).toHaveText('Carry over · 1');
});

test('cannot move into the past', async ({ page }) => {
  await loadCalendar(page, { events: EVENTS });
  await carryButton(page).click();
  await panel(page).locator('input[type="date"]').fill('2026-10-01');
  await expect(panel(page).locator('[data-action="move"]')).toBeDisabled();
});

test('timed tasks take their date from the day column', async ({ page }) => {
  await loadCalendar(page, { events: [{ id: 't', title: '[ ] standup notes', date: '2026-10-13', timed: true }] });
  await expect(carryButton(page)).toHaveText('Carry over · 1');
  await carryButton(page).click();
  await panel(page).getByRole('button', { name: 'Move 1 to today' }).click();
  await expect.poll(() => moves(page), { timeout: 10_000 }).toEqual([
    { id: 't', from: '2026-10-13', to: '2026-10-14' },
  ]);
  await expect(cell(page, 't').locator('xpath=..')).toHaveAttribute('aria-label', 'Wednesday, October 14th, 2026');
});

test('recurring tasks move just that occurrence', async ({ page }) => {
  await loadCalendar(page, { events: [{ id: 'r', title: '[ ] water plants', date: '2026-10-12', recurring: true }] });
  await carryButton(page).click();
  await panel(page).getByRole('button', { name: 'Move 1 to today' }).click();
  await expect.poll(() => moves(page), { timeout: 10_000 }).toEqual([
    { id: 'r', from: '2026-10-12', to: '2026-10-14' },
  ]);
  expect(await page.evaluate(() => window.__mock.recurringScopes)).toEqual(['this']);
});

test('escape and outside clicks close the panel', async ({ page }) => {
  await loadCalendar(page, { events: EVENTS });
  await carryButton(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);

  await carryButton(page).click();
  await page.mouse.click(5, 400);
  await expect(panel(page)).toHaveCount(0);
});

test('reports tasks it could not move', async ({ page }) => {
  await loadCalendar(page, { events: EVENTS, popoverMode: 'trusted' });
  await carryButton(page).click();
  await panel(page).getByRole('button', { name: 'Move 2 to today' }).click();
  await expect(panel(page).getByRole('status')).toHaveText(/Moved 0\. Couldn't move: email landlord, draft essay/, { timeout: 15_000 });
  await expect(panel(page).getByRole('button', { name: 'Close' })).toBeEnabled();
});
