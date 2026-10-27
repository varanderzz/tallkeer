'use strict';

// Transcrição de fala: Groq ou OpenAI (API de transcrição compatível) ou
// whisper.cpp rodando localmente, sem internet.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

class TranscriptionError extends Error {}

const CLOUD = {
  groq: {
    label: 'Groq',
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    secret: 'groq',
    modelSetting: 'groqModel',
    verbose: true,
  },
  openai: {
    label: 'OpenAI',
    url: 'https://api.openai.com/v1/audio/transcriptions',
    secret: 'openai',
    modelSetting: 'openaiModel',
    // Os modelos gpt-4o-*-transcribe só devolvem "json"/"text".
    verbose: false,
  },
};

// O "prompt" do Whisper serve para enviesar a grafia de nomes e termos.
function vocabularyPrompt(vocabulary) {
  if (!vocabulary.length) return '';
  return `Vocabulário: ${vocabulary.join(', ')}.`.slice(0, 800);
}

async function transcribeCloud(providerId, wav, { settings, getSecret, vocabulary }) {
  const provider = CLOUD[providerId];
  const apiKey = getSecret(provider.secret);
  if (!apiKey) throw new TranscriptionError(`Configure a chave da ${provider.label} em Configurações.`);

  const model = settings.transcription[provider.modelSetting];
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'tallkeer.wav');
  form.append('model', model);
  form.append('temperature', '0');
  form.append('response_format', provider.verbose && model.startsWith('whisper') ? 'verbose_json' : 'json');
  if (settings.language !== 'auto') form.append('language', settings.language);
  const prompt = vocabularyPrompt(vocabulary);
  if (prompt) form.append('prompt', prompt);

  let res;
  try {
    res = await fetch(provider.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    throw new TranscriptionError(
      err.name === 'TimeoutError' ? `A ${provider.label} demorou demais para responder.` : `Sem conexão com a ${provider.label}.`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 401) throw new TranscriptionError(`Chave da ${provider.label} inválida.`);
    if (res.status === 429) throw new TranscriptionError(`Limite de uso da ${provider.label} atingido. Tente de novo em instantes.`);
    throw new TranscriptionError(`Erro ${res.status} da ${provider.label}: ${detail.slice(0, 160)}`);
  }

  const body = await res.json();
  let text = body.text || '';
  // Segmentos que o próprio modelo marca como "provavelmente silêncio" saem.
  if (Array.isArray(body.segments) && body.segments.length) {
    const spoken = body.segments.filter((s) => !(s.no_speech_prob > 0.8 && s.avg_logprob < -0.8));
    text = spoken.map((s) => s.text).join('');
  }
  return { text: text.trim(), language: body.language || settings.language, provider: providerId };
}

function transcribeLocal(wav, { settings, vocabulary }) {
  const { whisperCppPath, whisperCppModel } = settings.transcription;
  if (!whisperCppPath || !fs.existsSync(whisperCppPath)) {
    throw new TranscriptionError('Informe o caminho do whisper-cli.exe em Configurações.');
  }
  if (!whisperCppModel || !fs.existsSync(whisperCppModel)) {
    throw new TranscriptionError('Informe o arquivo do modelo do whisper.cpp (.bin) em Configurações.');
  }

  const file = path.join(os.tmpdir(), `tallkeer-${crypto.randomUUID()}.wav`);
  fs.writeFileSync(file, Buffer.from(wav));
  const args = ['-m', whisperCppModel, '-f', file, '-nt', '-np', '-l', settings.language === 'auto' ? 'auto' : settings.language];
  const prompt = vocabularyPrompt(vocabulary);
  if (prompt) args.push('--prompt', prompt);

  return new Promise((resolve, reject) => {
    execFile(whisperCppPath, args, { timeout: 120000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      fs.rm(file, { force: true }, () => {});
      if (err) {
        reject(new TranscriptionError(`whisper.cpp falhou: ${err.message.slice(0, 160)}`));
        return;
      }
      const text = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ');
      resolve({ text, language: settings.language, provider: 'local' });
    });
  });
}

function transcribe(wav, options) {
  const provider = options.settings.transcription.provider;
  if (provider === 'local') return transcribeLocal(wav, options);
  if (!CLOUD[provider]) throw new TranscriptionError(`Provedor de transcrição desconhecido: ${provider}`);
  return transcribeCloud(provider, wav, options);
}

async function testCloudKey(providerId, apiKey) {
  const provider = CLOUD[providerId];
  const base = provider.url.replace(/\/audio\/transcriptions$/, '');
  const res = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) return { ok: false, message: 'Chave inválida.' };
  if (!res.ok) return { ok: false, message: `Erro ${res.status}.` };
  return { ok: true, message: `Chave da ${provider.label} funcionando.` };
}

module.exports = { transcribe, testCloudKey, TranscriptionError };
