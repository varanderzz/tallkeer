'use strict';

// Gera build/icon.png (512 px) para o instalador e o executável, a partir do
// mesmo desenho usado na bandeja. Uso: npm run icon

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { drawIcon } = require('../src/main/icon');

app.whenReady().then(() => {
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, drawIcon(512).toPNG());
  console.log(`Ícone gerado em ${out}`);
  app.exit(0);
});
