'use strict';

const api = window.tallkeer;
const pageEl = document.getElementById('page');
const contentEl = document.getElementById('content');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let state = null;
let current = null; // página aberta: { name, onHistory?, onLeave? }

// --- Utilidades ------------------------------------------------------------

// Cria elementos sem innerHTML: textos do usuário nunca viram HTML.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Ícones de traço único, desenhados à mão.
const ICONS = {
  search: ['M11 11l4 4', 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z'],
  check: ['M3.5 8.5l3 3 6-7'],
  arrow: ['M3 8h10', 'M9 4l4 4-4 4'],
  plus: ['M8 3v10', 'M3 8h10'],
};

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

function combo(keys) {
  return h(
    'span',
    { class: 'combo' },
    keys.map((k) => h('kbd', { text: { Meta: 'Win', Escape: 'Esc' }[k] || k })),
  );
}

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function confirmDialog({ title, text, confirm, danger = false }) {
  return new Promise((resolve) => {
    const close = (answer) => {
      scrim.classList.add('closing');
      setTimeout(() => scrim.remove(), 200);
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close(false);
    };
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, text: confirm, onclick: () => close(true) });
    const scrim = h(
      'div',
      { class: 'scrim', onclick: (event) => event.target === scrim && close(false) },
      h(
        'div',
        { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('h3', { text: title }),
        h('p', { text }),
        h('div', { class: 'actions' }, h('button', { class: 'btn quiet', text: 'Cancelar', onclick: () => close(false) }), ok),
      ),
    );
    document.addEventListener('keydown', onKey);
    document.body.append(scrim);
    ok.focus();
  });
}

const numberFormat = new Intl.NumberFormat('pt-BR');

// Os números sobem do zero até o valor, desacelerando no fim. Só na entrada
// da página: ao atualizar a mesma página o valor aparece direto.
let animateNumbers = true;

function countUp(el, value, format = (n) => numberFormat.format(n)) {
  if (!animateNumbers || reducedMotion.matches || value === 0) {
    el.textContent = format(value);
    return;
  }
  const start = performance.now();
  const duration = 1100;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = format(Math.round(value * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function formatDuration(min) {
  if (min < 60) return { value: min, unit: 'min' };
  return { value: Math.round((min / 60) * 10) / 10, unit: 'h' };
}

function timeOf(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(ts) {
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return 'Hoje';
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

async function saveSettings(patch, message = 'Salvo') {
  state = await api.updateSettings(patch);
  updateSidebar();
  if (message) toast(message);
}

function transcriptionReady() {
  const { provider, whisperCppPath } = state.settings.transcription;
  return provider === 'local' ? Boolean(whisperCppPath) : Boolean(state.secrets[provider]);
}

function updateSidebar() {
  document.getElementById('hotkey-hint').replaceChildren(combo(state.settings.hotkeys.dictation));
  const status = document.getElementById('status');
  let kind = 'ready';
  let text = 'Pronto para ouvir';
  if (state.paused) {
    kind = 'paused';
    text = 'Atalhos pausados';
  } else if (!transcriptionReady()) {
    kind = 'pending';
    text = 'Configuração pendente';
  }
  status.className = `status-line ${kind}`;
  status.querySelector('.status-text').textContent = text;
}

// Cabeçalho editorial: rótulo pequeno, título serifado, linha de apoio.
function header({ eyebrow, title, lede }) {
  return [
    h('div', { class: 'eyebrow', text: eyebrow }),
    h('h1', {}, title),
    lede ? h('p', { class: 'lede', text: lede }) : null,
  ];
}

function sectionHead(title, aside = null) {
  return h('div', { class: 'section-head' }, h('h2', {}, title), aside);
}

function empty(big, note) {
  return h('div', { class: 'empty' }, h('div', { class: 'big', text: big }), note ? h('div', { class: 'note', text: note }) : null);
}

const MODE_LABEL = { dictation: 'Ditado', command: 'Comando' };
const CATEGORY_LABEL = { email: 'E-mail', trabalho: 'Trabalho', pessoal: 'Pessoal', outros: 'Outros' };

function entryRow(item, { onDelete, fresh = false } = {}) {
  let raw = null;
  const body = h(
    'div',
    {},
    h('div', { class: 'text', text: item.text }),
    h(
      'div',
      { class: 'meta' },
      h('span', { text: item.app || 'Outro' }),
      item.mode === 'command' ? h('span', { class: 'tag sand', text: MODE_LABEL.command }) : null,
      item.formatted ? null : h('span', { class: 'tag', text: 'Sem IA' }),
    ),
  );
  return h(
    'div',
    { class: `entry${fresh ? ' fresh' : ''}` },
    h('div', { class: 'time', text: timeOf(item.ts) }),
    body,
    h(
      'div',
      { class: 'actions' },
      h('button', {
        class: 'btn quiet sm',
        text: 'Copiar',
        onclick: async () => {
          await api.copy(item.text);
          toast('Copiado');
        },
      }),
      item.raw && item.raw !== item.text
        ? h('button', {
            class: 'btn quiet sm',
            text: 'Original',
            onclick: () => {
              if (raw) {
                raw.remove();
                raw = null;
              } else {
                raw = h('div', { class: 'raw', text: item.raw });
                body.insertBefore(raw, body.children[1]);
              }
            },
          })
        : null,
      onDelete ? h('button', { class: 'btn quiet sm danger', text: 'Excluir', onclick: onDelete }) : null,
    ),
  );
}

// --- Início ---------------------------------------------------------------

async function renderHome() {
  const { settings, secrets, stats } = state;
  const formattingReady = !settings.formatting.enabled || secrets.anthropic;
  const hour = new Date().getHours();
  const period = hour < 12 ? 'dia' : hour < 18 ? 'tarde' : 'noite';
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const blocks = [
    ...header({
      eyebrow: today,
      title: [hour < 12 ? 'Bom ' : 'Boa ', h('em', { text: period }), '.'],
      lede: 'Fale em qualquer aplicativo. O Tallkeer escreve, pontua e cola o texto para você.',
    }),
  ];

  // Bento de números.
  const figure = (value, unit, format) => {
    const number = h('span');
    countUp(number, value, format);
    return h('div', { class: 'figure' }, number, unit ? h('span', { class: 'unit', text: unit }) : null);
  };
  const maxDay = Math.max(1, ...stats.daily.map((d) => d.words));
  const chart = h(
    'div',
    { class: 'chart', 'aria-label': 'Palavras ditadas nos últimos 7 dias' },
    stats.daily.map((d, i) => {
      const bar = h('div', { class: 'bar', title: `${numberFormat.format(d.words)} palavras` });
      bar.style.height = `${Math.max(2, (d.words / maxDay) * 100)}%`;
      bar.style.setProperty('--i', i);
      const label = new Date(d.ts).toLocaleDateString('pt-BR', { weekday: 'narrow' });
      return h('div', { class: `col${i === 6 ? ' today' : ''}` }, h('div', { class: 'bar-wrap' }, bar), h('span', { class: 'day', text: label }));
    }),
  );
  const saved = formatDuration(stats.savedMinutes);
  const topApp = stats.topApps[0]?.app;
  blocks.push(
    h(
      'div',
      { class: 'bento' },
      h('div', { class: 'tile hero' }, h('div', {}, h('div', { class: 'label', text: 'Palavras ditadas' }), figure(stats.words)), chart),
      h('div', { class: 'tile' }, h('div', { class: 'label', text: 'Velocidade' }), figure(stats.wpm, 'ppm')),
      h(
        'div',
        { class: 'tile' },
        h('div', { class: 'label', text: 'Tempo economizado' }),
        figure(saved.value, saved.unit, (n) => numberFormat.format(n)),
      ),
      h('div', { class: 'tile' }, h('div', { class: 'label', text: 'Sequência' }), figure(stats.streak, stats.streak === 1 ? 'dia' : 'dias')),
      h(
        'div',
        { class: 'tile' },
        h('div', { class: 'label', text: 'Mais usado em' }),
        h('div', { class: 'figure text', text: topApp || '—' }),
      ),
    ),
  );

  // Primeiros passos.
  if (!settings.onboarded || !transcriptionReady() || !formattingReady) {
    const step = (done, n, title, desc, action) =>
      h(
        'div',
        { class: `row-item${done ? ' done' : ''}` },
        h('span', { class: 'num', text: String(n).padStart(2, '0') }),
        h('div', {}, h('div', { class: 'title', text: title }), h('div', { class: 'desc', text: desc })),
        done ? h('span', { class: 'tag green', text: 'Pronto' }) : action,
      );
    const goSettings = () => h('button', { class: 'btn sm', text: 'Configurar', onclick: () => navigate('configuracoes') });
    blocks.push(
      h(
        'section',
        {},
        sectionHead(['Primeiros ', h('em', { text: 'passos' })]),
        h(
          'div',
          { class: 'rows' },
          step(transcriptionReady(), 1, 'Transcrição de voz', 'Uma chave da Groq (rápida, com plano gratuito) ou da OpenAI, ou o whisper.cpp local.', goSettings()),
          step(formattingReady, 2, 'Formatação com o Claude', 'Tira hesitações, pontua, aplica correções e o estilo de cada app.', goSettings()),
          step(
            settings.onboarded,
            3,
            'Primeiro ditado',
            'Abra o Bloco de Notas, segure o atalho, fale e solte.',
            h('button', {
              class: 'btn sm primary',
              text: 'Entendi',
              onclick: async () => {
                await saveSettings({ onboarded: true }, null);
                navigate('inicio');
              },
            }),
          ),
        ),
      ),
    );
  }

  // Como usar.
  const { dictation, command } = settings.hotkeys;
  const gesture = (keys, title, desc) => h('div', { class: 'gesture' }, keys, h('div', { class: 'title', text: title }), h('div', { class: 'desc', text: desc }));
  blocks.push(
    h(
      'section',
      {},
      sectionHead(['Como ', h('em', { text: 'usar' })]),
      h(
        'div',
        { class: 'gestures' },
        gesture(combo(dictation), 'Segure para ditar', 'Fale enquanto segura. Ao soltar, o texto aparece onde está o cursor.'),
        gesture(combo(dictation), 'Toque para mãos livres', 'Um toque rápido começa a gravar; outro toque termina.'),
        gesture(combo(command), 'Modo Comando', 'Selecione um texto e diga o que fazer: "deixa mais formal", "traduz para inglês".'),
        gesture(combo(['Escape']), 'Cancelar', 'Descarta a gravação em andamento.'),
      ),
    ),
  );

  // Recentes.
  const recent = await api.history.list({ limit: 5 });
  const list = h('div', { class: 'entries' });
  if (recent.length) recent.forEach((item) => list.append(entryRow(item)));
  else list.append(empty('Nada por aqui ainda.', 'Seus ditados aparecem aqui assim que você falar.'));
  blocks.push(
    h(
      'section',
      {},
      sectionHead(['Recentes'], h('button', { class: 'btn quiet sm', onclick: () => navigate('historico') }, 'Ver tudo', icon('arrow'))),
      list,
    ),
  );

  return { blocks, hooks: { onHistory: () => navigate('inicio', { keepScroll: true }) } };
}

// --- Histórico ------------------------------------------------------------

async function renderHistory() {
  const list = h('div', { class: 'entries' });
  const search = h('input', { type: 'search', placeholder: 'Buscar no que você ditou', 'aria-label': 'Buscar no histórico' });
  let shown = [];

  async function load() {
    const items = await api.history.list({ query: search.value, limit: 500 });
    shown = items;
    list.replaceChildren();
    if (!items.length) {
      list.append(search.value ? empty('Nada encontrado.', 'Tente outra palavra.') : empty('Nenhum ditado ainda.', 'Segure o atalho em qualquer app para começar.'));
      return;
    }
    let lastDay = '';
    for (const item of items) {
      const day = dayLabel(item.ts);
      if (day !== lastDay) {
        list.append(h('div', { class: 'eyebrow day-label', text: day }));
        lastDay = day;
      }
      list.append(
        entryRow(item, {
          onDelete: async () => {
            state.stats = await api.history.remove(item.id);
            load();
          },
        }),
      );
    }
  }

  search.addEventListener('input', debounce(load, 180));
  const blocks = [
    ...header({ eyebrow: 'Histórico', title: ['Seu ', h('em', { text: 'histórico' })], lede: 'Tudo o que você ditou, guardado só neste computador.' }),
    h(
      'div',
      { class: 'toolbar' },
      h('label', { class: 'search' }, icon('search'), search),
      h('button', {
        class: 'btn quiet danger',
        text: 'Limpar tudo',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Apagar o histórico?',
            text: 'Todos os ditados salvos neste computador serão apagados. Isso não pode ser desfeito.',
            confirm: 'Apagar tudo',
            danger: true,
          });
          if (!ok) return;
          state.stats = await api.history.clear();
          load();
        },
      }),
    ),
    h('section', { class: 'tight' }, list),
  ];
  await load();
  return {
    blocks,
    hooks: {
      onHistory: (item) => {
        if (search.value || !shown.length) return load();
        const first = list.querySelector('.day-label');
        const row = entryRow(item, { fresh: true, onDelete: async () => { state.stats = await api.history.remove(item.id); load(); } });
        if (first && first.textContent === 'Hoje') first.after(row);
        else load();
        shown.unshift(item);
      },
    },
  };
}

// --- Dicionário -----------------------------------------------------------

async function renderDictionary() {
  const term = h('input', { class: 'input', type: 'text', placeholder: 'Kubernetes' });
  const variants = h('input', { class: 'input', type: 'text', placeholder: 'cubernetes, cuber netes' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Adicionar');
  const list = h('div', { class: 'entries' });
  let editingId = null;

  function resetForm() {
    editingId = null;
    term.value = '';
    variants.value = '';
    submit.replaceChildren(icon('plus'), 'Adicionar');
  }

  async function load() {
    const entries = await api.collection.list('dictionary');
    list.replaceChildren();
    if (!entries.length) list.append(empty('Nenhuma palavra ainda.', 'Adicione nomes, marcas e termos que a transcrição costuma errar.'));
    for (const entry of entries) {
      list.append(
        h(
          'div',
          { class: 'entry plain' },
          h(
            'div',
            {},
            h('div', { class: 'term', text: entry.term }),
            entry.variants?.length
              ? h('div', { class: 'meta' }, h('span', { text: 'Corrige' }), entry.variants.map((v) => h('span', { class: 'tag literal', text: v })))
              : null,
          ),
          h(
            'div',
            { class: 'actions' },
            h('button', {
              class: 'btn quiet sm',
              text: 'Editar',
              onclick: () => {
                editingId = entry.id;
                term.value = entry.term;
                variants.value = (entry.variants || []).join(', ');
                submit.replaceChildren('Salvar');
                term.focus();
              },
            }),
            h('button', {
              class: 'btn quiet sm danger',
              text: 'Excluir',
              onclick: async () => {
                await api.collection.remove('dictionary', entry.id);
                load();
              },
            }),
          ),
        ),
      );
    }
  }

  const form = h(
    'form',
    {
      class: 'composer',
      onsubmit: async (event) => {
        event.preventDefault();
        if (!term.value.trim()) return term.focus();
        await api.collection.upsert('dictionary', {
          id: editingId || undefined,
          term: term.value,
          variants: variants.value.split(',').map((v) => v.trim()).filter(Boolean),
        });
        resetForm();
        toast('Dicionário atualizado');
        load();
      },
    },
    h(
      'div',
      { class: 'fields' },
      h('label', { class: 'field' }, h('span', { text: 'Grafia correta' }), term),
      h('label', { class: 'field' }, h('span', { text: 'Corrigir quando sair assim' }), variants),
    ),
    h('div', { class: 'footer' }, h('span', { class: 'note', text: 'Separe as variações por vírgula. Elas são opcionais.' }), submit),
  );

  await load();
  return {
    blocks: [
      ...header({
        eyebrow: 'Dicionário',
        title: ['Seu ', h('em', { text: 'vocabulário' })],
        lede: 'Nomes, marcas e termos que você usa. O Tallkeer ensina a grafia à transcrição e ao Claude, e corrige o que sair errado.',
      }),
      form,
      h('section', {}, sectionHead('Palavras'), list),
    ],
  };
}

// --- Snippets -------------------------------------------------------------

async function renderSnippets() {
  const trigger = h('input', { class: 'input', type: 'text', placeholder: 'meu link de agenda' });
  const text = h('textarea', { placeholder: 'https://cal.com/seu-nome — escolha o melhor horário para você.' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Adicionar');
  const list = h('div', { class: 'entries' });
  let editingId = null;

  async function load() {
    const snippets = await api.collection.list('snippets');
    list.replaceChildren();
    if (!snippets.length) list.append(empty('Nenhum snippet ainda.', 'Crie atalhos de voz para e-mails, endereços e respostas prontas.'));
    for (const snippet of snippets) {
      list.append(
        h(
          'div',
          { class: 'entry plain' },
          h('div', {}, h('div', { class: 'trigger', text: `“${snippet.trigger}”` }), h('div', { class: 'expansion', text: snippet.text })),
          h(
            'div',
            { class: 'actions' },
            h('button', {
              class: 'btn quiet sm',
              text: 'Editar',
              onclick: () => {
                editingId = snippet.id;
                trigger.value = snippet.trigger;
                text.value = snippet.text;
                submit.replaceChildren('Salvar');
                trigger.focus();
              },
            }),
            h('button', {
              class: 'btn quiet sm danger',
              text: 'Excluir',
              onclick: async () => {
                await api.collection.remove('snippets', snippet.id);
                load();
              },
            }),
          ),
        ),
      );
    }
  }

  const form = h(
    'form',
    {
      class: 'composer',
      onsubmit: async (event) => {
        event.preventDefault();
        if (!trigger.value.trim()) return trigger.focus();
        if (!text.value.trim()) return text.focus();
        await api.collection.upsert('snippets', { id: editingId || undefined, trigger: trigger.value, text: text.value });
        editingId = null;
        trigger.value = '';
        text.value = '';
        submit.replaceChildren(icon('plus'), 'Adicionar');
        toast('Snippet salvo');
        load();
      },
    },
    h('label', { class: 'field' }, h('span', { text: 'Quando eu disser' }), trigger),
    h('label', { class: 'field' }, h('span', { text: 'Inserir' }), text),
    h('div', { class: 'footer' }, h('span', { class: 'note', text: 'Funciona sozinho ou no meio de uma frase.' }), submit),
  );

  await load();
  return {
    blocks: [
      ...header({
        eyebrow: 'Snippets',
        title: ['Atalhos de ', h('em', { text: 'voz' })],
        lede: 'Diga a frase-gatilho e o Tallkeer insere o texto completo.',
      }),
      form,
      h('section', {}, sectionHead('Seus snippets'), list),
    ],
  };
}

// --- Estilos --------------------------------------------------------------

const STYLE_OPTIONS = [
  { id: 'formal', name: 'Formal', sample: 'Olá, Ana. Está tudo certo para amanhã às 10h?' },
  { id: 'casual', name: 'Casual', sample: 'Oi Ana, tudo certo pra amanhã às 10h?' },
  { id: 'muito_casual', name: 'Muito casual', sample: 'oi ana tudo certo pra amanha 10h' },
];

const CATEGORY_INFO = {
  email: 'Outlook, Thunderbird, Gmail e outros e-mails no navegador',
  trabalho: 'Slack, Teams, Google Chat, Zoom',
  pessoal: 'WhatsApp, Telegram, Discord, Messenger',
  outros: 'Documentos, navegador, editores de código e o resto',
};

async function renderStyles() {
  const groups = Object.entries(CATEGORY_INFO).map(([category, desc]) =>
    h(
      'div',
      { class: 'style-group' },
      h('div', { class: 'head' }, h('h2', { text: CATEGORY_LABEL[category] }), h('span', { class: 'note', text: desc })),
      h(
        'div',
        { class: 'options' },
        STYLE_OPTIONS.map((option) =>
          h(
            'label',
            { class: 'option' },
            h('input', {
              type: 'radio',
              name: `style-${category}`,
              value: option.id,
              checked: state.settings.styles[category] === option.id,
              onchange: () => saveSettings({ styles: { [category]: option.id } }, `${CATEGORY_LABEL[category]}: ${option.name.toLowerCase()}`),
            }),
            h('span', { class: 'check', 'aria-hidden': 'true' }),
            h('span', { class: 'name', text: option.name }),
            h('span', { class: 'sample', text: option.sample }),
          ),
        ),
      ),
    ),
  );

  // Regras para apps que o Tallkeer não reconhece sozinho.
  const exe = h('input', { class: 'input', type: 'text', placeholder: 'notion.exe' });
  const select = h('select', { 'aria-label': 'Categoria' }, Object.entries(CATEGORY_LABEL).map(([id, name]) => h('option', { value: id, text: name })));
  const rules = h('div', { class: 'entries' });

  function drawRules() {
    rules.replaceChildren();
    const entries = Object.entries(state.settings.appCategories);
    if (!entries.length) rules.append(h('div', { class: 'note', text: 'Nenhuma regra personalizada.' }));
    for (const [name, category] of entries) {
      rules.append(
        h(
          'div',
          { class: 'entry plain' },
          h('div', { class: 'meta' }, h('span', { class: 'mono', text: name }), icon('arrow'), h('span', { text: CATEGORY_LABEL[category] })),
          h(
            'div',
            { class: 'actions' },
            h('button', {
              class: 'btn quiet sm danger',
              text: 'Remover',
              onclick: async () => {
                const next = { ...state.settings.appCategories };
                delete next[name];
                await saveSettings({ appCategories: next }, 'Regra removida');
                drawRules();
              },
            }),
          ),
        ),
      );
    }
  }
  drawRules();

  return {
    blocks: [
      ...header({
        eyebrow: 'Estilos',
        title: ['Tom de ', h('em', { text: 'escrita' })],
        lede: 'O Tallkeer ajusta o tom conforme o aplicativo em que você está escrevendo.',
      }),
      h('section', { class: 'tight' }, groups),
      h(
        'section',
        {},
        sectionHead(['Regras por ', h('em', { text: 'aplicativo' })]),
        h(
          'form',
          {
            class: 'composer',
            onsubmit: async (event) => {
              event.preventDefault();
              const name = exe.value.trim().toLowerCase();
              if (!name) return exe.focus();
              const key = name.endsWith('.exe') ? name : `${name}.exe`;
              await saveSettings({ appCategories: { ...state.settings.appCategories, [key]: select.value } }, 'Regra salva');
              exe.value = '';
              drawRules();
            },
          },
          h(
            'div',
            { class: 'fields' },
            h('label', { class: 'field' }, h('span', { text: 'Programa' }), exe),
            h('label', { class: 'field' }, h('span', { text: 'Categoria' }), select),
          ),
          h(
            'div',
            { class: 'footer' },
            h('span', { class: 'note', text: 'O nome do executável aparece no Gerenciador de Tarefas, na aba Detalhes.' }),
            h('button', { class: 'btn', type: 'submit', text: 'Adicionar regra' }),
          ),
        ),
        rules,
      ),
    ],
  };
}

// --- Notas ----------------------------------------------------------------

async function renderNotes() {
  let notes = await api.collection.list('notes');
  let selected = notes[0]?.id || null;
  const listEl = h('div', { class: 'notes-list' });
  const editor = h('textarea', { placeholder: 'Clique aqui, segure o atalho e comece a falar.', 'aria-label': 'Texto da nota' });
  const removeBtn = h('button', { class: 'btn quiet sm danger', text: 'Excluir nota' });
  const copyBtn = h('button', { class: 'btn quiet sm', text: 'Copiar' });
  const savedLabel = h('span', { class: 'note' });

  const persist = debounce(async (id, text) => {
    // Nota já excluída ou nenhuma selecionada: nada a salvar.
    if (!id || !notes.some((n) => n.id === id)) return;
    const saved = await api.collection.upsert('notes', { id, text });
    notes = notes.map((n) => (n.id === saved.id ? saved : n));
    savedLabel.textContent = `Salvo às ${timeOf(saved.updatedAt)}`;
    drawList();
  }, 500);

  const titleOf = (note) => (note.text || '').trim().split('\n')[0].slice(0, 60) || 'Nota sem título';

  function drawList() {
    listEl.replaceChildren(
      h(
        'button',
        {
          class: 'btn',
          onclick: async () => {
            persist.flush(selected, editor.value);
            const note = await api.collection.upsert('notes', { text: '' });
            notes.unshift(note);
            select(note.id);
            editor.focus();
          },
        },
        icon('plus'),
        'Nova nota',
      ),
    );
    for (const note of notes) {
      listEl.append(
        h(
          'button',
          { class: 'note-entry', 'aria-current': note.id === selected ? 'true' : 'false', onclick: () => select(note.id) },
          h('div', { class: 't', text: titleOf(note) }),
          h('div', { class: 'd', text: new Date(note.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }),
        ),
      );
    }
  }

  function select(id) {
    if (selected && selected !== id) persist.flush(selected, editor.value);
    selected = id;
    const note = notes.find((n) => n.id === id);
    editor.value = note?.text || '';
    editor.disabled = !note;
    removeBtn.disabled = !note;
    copyBtn.disabled = !note;
    savedLabel.textContent = '';
    drawList();
  }

  editor.addEventListener('input', () => {
    if (!selected) return;
    const note = notes.find((n) => n.id === selected);
    if (note) note.text = editor.value;
    persist(selected, editor.value);
  });
  removeBtn.addEventListener('click', async () => {
    if (!selected) return;
    const ok = await confirmDialog({ title: 'Excluir esta nota?', text: 'O texto será apagado deste computador.', confirm: 'Excluir', danger: true });
    if (!ok) return;
    await api.collection.remove('notes', selected);
    notes = notes.filter((n) => n.id !== selected);
    selected = null;
    select(notes[0]?.id || null);
  });
  copyBtn.addEventListener('click', async () => {
    await api.copy(editor.value);
    toast('Nota copiada');
  });

  select(selected);
  return {
    blocks: [
      ...header({ eyebrow: 'Notas', title: ['Suas ', h('em', { text: 'notas' })], lede: 'Um lugar para ditar ideias soltas antes de levá-las para outro app.' }),
      h(
        'div',
        { class: 'notes' },
        listEl,
        h('div', { class: 'note-editor' }, editor, h('div', { class: 'footer' }, h('div', {}, copyBtn, removeBtn), savedLabel)),
      ),
    ],
    hooks: { onLeave: () => persist.flush(selected, editor.value) },
  };
}

// --- Configurações --------------------------------------------------------

const LANGUAGES = [
  ['auto', 'Detectar automaticamente'],
  ['pt', 'Português'],
  ['en', 'English'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
  ['ja', '日本語'],
  ['zh', '中文'],
];

const CLAUDE_MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 · melhor qualidade'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 · equilíbrio'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 · mais rápido'],
];

function setting(title, desc, control, extraClass = '') {
  return h(
    'div',
    { class: `setting ${extraClass}` },
    title ? h('div', { class: 'info' }, h('div', { class: 'title', text: title }), desc ? h('div', { class: 'desc', text: desc }) : null) : null,
    control,
  );
}

function toggle(checked, onchange, label) {
  return h('input', { type: 'checkbox', class: 'switch', checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked) });
}

function segmented(options, value, onchange, label) {
  const thumb = h('span', { class: 'thumb', 'aria-hidden': 'true' });
  const buttons = options.map(([id, name]) =>
    h('button', {
      type: 'button',
      text: name,
      'aria-pressed': String(id === value),
      onclick: () => {
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === buttons[options.findIndex(([o]) => o === id)])));
        place();
        onchange(id);
      },
    }),
  );
  const root = h('div', { class: 'segmented', role: 'group', 'aria-label': label }, thumb, buttons);
  function place() {
    const active = buttons.find((b) => b.getAttribute('aria-pressed') === 'true');
    if (!active || !active.offsetWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  // Posiciona o marcador assim que o controle ganha tamanho na tela.
  new ResizeObserver(place).observe(root);
  return root;
}

function secretField(name, label, url) {
  const saved = state.secrets[name];
  const input = h('input', {
    class: 'input',
    type: 'password',
    placeholder: saved ? '••••••••••••••••••••  salva' : 'Cole sua chave aqui',
    autocomplete: 'off',
    spellcheck: false,
    'aria-label': label,
  });
  const msg = h('span', { class: 'msg' });
  const setMsg = (ok, message) => {
    msg.className = `msg ${ok ? 'ok' : 'err'}`;
    msg.textContent = message;
  };
  const test = async () => {
    msg.className = 'msg';
    msg.textContent = 'Testando…';
    const result = await api.testSecret(name);
    setMsg(result.ok, result.message);
  };
  return h(
    'div',
    { class: 'field' },
    h('span', { text: label }),
    h(
      'div',
      { class: 'key-row' },
      input,
      h('button', {
        class: 'btn primary',
        text: 'Salvar',
        onclick: async () => {
          if (!input.value.trim()) return input.focus();
          state.secrets = await api.setSecret(name, input.value);
          input.value = '';
          input.placeholder = '••••••••••••••••••••  salva';
          updateSidebar();
          test();
        },
      }),
      h('button', { class: 'btn', text: 'Testar', onclick: test }),
    ),
    h(
      'div',
      { class: 'key-status' },
      h('button', { class: 'link', text: 'Criar uma chave', onclick: () => api.openUrl(url) }),
      saved
        ? h('button', {
            class: 'link',
            text: 'Remover chave',
            onclick: async () => {
              state.secrets = await api.setSecret(name, '');
              updateSidebar();
              navigate('configuracoes', { keepScroll: true });
            },
          })
        : null,
      msg,
    ),
  );
}

async function microphoneSelect() {
  const select = h('select', { 'aria-label': 'Microfone' }, h('option', { value: 'default', text: 'Padrão do Windows' }));
  try {
    // Os nomes dos dispositivos só aparecem depois de liberar o microfone.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* sem permissão: a lista vem sem nomes */
  }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications',
  );
  devices.forEach((d, i) => select.append(h('option', { value: d.deviceId, text: d.label || `Microfone ${i + 1}` })));
  select.value = devices.some((d) => d.deviceId === state.settings.microphoneId) ? state.settings.microphoneId : 'default';
  select.addEventListener('change', () => saveSettings({ microphoneId: select.value }, 'Microfone atualizado'));
  return select;
}

function hotkeyControl(which) {
  const error = h('div', { class: 'error' });
  const button = h('button', {
    class: 'btn sm',
    text: 'Alterar',
    onclick: async () => {
      button.disabled = true;
      button.classList.add('listening');
      button.textContent = 'Pressione as teclas…';
      error.textContent = '';
      const result = await api.captureHotkey(which);
      state = result.state;
      updateSidebar();
      button.classList.remove('listening');
      if (result.error) {
        error.textContent = result.error;
        button.disabled = false;
        button.textContent = 'Alterar';
      } else {
        toast(result.keys ? 'Atalho atualizado' : 'Nada alterado');
        navigate('configuracoes', { keepScroll: true });
      }
    },
  });
  return h('div', { class: 'hotkey' }, h('div', { class: 'combo' }, combo(state.settings.hotkeys[which]), button), error);
}

async function renderSettings() {
  const { settings, encryption } = state;
  const blocks = [...header({ eyebrow: 'Configurações', title: ['Suas ', h('em', { text: 'preferências' })] })];

  blocks.push(
    h(
      'section',
      {},
      sectionHead('Aparência'),
      setting(
        'Tema',
        'Siga o Windows ou escolha um tom fixo.',
        segmented(
          [
            ['system', 'Sistema'],
            ['light', 'Claro'],
            ['dark', 'Escuro'],
          ],
          settings.theme,
          (theme) => saveSettings({ theme }, null),
          'Tema',
        ),
      ),
    ),
  );

  blocks.push(
    h(
      'section',
      {},
      sectionHead('Atalhos'),
      setting('Ditado', 'Segure para falar. Um toque rápido liga o modo mãos livres.', hotkeyControl('dictation')),
      setting('Modo Comando', 'O atalho de ditado mais uma tecla. Selecione um texto antes para editá-lo.', hotkeyControl('command')),
    ),
  );

  const languageSelect = h(
    'select',
    { 'aria-label': 'Idioma', onchange: (e) => saveSettings({ language: e.target.value }, 'Idioma atualizado') },
    LANGUAGES.map(([id, name]) => h('option', { value: id, text: name, selected: settings.language === id })),
  );
  blocks.push(
    h(
      'section',
      {},
      sectionHead(['Microfone e ', h('em', { text: 'idioma' })]),
      setting('Microfone', 'Usado em todas as gravações.', await microphoneSelect()),
      setting('Idioma', 'Fixar o idioma deixa a transcrição um pouco mais precisa.', languageSelect),
    ),
  );

  // Transcrição
  const provider = settings.transcription.provider;
  const providerSelect = h(
    'select',
    {
      'aria-label': 'Provedor de transcrição',
      onchange: async (e) => {
        await saveSettings({ transcription: { provider: e.target.value } }, 'Provedor atualizado');
        navigate('configuracoes', { keepScroll: true });
      },
    },
    [
      ['groq', 'Groq · Whisper Large v3 Turbo'],
      ['openai', 'OpenAI'],
      ['local', 'whisper.cpp · offline e gratuito'],
    ].map(([id, name]) => h('option', { value: id, text: name, selected: provider === id })),
  );
  const modelInput = (key, fallback) =>
    h('input', {
      class: 'input',
      type: 'text',
      value: settings.transcription[key],
      placeholder: fallback,
      onchange: (e) => saveSettings({ transcription: { [key]: e.target.value.trim() || fallback } }, 'Modelo atualizado'),
    });

  const transcription = h('section', {}, sectionHead('Transcrição'), setting('Provedor', 'Para onde o áudio vai para virar texto.', providerSelect));
  if (provider === 'groq' || provider === 'openai') {
    const isGroq = provider === 'groq';
    transcription.append(
      setting(
        '',
        null,
        h(
          'div',
          { class: 'field' },
          secretField(provider, isGroq ? 'Chave da API da Groq' : 'Chave da API da OpenAI', isGroq ? 'https://console.groq.com/keys' : 'https://platform.openai.com/api-keys'),
          h(
            'label',
            { class: 'field' },
            h('span', { text: 'Modelo' }),
            isGroq ? modelInput('groqModel', 'whisper-large-v3-turbo') : modelInput('openaiModel', 'gpt-4o-mini-transcribe'),
          ),
        ),
        'block',
      ),
    );
  } else {
    const pathField = (key, label, kind) => {
      const input = h('input', {
        class: 'input',
        type: 'text',
        value: settings.transcription[key],
        onchange: (e) => saveSettings({ transcription: { [key]: e.target.value.trim() } }),
      });
      return h(
        'label',
        { class: 'field' },
        h('span', { text: label }),
        h(
          'div',
          { class: 'key-row' },
          input,
          h('button', {
            class: 'btn',
            type: 'button',
            text: 'Procurar',
            onclick: async () => {
              const file = await api.pickFile(kind);
              if (!file) return;
              input.value = file;
              await saveSettings({ transcription: { [key]: file } });
            },
          }),
        ),
      );
    };
    transcription.append(
      setting(
        '',
        null,
        h(
          'div',
          { class: 'field' },
          pathField('whisperCppPath', 'Programa whisper-cli.exe', 'exe'),
          pathField('whisperCppModel', 'Modelo (.bin)', 'model'),
          h(
            'div',
            { class: 'key-status' },
            h('span', { text: 'Baixe o whisper.cpp e um modelo, como o ggml-large-v3-turbo.bin.' }),
            h('button', { class: 'link', text: 'Página do whisper.cpp', onclick: () => api.openUrl('https://github.com/ggml-org/whisper.cpp') }),
          ),
        ),
        'block',
      ),
    );
  }
  blocks.push(transcription);

  // Claude
  const modelSelect = h(
    'select',
    { 'aria-label': 'Modelo do Claude', onchange: (e) => saveSettings({ formatting: { model: e.target.value } }, 'Modelo atualizado') },
    CLAUDE_MODELS.map(([id, name]) => h('option', { value: id, text: name, selected: settings.formatting.model === id })),
  );
  blocks.push(
    h(
      'section',
      {},
      sectionHead(['Formatação e ', h('em', { text: 'Comando' })]),
      setting(
        'Formatar com IA',
        'Tira hesitações, pontua, aplica correções e o estilo do app. Desligado, o texto entra quase como foi transcrito.',
        toggle(settings.formatting.enabled, (v) => saveSettings({ formatting: { enabled: v } }), 'Formatar com IA'),
      ),
      setting('Modelo', 'O Opus escreve melhor; o Haiku responde mais rápido.', modelSelect),
      setting(
        '',
        null,
        h(
          'div',
          { class: 'field' },
          secretField('anthropic', 'Chave da API da Anthropic', 'https://console.anthropic.com/settings/keys'),
          h('div', { class: 'note', text: 'Sem chave salva, o Tallkeer usa a variável de ambiente ANTHROPIC_API_KEY, se existir.' }),
        ),
        'block',
      ),
    ),
  );

  blocks.push(
    h(
      'section',
      {},
      sectionHead('Geral'),
      setting('Sons', 'Um aviso curto ao começar e terminar de gravar.', toggle(settings.sounds, (v) => saveSettings({ sounds: v }), 'Sons')),
      setting(
        'Iniciar com o Windows',
        'Abre o Tallkeer na bandeja ao ligar o computador.',
        toggle(settings.launchAtLogin, (v) => saveSettings({ launchAtLogin: v }), 'Iniciar com o Windows'),
      ),
      setting('Salvar histórico', 'Guarda seus ditados neste computador.', toggle(settings.saveHistory, (v) => saveSettings({ saveHistory: v }), 'Salvar histórico')),
      setting(
        'Enviar título da janela',
        'Manda o título da janela ativa ao Claude como contexto, como o assunto de um e-mail.',
        toggle(settings.sendWindowTitle, (v) => saveSettings({ sendWindowTitle: v }), 'Enviar título da janela'),
      ),
    ),
  );

  blocks.push(
    h(
      'section',
      {},
      sectionHead('Privacidade'),
      h(
        'p',
        { class: 'lede' },
        'O áudio só é gravado enquanto o atalho está ativo e vai apenas para o provedor de transcrição escolhido. ',
        'O texto vai para o Claude quando a formatação está ligada. Histórico, dicionário, snippets e notas ficam neste computador. ',
        encryption ? 'As chaves de API são guardadas criptografadas pelo Windows.' : 'A criptografia do Windows não está disponível: as chaves ficam em texto puro.',
      ),
      h('p', { class: 'note mono', text: `Tallkeer ${state.version}` }),
    ),
  );

  return { blocks };
}

// --- Navegação --------------------------------------------------------------

const PAGES = {
  inicio: renderHome,
  historico: renderHistory,
  dicionario: renderDictionary,
  snippets: renderSnippets,
  estilos: renderStyles,
  notas: renderNotes,
  configuracoes: renderSettings,
};

function moveIndicator(page) {
  const nav = document.getElementById('nav');
  const indicator = nav.querySelector('.nav-indicator');
  const button = nav.querySelector(`button[data-page="${page}"]`);
  if (!button) return;
  indicator.style.transform = `translateY(${button.offsetTop}px)`;
  indicator.style.opacity = '1';
}

let navigating = Promise.resolve();

function navigate(name, { keepScroll = false } = {}) {
  navigating = navigating.then(async () => {
    const page = PAGES[name] ? name : 'inicio';
    const samePage = current?.name === page;
    current?.onLeave?.();
    history.replaceState(null, '', `#${page}`);
    for (const button of document.querySelectorAll('#nav button')) {
      button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
    }
    moveIndicator(page);

    // Monta a página nova antes de tirar a antiga, para a troca não piscar.
    animateNumbers = !samePage;
    const { blocks, hooks = {} } = await PAGES[page]();
    const scroll = keepScroll ? contentEl.scrollTop : 0;
    if (!samePage && pageEl.childElementCount && !reducedMotion.matches) {
      pageEl.classList.add('leaving');
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
    pageEl.classList.remove('leaving');
    pageEl.classList.toggle('still', samePage);
    pageEl.replaceChildren(...blocks.filter(Boolean));
    if (!samePage) {
      [...pageEl.children].forEach((el, i) => {
        el.classList.add('reveal');
        el.style.setProperty('--i', i);
      });
    }
    contentEl.scrollTop = scroll;
    current = { name: page, ...hooks };
  });
  return navigating;
}

document.getElementById('nav').addEventListener('click', (event) => {
  const page = event.target.closest('button')?.dataset.page;
  if (page && page !== current?.name) navigate(page);
});

api.onEvent((event) => {
  if (event.type === 'navigate') navigate(event.page);
  if (event.type === 'state') {
    state = event.state;
    updateSidebar();
  }
  if (event.type === 'history') {
    state.stats = event.stats;
    current?.onHistory?.(event.item);
  }
});

(async () => {
  state = await api.state();
  updateSidebar();
  await document.fonts.ready;
  navigate(location.hash.slice(1) || 'inicio');
})();
