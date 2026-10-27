'use strict';

// Testa a integração com o Claude contra um servidor local que imita a API
// da Anthropic: confere o pedido enviado e a leitura da resposta.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let reply = null;
const requests = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
    const { status, json } = reply;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(json));
  });
});

function message(text, stopReason = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

let formatter;
const context = { app: 'Slack', category: 'trabalho', title: 'Canal #geral', exe: 'slack.exe' };

test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  formatter = require('../src/main/formatter');
});

test.after(() => server.close());

test('formatDictation envia contexto, estilo e fallback e lê <output>', async () => {
  reply = { status: 200, json: message('<output>Então, a reunião é amanhã às 10h.</output>') };
  const text = await formatter.formatDictation({
    transcript: 'hum então a reunião é amanhã ahn às dez',
    apiKey: 'sk-test',
    model: 'claude-opus-5-5',
    context,
    style: 'casual',
    language: 'pt',
    vocabulary: ['Kubernetes'],
    snippetTriggers: ['meu email'],
    sendWindowTitle: false,
  });
  assert.equal(text, 'Então, a reunião é amanhã às 10h.');

  const req = requests.at(-1);
  assert.match(req.url, /^\/v1\/messages/);
  assert.equal(req.headers['x-api-key'], 'sk-test');
  assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.deepEqual(req.body.output_config, { effort: 'low' });
  assert.equal(req.body.betas, undefined, 'betas vai no cabeçalho, não no corpo');
  const content = req.body.messages[0].content;
  assert.match(content, /<transcript>\nhum então a reunião/);
  assert.match(content, /Kubernetes/);
  assert.match(content, /"meu email"/);
  assert.match(content, /Casual:/);
  assert.doesNotMatch(content, /Canal #geral/, 'título da janela só vai com a opção ligada');
});

test('Haiku não recebe o parâmetro de fallback', async () => {
  reply = { status: 200, json: message('<output>ok</output>') };
  await formatter.formatDictation({
    transcript: 'ok',
    apiKey: 'sk-test',
    model: 'claude-haiku-5-5',
    context,
    style: 'formal',
    language: 'auto',
    vocabulary: [],
    snippetTriggers: [],
    sendWindowTitle: true,
  });
  const req = requests.at(-1);
  assert.equal(req.body.fallbacks, undefined);
  assert.doesNotMatch(req.headers['anthropic-beta'] || '', /server-side-fallback/);
  assert.match(req.body.messages[0].content, /Window title: Canal #geral/);
});

test('runCommand manda a seleção e a instrução', async () => {
  reply = { status: 200, json: message('<output>Prezada Ana, confirmo a reunião.</output>') };
  const text = await formatter.runCommand({
    instruction: 'deixa mais formal',
    selectedText: 'oi ana, fechado pra reunião',
    apiKey: 'sk-test',
    model: 'claude-opus-5-5',
    context,
    sendWindowTitle: false,
  });
  assert.equal(text, 'Prezada Ana, confirmo a reunião.');
  const req = requests.at(-1);
  assert.deepEqual(req.body.output_config, { effort: 'medium' });
  assert.match(req.body.messages[0].content, /<selected_text>\noi ana, fechado/);
  assert.match(req.body.messages[0].content, /<instruction>\ndeixa mais formal/);
});

test('recusa e chave inválida viram mensagens em português', async () => {
  reply = { status: 200, json: message('', 'refusal') };
  await assert.rejects(
    formatter.formatDictation({ transcript: 'x', apiKey: 'sk-test', model: 'claude-opus-5-5', context, style: 'formal', vocabulary: [], snippetTriggers: [] }),
    /recusou/,
  );
  reply = { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } };
  await assert.rejects(
    formatter.formatDictation({ transcript: 'x', apiKey: 'sk-bad', model: 'claude-opus-5-5', context, style: 'formal', vocabulary: [], snippetTriggers: [] }),
    /Chave da Anthropic inválida/,
  );
});
