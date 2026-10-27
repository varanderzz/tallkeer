'use strict';

// Fluxo de um ditado: atalho pressionado -> gravação na barra flutuante ->
// transcrição -> formatação (ou Modo Comando) -> dicionário e snippets ->
// colar no app -> histórico.

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { captureContext } = require('./context');
const { transcribe } = require('./transcribe');
const { formatDictation, runCommand } = require('./formatter');
const {
  applyDictionary,
  applySnippets,
  countWords,
  isLikelyHallucination,
  localCleanup,
  vocabularyFrom,
} = require('./textops');

const MAX_RECORDING_MS = 10 * 60 * 1000;
const MIN_SPEECH_MS = 250;

// Erros esperados, mostrados ao usuário sem registrar como falha.
class Notice extends Error {}

class Pipeline extends EventEmitter {
  constructor({ store, inserter, overlay, foregroundWindow }) {
    super();
    this.store = store;
    this.inserter = inserter;
    this.overlay = overlay;
    this.foregroundWindow = foregroundWindow;
    this.recording = null;
    this.pending = new Map();
    this.maxTimer = null;
    this.lastText = '';
  }

  get busy() {
    return Boolean(this.recording) || this.pending.size > 0;
  }

  start(mode) {
    if (this.recording) return;
    const settings = this.store.settings;
    this.recording = {
      id: crypto.randomUUID(),
      mode,
      context: captureContext(this.foregroundWindow, settings.appCategories),
      startedAt: Date.now(),
    };
    this.overlay.startRecording({
      sessionId: this.recording.id,
      mode,
      microphoneId: settings.microphoneId,
      sounds: settings.sounds,
    });
    clearTimeout(this.maxTimer);
    this.maxTimer = setTimeout(() => this.emit('limit'), MAX_RECORDING_MS);
  }

  setMode(mode) {
    if (!this.recording) return;
    this.recording.mode = mode;
    this.overlay.send('overlay:mode', mode);
  }

  setHandsFree() {
    if (this.recording) this.overlay.send('overlay:handsfree');
  }

  stop() {
    const session = this.recording;
    if (!session) return;
    clearTimeout(this.maxTimer);
    this.recording = null;
    this.pending.set(session.id, session);
    this.overlay.send('overlay:stop', { sessionId: session.id });
  }

  cancel() {
    if (!this.recording) return;
    clearTimeout(this.maxTimer);
    this.recording = null;
    this.overlay.send('overlay:cancel');
  }

  // Chamado quando a barra flutuante termina de gravar e manda o áudio.
  async handleAudio({ sessionId, wav, durationMs, speechMs }) {
    const session = this.pending.get(sessionId);
    if (!session) return;
    try {
      await this.process(session, { wav, durationMs, speechMs });
    } catch (err) {
      this.overlay.status(sessionId, 'error', err.message);
      if (!(err instanceof Notice)) this.emit('failure', err);
    } finally {
      this.pending.delete(sessionId);
    }
  }

  handleRecordingError(sessionId, message) {
    if (this.recording?.id === sessionId) {
      clearTimeout(this.maxTimer);
      this.recording = null;
    }
    this.pending.delete(sessionId);
    this.emit('reset');
    this.overlay.status(sessionId, 'error', message);
  }

  async process(session, audio) {
    const settings = this.store.settings;
    const startedProcessing = Date.now();
    if (audio.speechMs < MIN_SPEECH_MS) throw new Notice('Não ouvi nada.');

    const dictionary = this.store.list('dictionary');
    const snippets = this.store.list('snippets');
    const vocabulary = vocabularyFrom(dictionary);
    const anthropicKey = this.store.getSecret('anthropic');
    const getSecret = (name) => this.store.getSecret(name);

    // No Modo Comando, copia a seleção enquanto a transcrição acontece.
    const selection = session.mode === 'command' ? this.inserter.copySelection() : null;

    this.overlay.status(session.id, 'processing');
    const asr = await transcribe(audio.wav, { settings, getSecret, vocabulary });
    if (isLikelyHallucination(asr.text, audio.speechMs)) throw new Notice('Não ouvi nada.');

    let text;
    let formatted = false;
    let warning = null;

    if (session.mode === 'command') {
      const selectedText = await selection;
      text = await runCommand({
        instruction: asr.text,
        selectedText,
        apiKey: anthropicKey,
        model: settings.formatting.model,
        context: session.context,
        sendWindowTitle: settings.sendWindowTitle,
      });
      formatted = true;
    } else {
      text = localCleanup(asr.text);
      if (settings.formatting.enabled) {
        try {
          const out = await formatDictation({
            transcript: asr.text,
            apiKey: anthropicKey,
            model: settings.formatting.model,
            context: session.context,
            style: settings.styles[session.context.category] || 'formal',
            language: settings.language,
            vocabulary,
            snippetTriggers: snippets.map((s) => s.trigger).filter(Boolean),
            sendWindowTitle: settings.sendWindowTitle,
          });
          if (out) {
            text = out;
            formatted = true;
          }
        } catch (err) {
          // Sem a IA, o ditado ainda entra com a limpeza local.
          warning = `Inserido sem formatação: ${err.message}`;
        }
      }
      text = applyDictionary(text, dictionary);
      text = applySnippets(text, snippets).text;
    }

    if (!text.trim()) throw new Notice('Nada para inserir.');

    const pasted = await this.inserter.paste(text);
    this.lastText = text;

    const item = this.store.addHistory({
      mode: session.mode,
      app: session.context.app,
      exe: session.context.exe,
      category: session.context.category,
      raw: asr.text,
      text,
      formatted,
      language: asr.language,
      provider: asr.provider,
      durationMs: audio.durationMs,
      speechMs: audio.speechMs,
      words: countWords(text),
      latencyMs: Date.now() - startedProcessing,
    });
    this.emit('history', item);

    if (!pasted) this.overlay.status(session.id, 'warning', 'Texto copiado. Cole com Ctrl+V.');
    else if (warning) this.overlay.status(session.id, 'warning', warning);
    else this.overlay.status(session.id, 'done');
  }
}

module.exports = { Pipeline };
