# protoncalendar-tasks

fulfills a promise that [Proton has ignored for three years](https://proton.me/blog/proton-mail-calendar-roadmap): tasks in the calendar.

![protoncalendar-tasks](https://github.com/user-attachments/assets/13ced99e-3a46-4213-8da3-1850d29baa37)

## Installation

### Chromium, Edge, Brave

1. Download this repository (green "Code" button → Download ZIP)
2. Unzip the folder somewhere on your computer
3. Open your browser and go to `chrome://extensions/`
4. Turn on "Developer mode" (toggle in top right corner)
5. Click "Load unpacked" button
6. Select the folder you unzipped

### LibreWolf, FireFox

1. Download and unzip (same as above)
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Navigate to the folder and select `manifest.json`

Note: The extension will be removed when you close Firefox. For permanent installation, Firefox requires extension signing.

## Usage

1. Create an event in Proton Calendar
2. Start the event name with:
   - `[ ]` for an unchecked task
   - `[-]` for an in-progress task
   - `[x]` for a completed task
3. Click the checkbox to toggle

Unfinished tasks from past days can be moved with **Carry over** next to **Today**.

## Development

```sh
nix develop
npm install
npm test                             # offline, against a mock calendar
npm run auth                         # log in once
npm run test:live                    # read-only, against the real calendar
PCT_LIVE_WRITE=1 npm run test:live   # also creates and deletes pct-* events
```
