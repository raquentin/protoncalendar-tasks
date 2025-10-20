(function() {
  'use strict';

  const UNCHECKED_PATTERN = /^\[\s*\]\s*/;
  const CHECKED_PATTERN = /^\[x\]\s*/i;
  const ANY_TASK_PATTERN = /^\[[\sx]\]\s*/i;

  // svg checkbox icons
  const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block;">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M 4 8 L 7 11 L 12 5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  
  const UNCHECK_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block;">
    <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
  </svg>`;

  function processEventCell(eventCell) {
    const titleSpan = eventCell.querySelector('.calendar-dayeventcell-title');
    if (!titleSpan) return;

    const titleText = titleSpan.textContent.trim();
    
    if (!ANY_TASK_PATTERN.test(titleText)) {
      return;
    }

    const isChecked = CHECKED_PATTERN.test(titleText);
    const taskText = titleText.replace(ANY_TASK_PATTERN, '').trim();

    // check if already has checkbox
    let checkbox = eventCell.querySelector('.proton-task-checkbox');
    if (checkbox) {
      // update existing checkbox and title (handles reprocessing after save)
      titleSpan.textContent = taskText;
      checkbox.innerHTML = isChecked ? CHECK_SVG : UNCHECK_SVG;
      checkbox.dataset.checked = isChecked ? 'true' : 'false';
      if (isChecked) {
        titleSpan.style.textDecoration = 'line-through';
        titleSpan.style.opacity = '0.6';
      } else {
        titleSpan.style.textDecoration = 'none';
        titleSpan.style.opacity = '1';
      }
      return;
    }

    eventCell.dataset.taskProcessed = 'true';

    checkbox = document.createElement('span');
    checkbox.className = 'proton-task-checkbox';
    checkbox.innerHTML = isChecked ? CHECK_SVG : UNCHECK_SVG;
    checkbox.dataset.checked = isChecked ? 'true' : 'false';

    // remove the [ ] or [x] from the title
    titleSpan.textContent = taskText;
    if (isChecked) {
      titleSpan.style.textDecoration = 'line-through';
      titleSpan.style.opacity = '0.6';
    }

    const container = titleSpan.parentElement;
    container.insertBefore(checkbox, titleSpan);

    // only checkbox is clickable, prevent event modal from opening
    checkbox.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const currentChecked = checkbox.dataset.checked === 'true';
      const newChecked = !currentChecked;
      
      // update ui immediately
      checkbox.innerHTML = newChecked ? CHECK_SVG : UNCHECK_SVG;
      checkbox.dataset.checked = newChecked ? 'true' : 'false';
      
      if (newChecked) {
        titleSpan.style.textDecoration = 'line-through';
        titleSpan.style.opacity = '0.6';
      } else {
        titleSpan.style.textDecoration = 'none';
        titleSpan.style.opacity = '1';
      }
      
      // store current state for pending update (use current title text)
      const currentTaskText = titleSpan.textContent.trim();
      const newTitle = newChecked ? `[x] ${currentTaskText}` : `[ ] ${currentTaskText}`;
      eventCell.dataset.pendingTitle = newTitle;
    }, true);
  }

  // intercept clicks to handle auto-save
  function setupInterceptor() {
    document.addEventListener('click', async (e) => {
      const eventCell = e.target.closest('.calendar-dayeventcell');
      if (!eventCell || !eventCell.dataset.pendingTitle) return;
      
      const newTitle = eventCell.dataset.pendingTitle;
      delete eventCell.dataset.pendingTitle;
      
      // hide modals
      const hideStyle = document.createElement('style');
      hideStyle.id = 'proton-task-hide-modal';
      hideStyle.textContent = '.modal-two, [role="dialog"], .eventpopover { opacity: 0 !important; pointer-events: none !important; }';
      document.head.appendChild(hideStyle);
      
      try {
        // wait for popover
        await new Promise(resolve => setTimeout(resolve, 400));
        
        const editButton = document.querySelector('button[data-testid="event-popover:edit"]');
        if (!editButton) return;
        
        editButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const titleInput = document.querySelector('#event-title-input');
        if (!titleInput) return;
        
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(titleInput, newTitle);
        
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        const saveButton = document.querySelector('button[data-testid="create-event-modal:save"]');
        if (!saveButton) return;
        
        saveButton.click();
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } finally {
        const style = document.getElementById('proton-task-hide-modal');
        if (style) style.remove();
        
        setTimeout(() => processAllEvents(), 1500);
      }
    }, true);
  }

  function processAllEvents() {
    const eventCells = document.querySelectorAll('.calendar-dayeventcell');
    eventCells.forEach(processEventCell);
  }

  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0 || 
            mutation.type === 'characterData' || 
            mutation.type === 'childList') {
          shouldProcess = true;
          break;
        }
      }
      
      if (shouldProcess) {
        processAllEvents();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return observer;
  }

  function init() {
    processAllEvents();
    setupObserver();
    setupInterceptor();
    setInterval(processAllEvents, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
