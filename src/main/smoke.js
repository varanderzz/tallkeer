'use strict';

// Teste de fumaça: `electron . --smoke=<pasta>` abre o app com dados de
// exemplo numa pasta temporária, fotografa cada tela e a barra flutuante,
// registra erros do console e fecha. Não liga o hook de teclado nem o microfone.

const fs = require('node:fs');
const path = require('node:path');
const { nativeTheme } = require('electron');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PAGES = ['inicio', 'historico', 'dicionario', 'snippets', 'estilos', 'notas', 'configuracoes'];

function seed(store) {
  const now = Date.now();
  const samples = [
    { mode: 'dictation', app: 'Slack', category: 'trabalho', raw: 'hum então a reunião é amanhã ahn às dez', text: 'Então, a reunião é amanhã às 10h.' },
    { mode: 'command', app: 'Outlook', category: 'email', raw: 'deixa mais formal', text: 'Prezada Ana, confirmo nossa reunião de amanhã às 10h.' },
    { mode: 'dictation', app: 'WhatsApp', category: 'pessoal', raw: 'chego em dez minutos', text: 'Chego em 10 minutos' },
  ];
  samples.forEach((s, i) =>
    store.historyFile.data.push({
      id: `smoke-${i}`,
      ts: now - i * 3600 * 1000,
      formatted: true,
      durationMs: 4000,
      speechMs: 3500,
      words: s.text.split(/\s+/).length,
      ...s,
    }),
  );
  // Uma semana de uso para o gráfico e as estatísticas.
  [180, 420, 0, 260, 610, 340].forEach((words, d) =>
    store.historyFile.data.push({
      id: `smoke-day-${d}`,
      ts: now - (d + 1) * 86400000,
      mode: 'dictation',
      app: d % 2 ? 'Slack' : 'Outlook',
      category: 'trabalho',
      raw: '',
      text: 'Resumo da reunião de planejamento enviado para a equipe.',
      formatted: true,
      durationMs: words * 400,
      speechMs: words * 350,
      words,
    }),
  );
  store.upsert('dictionary', { term: 'Kubernetes', variants: ['cubernetes', 'cuber netes'] });
  store.upsert('snippets', { trigger: 'meu link de agenda', text: 'https://cal.com/exemplo — escolha o melhor horário.' });
  store.upsert('notes', { text: 'Ideias para o projeto\n- Testar o modo comando\n- Revisar o dicionário' });
}

async function capture(webContents, file) {
  const image = await webContents.capturePage();
  fs.writeFileSync(file, image.toPNG());
}

function watchConsole(name, webContents, errors) {
  webContents.on('console-message', (event, legacyLevel, legacyMessage) => {
    const level = event.level ?? ['verbose', 'info', 'warning', 'error'][legacyLevel];
    const message = event.message ?? legacyMessage;
    if (level === 'error' || level === 'warning') errors.push(`[${name}] ${level}: ${message}`);
  });
  webContents.on('render-process-gone', (_e, details) => errors.push(`[${name}] crashed: ${details.reason}`));
}

// Ditado completo com o microfone falso do Chromium (um bipe periódico):
// grava 2,5 s, a "Groq" responde um texto fixo e a colagem é interceptada.
async function dictationFlow({ store, pipeline }) {
  store.setSecret('groq', 'gsk_smoke');
  store.updateSettings({ formatting: { enabled: false }, sounds: false });

  const realFetch = globalThis.fetch;
  let audioBytes = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.groq.com')) {
      audioBytes = init.body.get('file').size;
      return new Response(JSON.stringify({ text: 'hum teste do meu link de agenda' }), { status: 200 });
    }
    return realFetch(url, init);
  };
  // A colagem de verdade simula Ctrl+V; aqui só a área de transferência é
  // exercitada (salvar e restaurar), sem teclar nas janelas do usuário.
  const { snapshotClipboard, restoreClipboard } = require('./inserter');
  await restoreClipboard(await snapshotClipboard());

  const pasted = [];
  pipeline.inserter.paste = async (text) => {
    pasted.push(text);
    return true;
  };

  const statuses = [];
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('o ditado não terminou em 15 s')), 15000);
    pipeline.once('history', (item) => {
      clearTimeout(timer);
      resolve(item);
    });
    const realStatus = pipeline.overlay.status.bind(pipeline.overlay);
    pipeline.overlay.status = (sessionId, state, message) => {
      statuses.push(message ? `${state}: ${message}` : state);
      if (state === 'error') {
        clearTimeout(timer);
        reject(new Error(`a barra mostrou erro: ${message}`));
      }
      return realStatus(sessionId, state, message);
    };
  });

  pipeline.start('dictation');
  await delay(2500);
  pipeline.stop();
  const item = await done;
  globalThis.fetch = realFetch;
  await delay(300);
  return { audioBytes, pasted, statuses, history: { raw: item.raw, text: item.text, durationMs: item.durationMs, speechMs: item.speechMs, words: item.words } };
}

async function run({ app, openHub, getHub, overlay, store, pipeline, outDir }) {
  const errors = [];
  try {
    seed(store);
    watchConsole('overlay', overlay.webContents, errors);
    openHub('inicio');
    const hub = getHub();
    watchConsole('hub', hub.webContents, errors);
    await new Promise((resolve) => hub.webContents.once('did-finish-load', resolve));
    await delay(800);

    // Cada tela nos dois temas.
    for (const theme of ['light', 'dark']) {
      nativeTheme.themeSource = theme;
      for (const page of PAGES) {
        hub.webContents.send('hub:event', { type: 'navigate', page });
        await delay(page === 'configuracoes' ? 1800 : 1400);
        await capture(hub.webContents, path.join(outDir, `hub-${theme}-${page}.png`));
      }
    }
    nativeTheme.themeSource = 'system';

    overlay.show();
    const states = [
      [
        'recording',
        "current = { sessionId: 'smoke', mode: 'dictation', handsfree: true }; sizeCanvas(); history = history.map((_, i) => Math.max(0.15, 0.85 - i * 0.07)); render('recording'); startClock(Date.now() - 14000); drawWave();",
      ],
      ['processing', "current = null; clearInterval(clock); latestSession = 'smoke'; render('processing', 'Transcrevendo');"],
      ['done', "render('done');"],
      ['error', "render('error', 'Chave da Groq inválida.');"],
    ];
    for (const [name, script] of states) {
      await overlay.webContents.executeJavaScript(script);
      await delay(700);
      await capture(overlay.webContents, path.join(outDir, `overlay-${name}.png`));
    }
  } catch (err) {
    errors.push(`[smoke] ${err.stack || err.message}`);
  }

  const flow = await dictationFlow({ store, pipeline }).catch((err) => {
    errors.push(`[fluxo] ${err.stack || err.message}`);
    return null;
  });

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ errors, flow }, null, 2));
  store.flushAll();
  app.exit(errors.length ? 1 : 0);
}

module.exports = { run };
