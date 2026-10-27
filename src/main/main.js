'use strict';

const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  screen,
  session,
  shell,
} = require('electron');
const { Store } = require('./store');
const { Keyboard } = require('./keyboard');
const { Inserter } = require('./inserter');
const { Pipeline } = require('./pipeline');
const { computeStats } = require('./stats');
const { comboLabel, MODIFIERS } = require('./hotkeys');
const { drawIcon } = require('./icon');
const { testKey } = require('./formatter');
const { testCloudKey } = require('./transcribe');
const win32 = require('./win32');

const SRC = path.join(__dirname, '..');
const RENDERER = path.join(SRC, 'renderer');
const PRELOAD = path.join(SRC, 'preload');

const LINKS = new Set([
  'https://console.anthropic.com/settings/keys',
  'https://console.groq.com/keys',
  'https://platform.openai.com/api-keys',
  'https://github.com/ggml-org/whisper.cpp',
]);

// --smoke=<pasta>: teste automático com dados isolados (ver smoke.js).
const smokeArg = process.argv.find((arg) => arg.startsWith('--smoke='));
const smokeDir = smokeArg ? path.resolve(smokeArg.slice('--smoke='.length)) : null;
if (smokeDir) {
  app.setPath('userData', path.join(smokeDir, 'userdata'));
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Mesmo identificador do antigo Ditado: o instalador do Tallkeer o substitui.
  app.setAppUserModelId('app.ditado.desktop');
  app.on('second-instance', () => openHub());
  app.whenReady().then(boot);
}

let store;
let keyboard;
let inserter;
let pipeline;
let overlay;
let hubWindow = null;
let tray = null;
let quitting = false;

// --- Barra flutuante (gravação) ----------------------------------------

const THEME_BACKGROUND = { light: '#f6f5f1', dark: '#121211' };

function themeBackground() {
  return nativeTheme.shouldUseDarkColors ? THEME_BACKGROUND.dark : THEME_BACKGROUND.light;
}

class OverlayController {
  constructor() {
    this.win = new BrowserWindow({
      width: 480,
      height: 120,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(PRELOAD, 'overlay.js'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        // A barra nunca recebe clique antes de tocar sons ou abrir o microfone.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.loadFile(path.join(RENDERER, 'overlay', 'index.html'));
  }

  get webContents() {
    return this.win.webContents;
  }

  show() {
    if (this.win.isVisible()) return;
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const [w, h] = this.win.getSize();
    this.win.setPosition(
      Math.round(workArea.x + (workArea.width - w) / 2),
      Math.round(workArea.y + workArea.height - h - 16),
    );
    this.win.showInactive();
  }

  hide() {
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.hide();
  }

  send(channel, payload) {
    this.win.webContents.send(channel, payload);
  }

  startRecording(payload) {
    this.show();
    this.send('overlay:start', payload);
  }

  status(sessionId, state, message = null) {
    this.show();
    this.send('overlay:status', { sessionId, state, message });
  }
}

// --- Janela principal ----------------------------------------------------

function openHub(page) {
  if (hubWindow && !hubWindow.isDestroyed()) {
    if (page) hubWindow.webContents.send('hub:event', { type: 'navigate', page });
    if (hubWindow.isMinimized()) hubWindow.restore();
    hubWindow.show();
    hubWindow.focus();
    return;
  }

  hubWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'Tallkeer',
    icon: drawIcon(64),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: themeBackground(),
    webPreferences: {
      preload: path.join(PRELOAD, 'hub.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  hubWindow.setMenu(null);
  hubWindow.loadFile(path.join(RENDERER, 'hub', 'index.html'), page ? { hash: page } : undefined);
  hubWindow.once('ready-to-show', () => hubWindow.show());
  hubWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      hubWindow.hide();
    }
  });
  hubWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  hubWindow.webContents.on('will-navigate', (event) => event.preventDefault());
}

function sendHub(event) {
  if (hubWindow && !hubWindow.isDestroyed()) hubWindow.webContents.send('hub:event', event);
}

// --- Bandeja ---------------------------------------------------------------

function trayTooltip() {
  if (!keyboard.machine.enabled) return 'Tallkeer: atalhos pausados';
  return `Tallkeer: segure ${comboLabel(store.settings.hotkeys.dictation)} para falar`;
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(trayTooltip());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Tallkeer', click: () => openHub() },
      {
        label: 'Copiar última transcrição',
        enabled: Boolean(pipeline.lastText),
        click: () => clipboard.writeText(pipeline.lastText),
      },
      { type: 'separator' },
      {
        label: 'Pausar atalhos',
        type: 'checkbox',
        checked: !keyboard.machine.enabled,
        click: (item) => {
          keyboard.machine.enabled = !item.checked;
          if (item.checked) pipeline.cancel();
          updateTrayMenu();
          sendHub({ type: 'state', state: appState() });
        },
      },
      { label: 'Configurações', click: () => openHub('configuracoes') },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

// --- Estado e configurações ------------------------------------------------

function appState() {
  return {
    settings: store.settings,
    secrets: store.secretStatus(),
    encryption: safeStorage.isEncryptionAvailable(),
    stats: computeStats(store.history),
    paused: !keyboard.machine.enabled,
    version: app.getVersion(),
  };
}

function applySettings() {
  const settings = store.settings;
  nativeTheme.themeSource = ['light', 'dark'].includes(settings.theme) ? settings.theme : 'system';
  if (hubWindow && !hubWindow.isDestroyed()) hubWindow.setBackgroundColor(themeBackground());
  keyboard.machine.setCombos(settings.hotkeys);
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  updateTrayMenu();
}

function validateCombo(which, keys) {
  if (!keys) return { error: null, keys: null };
  const hasModifier = keys.some((k) => MODIFIERS.has(k));
  const isFunctionKey = keys.length === 1 && /^F([1-9]|1\d|2[0-4])$/.test(keys[0]);
  if (!hasModifier && !isFunctionKey) {
    return { error: 'Use pelo menos uma tecla modificadora (Ctrl, Alt, Shift ou Win) ou uma tecla F.' };
  }
  if (which === 'command') {
    const dictation = store.settings.hotkeys.dictation;
    if (!dictation.every((k) => keys.includes(k)) || keys.length <= dictation.length) {
      return { error: `O atalho de comando precisa ser o de ditado (${comboLabel(dictation)}) mais uma tecla.` };
    }
  }
  return { error: null, keys };
}

const COLLECTION_FIELDS = {
  dictionary: (item) => ({
    term: String(item.term || '').trim().slice(0, 200),
    variants: (Array.isArray(item.variants) ? item.variants : [])
      .map((v) => String(v).trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 20),
  }),
  snippets: (item) => ({
    trigger: String(item.trigger || '').trim().slice(0, 200),
    text: String(item.text || '').slice(0, 20000),
  }),
  notes: (item) => ({
    text: String(item.text || '').slice(0, 200000),
    pinned: Boolean(item.pinned),
  }),
};

function sanitize(name, item) {
  const fields = COLLECTION_FIELDS[name];
  if (!fields) throw new Error(`Coleção desconhecida: ${name}`);
  const clean = fields(item || {});
  if (typeof item?.id === 'string') clean.id = item.id;
  return clean;
}

// --- IPC -----------------------------------------------------------------

function registerIpc() {
  const fromOverlay = (event) => event.sender === overlay.webContents;
  const hubOnly =
    (handler) =>
    (event, ...args) => {
      if (!hubWindow || hubWindow.isDestroyed() || event.sender !== hubWindow.webContents) {
        throw new Error('Origem não autorizada.');
      }
      return handler(...args);
    };

  ipcMain.handle('overlay:audio', (event, payload) => {
    if (!fromOverlay(event)) return false;
    pipeline.handleAudio({ ...payload, wav: Buffer.from(payload.wav) });
    return true;
  });
  ipcMain.on('overlay:recording-error', (event, { sessionId, message }) => {
    if (fromOverlay(event)) pipeline.handleRecordingError(sessionId, message);
  });
  ipcMain.on('overlay:idle', (event) => {
    if (fromOverlay(event) && !pipeline.recording) overlay.hide();
  });
  ipcMain.on('overlay:mouse', (event, inside) => {
    if (fromOverlay(event)) overlay.win.setIgnoreMouseEvents(!inside, { forward: true });
  });
  ipcMain.on('overlay:action', (event, action) => {
    if (!fromOverlay(event)) return;
    keyboard.machine.reset();
    if (action === 'stop') pipeline.stop();
    else if (action === 'cancel') pipeline.cancel();
  });

  ipcMain.handle('app:state', hubOnly(appState));
  ipcMain.handle(
    'settings:update',
    hubOnly((patch) => {
      store.updateSettings(patch);
      applySettings();
      return appState();
    }),
  );
  ipcMain.handle(
    'secrets:set',
    hubOnly(({ name, value }) => {
      store.setSecret(name, value);
      return store.secretStatus();
    }),
  );
  ipcMain.handle(
    'secrets:test',
    hubOnly(async (name) => {
      const key = store.getSecret(name);
      if (name === 'anthropic') return testKey(key, store.settings.formatting.model);
      if (!key) return { ok: false, message: 'Nenhuma chave salva.' };
      return testCloudKey(name, key).catch((err) => ({ ok: false, message: err.message }));
    }),
  );
  ipcMain.handle('history:list', hubOnly((options) => store.listHistory(options)));
  ipcMain.handle(
    'history:delete',
    hubOnly((id) => {
      store.deleteHistory(id);
      return computeStats(store.history);
    }),
  );
  ipcMain.handle(
    'history:clear',
    hubOnly(() => {
      store.clearHistory();
      return computeStats(store.history);
    }),
  );
  ipcMain.handle('collection:list', hubOnly((name) => store.list(name)));
  ipcMain.handle('collection:upsert', hubOnly((name, item) => store.upsert(name, sanitize(name, item))));
  ipcMain.handle('collection:remove', hubOnly((name, id) => store.remove(name, id)));
  ipcMain.handle(
    'hotkey:capture',
    hubOnly(async (which) => {
      pipeline.cancel();
      const result = validateCombo(which, await keyboard.machine.captureCombo());
      keyboard.machine.reset();
      if (result.error || !result.keys) return { ...result, state: appState() };
      const hotkeys = { ...store.settings.hotkeys, [which]: result.keys };
      // Se o atalho de ditado mudou, o de comando acompanha (ditado + Alt).
      if (which === 'dictation') hotkeys.command = [...result.keys, result.keys.includes('Alt') ? 'Shift' : 'Alt'];
      store.updateSettings({ hotkeys });
      applySettings();
      return { error: null, keys: result.keys, state: appState() };
    }),
  );
  ipcMain.handle('clipboard:write', hubOnly((text) => clipboard.writeText(String(text))));
  ipcMain.handle(
    'dialog:pick-file',
    hubOnly(async (kind) => {
      const filters =
        kind === 'exe' ? [{ name: 'Programa', extensions: ['exe'] }] : [{ name: 'Modelo', extensions: ['bin', 'gguf'] }];
      const result = await dialog.showOpenDialog(hubWindow, { properties: ['openFile'], filters });
      return result.canceled ? null : result.filePaths[0];
    }),
  );
  ipcMain.handle(
    'shell:open',
    hubOnly((url) => {
      if (LINKS.has(url)) shell.openExternal(url);
    }),
  );
}

// --- Inicialização -------------------------------------------------------

function wireHotkeys() {
  const machine = keyboard.machine;
  machine.on('start', (mode) => pipeline.start(mode));
  machine.on('mode', (mode) => pipeline.setMode(mode));
  machine.on('handsfree', () => pipeline.setHandsFree());
  machine.on('stop', () => pipeline.stop());
  machine.on('cancel', () => pipeline.cancel());

  pipeline.on('limit', () => {
    machine.reset();
    pipeline.stop();
  });
  pipeline.on('reset', () => machine.reset());
  pipeline.on('history', (item) => {
    sendHub({ type: 'history', item, stats: computeStats(store.history) });
    updateTrayMenu();
  });
  pipeline.on('failure', (err) => console.error('[tallkeer]', err));
}

function boot() {
  // Só o microfone é liberado para as janelas do app.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(permission === 'media' && (details.mediaTypes || ['audio']).every((t) => t === 'audio'));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  store = new Store(app.getPath('userData'), safeStorage);
  keyboard = new Keyboard({ combos: store.settings.hotkeys, isKeyDown: win32.isModifierDown });
  inserter = new Inserter(keyboard);
  overlay = new OverlayController();
  pipeline = new Pipeline({ store, inserter, overlay, foregroundWindow: win32.foregroundWindow });

  registerIpc();
  wireHotkeys();

  tray = new Tray(drawIcon(32));
  tray.on('click', () => openHub());
  applySettings();

  if (smokeDir) {
    require('./smoke').run({ app, openHub, getHub: () => hubWindow, overlay, store, pipeline, outDir: smokeDir });
    return;
  }

  try {
    keyboard.start();
  } catch (err) {
    dialog.showErrorBox('Tallkeer', `Não foi possível registrar o atalho global de teclado.\n\n${err.message}`);
  }

  const { provider, whisperCppPath } = store.settings.transcription;
  const transcriptionReady = provider === 'local' ? Boolean(whisperCppPath) : store.secretStatus()[provider];
  const needsSetup = !store.settings.onboarded || !transcriptionReady;
  if (needsSetup || process.argv.includes('--show')) openHub(needsSetup ? 'inicio' : undefined);
}

app.on('window-all-closed', () => {
  // Continua rodando na bandeja.
});

app.on('before-quit', () => {
  quitting = true;
  keyboard?.stop();
  store?.flushAll();
});
