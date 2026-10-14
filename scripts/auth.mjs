// log in once; the session is kept in .auth/profile
import launch from '../tests/live/launch.js';

const { launchWithExtension, CALENDAR_URL, PROFILE_DIR } = launch;

const context = await launchWithExtension({ headless: false });
const page = context.pages()[0] || await context.newPage();
await page.goto(CALENDAR_URL);

console.log('log in to proton in the browser window (tick "keep me signed in").');
console.log('once your calendar is showing, close the window.');

await page.waitForURL(/calendar\.proton\.me\/u\/\d+/, { timeout: 0 }).catch(() => {});
await new Promise((resolve) => context.on('close', resolve));
console.log(`saved login to ${PROFILE_DIR}`);
