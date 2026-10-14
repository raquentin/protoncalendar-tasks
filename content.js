(function() {
  'use strict';

  const {
    parseTitle, formatTitle, nextState, isOpen,
    parseProtonDate, toISODate, formatInputDate, formatShortDate,
  } = globalThis.PCTasks;

  // proton opens the popover on mousedown, not click
  const CELL_KINDS = [
    { cell: '.calendar-dayeventcell', clickTarget: '.calendar-dayeventcell-inner', title: '.calendar-dayeventcell-title' },
    { cell: '.calendar-eventcell', clickTarget: null, title: '.calendar-eventcell-title' },
  ];
  const ANY_CELL = CELL_KINDS.map(k => k.cell).join(', ');
  const kindOf = (eventCell) => CELL_KINDS.find(k => eventCell.matches(k.cell));

  const SELECTORS = {
    popoverEdit: 'button[data-testid="event-popover:edit"]',
    titleInput: '#event-title-input',
    dateInput: '#event-date-input',
    saveButton: 'button[data-testid="create-event-modal:save"]',
    recurringOption: 'input[data-testid="update-recurring-popover:update-option-radio"]',
    recurringDialog: '.modal-two-dialog-container',
    todayButton: 'button[data-testid="calendar-toolbar:today"]',
    weekdayColumn: '[data-testid="calendar-week-day-view:weekday-column"]',
  };

  const HIDE_STYLE_ID = 'proton-task-hide-modal';
  const SAVE_DEBOUNCE_MS = 600;

  const settings = {
    cycleInProgress: false,
    autoSave: true,
    hideCompleted: false,
  };

  // svg checkbox icons
  const BOX = '<rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>';
  const ICONS = {
    todo: `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block;">${BOX}</svg>`,
    doing: `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block;">${BOX}
      <path d="M 4.5 8 L 11.5 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
    done: `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block;">${BOX}
      <path d="M 4 8 L 7 11 L 12 5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  };
  const LABELS = { todo: 'not started', doing: 'in progress', done: 'done' };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // not Date.now, tests mock the clock
  async function waitFor(fn, timeout = 1500, interval = 50) {
    const end = performance.now() + timeout;
    for (;;) {
      const result = fn();
      if (result) return result;
      if (performance.now() > end) return null;
      await sleep(interval);
    }
  }

  function renderCheckbox(eventCell) {
    const checkbox = eventCell.querySelector('.proton-task-checkbox');
    if (!checkbox) return;
    const state = eventCell.dataset.taskState;
    checkbox.innerHTML = ICONS[state];
    checkbox.dataset.checked = state === 'done' ? 'true' : 'false';
    checkbox.setAttribute('aria-checked', state === 'done' ? 'true' : state === 'doing' ? 'mixed' : 'false');
    checkbox.title = LABELS[state];
  }

  function createCheckbox(eventCell, titleSpan) {
    const checkbox = document.createElement('span');
    checkbox.className = 'proton-task-checkbox';
    checkbox.setAttribute('role', 'checkbox');
    checkbox.tabIndex = 0;
    titleSpan.parentElement.insertBefore(checkbox, titleSpan);

    // don't open the popover
    const swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      checkbox.addEventListener(type, swallow, true);
    }
    checkbox.addEventListener('click', (e) => {
      swallow(e);
      toggle(eventCell);
    }, true);
    checkbox.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        swallow(e);
        toggle(eventCell);
      }
    }, true);
    return checkbox;
  }

  function clearTask(eventCell) {
    eventCell.querySelector('.proton-task-checkbox')?.remove();
    for (const key of ['taskProcessed', 'taskState', 'taskSavedState', 'taskText', 'pendingTitle']) {
      delete eventCell.dataset[key];
    }
    eventCell.classList.remove('proton-task-needs-click');
  }

  function processEventCell(eventCell) {
    const titleSpan = eventCell.querySelector(kindOf(eventCell).title);
    if (!titleSpan) return;

    const titleText = titleSpan.textContent.trim();

    if (eventCell.dataset.taskProcessed && titleText === eventCell.dataset.taskText) return;

    const parsed = parseTitle(titleText);
    if (!parsed) {
      if (eventCell.dataset.taskProcessed) clearTask(eventCell);
      return;
    }

    eventCell.dataset.taskProcessed = 'true';
    eventCell.dataset.taskText = parsed.text;
    eventCell.dataset.taskSavedState = parsed.state;
    if (!eventCell.dataset.pendingTitle && !eventCell._pctSaveTimer) {
      eventCell.dataset.taskState = parsed.state;
    }
    titleSpan.textContent = parsed.text;

    if (!eventCell.querySelector('.proton-task-checkbox')) {
      createCheckbox(eventCell, titleSpan);
    }
    renderCheckbox(eventCell);
  }

  function processAllEvents() {
    document.querySelectorAll(ANY_CELL).forEach(processEventCell);
    renderCarryButton();
  }

  function toggle(eventCell) {
    eventCell.dataset.taskState = nextState(eventCell.dataset.taskState, settings);
    renderCheckbox(eventCell);

    clearTimeout(eventCell._pctSaveTimer);
    eventCell._pctSaveTimer = setTimeout(() => {
      eventCell._pctSaveTimer = null;
      enqueueSave(eventCell);
    }, SAVE_DEBOUNCE_MS);
  }

  // one modal, one edit at a time
  let editQueue = Promise.resolve();

  function exclusive(fn) {
    const run = editQueue.then(fn).catch((err) => {
      console.warn('[protoncalendar-tasks] edit failed', err);
      return false;
    });
    editQueue = run;
    return run;
  }

  function enqueueSave(eventCell) {
    return exclusive(() => save(eventCell));
  }

  // proton sometimes replaces the cell element
  function reconnect(eventCell) {
    if (eventCell.isConnected) return eventCell;
    const replacement = [...document.querySelectorAll(ANY_CELL)]
      .find(c => c.dataset.taskText === eventCell.dataset.taskText);
    if (!replacement) return null;
    replacement.dataset.taskState = eventCell.dataset.taskState;
    renderCheckbox(replacement);
    return replacement;
  }

  async function save(staleCell) {
    const eventCell = reconnect(staleCell);
    if (!eventCell) return;
    const { taskState, taskSavedState, taskText } = eventCell.dataset;
    if (taskState === taskSavedState) {
      delete eventCell.dataset.pendingTitle;
      eventCell.classList.remove('proton-task-needs-click');
      return;
    }

    const newTitle = formatTitle(taskState, taskText);

    if (settings.autoSave && await openPopover(eventCell)) {
      await editFromPopover({ title: newTitle });
      return;
    }

    eventCell.dataset.pendingTitle = newTitle;
    eventCell.classList.add('proton-task-needs-click');
  }

  function hideModals() {
    document.documentElement.classList.add('proton-task-saving');
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = HIDE_STYLE_ID;
    style.textContent = '.modal-two, [role="dialog"], .eventpopover { opacity: 0 !important; pointer-events: none !important; }';
    document.head.appendChild(style);
  }

  function showModals() {
    document.documentElement.classList.remove('proton-task-saving');
    document.getElementById(HIDE_STYLE_ID)?.remove();
  }

  async function openPopover(eventCell) {
    const { clickTarget } = kindOf(eventCell);
    const target = (clickTarget && eventCell.querySelector(clickTarget)) || eventCell;
    const rect = target.getBoundingClientRect();
    const coords = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      clientX: rect.left + Math.min(rect.width - 2, 40),
      clientY: rect.top + rect.height / 2,
    };

    hideModals();

    const strategies = [
      () => {
        target.dispatchEvent(new PointerEvent('pointerdown', { ...coords, buttons: 1, pointerType: 'mouse', isPrimary: true }));
        target.dispatchEvent(new MouseEvent('mousedown', { ...coords, buttons: 1 }));
        target.dispatchEvent(new PointerEvent('pointerup', { ...coords, buttons: 0, pointerType: 'mouse', isPrimary: true }));
        target.dispatchEvent(new MouseEvent('mouseup', { ...coords, buttons: 0 }));
        target.dispatchEvent(new MouseEvent('click', { ...coords, buttons: 0 }));
      },
      () => {
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      },
    ];

    for (const attempt of strategies) {
      attempt();
      if (await waitFor(() => document.querySelector(SELECTORS.popoverEdit), 700)) return true;
    }

    showModals();
    return false;
  }

  function setInputValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // parses on enter/blur
  function commitDateInput(input, value) {
    input.focus();
    setInputValue(input, value);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    input.blur();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  // "this event" is always first
  async function confirmThisOccurrence() {
    const option = document.querySelector(SELECTORS.recurringOption);
    if (!option) return false;
    if (!option.checked) option.click();
    const dialog = option.closest(SELECTORS.recurringDialog) || option.closest('.modal-two');
    const update = dialog && [...dialog.querySelectorAll('button')].find(b => b.type !== 'reset');
    if (!update) return false;
    await sleep(50);
    update.click();
    return true;
  }

  async function editFromPopover({ title, date }) {
    hideModals();
    try {
      const editButton = await waitFor(() => document.querySelector(SELECTORS.popoverEdit));
      if (!editButton) return false;
      editButton.click();

      const titleInput = await waitFor(() => document.querySelector(SELECTORS.titleInput));
      if (!titleInput) return false;

      if (title !== undefined) setInputValue(titleInput, title);
      if (date !== undefined) {
        const dateInput = document.querySelector(SELECTORS.dateInput);
        if (!dateInput) return false;
        commitDateInput(dateInput, date);
        await sleep(200);
        if (dateInput.value !== date) return false;
      }
      await sleep(100);

      const saveButton = await waitFor(() => document.querySelector(SELECTORS.saveButton));
      if (!saveButton) return false;
      saveButton.click();

      const outcome = await waitFor(() => {
        if (!document.querySelector(SELECTORS.titleInput)) return 'closed';
        if (document.querySelector(SELECTORS.recurringOption)) return 'recurring';
        return null;
      }, 2500);
      if (outcome === 'recurring') await confirmThisOccurrence();

      const closed = await waitFor(() => !document.querySelector(SELECTORS.titleInput), 2500);
      return Boolean(closed);
    } finally {
      showModals();
      setTimeout(processAllEvents, 300);
    }
  }

  // manual fallback
  function setupInterceptor() {
    document.addEventListener('click', async (e) => {
      if (!e.isTrusted) return;
      const eventCell = e.target.closest(ANY_CELL);
      if (!eventCell || !eventCell.dataset.pendingTitle) return;

      const newTitle = eventCell.dataset.pendingTitle;
      delete eventCell.dataset.pendingTitle;
      eventCell.classList.remove('proton-task-needs-click');

      hideModals();
      await exclusive(() => editFromPopover({ title: newTitle }));
    }, true);
  }

  const CARRY_BUTTON_ID = 'proton-task-carry';
  let carryPanel = null;
  let carrying = false;

  function cellDate(eventCell) {
    const time = eventCell.querySelector('time');
    const column = eventCell.closest(SELECTORS.weekdayColumn);
    // datetime attr is a day early on all-day events
    return parseProtonDate(time?.textContent) || parseProtonDate(column?.getAttribute('aria-label'));
  }

  function findOverdueTasks() {
    const today = toISODate(new Date());
    const seen = new Set();
    const tasks = [];
    for (const cell of document.querySelectorAll(ANY_CELL)) {
      const { taskProcessed, taskState, taskSavedState, taskText } = cell.dataset;
      if (!taskProcessed || !isOpen(taskState) || !isOpen(taskSavedState)) continue;
      const date = cellDate(cell);
      if (!date || date >= today) continue;
      const key = `${date}|${taskText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push({ key, date, text: taskText });
    }
    return tasks.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text));
  }

  function findTaskCell(task) {
    return [...document.querySelectorAll(ANY_CELL)]
      .find(c => c.dataset.taskText === task.text && cellDate(c) === task.date);
  }

  function renderCarryButton() {
    const today = [...document.querySelectorAll(SELECTORS.todayButton)].find(b => b.offsetParent !== null);
    let button = document.getElementById(CARRY_BUTTON_ID);
    const count = carrying ? null : findOverdueTasks().length;

    if (!today || (count === 0 && !carryPanel)) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.id = CARRY_BUTTON_ID;
      button.type = 'button';
      button.className = 'button button-medium button-outline-weak shrink-0 proton-task-carry-button';
      button.title = 'Move unfinished tasks from past days';
      button.addEventListener('click', () => (carryPanel ? closeCarryPanel() : openCarryPanel()));
    }
    if (today.nextElementSibling !== button) today.after(button);
    const label = count === null ? 'Carrying over…' : `Carry over · ${count}`;
    if (button.textContent !== label) button.textContent = label;
  }

  function closeCarryPanel() {
    if (carrying) return;
    carryPanel?.remove();
    carryPanel = null;
    document.removeEventListener('mousedown', onOutsideMousedown, true);
    document.removeEventListener('keydown', onPanelKeydown, true);
    renderCarryButton();
  }

  function onOutsideMousedown(e) {
    if (!e.isTrusted || carrying) return;
    if (carryPanel?.contains(e.target) || e.target.closest?.(`#${CARRY_BUTTON_ID}`)) return;
    closeCarryPanel();
  }

  function onPanelKeydown(e) {
    if (e.key === 'Escape' && !carrying) {
      e.stopPropagation();
      closeCarryPanel();
    }
  }

  function openCarryPanel() {
    const button = document.getElementById(CARRY_BUTTON_ID);
    if (!button) return;
    const tasks = findOverdueTasks();
    const today = toISODate(new Date());

    // not role=dialog, hideModals would hide it
    carryPanel = document.createElement('div');
    carryPanel.className = 'proton-task-carry-panel';
    carryPanel.setAttribute('role', 'region');
    carryPanel.setAttribute('aria-label', 'Carry over unfinished tasks');
    carryPanel.innerHTML = `
      <div class="proton-task-carry-heading">Carry over unfinished tasks</div>
      <ul class="proton-task-carry-list"></ul>
      <label class="proton-task-carry-date">Move to <input type="date" required></label>
      <p class="proton-task-carry-hint">Only tasks in the current view. Switch to month view to catch older ones.</p>
      <div class="proton-task-carry-status" role="status"></div>
      <div class="proton-task-carry-actions">
        <button type="button" class="button button-small button-outline-weak" data-action="cancel">Cancel</button>
        <button type="button" class="button button-small button-solid-norm" data-action="move">Move</button>
      </div>`;

    const list = carryPanel.querySelector('.proton-task-carry-list');
    for (const task of tasks) {
      const item = document.createElement('li');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.dataset.key = task.key;
      const text = document.createElement('span');
      text.textContent = task.text;
      const date = document.createElement('small');
      date.textContent = formatShortDate(task.date);
      label.append(checkbox, text, date);
      item.append(label);
      list.append(item);
    }

    const dateInput = carryPanel.querySelector('input[type="date"]');
    dateInput.value = today;
    dateInput.min = today;

    const moveButton = carryPanel.querySelector('[data-action="move"]');
    const updateMoveLabel = () => {
      const n = list.querySelectorAll('input:checked').length;
      moveButton.textContent = n ? `Move ${n} to ${dateInput.value === today ? 'today' : formatShortDate(dateInput.value)}` : 'Move';
      moveButton.disabled = !n || !dateInput.value || dateInput.value < today;
    };
    list.addEventListener('change', updateMoveLabel);
    dateInput.addEventListener('input', updateMoveLabel);
    updateMoveLabel();

    carryPanel.querySelector('[data-action="cancel"]').addEventListener('click', closeCarryPanel);
    moveButton.addEventListener('click', () => {
      const keys = new Set([...list.querySelectorAll('input:checked')].map(i => i.dataset.key));
      carryOver(tasks.filter(t => keys.has(t.key)), dateInput.value);
    });

    const rect = button.getBoundingClientRect();
    carryPanel.style.top = `${rect.bottom + 6}px`;
    carryPanel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 348))}px`;
    document.body.appendChild(carryPanel);
    document.addEventListener('mousedown', onOutsideMousedown, true);
    document.addEventListener('keydown', onPanelKeydown, true);
  }

  async function carryOver(tasks, date) {
    if (!tasks.length || !date) return;
    const panel = carryPanel;
    const status = panel.querySelector('.proton-task-carry-status');
    panel.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
    carrying = true;
    renderCarryButton();

    const failed = [];
    for (const [i, task] of tasks.entries()) {
      status.textContent = `Moving ${i + 1} of ${tasks.length}…`;
      const ok = await exclusive(async () => {
        const cell = findTaskCell(task);
        return Boolean(cell) && await openPopover(cell) && editFromPopover({ date: formatInputDate(date) });
      });
      if (!ok) failed.push(task.text);
      await sleep(300);
    }

    carrying = false;
    const moved = tasks.length - failed.length;
    status.textContent = failed.length
      ? `Moved ${moved}. Couldn't move: ${failed.join(', ')}`
      : `Moved ${moved} task${moved === 1 ? '' : 's'}.`;
    panel.querySelector('[data-action="cancel"]').disabled = false;
    panel.querySelector('[data-action="cancel"]').textContent = 'Close';
    processAllEvents();
    if (!failed.length) setTimeout(() => { if (carryPanel === panel) closeCarryPanel(); }, 1200);
  }

  function setupObserver() {
    // rAF stalls in background tabs
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        processAllEvents();
      }, 30);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return observer;
  }

  function applySettings() {
    document.documentElement.classList.toggle('proton-task-hide-done', Boolean(settings.hideCompleted));
  }

  function loadSettings() {
    const storage = globalThis.chrome?.storage;
    if (!storage?.sync) return;
    storage.sync.get(settings, (stored) => {
      Object.assign(settings, stored);
      applySettings();
    });
    storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in settings) settings[key] = newValue;
      }
      applySettings();
    });
  }

  function init() {
    loadSettings();
    processAllEvents();
    setupObserver();
    setupInterceptor();
    setInterval(processAllEvents, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
