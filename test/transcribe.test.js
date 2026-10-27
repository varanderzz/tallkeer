'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { transcribe } = require('../src/main/transcribe');
const { DEFAULT_SETTINGS } = require('../src/main/store');

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

function settings(patch = {}) {
  return { ...structuredClone(DEFAULT_SETTINGS), ...patch };
}

test('Groq recebe áudio, modelo, idioma e vocabulário; segmentos de silêncio saem', async () => {
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = { url, init };
    return new Response(
      JSON.stringify({
        text: ' Olá equipe. Obrigado.',
        language: 'portuguese',
        segments: [
          { text: ' Olá equipe.', no_speech_prob: 0.01, avg_logprob: -0.2 },
          { text: ' Obrigado.', no_speech_prob: 0.95, avg_logprob: -1.2 },
        ],
      }),
      { status: 200 },
    );
  };
  const result = await transcribe(new Uint8Array([1, 2, 3]), {
    settings: settings({ language: 'pt' }),
    getSecret: (name) => (name === 'groq' ? 'gsk_test' : ''),
    vocabulary: ['Kubernetes', 'Tallkeer'],
  });

  assert.equal(result.text, 'Olá equipe.');
  assert.equal(sent.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(sent.init.headers.Authorization, 'Bearer gsk_test');
  const form = sent.init.body;
  assert.equal(form.get('model'), 'whisper-large-v3-turbo');
  assert.equal(form.get('language'), 'pt');
  assert.equal(form.get('response_format'), 'verbose_json');
  assert.equal(form.get('prompt'), 'Vocabulário: Kubernetes, Tallkeer.');
  assert.equal(form.get('file').type, 'audio/wav');
});

test('OpenAI com gpt-4o-mini-transcribe pede json e não manda idioma em "auto"', async () => {
  let form = null;
  globalThis.fetch = async (_url, init) => {
    form = init.body;
    return new Response(JSON.stringify({ text: 'Hello there.' }), { status: 200 });
  };
  const result = await transcribe(new Uint8Array([1]), {
    settings: settings({ transcription: { ...DEFAULT_SETTINGS.transcription, provider: 'openai' } }),
    getSecret: () => 'sk-test',
    vocabulary: [],
  });
  assert.equal(result.text, 'Hello there.');
  assert.equal(form.get('response_format'), 'json');
  assert.equal(form.get('language'), null);
  assert.equal(form.get('prompt'), null);
});

test('erros viram mensagens claras', async () => {
  const opts = { settings: settings(), getSecret: () => 'gsk_test', vocabulary: [] };
  globalThis.fetch = async () => new Response('{"error":"bad key"}', { status: 401 });
  await assert.rejects(transcribe(new Uint8Array([1]), opts), /Chave da Groq inválida/);
  globalThis.fetch = async () => new Response('{}', { status: 429 });
  await assert.rejects(transcribe(new Uint8Array([1]), opts), /Limite de uso/);
  await assert.rejects(
    transcribe(new Uint8Array([1]), { ...opts, getSecret: () => '' }),
    /Configure a chave da Groq/,
  );
});
