'use strict';

// Descobre em que app o usuário está ditando e em que categoria ele cai,
// para escolher o estilo de escrita (e-mail formal, chat casual...).

const CATEGORIES = ['email', 'trabalho', 'pessoal', 'outros'];

const APP_CATEGORY = {
  'outlook.exe': 'email',
  'olk.exe': 'email',
  'hxoutlook.exe': 'email',
  'thunderbird.exe': 'email',
  'mailspring.exe': 'email',
  'slack.exe': 'trabalho',
  'teams.exe': 'trabalho',
  'ms-teams.exe': 'trabalho',
  'zoom.exe': 'trabalho',
  'mattermost.exe': 'trabalho',
  'webex.exe': 'trabalho',
  'whatsapp.exe': 'pessoal',
  'whatsapp.root.exe': 'pessoal',
  'telegram.exe': 'pessoal',
  'discord.exe': 'pessoal',
  'signal.exe': 'pessoal',
  'messenger.exe': 'pessoal',
};

const BROWSERS = new Set([
  'chrome.exe',
  'msedge.exe',
  'firefox.exe',
  'brave.exe',
  'opera.exe',
  'vivaldi.exe',
  'arc.exe',
  'zen.exe',
]);

// No navegador, a categoria vem do título da aba.
const TITLE_RULES = [
  { category: 'email', pattern: /gmail|outlook|yahoo mail|proton mail|e-?mail/i },
  { category: 'trabalho', pattern: /slack|microsoft teams|google chat|mattermost|linear|jira|asana|trello/i },
  { category: 'pessoal', pattern: /whatsapp|telegram|messenger|instagram|discord/i },
];

const APP_NAMES = {
  'chrome.exe': 'Chrome',
  'msedge.exe': 'Edge',
  'firefox.exe': 'Firefox',
  'olk.exe': 'Outlook',
  'outlook.exe': 'Outlook',
  'ms-teams.exe': 'Teams',
  'teams.exe': 'Teams',
  'whatsapp.root.exe': 'WhatsApp',
  'winword.exe': 'Word',
  'excel.exe': 'Excel',
  'powerpnt.exe': 'PowerPoint',
  'code.exe': 'VS Code',
  'windowsterminal.exe': 'Terminal',
  'explorer.exe': 'Explorador',
  'notepad.exe': 'Bloco de Notas',
  'electron.exe': 'Tallkeer',
  'tallkeer.exe': 'Tallkeer',
};

function appName(exe) {
  if (!exe) return 'Outro';
  if (APP_NAMES[exe]) return APP_NAMES[exe];
  const base = exe.replace(/\.exe$/i, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function classify({ exe, title }, overrides = {}) {
  if (exe && CATEGORIES.includes(overrides[exe])) return overrides[exe];
  if (exe && APP_CATEGORY[exe]) return APP_CATEGORY[exe];
  if (exe && BROWSERS.has(exe) && title) {
    const rule = TITLE_RULES.find((r) => r.pattern.test(title));
    if (rule) return rule.category;
  }
  return 'outros';
}

function captureContext(foregroundWindow, overrides) {
  let win = { exe: '', title: '' };
  try {
    win = foregroundWindow();
  } catch {
    // Sem contexto o ditado continua funcionando com o estilo "outros".
  }
  return {
    exe: win.exe,
    app: appName(win.exe),
    title: win.title,
    category: classify(win, overrides),
  };
}

module.exports = { CATEGORIES, appName, captureContext, classify };
