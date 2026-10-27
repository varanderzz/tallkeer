'use strict';

// Liga o hook global de teclado (uiohook) à máquina de estados dos atalhos e
// simula atalhos como Ctrl+V / Ctrl+C no app em primeiro plano.

const { uIOhook, UiohookKey } = require('uiohook-napi');
const { HotkeyMachine } = require('./hotkeys');

const CODE_TO_NAME = new Map();
for (const [name, code] of Object.entries(UiohookKey)) {
  if (typeof code === 'number' && !CODE_TO_NAME.has(code)) CODE_TO_NAME.set(code, name);
}
const SIDE_ALIASES = { CtrlRight: 'Ctrl', AltRight: 'Alt', ShiftRight: 'Shift', MetaRight: 'Meta' };

function keyName(keycode) {
  const name = CODE_TO_NAME.get(keycode) || `Key${keycode}`;
  return SIDE_ALIASES[name] || name;
}

class Keyboard {
  constructor({ combos, isKeyDown }) {
    this.machine = new HotkeyMachine({ ...combos, isKeyDown });
    this.ignore = { keys: new Set(), until: 0 };
    this.started = false;
  }

  start() {
    if (this.started) return;
    uIOhook.on('keydown', (e) => this.handle('keydown', e));
    uIOhook.on('keyup', (e) => this.handle('keyup', e));
    uIOhook.start();
    this.started = true;
  }

  stop() {
    if (!this.started) return;
    uIOhook.stop();
    this.started = false;
  }

  handle(type, event) {
    const name = keyName(event.keycode);
    // As teclas que nós mesmos simulamos não podem disparar os atalhos.
    if (Date.now() < this.ignore.until && this.ignore.keys.has(name)) return;
    this.machine[type](name);
  }

  // Ex.: tap('V', ['Ctrl']) para colar.
  tap(key, modifiers = []) {
    this.ignore = { keys: new Set([key, ...modifiers]), until: Date.now() + 250 };
    uIOhook.keyTap(
      UiohookKey[key],
      modifiers.map((m) => UiohookKey[m]),
    );
  }
}

module.exports = { Keyboard, keyName };
