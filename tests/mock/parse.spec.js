const { test, expect } = require('@playwright/test');
require('../../lib/tasks.js');

const { parseTitle, formatTitle, nextState, parseProtonDate, formatInputDate, toISODate } = globalThis.PCTasks;

test.describe('parseTitle', () => {
  const cases = [
    ['[ ] buy milk', { state: 'todo', text: 'buy milk' }],
    ['[] buy milk', { state: 'todo', text: 'buy milk' }],
    ['[  ] buy milk', { state: 'todo', text: 'buy milk' }],
    ['[x] buy milk', { state: 'done', text: 'buy milk' }],
    ['[X] buy milk', { state: 'done', text: 'buy milk' }],
    ['[-] buy milk', { state: 'doing', text: 'buy milk' }],
    ['  [ ]buy milk', { state: 'todo', text: 'buy milk' }],
    ['[x] [ ] nested', { state: 'done', text: '[ ] nested' }],
  ];
  for (const [input, expected] of cases) {
    test(JSON.stringify(input), () => {
      expect(parseTitle(input)).toEqual(expected);
    });
  }

  for (const input of ['buy milk', '[y] nope', 'x [ ] later', '[[ ]]', '', null]) {
    test(`not a task: ${JSON.stringify(input)}`, () => {
      expect(parseTitle(input)).toBeNull();
    });
  }
});

test('formatTitle round-trips', () => {
  for (const state of ['todo', 'doing', 'done']) {
    expect(parseTitle(formatTitle(state, 'a task'))).toEqual({ state, text: 'a task' });
  }
});

test('nextState', () => {
  expect(nextState('todo')).toBe('done');
  expect(nextState('done')).toBe('todo');
  expect(nextState('doing')).toBe('done');
  const cycle = { cycleInProgress: true };
  expect(nextState('todo', cycle)).toBe('doing');
  expect(nextState('doing', cycle)).toBe('done');
  expect(nextState('done', cycle)).toBe('todo');
});

test('parseProtonDate', () => {
  expect(parseProtonDate('Mon, Oct 12, 2026')).toBe('2026-10-12');
  expect(parseProtonDate('Tuesday, October 13th, 2026')).toBe('2026-10-13');
  expect(parseProtonDate('Friday, May 1st, 2026')).toBe('2026-05-01');
  expect(parseProtonDate('Sept. 2, 2027')).toBe('2027-09-02');
  expect(parseProtonDate('10:30pm - 11pm')).toBeNull();
  expect(parseProtonDate(undefined)).toBeNull();
});

test('formatInputDate matches proton\'s date input', () => {
  expect(formatInputDate('2026-10-12')).toBe('Oct 12, 2026');
  expect(formatInputDate('2027-01-05')).toBe('Jan 5, 2027');
  expect(toISODate(new Date(2026, 0, 9))).toBe('2026-01-09');
});
