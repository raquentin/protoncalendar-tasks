const DEFAULTS = { autoSave: true, cycleInProgress: false, hideCompleted: false };

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const [key, value] of Object.entries(settings)) {
    const input = document.getElementById(key);
    if (!input) continue;
    input.checked = value;
    input.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: input.checked });
    });
  }
});

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;
