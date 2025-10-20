# protoncalendar-tasks

fulfills [a promise that Proton has ignored for three years](https://proton.me/blog/proton-mail-calendar-roadmap): tasks in the calendar.

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

1. Create an all-day event in Proton Calendar
2. Start the event name with:
   - `[ ]` for an unchecked task
   - `[x]` for a completed task
4. Click the checkbox to toggle, then quickly click the event again to save