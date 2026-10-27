'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStats } = require('../src/main/stats');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 20, 15, 0).getTime();

test('computeStats soma palavras, calcula WPM e tempo economizado', () => {
  const history = [
    { ts: now - 1000, words: 150, durationMs: 60000, app: 'Slack' },
    { ts: now - 2000, words: 150, durationMs: 60000, app: 'Outlook' },
  ];
  const stats = computeStats(history, now);
  assert.equal(stats.words, 300);
  assert.equal(stats.wpm, 150);
  assert.equal(stats.savedMinutes, Math.round(300 / 40 - 2));
  assert.equal(stats.dictations, 2);
});

test('sequência conta dias seguidos e tolera ainda não ter ditado hoje', () => {
  const history = [
    { ts: now - 1 * DAY, words: 1, durationMs: 1000 },
    { ts: now - 2 * DAY, words: 1, durationMs: 1000 },
    { ts: now - 4 * DAY, words: 1, durationMs: 1000 },
  ];
  assert.equal(computeStats(history, now).streak, 2);
  assert.equal(computeStats([], now).streak, 0);
});

test('daily traz os últimos 7 dias, do mais antigo até hoje', () => {
  const history = [
    { ts: now - 1000, words: 10 },
    { ts: now - 2000, words: 5 },
    { ts: now - 3 * DAY, words: 7 },
    { ts: now - 9 * DAY, words: 99 },
  ];
  const { daily } = computeStats(history, now);
  assert.equal(daily.length, 7);
  assert.deepEqual(
    daily.map((d) => d.words),
    [0, 0, 0, 7, 0, 0, 15],
  );
});
