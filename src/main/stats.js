'use strict';

const TYPING_WPM = 40; // velocidade média de digitação usada para estimar o tempo economizado
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function computeStats(history, now = Date.now()) {
  let words = 0;
  let speechMs = 0;
  let weekWords = 0;
  const days = new Set();
  const perApp = new Map();
  const perDay = new Map();

  for (const item of history) {
    words += item.words || 0;
    speechMs += item.durationMs || 0;
    if (now - item.ts < 7 * DAY_MS) weekWords += item.words || 0;
    const key = dayKey(item.ts);
    days.add(key);
    perDay.set(key, (perDay.get(key) || 0) + (item.words || 0));
    const app = item.app || 'Outro';
    perApp.set(app, (perApp.get(app) || 0) + (item.words || 0));
  }

  const minutes = speechMs / 60000;
  const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
  const savedMinutes = Math.max(0, words / TYPING_WPM - minutes);

  // Sequência: dias seguidos com pelo menos um ditado, contando a partir de
  // hoje (ou de ontem, se ainda não ditou hoje).
  let streak = 0;
  let cursor = now;
  if (!days.has(dayKey(cursor))) cursor -= DAY_MS;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }

  const topApps = [...perApp.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([app, appWords]) => ({ app, words: appWords }));

  // Palavras por dia nos últimos 7 dias, do mais antigo para hoje.
  const daily = [];
  for (let i = 6; i >= 0; i -= 1) {
    const ts = now - i * DAY_MS;
    daily.push({ ts, words: perDay.get(dayKey(ts)) || 0 });
  }

  return {
    dictations: history.length,
    words,
    weekWords,
    wpm,
    savedMinutes: Math.round(savedMinutes),
    streak,
    topApps,
    daily,
  };
}

module.exports = { computeStats };
