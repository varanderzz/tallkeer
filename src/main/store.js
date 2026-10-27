'use strict';

// Persistência local em arquivos JSON na pasta de dados do app
// (%APPDATA%\Tallkeer). Chaves de API ficam criptografadas com o DPAPI do
// Windows (safeStorage do Electron).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_HISTORY = 5000;

const DEFAULT_SETTINGS = {
  hotkeys: {
    dictation: ['Ctrl', 'Meta'],
    command: ['Ctrl', 'Alt', 'Meta'],
  },
  theme: 'system',
  language: 'auto',
  microphoneId: 'default',
  sounds: true,
  launchAtLogin: false,
  saveHistory: true,
  sendWindowTitle: false,
  transcription: {
    provider: 'groq',
    groqModel: 'whisper-large-v3-turbo',
    openaiModel: 'gpt-4o-mini-transcribe',
    whisperCppPath: '',
    whisperCppModel: '',
  },
  formatting: {
    enabled: true,
    model: 'claude-opus-5-5',
  },
  styles: {
    email: 'formal',
    trabalho: 'casual',
    pessoal: 'casual',
    outros: 'formal',
  },
  appCategories: {},
  onboarded: false,
};

const SECRET_NAMES = ['anthropic', 'groq', 'openai'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeDefaults(defaults, value) {
  if (!isPlainObject(defaults)) return value === undefined ? defaults : value;
  const out = {};
  const source = isPlainObject(value) ? value : {};
  for (const key of new Set([...Object.keys(defaults), ...Object.keys(source)])) {
    if (key in defaults && isPlainObject(defaults[key]) && Object.keys(defaults[key]).length > 0) {
      out[key] = mergeDefaults(defaults[key], source[key]);
    } else {
      out[key] = key in source ? source[key] : defaults[key];
    }
  }
  return out;
}

class JsonFile {
  constructor(file, fallback) {
    this.file = file;
    this.timer = null;
    this.data = this.load(fallback);
  }

  load(fallback) {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Arquivo corrompido: guarda uma cópia e recomeça do padrão.
        try {
          fs.renameSync(this.file, `${this.file}.corrompido-${Date.now()}`);
        } catch {
          /* nada a fazer */
        }
      }
      return structuredClone(fallback);
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
}

class Store {
  constructor(dir, safeStorage) {
    fs.mkdirSync(dir, { recursive: true });
    this.dir = dir;
    this.safeStorage = safeStorage;
    this.settingsFile = new JsonFile(path.join(dir, 'settings.json'), DEFAULT_SETTINGS);
    this.settingsFile.data = mergeDefaults(DEFAULT_SETTINGS, this.settingsFile.data);
    this.historyFile = new JsonFile(path.join(dir, 'history.json'), []);
    this.dictionaryFile = new JsonFile(path.join(dir, 'dictionary.json'), []);
    this.snippetsFile = new JsonFile(path.join(dir, 'snippets.json'), []);
    this.notesFile = new JsonFile(path.join(dir, 'notes.json'), []);
    this.secretsFile = new JsonFile(path.join(dir, 'secrets.json'), {});
  }

  flushAll() {
    for (const file of [
      this.settingsFile,
      this.historyFile,
      this.dictionaryFile,
      this.snippetsFile,
      this.notesFile,
      this.secretsFile,
    ]) {
      if (file.timer) file.flush();
    }
  }

  // --- Configurações ---------------------------------------------------

  get settings() {
    return this.settingsFile.data;
  }

  updateSettings(patch) {
    const merged = mergeDeep(this.settingsFile.data, patch);
    // Mapas editáveis são substituídos inteiros, para permitir remover itens.
    if (isPlainObject(patch.appCategories)) merged.appCategories = { ...patch.appCategories };
    this.settingsFile.data = mergeDefaults(DEFAULT_SETTINGS, merged);
    this.settingsFile.save();
    return this.settings;
  }

  // --- Chaves de API ---------------------------------------------------

  getSecret(name) {
    const stored = this.secretsFile.data[name];
    if (!stored) return '';
    if (stored.startsWith('enc:')) {
      try {
        return this.safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
      } catch {
        return '';
      }
    }
    return stored.startsWith('plain:') ? stored.slice(6) : '';
  }

  setSecret(name, value) {
    if (!SECRET_NAMES.includes(name)) throw new Error(`Chave desconhecida: ${name}`);
    const trimmed = (value || '').trim();
    if (!trimmed) {
      delete this.secretsFile.data[name];
    } else if (this.safeStorage.isEncryptionAvailable()) {
      this.secretsFile.data[name] = `enc:${this.safeStorage.encryptString(trimmed).toString('base64')}`;
    } else {
      this.secretsFile.data[name] = `plain:${trimmed}`;
    }
    this.secretsFile.flush();
  }

  secretStatus() {
    return Object.fromEntries(SECRET_NAMES.map((name) => [name, Boolean(this.getSecret(name))]));
  }

  // --- Histórico -------------------------------------------------------

  get history() {
    return this.historyFile.data;
  }

  addHistory(item) {
    const entry = { id: crypto.randomUUID(), ts: Date.now(), ...item };
    if (this.settings.saveHistory) {
      this.historyFile.data.unshift(entry);
      if (this.historyFile.data.length > MAX_HISTORY) this.historyFile.data.length = MAX_HISTORY;
      this.historyFile.save();
    }
    return entry;
  }

  listHistory({ query = '', limit = 200 } = {}) {
    const q = query.trim().toLowerCase();
    const items = q
      ? this.history.filter(
          (h) => (h.text || '').toLowerCase().includes(q) || (h.app || '').toLowerCase().includes(q),
        )
      : this.history;
    return items.slice(0, limit);
  }

  deleteHistory(id) {
    this.historyFile.data = this.history.filter((h) => h.id !== id);
    this.historyFile.save();
  }

  clearHistory() {
    this.historyFile.data = [];
    this.historyFile.save();
  }

  // --- Coleções editáveis (dicionário, snippets, notas) ----------------

  collection(name) {
    const file = { dictionary: this.dictionaryFile, snippets: this.snippetsFile, notes: this.notesFile }[name];
    if (!file) throw new Error(`Coleção desconhecida: ${name}`);
    return file;
  }

  list(name) {
    return this.collection(name).data;
  }

  upsert(name, item) {
    const file = this.collection(name);
    const now = Date.now();
    if (item.id) {
      const index = file.data.findIndex((x) => x.id === item.id);
      if (index !== -1) {
        file.data[index] = { ...file.data[index], ...item, updatedAt: now };
        file.save();
        return file.data[index];
      }
    }
    const created = { ...item, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    file.data.unshift(created);
    file.save();
    return created;
  }

  remove(name, id) {
    const file = this.collection(name);
    file.data = file.data.filter((x) => x.id !== id);
    file.save();
  }
}

function mergeDeep(base, patch) {
  if (!isPlainObject(patch)) return patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(base?.[key]) ? mergeDeep(base[key], value) : value;
  }
  return out;
}

module.exports = { Store, DEFAULT_SETTINGS, mergeDefaults };
