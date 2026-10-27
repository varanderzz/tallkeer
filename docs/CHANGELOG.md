# Histórico de versões

## 0.2.1 (26/10/2026)

### Corrigido
- Colar o texto falhava com `clipboard.availableFormats is not a function`. O Electron 44 trocou a API de área de transferência por uma versão assíncrona; o módulo de colagem foi reescrito com `clipboard.read/write` e `ClipboardItem`.
- O teste de fumaça passou a exercitar a leitura e a restauração da área de transferência.

## 0.2.0 (21/10/2026)

### Mudado
- O aplicativo passou a se chamar **Tallkeer** (antes "Ditado").
- Interface totalmente redesenhada: tipografia editorial (Instrument Serif, Geist, Geist Mono), paleta monocromática quente, bordas finas e transições suaves.
- Tela inicial com estatísticas em blocos, gráfico das palavras da semana e app mais usado.
- Barra flutuante nova: onda sonora simétrica, cronômetro, ponto pulsante e confirmação animada.
- Novo ícone, também usado no instalador e no executável.
- Confirmações em janelas próprias, no lugar das caixas do Windows.

### Adicionado
- Tema claro, escuro ou do sistema.
- Indicador de status na barra lateral (pronto, configuração pendente, atalhos pausados).

## 0.1.0 (20/10/2026)

Primeira versão, com o nome provisório **Ditado**.

### Adicionado
- Ditado por atalho global (segurar Ctrl + Win), modo mãos livres e Modo Comando.
- Transcrição por Groq, OpenAI ou whisper.cpp local.
- Formatação e edição por voz com o Claude.
- Estilos por aplicativo, regras por programa, dicionário e snippets.
- Histórico, estatísticas e notas.
- Barra flutuante, sons, bandeja do sistema e início com o Windows.
- Chaves de API criptografadas pelo Windows.
- Testes automatizados e teste de fumaça no Electron.
- Instalador para Windows.
