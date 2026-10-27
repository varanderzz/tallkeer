# Manual do usuário

## 1. Instalação

1. Baixe o arquivo `Tallkeer Setup <versão>.exe`.
2. Dê dois cliques. Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações** e depois em **Executar assim mesmo** (o instalador não tem assinatura digital paga).
3. O Tallkeer instala e abre sozinho. A partir daí ele fica na bandeja, ao lado do relógio.

Requisitos: Windows 10 ou 11 e microfone.

## 2. Primeira configuração

### 2.1 Liberar o microfone
**Configurações do Windows > Privacidade e segurança > Microfone**: ligue "Acesso ao microfone" e "Permitir que aplicativos da área de trabalho acessem o microfone".

### 2.2 Chave de transcrição (obrigatória)
1. Crie uma chave gratuita da Groq em <https://console.groq.com/keys> (botão **Create API Key**; a chave começa com `gsk_`).
2. No Tallkeer: **Configurações > Transcrição**, cole a chave e clique em **Salvar**. Deve aparecer "Chave da Groq funcionando".

Alternativas: OpenAI (chave em <https://platform.openai.com/api-keys>) ou whisper.cpp offline (informe o `whisper-cli.exe` e o arquivo do modelo `.bin`).

### 2.3 Chave da Anthropic (recomendada)
Para a formatação com IA e o Modo Comando, crie uma chave em <https://console.anthropic.com/settings/keys> e cole em **Configurações > Formatação e Comando**. Sem ela, o texto entra com uma limpeza básica.

### 2.4 Microfone e idioma
Em **Configurações > Microfone e idioma**, escolha o microfone e, se quiser, fixe o idioma.

## 3. Uso

| Ação | Como fazer |
| --- | --- |
| Ditar | Clique onde quer escrever, segure **Ctrl + Win**, fale e solte |
| Mãos livres | Toque rápido em **Ctrl + Win**; toque de novo para terminar |
| Modo Comando | Selecione um texto, segure **Ctrl + Win + Alt** e diga o que fazer |
| Cancelar | **Esc** durante a gravação |
| Abrir o app | Clique no ícone da bandeja |
| Copiar a última transcrição | Botão direito no ícone da bandeja |
| Pausar os atalhos | Botão direito no ícone da bandeja > **Pausar atalhos** |

## 4. Telas

| Tela | Para que serve |
| --- | --- |
| **Início** | Estatísticas, gráfico da semana, primeiros passos, guia de atalhos e ditados recentes |
| **Histórico** | Buscar, copiar, ver o original ou excluir ditados |
| **Dicionário** | Cadastrar nomes e termos com a grafia correta |
| **Snippets** | Cadastrar frases-gatilho que viram textos prontos |
| **Estilos** | Escolher o tom por tipo de aplicativo e criar regras por programa |
| **Notas** | Rascunhos salvos automaticamente |
| **Configurações** | Tema, atalhos, microfone, idioma, provedores, chaves, sons e privacidade |

## 5. Mensagens da barra flutuante

| Mensagem | O que significa | O que fazer |
| --- | --- | --- |
| "Não ouvi nada." | Pouca ou nenhuma fala detectada | Fale mais perto do microfone ou confira o microfone escolhido |
| "Configure a chave da Groq em Configurações." | Nenhuma chave de transcrição salva | Siga o passo 2.2 |
| "Chave da Groq inválida." | Chave errada ou revogada | Gere outra chave e salve de novo |
| "Limite de uso … atingido." | Cota do provedor esgotada | Espere alguns instantes ou use outro provedor |
| "Inserido sem formatação: …" | A IA falhou; o texto entrou com limpeza básica | Confira a chave da Anthropic |
| "Texto copiado. Cole com Ctrl+V." | Não foi possível colar sozinho | Cole manualmente |
| "Microfone bloqueado…" | O Windows não liberou o microfone | Siga o passo 2.1 |

## 6. Usar em outro computador

Copie o instalador para o outro computador (pen drive, Google Drive, OneDrive), instale e repita a configuração. Configurações, histórico, dicionário, snippets e notas não são transferidos.

## 7. Desinstalar

**Configurações do Windows > Aplicativos > Aplicativos instalados > Tallkeer > Desinstalar.** Para apagar também os dados, exclua a pasta `%APPDATA%\Tallkeer`.
