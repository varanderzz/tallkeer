'use strict';

// Pós-processamento local do texto ditado: limpeza mínima (usada quando a
// formatação por IA está desligada ou falha), correções do dicionário,
// expansão de snippets e detecção das "alucinações" clássicas do Whisper.

const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}_])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}_])';

// Frases que o Whisper costuma inventar quando recebe silêncio ou ruído.
const HALLUCINATIONS = new Set([
  'obrigado',
  'obrigada',
  'obrigado por assistir',
  'tchau',
  'e ai',
  'inscrevase no canal',
  'legendas pela comunidade amaraorg',
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'bye',
  'you',
  'gracias',
  'subtitulos realizados por la comunidad de amaraorg',
]);

// Créditos de legenda que às vezes aparecem colados no fim de uma fala real.
const CREDIT_LINE = /\s*(legendas pela comunidade amara\.org|subt[ií]tulos realizados por la comunidad de amara\.org)\.?\s*$/iu;

const FILLERS = /(^|[\s,])(hum+|hmm+|h[ãa]+|ahn+|[ãa]h+|uhm+|uh+|erm+|eh+)(?=[\s,.!?]|$)[,]?/giu;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Regex que encontra uma frase inteira, ignorando maiúsculas e pontuação entre
// as palavras ("bom dia, equipe" também casa com "bom dia equipe").
function phraseRegExp(phrase) {
  const words = phrase.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (words.length === 0) return null;
  return new RegExp(`${BOUNDARY_BEFORE}${words.join('[\\s,;:.!?-]+')}${BOUNDARY_AFTER}`, 'giu');
}

function normalizeForCompare(text) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text) {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

function capitalizeFirst(text) {
  return text.replace(/^(\s*["'“(]?)(\p{Ll})/u, (_, prefix, letter) => prefix + letter.toUpperCase());
}

function localCleanup(text) {
  let result = text.replace(CREDIT_LINE, '');
  result = result.replace(FILLERS, '$1');
  result = result
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=\p{L})/gu, '$1 ')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/^[\s,]+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return capitalizeFirst(result);
}

function isLikelyHallucination(text, speechMs) {
  const normalized = normalizeForCompare(text);
  if (!normalized) return true;
  if (normalized.startsWith('legendas pela comunidade amara')) return true;
  return speechMs < 1500 && HALLUCINATIONS.has(normalized);
}

// Dicionário: cada entrada tem o termo correto e as variações que a
// transcrição costuma errar ("cubernetes" -> "Kubernetes").
function applyDictionary(text, entries) {
  let result = text;
  for (const entry of entries) {
    const term = (entry.term || '').trim();
    if (!term) continue;
    for (const variant of entry.variants || []) {
      const re = phraseRegExp(variant);
      if (re) result = result.replace(re, () => term);
    }
    // Garante a grafia exata do termo (maiúsculas, acentos já iguais).
    const exact = phraseRegExp(term);
    if (exact) result = result.replace(exact, () => term);
  }
  return result;
}

function vocabularyFrom(entries) {
  return entries.map((entry) => (entry.term || '').trim()).filter(Boolean);
}

// Snippets: se a fala inteira for o gatilho, o texto todo vira a expansão;
// se o gatilho aparecer no meio da frase, só ele é trocado.
function applySnippets(text, snippets) {
  const sorted = [...snippets]
    .filter((s) => (s.trigger || '').trim() && typeof s.text === 'string')
    .sort((a, b) => b.trigger.length - a.trigger.length);

  const whole = normalizeForCompare(text);
  for (const snippet of sorted) {
    if (whole === normalizeForCompare(snippet.trigger)) return { text: snippet.text, used: [snippet.id] };
  }

  let result = text;
  const used = [];
  for (const snippet of sorted) {
    const re = phraseRegExp(snippet.trigger);
    if (!re) continue;
    let hit = false;
    result = result.replace(re, () => {
      hit = true;
      return snippet.text;
    });
    if (hit) used.push(snippet.id);
  }
  return { text: result, used };
}

module.exports = {
  applyDictionary,
  applySnippets,
  countWords,
  isLikelyHallucination,
  localCleanup,
  normalizeForCompare,
  vocabularyFrom,
};
