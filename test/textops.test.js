'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyDictionary,
  applySnippets,
  countWords,
  isLikelyHallucination,
  localCleanup,
} = require('../src/main/textops');

test('localCleanup remove hesitações e arruma espaços e maiúscula', () => {
  assert.equal(localCleanup('hum então , a reunião é amanhã ahn às 10 .'), 'Então, a reunião é amanhã às 10.');
  assert.equal(localCleanup('ok,vamos lá'), 'Ok, vamos lá');
});

test('localCleanup não apaga palavras reais parecidas com hesitações', () => {
  assert.equal(localCleanup('ele é um bom humano'), 'Ele é um bom humano');
});

test('localCleanup remove créditos de legenda do fim', () => {
  assert.equal(localCleanup('Pode mandar o arquivo. Legendas pela comunidade Amara.org'), 'Pode mandar o arquivo.');
});

test('isLikelyHallucination pega frases curtas típicas do silêncio', () => {
  assert.equal(isLikelyHallucination('Obrigado.', 600), true);
  assert.equal(isLikelyHallucination('  ', 3000), true);
  assert.equal(isLikelyHallucination('Obrigado.', 4000), false);
  assert.equal(isLikelyHallucination('Obrigado pela ajuda ontem', 900), false);
});

test('applyDictionary corrige variações e mantém a grafia do termo', () => {
  const entries = [
    { term: 'Kubernetes', variants: ['cubernetes', 'cuber netes'] },
    { term: 'Gabriel', variants: [] },
  ];
  assert.equal(
    applyDictionary('o cubernetes e o Cuber Netes do gabriel', entries),
    'o Kubernetes e o Kubernetes do Gabriel',
  );
});

test('applyDictionary respeita limites de palavra', () => {
  const entries = [{ term: 'API', variants: ['api'] }];
  assert.equal(applyDictionary('a api e o apito', entries), 'a API e o apito');
});

test('applyDictionary não interpreta $ no termo como referência de regex', () => {
  const entries = [{ term: 'R$', variants: ['reais'] }];
  assert.equal(applyDictionary('100 reais', entries), '100 R$');
});

test('applySnippets troca a fala inteira quando ela é o gatilho', () => {
  const snippets = [{ id: 's1', trigger: 'meu email', text: 'gabriel@exemplo.com' }];
  assert.deepEqual(applySnippets('Meu email.', snippets), { text: 'gabriel@exemplo.com', used: ['s1'] });
  // Hífen e pontuação são ignorados na comparação da fala inteira.
  assert.deepEqual(applySnippets('Meu e-mail!', snippets), { text: 'gabriel@exemplo.com', used: ['s1'] });
  assert.deepEqual(applySnippets('Meu email antigo', snippets).used, ['s1']);
});

test('applySnippets troca o gatilho no meio da frase', () => {
  const snippets = [{ id: 's1', trigger: 'link da agenda', text: 'https://cal.exemplo.com/gabriel' }];
  const out = applySnippets('Pode marcar aqui: link da agenda, obrigado.', snippets);
  assert.equal(out.text, 'Pode marcar aqui: https://cal.exemplo.com/gabriel, obrigado.');
  assert.deepEqual(out.used, ['s1']);
});

test('countWords conta palavras com acento e números', () => {
  assert.equal(countWords('Olá, João! São 10h30 — tudo bem?'), 6);
});
