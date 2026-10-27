'use strict';

// Insere texto no app em primeiro plano (área de transferência + Ctrl+V) e lê
// o texto selecionado (Ctrl+C), sempre devolvendo a área de transferência
// do usuário como estava antes. Usa a API assíncrona de clipboard do
// Electron 44+ (read/write com ClipboardItem).

const { clipboard, ClipboardItem } = require('electron');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Copia todos os formatos presentes (texto, HTML, imagem...) para poder
// devolvê-los depois. Falhas na leitura viram um snapshot vazio.
async function snapshotClipboard() {
  try {
    const items = await clipboard.read();
    const saved = [];
    for (const item of items) {
      const data = {};
      for (const type of item.types) {
        try {
          data[type] = await item.getType(type);
        } catch {
          /* formato que não dá para ler: ignora */
        }
      }
      if (Object.keys(data).length) saved.push(data);
    }
    return saved;
  } catch {
    return [];
  }
}

async function restoreClipboard(saved) {
  try {
    if (!saved.length) clipboard.clear();
    else await clipboard.write(saved.map((data) => new ClipboardItem(data)));
  } catch {
    /* não conseguiu restaurar: o texto ditado fica na área de transferência */
  }
}

async function readText() {
  try {
    return await clipboard.readText();
  } catch {
    return '';
  }
}

class Inserter {
  constructor(keyboard) {
    this.keyboard = keyboard;
    this.queue = Promise.resolve();
  }

  // Todas as operações que mexem na área de transferência rodam em fila.
  enqueue(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  // Devolve false se não deu para colar (o texto fica na área de
  // transferência para o usuário colar manualmente).
  paste(text) {
    return this.enqueue(async () => {
      const released = await this.keyboard.machine.waitForModifiersReleased(4000);
      const snap = await snapshotClipboard();
      await clipboard.writeText(text);
      if (!released) return false;
      await delay(30);
      this.keyboard.tap('V', ['Ctrl']);
      // Dá tempo ao app de ler a área de transferência antes de restaurar.
      await delay(450);
      if ((await readText()) === text) await restoreClipboard(snap);
      return true;
    });
  }

  copySelection() {
    return this.enqueue(async () => {
      await this.keyboard.machine.waitForModifiersReleased(4000);
      const snap = await snapshotClipboard();
      clipboard.clear();
      await delay(30);
      this.keyboard.tap('C', ['Ctrl']);
      let selected = '';
      for (let i = 0; i < 20 && !selected; i += 1) {
        await delay(25);
        selected = await readText();
      }
      await restoreClipboard(snap);
      return selected;
    });
  }
}

module.exports = { Inserter, snapshotClipboard, restoreClipboard };
