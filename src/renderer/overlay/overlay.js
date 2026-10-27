'use strict';

// Barra flutuante: grava o microfone (PCM 16 kHz), desenha a onda sonora e
// mostra o andamento de cada ditado.

const SAMPLE_RATE = 16000;
const SPEECH_RMS = 0.012;
const BARS = 24;
const HISTORY = BARS / 2;

const hud = document.getElementById('hud');
const label = document.getElementById('label');
const timer = document.getElementById('timer');
const canvas = document.getElementById('wave');
const ctx2d = canvas.getContext('2d');

const LABELS = {
  dictation: 'Ouvindo',
  handsfree: 'Mãos livres',
  command: 'Diga o comando',
};

let current = null; // gravação em andamento
let latestSession = null;
let soundsOn = true;
let hideTimer = null;
let clock = null;
let frame = 0;
let history = new Array(HISTORY).fill(0); // níveis recentes, o mais novo primeiro
const shown = new Float32Array(BARS); // alturas desenhadas, suavizadas

// --- Gravação -----------------------------------------------------------

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('tap', Tap);
`;

class Recorder {
  static async start(microphoneId, onLevel) {
    const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneId && microphoneId !== 'default' ? { ...audio, deviceId: { exact: microphoneId } } : audio,
      });
    } catch (err) {
      // O microfone escolhido sumiu (headset desconectado): usa o padrão.
      if (err.name !== 'OverconstrainedError' && err.name !== 'NotFoundError') throw err;
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    }

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = context.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(context, 'tap');
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(tap).connect(mute).connect(context.destination);

    const recorder = new Recorder(stream, context, onLevel);
    tap.port.onmessage = (event) => recorder.push(event.data);
    return recorder;
  }

  constructor(stream, context, onLevel) {
    this.stream = stream;
    this.context = context;
    this.onLevel = onLevel;
    this.chunks = [];
    this.samples = 0;
    this.speechSamples = 0;
  }

  push(chunk) {
    this.chunks.push(chunk);
    this.samples += chunk.length;
    let sum = 0;
    for (let i = 0; i < chunk.length; i += 1) sum += chunk[i] * chunk[i];
    const rms = Math.sqrt(sum / chunk.length);
    if (rms > SPEECH_RMS) this.speechSamples += chunk.length;
    this.onLevel(rms);
  }

  close() {
    for (const track of this.stream.getTracks()) track.stop();
    this.context.close().catch(() => {});
  }

  stop() {
    this.close();
    const pcm = new Float32Array(this.samples);
    let offset = 0;
    for (const chunk of this.chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    const rate = this.context.sampleRate;
    return {
      wav: encodeWav(pcm, rate),
      durationMs: Math.round((this.samples / rate) * 1000),
      speechMs: Math.round((this.speechSamples / rate) * 1000),
    };
  }
}

function encodeWav(pcm, rate) {
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const writeStr = (at, s) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(at + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

function micErrorMessage(err) {
  if (err.name === 'NotAllowedError') {
    return 'Microfone bloqueado. Libere em Configurações do Windows > Privacidade > Microfone.';
  }
  if (err.name === 'NotFoundError') return 'Nenhum microfone encontrado.';
  if (err.name === 'NotReadableError') return 'O microfone está em uso por outro aplicativo.';
  return `Erro no microfone: ${err.message}`;
}

// --- Sons ---------------------------------------------------------------

let soundContext = null;

// Notas curtas e suaves, com um leve harmônico para soar como um sino.
function chime(kind) {
  soundContext ??= new AudioContext();
  const notes = {
    start: [784, 1175],
    stop: [1175, 784],
    cancel: [622],
    error: [330, 262],
  }[kind];
  let t = soundContext.currentTime + 0.01;
  for (const freq of notes) {
    for (const [ratio, level] of [
      [1, 0.045],
      [2, 0.008],
    ]) {
      const osc = soundContext.createOscillator();
      const gain = soundContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(level, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(soundContext.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    }
    t += 0.07;
  }
}

// --- Onda sonora ----------------------------------------------------------

function onLevel(rms) {
  history.unshift(Math.min(1, Math.pow(rms * 7, 0.8)));
  history.length = HISTORY;
}

function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(116 * dpr);
  canvas.height = Math.round(24 * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// A fala mais recente nasce no centro e se espalha para as bordas.
function drawWave() {
  const width = 116;
  const height = 24;
  ctx2d.clearRect(0, 0, width, height);
  const barW = 2;
  const gap = (width - barW * BARS) / (BARS - 1);
  const center = (BARS - 1) / 2;
  for (let i = 0; i < BARS; i += 1) {
    const dist = Math.abs(i - center);
    const target = history[Math.min(HISTORY - 1, Math.floor(dist))] * (1 - (dist / BARS) * 0.9);
    shown[i] += (target - shown[i]) * 0.24;
    const h = Math.max(2, shown[i] * height);
    const x = i * (barW + gap);
    ctx2d.globalAlpha = 0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / BARS);
    ctx2d.fillStyle = '#edebe6';
    ctx2d.beginPath();
    ctx2d.roundRect(x, (height - h) / 2, barW, h, 1);
    ctx2d.fill();
  }
  ctx2d.globalAlpha = 1;
  if (current) frame = requestAnimationFrame(drawWave);
}

function startClock(startedAt) {
  const tick = () => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  clearInterval(clock);
  tick();
  clock = setInterval(tick, 250);
}

// --- Estados ----------------------------------------------------------------

function render(state, message = '') {
  hud.className = `hud ${state}`;
  if (state === 'recording') {
    hud.classList.toggle('command', current.mode === 'command');
    hud.classList.toggle('handsfree', current.handsfree);
    label.textContent = current.mode === 'command' ? LABELS.command : current.handsfree ? LABELS.handsfree : LABELS.dictation;
  } else if (state === 'processing') {
    label.textContent = message || 'Transcrevendo';
  } else if (state === 'done') {
    label.textContent = 'Inserido';
  } else {
    label.textContent = message;
  }
  hud.title = label.textContent;
}

function scheduleIdle(ms) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (current) return;
    hud.classList.add('hidden');
    window.overlay.mouse(false);
    // Espera a saída suave terminar antes de esconder a janela.
    setTimeout(() => !current && window.overlay.idle(), 260);
  }, ms);
}

// --- Comandos do processo principal -------------------------------------

window.overlay.on('overlay:start', async (payload) => {
  clearTimeout(hideTimer);
  latestSession = payload.sessionId;
  soundsOn = payload.sounds;
  current = { ...payload, handsfree: false, stopped: false, cancelled: false, recorder: null };
  history = new Array(HISTORY).fill(0);
  shown.fill(0);
  sizeCanvas();
  render('recording');
  startClock(Date.now());
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(drawWave);
  if (payload.sounds) chime('start');

  const session = current;
  try {
    session.recorder = await Recorder.start(payload.microphoneId, onLevel);
  } catch (err) {
    if (current === session) current = null;
    clearInterval(clock);
    window.overlay.recordingError(session.sessionId, micErrorMessage(err));
    return;
  }
  // O usuário pode ter soltado as teclas enquanto o microfone abria.
  if (session.cancelled) session.recorder.close();
  else if (session.stopped) finish(session);
});

window.overlay.on('overlay:mode', (mode) => {
  if (!current) return;
  current.mode = mode;
  render('recording');
});

window.overlay.on('overlay:handsfree', () => {
  if (!current) return;
  current.handsfree = true;
  render('recording');
});

window.overlay.on('overlay:stop', ({ sessionId }) => {
  if (!current || current.sessionId !== sessionId) return;
  current.stopped = true;
  if (current.recorder) finish(current);
});

window.overlay.on('overlay:cancel', () => {
  if (!current) return;
  const session = current;
  current = null;
  clearInterval(clock);
  session.cancelled = true;
  session.recorder?.close();
  if (session.sounds) chime('cancel');
  scheduleIdle(0);
});

window.overlay.on('overlay:status', ({ sessionId, state, message }) => {
  // Uma gravação nova tem prioridade sobre o status de ditados anteriores.
  if (current || sessionId !== latestSession) return;
  clearTimeout(hideTimer);
  render(state, message);
  if (state === 'done') scheduleIdle(900);
  else if (state === 'warning') scheduleIdle(3500);
  else if (state === 'error') {
    if (soundsOn) chime('error');
    scheduleIdle(4200);
  }
});

function finish(session) {
  if (current === session) current = null;
  clearInterval(clock);
  const result = session.recorder.stop();
  if (session.sounds) chime('stop');
  render('processing', session.mode === 'command' ? 'Pensando no comando' : 'Transcrevendo');
  window.overlay.sendAudio({ sessionId: session.sessionId, ...result });
}

// --- Botões no modo mãos livres ------------------------------------------

hud.addEventListener('mouseenter', () => window.overlay.mouse(true));
hud.addEventListener('mouseleave', () => window.overlay.mouse(false));
document.getElementById('stop').addEventListener('click', () => window.overlay.action('stop'));
document.getElementById('cancel').addEventListener('click', () => window.overlay.action('cancel'));
