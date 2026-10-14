const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURE = 'file://' + path.join(ROOT, 'tests', 'fixtures', 'calendar.html');
const TODAY = '2026-10-14';

async function loadCalendar(page, config, settings = {}) {
  await page.addInitScript(({ config, settings }) => {
    window.__mockConfig = config;
    window.chrome = window.chrome || {};
    const listeners = [];
    window.chrome.storage = {
      sync: { get: (defaults, cb) => cb({ ...defaults, ...settings }) },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    };
    window.__setSetting = (key, value) => {
      settings[key] = value;
      listeners.forEach(fn => fn({ [key]: { newValue: value } }, 'sync'));
    };
  }, { config, settings });

  await page.clock.setFixedTime(new Date(`${config.today || TODAY}T10:00:00`));
  await page.goto(FIXTURE);
  await page.addStyleTag({ path: path.join(ROOT, 'styles.css') });
  await page.addScriptTag({ path: path.join(ROOT, 'lib', 'tasks.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'content.js') });
}

const cell = (page, id) => page.locator(`[data-event-id="${id}"]`);

const saves = (page) => page.evaluate(() => window.__mock.saves);

const setSetting = (page, key, value) => page.evaluate(([k, v]) => window.__setSetting(k, v), [key, value]);

module.exports = { ROOT, loadCalendar, cell, saves, setSetting };
