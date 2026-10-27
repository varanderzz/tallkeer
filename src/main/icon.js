'use strict';

// Ícone do Tallkeer desenhado em código (sem arquivos de imagem): um disco
// grafite com três hastes de som em tom de osso. Cada pixel é calculado por
// distância até as formas, então as bordas saem suaves em qualquer tamanho.

const { nativeImage } = require('electron');

const DISC = [0x1c, 0x1b, 0x18];
const RIM = [0x3a, 0x38, 0x33];
const BONE = [0xf1, 0xee, 0xe7];
const BARS = [0.36, 0.62, 0.42]; // altura de cada haste, em fração do diâmetro

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// Distância de um ponto até um segmento vertical (haste com pontas redondas).
function capsuleDistance(px, py, cx, top, bottom, radius) {
  const y = Math.max(top, Math.min(bottom, py));
  return Math.hypot(px - cx, py - y) - radius;
}

function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const r = size / 2;
  const rim = Math.max(1, size / 48);
  const barRadius = size * 0.045;
  const spacing = size * 0.17;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.hypot(px - c, py - c);
      const discAlpha = clamp01(r - d);
      if (discAlpha <= 0) continue;

      // Aro levemente mais claro, para o ícone aparecer em barras escuras.
      let rgb = mix(DISC, RIM, clamp01(1 - (r - d) / rim));

      let barAlpha = 0;
      BARS.forEach((height, i) => {
        const cx = c + (i - 1) * spacing;
        const half = (height * size) / 2;
        const dist = capsuleDistance(px, py, cx, c - half + barRadius, c + half - barRadius, barRadius);
        barAlpha = Math.max(barAlpha, clamp01(0.5 - dist));
      });
      rgb = mix(rgb, BONE, barAlpha);

      const i = (y * size + x) * 4;
      buf[i] = Math.round(rgb[2]);
      buf[i + 1] = Math.round(rgb[1]);
      buf[i + 2] = Math.round(rgb[0]);
      buf[i + 3] = Math.round(discAlpha * 255);
    }
  }
  return buf;
}

function drawIcon(size) {
  return nativeImage.createFromBitmap(renderIcon(size), { width: size, height: size });
}

module.exports = { drawIcon };
