# Funcionalidades do Tallkeer

## Falar e escrever

### 1. Ditado em qualquer aplicativo
Segure **Ctrl + Win**, fale e solte. O texto aparece onde está o cursor, em qualquer programa: WhatsApp, Word, Outlook, navegador, editores de código. Ao terminar, o que você tinha copiado antes volta para a área de transferência.

### 2. Modo mãos livres
Um **toque rápido** em Ctrl + Win começa a gravar sem precisar segurar. Para terminar, toque de novo ou clique no botão ■ da barra flutuante. Bom para textos longos.

### 3. Modo Comando
Selecione um texto, segure **Ctrl + Win + Alt** e diga o que fazer: "deixa mais formal", "traduz para inglês", "resume em três tópicos", "corrige a gramática". O resultado substitui a seleção. Sem nada selecionado, o Tallkeer escreve um texto novo a partir do pedido ("escreve um e-mail agradecendo a reunião").

### 4. Cancelar
Aperte **Esc** durante a gravação para descartá-la. Se você usar outro atalho do Windows que comece com Ctrl + Win (como Ctrl + Win + D para criar uma área de trabalho), o Tallkeer percebe e não grava.

![Barra flutuante gravando](screenshots/overlay-recording.png)

## Inteligência do texto

### 5. Formatação com IA (Claude)
Transforma a fala no texto que você queria escrever:
- tira hesitações ("é…", "hum", "tipo", "né") e repetições;
- coloca pontuação, acentos e maiúsculas;
- aplica autocorreções: "às 3, não, na verdade às 4" vira "às 4";
- formata listas quando você enumera itens;
- entende comandos falados: "nova linha", "novo parágrafo", "vírgula", "ponto final";
- escreve números, datas, horários, e-mails e links do jeito que as pessoas digitam.

Se a IA estiver desligada ou falhar, o texto entra com uma limpeza básica feita no próprio computador.

### 6. Estilos por aplicativo
O tom muda conforme onde você escreve. São quatro categorias, cada uma com três estilos:

| Categoria | Exemplos | Estilos |
| --- | --- | --- |
| E-mail | Outlook, Thunderbird, Gmail | Formal, Casual, Muito casual |
| Trabalho | Slack, Teams, Google Chat | Formal, Casual, Muito casual |
| Pessoal | WhatsApp, Telegram, Discord | Formal, Casual, Muito casual |
| Outros | Documentos, navegador, código | Formal, Casual, Muito casual |

Exemplo: "Olá, Ana. Está tudo certo para amanhã às 10h?" (formal) / "Oi Ana, tudo certo pra amanhã às 10h?" (casual) / "oi ana tudo certo pra amanha 10h" (muito casual).

### 7. Regras por aplicativo
Se o Tallkeer não reconhecer um programa, você informa o nome do executável (ex.: `notion.exe`) e a categoria dele.

### 8. Dicionário
Ensine nomes, marcas e termos que você usa. Cada palavra tem a grafia correta e, opcionalmente, as formas erradas que a transcrição costuma gerar ("cubernetes" → "Kubernetes"). O vocabulário também é enviado à transcrição e ao Claude para acertar de primeira.

### 9. Snippets (atalhos de voz)
Cadastre uma frase-gatilho e o texto que ela representa. Ao dizer "meu link de agenda", o Tallkeer insere "https://cal.com/seu-nome — escolha o melhor horário". Funciona sozinho ou no meio de uma frase.

### 10. Filtro de ruído
Gravações sem fala não são enviadas. Frases que a transcrição costuma inventar no silêncio ("Obrigado.", "Legendas pela comunidade Amara.org") são descartadas.

## Transcrição

### 11. Escolha do serviço
| Serviço | Vantagem |
| --- | --- |
| **Groq** (padrão) | Muito rápido, plano gratuito |
| **OpenAI** | Alternativa para quem já tem conta |
| **whisper.cpp** | Roda no próprio computador, offline e de graça |

### 12. Idioma
Detecção automática ou idioma fixo (português, inglês, espanhol, francês, alemão, italiano, japonês, chinês). Fixar o idioma deixa a transcrição um pouco mais precisa.

### 13. Escolha do microfone
Use o padrão do Windows ou escolha outro. Se o microfone escolhido for desconectado, o Tallkeer volta para o padrão.

## Organização

### 14. Histórico
Todos os ditados, agrupados por dia, com busca por texto ou aplicativo. Em cada item: copiar, ver a transcrição original (antes da formatação) e excluir. Também dá para apagar tudo.

![Histórico](screenshots/hub-light-historico.png)

### 15. Estatísticas
Na tela inicial:
- **Palavras ditadas** no total, com gráfico dos últimos 7 dias;
- **Velocidade** em palavras por minuto;
- **Tempo economizado** em relação a digitar (40 palavras por minuto);
- **Sequência** de dias seguidos de uso;
- **App mais usado**.

### 16. Notas
Um bloco de rascunho dentro do app, salvo automaticamente. Clique na nota, segure o atalho e dite direto nela.

## Conforto e aparência

### 17. Barra flutuante
Aparece na parte de baixo da tela durante o ditado. Mostra a onda sonora, o tempo, o andamento ("Transcrevendo", "Inserido") e mensagens de erro. Não rouba o foco do aplicativo em que você está.

| Gravando | Processando | Inserido | Erro |
| --- | --- | --- | --- |
| ![](screenshots/overlay-recording.png) | ![](screenshots/overlay-processing.png) | ![](screenshots/overlay-done.png) | ![](screenshots/overlay-error.png) |

### 18. Sons
Um toque suave ao começar e ao terminar de gravar, e outro em caso de erro. Pode ser desligado.

### 19. Tema
Claro, escuro ou igual ao do Windows, com transição suave entre eles.

### 20. Atalhos personalizáveis
Troque as teclas de ditado e do Modo Comando em Configurações. Basta clicar em "Alterar" e pressionar a nova combinação.

### 21. Bandeja do sistema
O Tallkeer fica ao lado do relógio. Pelo ícone: abrir, copiar a última transcrição, pausar os atalhos, configurações e sair.

### 22. Iniciar com o Windows
Abre automaticamente na bandeja ao ligar o computador.

## Privacidade e segurança

### 23. Dados locais
Histórico, dicionário, snippets e notas ficam só no seu computador, em `%APPDATA%\Tallkeer`.

### 24. Chaves protegidas
As chaves de API são guardadas criptografadas pelo Windows. A interface nunca exibe a chave salva.

### 25. Controle do que é enviado
O áudio só vai para o provedor de transcrição escolhido. O texto só vai para o Claude se a formatação estiver ligada. O título da janela só é enviado se você permitir. O histórico pode ser desligado.

### 26. Área de transferência preservada
Para colar o texto, o Tallkeer usa a área de transferência e, logo depois, devolve o conteúdo que estava lá (texto, formatação ou imagem).
