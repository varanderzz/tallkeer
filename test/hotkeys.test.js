'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HotkeyMachine, comboLabel } = require('../src/main/hotkeys');

function machine() {
  const m = new HotkeyMachine({ dictation: ['Ctrl', 'Meta'], command: ['Ctrl', 'Meta', 'Alt'], tapMs: 300 });
  const events = [];
  for (const name of ['start', 'mode', 'handsfree', 'stop', 'cancel']) {
    m.on(name, (arg) => events.push(arg ? `${name}:${arg}` : name));
  }
  return { m, events };
}

test('segurar Ctrl+Win grava e soltar para', () => {
  const { m, events } = machine();
  m.keydown('Ctrl', 0);
  m.keydown('Meta', 10);
  m.keyup('Meta', 2000);
  m.keyup('Ctrl', 2010);
  assert.deepEqual(events, ['start:dictation', 'stop']);
  assert.equal(m.state, 'idle');
});

test('repetição automática da tecla não reinicia a gravação', () => {
  const { m, events } = machine();
  m.keydown('Ctrl', 0);
  m.keydown('Meta', 10);
  m.keydown('Meta', 500);
  m.keydown('Meta', 530);
  m.keyup('Meta', 2000);
  assert.deepEqual(events, ['start:dictation', 'stop']);
});

test('toque rápido entra no modo mãos livres e outro toque para', () => {
  const { m, events } = machine();
  m.keydown('Ctrl', 0);
  m.keydown('Meta', 10);
  m.keyup('Meta', 150);
  m.keyup('Ctrl', 160);
  assert.equal(m.state, 'handsfree');
  m.keydown('Ctrl', 5000);
  m.keydown('Meta', 5010);
  m.keyup('Meta', 5100);
  m.keyup('Ctrl', 5110);
  assert.deepEqual(events, ['start:dictation', 'handsfree', 'stop']);
  assert.equal(m.state, 'idle');
});

test('acrescentar Alt muda para o modo comando', () => {
  const { m, events } = machine();
  m.keydown('Ctrl', 0);
  m.keydown('Meta', 10);
  m.keydown('Alt', 100);
  m.keyup('Alt', 1500);
  m.keyup('Meta', 1600);
  assert.deepEqual(events, ['start:dictation', 'mode:command', 'stop']);
});

test('modo comando não vira mãos livres num toque rápido', () => {
  const { m, events } = machine();
  m.keydown('Ctrl', 0);
  m.keydown('Alt', 5);
  m.keydown('Meta', 10);
  m.keyup('Meta', 100);
  assert.deepEqual(events, ['start:command', 'stop']);
});

test('outro atalho do Windows (Ctrl+Win+D) cancela', () => {
  const { m, events } = machine();
  m.keydown('Ctrl', 0);
  m.keydown('Meta', 10);
  m.keydown('D', 50);
  m.keyup('D', 80);
  m.keyup('Meta', 90);
  m.keyup('Ctrl', 95);
  assert.deepEqual(events, ['start:dictation', 'cancel']);
  assert.equal(m.state, 'idle');
});

test('Esc cancela no modo mãos livres', () => {
  const { m, events } = machine();
  m.keydown('Ctrl', 0);
  m.keydown('Meta', 10);
  m.keyup('Meta', 100);
  m.keyup('Ctrl', 110);
  m.keydown('Escape', 3000);
  m.keyup('Escape', 3050);
  assert.deepEqual(events, ['start:dictation', 'handsfree', 'cancel']);
  assert.equal(m.state, 'idle');
});

test('não começa se houver outra tecla junto', () => {
  const { m, events } = machine();
  m.keydown('Shift', 0);
  m.keydown('Ctrl', 5);
  m.keydown('Meta', 10);
  assert.deepEqual(events, []);
});

test('tecla presa (keyup perdido) é descartada depois de um tempo', () => {
  const { m, events } = machine();
  m.keydown('L', 0); // Win+L bloqueia a tela e o keyup se perde
  m.keydown('Ctrl', 10000);
  m.keydown('Meta', 10010);
  assert.deepEqual(events, ['start:dictation']);
});

test('modificador preso é descartado quando o sistema diz que está solto', () => {
  const down = new Set(['Ctrl', 'Meta']);
  const m = new HotkeyMachine({ dictation: ['Ctrl', 'Meta'], command: [], isKeyDown: (k) => down.has(k) });
  const events = [];
  m.on('start', () => events.push('start'));
  m.keydown('Alt', 0);
  down.delete('Alt');
  m.keydown('Ctrl', 10);
  m.keydown('Meta', 20);
  assert.deepEqual(events, ['start']);
});

test('captureCombo devolve as teclas pressionadas juntas', async () => {
  const { m } = machine();
  const pending = m.captureCombo();
  m.keydown('Alt', 0);
  m.keydown('Ctrl', 5);
  m.keyup('Alt', 50);
  m.keyup('Ctrl', 60);
  assert.deepEqual(await pending, ['Ctrl', 'Alt']);
  assert.equal(comboLabel(['Meta', 'Ctrl']), 'Ctrl + Win');
});
