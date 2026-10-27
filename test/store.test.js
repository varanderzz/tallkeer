'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/main/store');

// Substituto do safeStorage do Electron: "criptografa" invertendo os bytes.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s, 'utf8').reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString('utf8'),
};

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tallkeer-test-'));
  return { dir, store: new Store(dir, fakeSafeStorage) };
}

test('configurações recebem padrões e mesclam alterações parciais', () => {
  const { store } = tempStore();
  assert.equal(store.settings.transcription.provider, 'groq');
  assert.equal(store.settings.theme, 'system');
  store.updateSettings({ transcription: { provider: 'openai' }, styles: { email: 'casual' } });
  assert.equal(store.settings.transcription.provider, 'openai');
  assert.equal(store.settings.transcription.groqModel, 'whisper-large-v3-turbo');
  assert.equal(store.settings.styles.email, 'casual');
  assert.equal(store.settings.styles.trabalho, 'casual');
});

test('regras por app são substituídas por inteiro (permite remover)', () => {
  const { store } = tempStore();
  store.updateSettings({ appCategories: { 'a.exe': 'email', 'b.exe': 'pessoal' } });
  store.updateSettings({ appCategories: { 'b.exe': 'pessoal' } });
  assert.deepEqual(store.settings.appCategories, { 'b.exe': 'pessoal' });
});

test('chaves de API são gravadas criptografadas e lidas de volta', () => {
  const { dir, store } = tempStore();
  store.setSecret('groq', '  gsk_abc123  ');
  assert.equal(store.getSecret('groq'), 'gsk_abc123');
  assert.deepEqual(store.secretStatus(), { anthropic: false, groq: true, openai: false });
  const onDisk = fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8');
  assert.equal(onDisk.includes('gsk_abc123'), false);
  store.setSecret('groq', '');
  assert.equal(store.getSecret('groq'), '');
});

test('histórico guarda, busca e apaga; respeita "salvar histórico"', () => {
  const { store } = tempStore();
  const a = store.addHistory({ text: 'Reunião amanhã', app: 'Slack', words: 2 });
  store.addHistory({ text: 'Outro texto', app: 'Outlook', words: 2 });
  assert.equal(store.listHistory({ query: 'reunião' }).length, 1);
  assert.equal(store.listHistory({ query: 'outlook' }).length, 1);
  store.deleteHistory(a.id);
  assert.equal(store.history.length, 1);
  store.updateSettings({ saveHistory: false });
  store.addHistory({ text: 'não salvo' });
  assert.equal(store.history.length, 1);
});

test('coleções criam, atualizam e removem itens', () => {
  const { store } = tempStore();
  const created = store.upsert('snippets', { trigger: 'meu email', text: 'a@b.com' });
  store.upsert('snippets', { id: created.id, text: 'c@d.com' });
  assert.equal(store.list('snippets')[0].text, 'c@d.com');
  assert.equal(store.list('snippets')[0].trigger, 'meu email');
  store.remove('snippets', created.id);
  assert.equal(store.list('snippets').length, 0);
});

test('arquivos são gravados no disco ao finalizar', () => {
  const { dir, store } = tempStore();
  store.upsert('notes', { text: 'oi' });
  store.flushAll();
  const notes = JSON.parse(fs.readFileSync(path.join(dir, 'notes.json'), 'utf8'));
  assert.equal(notes[0].text, 'oi');
});
