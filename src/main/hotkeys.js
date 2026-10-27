'use strict';

const { EventEmitter } = require('node:events');

// Máquina de estados dos atalhos globais. Recebe nomes de teclas já
// normalizados ("Ctrl", "Meta", "Alt", "A"...) e emite:
//   start(mode)   começou a gravar ("dictation" ou "command")
//   mode(mode)    o usuário acrescentou a tecla de comando durante a gravação
//   handsfree     toque rápido: a gravação continua sem segurar as teclas
//   stop          terminou de falar
//   cancel        Esc, ou o usuário estava usando outro atalho do sistema

const MODIFIERS = new Set(['Ctrl', 'Alt', 'Shift', 'Meta']);
const ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const STALE_KEY_MS = 5000;

function sortCombo(keys) {
  return [...new Set(keys)].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

function comboLabel(keys) {
  return sortCombo(keys)
    .map((k) => (k === 'Meta' ? 'Win' : k))
    .join(' + ');
}

class HotkeyMachine extends EventEmitter {
  constructor({ dictation, command, tapMs = 300, isKeyDown = null }) {
    super();
    this.tapMs = tapMs;
    this.isKeyDown = isKeyDown;
    this.pressed = new Map(); // tecla -> último keydown (ms)
    this.state = 'idle'; // idle | holding | handsfree | waitRelease
    this.mode = 'dictation';
    this.startedAt = 0;
    this.enabled = true;
    this.capture = null;
    this.setCombos({ dictation, command });
  }

  setCombos({ dictation, command }) {
    this.dictation = sortCombo(dictation);
    // O atalho de comando precisa conter o de ditado: o usuário começa a
    // ditar e acrescenta a tecla extra para virar comando.
    this.command = command && this.dictation.every((k) => command.includes(k)) ? sortCombo(command) : [];
    this.comboKeys = new Set([...this.dictation, ...this.command]);
  }

  keydown(name, now = Date.now()) {
    this.purgeStale(now);
    const repeat = this.pressed.has(name);
    this.pressed.set(name, now);

    if (this.capture) {
      this.capture.keys.add(name);
      return;
    }
    if (repeat || !this.enabled) return;

    switch (this.state) {
      case 'idle':
        if (this.matches(this.dictation) && this.onlyComboKeysPressed()) {
          this.state = 'holding';
          this.startedAt = now;
          this.mode = this.command.length && this.matches(this.command) ? 'command' : 'dictation';
          this.emit('start', this.mode);
        }
        break;
      case 'holding':
        if (name === 'Escape') {
          this.finish('cancel');
        } else if (this.command.length && this.mode === 'dictation' && this.matches(this.command)) {
          this.mode = 'command';
          this.emit('mode', 'command');
        } else if (!this.comboKeys.has(name)) {
          // Ctrl+Win+D, Ctrl+Win+setas... é um atalho do Windows, não ditado.
          this.finish('cancel');
        }
        break;
      case 'handsfree':
        if (name === 'Escape') {
          this.finish('cancel');
        } else if (this.matches(this.dictation)) {
          this.finish('stop');
        }
        break;
      default:
        break;
    }
  }

  keyup(name, now = Date.now()) {
    this.pressed.delete(name);

    if (this.capture) {
      if (this.pressed.size === 0) this.endCapture();
      return;
    }

    if (this.state === 'holding' && !this.matches(this.dictation)) {
      if (this.mode === 'dictation' && now - this.startedAt < this.tapMs) {
        this.state = 'handsfree';
        this.emit('handsfree');
      } else {
        this.finish('stop');
      }
    } else if (this.state === 'waitRelease' && !this.anyComboKeyPressed()) {
      this.state = 'idle';
    }
  }

  finish(event) {
    this.state = this.anyComboKeyPressed() ? 'waitRelease' : 'idle';
    this.emit(event);
  }

  // Usado quando a gravação termina por outro motivo (limite de tempo, erro).
  reset() {
    this.state = this.anyComboKeyPressed() ? 'waitRelease' : 'idle';
  }

  matches(combo) {
    return combo.length > 0 && combo.every((k) => this.pressed.has(k));
  }

  onlyComboKeysPressed() {
    for (const key of this.pressed.keys()) if (!this.comboKeys.has(key)) return false;
    return true;
  }

  anyComboKeyPressed() {
    for (const key of this.comboKeys) if (this.pressed.has(key)) return true;
    return false;
  }

  modifiersPressed() {
    for (const key of this.pressed.keys()) if (MODIFIERS.has(key)) return true;
    return false;
  }

  // Teclas cujo keyup se perdeu (Win+L, tela do UAC) não podem ficar presas.
  purgeStale(now) {
    for (const [key, at] of this.pressed) {
      if (MODIFIERS.has(key)) {
        if (this.isKeyDown && !this.isKeyDown(key)) this.pressed.delete(key);
      } else if (now - at > STALE_KEY_MS) {
        this.pressed.delete(key);
      }
    }
  }

  async waitForModifiersReleased(timeoutMs = 1500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      this.purgeStale(Date.now());
      if (!this.modifiersPressed()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }

  // Grava um novo atalho: junta todas as teclas pressionadas até soltar tudo.
  captureCombo(timeoutMs = 10000) {
    if (this.capture) this.capture.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.endCapture(true), timeoutMs);
      this.capture = { keys: new Set(), resolve, timer };
    });
  }

  endCapture(timedOut = false) {
    const capture = this.capture;
    if (!capture) return;
    this.capture = null;
    clearTimeout(capture.timer);
    const keys = sortCombo(capture.keys);
    if (timedOut || keys.length === 0 || keys.includes('Escape')) capture.resolve(null);
    else capture.resolve(keys);
  }
}

module.exports = { HotkeyMachine, comboLabel, sortCombo, MODIFIERS };
