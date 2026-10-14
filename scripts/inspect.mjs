// dumps the live calendar's dom into .inspect/, for fixing selectors
import fs from 'fs';
import path from 'path';
import launch from '../tests/live/launch.js';

const { launchWithExtension, openCalendar, ROOT } = launch;
const OUT = path.join(ROOT, '.inspect');
fs.mkdirSync(OUT, { recursive: true });

const context = await launchWithExtension({ headless: !process.argv.includes('--headed') });
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), data);
  console.log(`  ${path.join('.inspect', name)}`);
};

try {
  const page = await openCalendar(context);
  await page.waitForTimeout(2000);

  console.log('writing:');
  await page.screenshot({ path: path.join(OUT, 'calendar.png') });
  console.log('  .inspect/calendar.png');

  const report = await page.evaluate(() => {
    const html = (el) => el ? el.outerHTML : null;
    const classes = new Set();
    document.querySelectorAll('[class*="eventcell"], [class*="event-cell"], [class*="calendar-event"]')
      .forEach((el) => el.classList.forEach((c) => /event/i.test(c) && classes.add(c)));
    return {
      url: location.href,
      eventClasses: [...classes].sort(),
      allDayCells: document.querySelectorAll('.calendar-dayeventcell').length,
      taskCells: document.querySelectorAll('[data-task-processed]').length,
      checkboxes: document.querySelectorAll('.proton-task-checkbox').length,
      firstAllDay: html(document.querySelector('.calendar-dayeventcell')),
      firstTask: html(document.querySelector('[data-task-processed]')),
      firstTimed: html(document.querySelector('.calendar-eventcell')),
    };
  });
  write('report.json', JSON.stringify(report, null, 2));

  const first = page.locator('.calendar-dayeventcell-inner').first();
  if (await first.count()) {
    await first.click();
    const edit = page.locator('button[data-testid="event-popover:edit"]');
    await edit.waitFor({ timeout: 5000 }).catch(() => {});
    write('popover.html', await page.locator('.eventpopover, [role="dialog"]').first().evaluate((el) => el.outerHTML).catch(() => 'not found'));
    if (await edit.count()) {
      await edit.click();
      await page.locator('#event-title-input').waitFor({ timeout: 5000 }).catch(() => {});
      write('modal.html', await page.locator('.modal-two, [role="dialog"]').first().evaluate((el) => el.outerHTML).catch(() => 'not found'));
      await page.screenshot({ path: path.join(OUT, 'modal.png') });
      // never save
      await page.keyboard.press('Escape');
    }
  }
  console.log(`\n${report.allDayCells} all-day events, ${report.checkboxes} checkboxes rendered`);
} finally {
  await context.close();
}
