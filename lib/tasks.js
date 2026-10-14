(function (root) {
  'use strict';

  const STATES = ['todo', 'doing', 'done'];

  const MARKERS = { todo: '[ ]', doing: '[-]', done: '[x]' };

  const TASK_PATTERN = /^\s*\[\s*([xX-]?)\s*\]\s*/;

  function parseTitle(title) {
    if (typeof title !== 'string') return null;
    const match = title.match(TASK_PATTERN);
    if (!match) return null;
    const mark = match[1].toLowerCase();
    const state = mark === 'x' ? 'done' : mark === '-' ? 'doing' : 'todo';
    return { state, text: title.slice(match[0].length).trim() };
  }

  function formatTitle(state, text) {
    return `${MARKERS[state] || MARKERS.todo} ${text}`;
  }

  function nextState(state, { cycleInProgress = false } = {}) {
    if (state === 'done') return 'todo';
    if (state === 'doing') return 'done';
    return cycleInProgress ? 'doing' : 'done';
  }

  const isOpen = (state) => state === 'todo' || state === 'doing';

  // dates are local YYYY-MM-DD strings
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const DATE_PATTERN = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i;
  const pad = (n) => String(n).padStart(2, '0');

  // "Mon, Oct 12, 2026" or "Tuesday, October 13th, 2026"
  function parseProtonDate(text) {
    const match = typeof text === 'string' && text.match(DATE_PATTERN);
    if (!match) return null;
    const month = MONTHS.indexOf(match[1].toLowerCase()) + 1;
    return `${match[3]}-${pad(month)}-${pad(Number(match[2]))}`;
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fromISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatInputDate(iso) {
    return fromISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatShortDate(iso) {
    return fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  root.PCTasks = {
    STATES, MARKERS, TASK_PATTERN, parseTitle, formatTitle, nextState, isOpen,
    parseProtonDate, toISODate, fromISODate, formatInputDate, formatShortDate,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
