# Publicação na Chrome Web Store — v1.1.0

Textos prontos para colar no painel do desenvolvedor da Chrome Web Store.

## 1. Gerar o pacote

```bash
node --test "tests/*.test.js"   # todos devem passar
node scripts/empacotar.mjs      # gera dist/leilometro-1.1.0.zip
```

O pacote leva só os arquivos da extensão (sem `docs/`, `tests/`, `scripts/` e `.md`).
Envie em **Pacote › Fazer upload de novo pacote**.

## 2. Ficha da loja

**Nome:** Leilômetro — Análise de Oportunidade

**Descrição curta** (até 132 caracteres, igual à do manifest):

> Análise de leilões de veículos em tempo real: custo real, preço limite, alertas de lance, comparador e assistente de IA.

**Descrição detalhada:**

```
O Leilômetro abre um painel na página do lote no leilo.com.br e mostra, antes do seu lance, quanto o carro realmente vai custar e até onde vale a pena ir.

O QUE ELE FAZ
• Custo no leilão: lance + comissão + taxas do lote (depósito, remoção, vistoria), lidos direto do leiloeiro.
• Preço limite: o maior lance em que você ainda lucra a margem que escolheu, já descontando comissão, taxas, conserto, documentação e IPVA.
• Meu teto: defina quanto você topa pagar e veja quantos lances ainda cabem.
• Score de oportunidade (0–100) e classificação de KM/ano (particular, frota, aplicativo).
• Sinais de atenção: lote sem vídeo (normalmente o carro não liga ou não anda), sem chave, sem laudo ou com laudo reprovado.

MODO LEILÃO
• Clique em "Ativar rastreio" durante o pregão.
• Apito quando faltarem poucos lances para o seu teto, quando passar do teto, quando chegar num valor escolhido e 1 minuto antes do encerramento.
• Notificação do sistema mesmo em outra aba, gráfico dos lances e modo compacto para não tampar a tela.
• Lembrete X minutos antes do encerramento dos lotes que você marcar.

E MAIS
• Comparador de veículos lado a lado, com exportação para planilha.
• Relatório para imprimir, salvar em PDF ou mandar resumo no WhatsApp.
• Assistente de IA opcional com a sua chave da OpenAI ou do Google Gemini: veredito, riscos, teto sugerido e checklist de vistoria.
• Anotações por lote e backup dos seus dados.

PRIVACIDADE
Tudo fica no seu navegador. Não temos servidor que receba seus dados. O assistente de IA só é usado se você ativar com a sua própria chave.

Ferramenta de apoio à decisão: leia o edital e vistorie o veículo antes de arrematar.
```

**Categoria:** Ferramentas (ou Produtividade)
**Idioma:** Português (Brasil)

**Novidades da versão 1.1.0** (campo de notas da versão / descrição):

```
• Corrige o painel que parou de abrir após a mudança de endereço dos lotes no leilo.com.br
• Preço limite agora desconta a comissão; custo no leilão bate com o "total a pagar" do site
• Novo Modo Leilão com alertas sonoros, notificações e lembrete antes do encerramento
• Sinais de atenção: lote sem vídeo, sem chave, sem laudo
• Comparador de veículos, relatório e assistente de IA opcional
```

**Capturas de tela sugeridas** (1280×800):
1. Painel completo num lote, com score e sinais de atenção
2. Modo Leilão ligado, com o gráfico e um alerta disparado
3. Modo compacto sobre a página do leilão
4. Comparador com 3 veículos
5. Balão de IA com o veredito

## 3. Práticas de privacidade

**Finalidade única:**

```
Ajudar compradores de leilões de veículos a avaliar o lote aberto no site do leiloeiro, calculando custo real, preço limite e alertando sobre lances durante o pregão.
```

**Justificativa de cada permissão:**

| Permissão | Justificativa |
|---|---|
| `storage` | Salvar no navegador as configurações do usuário (margem, custos), os lotes analisados, anotações e alertas. |
| `notifications` | Avisar o usuário quando o lance atinge o teto ou o valor escolhido durante o Modo Leilão, inclusive com a aba em segundo plano. Só é usado depois que o usuário ativa o rastreio ou o lembrete. |
| `alarms` | Agendar o lembrete que avisa alguns minutos antes do encerramento dos lotes que o usuário marcou. |
| Host `*://*.leilo.com.br/*` | Exibir o painel na página do lote e ler os dados públicos do lote (lance, taxas, comissão, veículo) na página e na API pública do próprio site. |
| Host opcional `https://api.openai.com/*` | Pedido só quando o usuário ativa o assistente de IA com a própria chave da OpenAI; envia as perguntas e os dados do lote ao provedor. |
| Host opcional `https://generativelanguage.googleapis.com/*` | Mesmo uso acima, para quem escolher o Google Gemini. |

**Código remoto:** Não. Todo o JavaScript está no pacote; as chamadas às APIs de IA e do leiloeiro só trafegam dados (JSON).

**Uso de dados** (formulário de divulgação):
- Coleta dados de identificação pessoal, saúde, financeiros, autenticação, comunicações pessoais ou localização? **Não.**
- "Conteúdo do site": **sim**. A extensão lê dados públicos do lote no site do leiloeiro para fazer os cálculos. Esses dados ficam no navegador. Só são enviados a terceiros (OpenAI/Google) se o usuário ativar o assistente de IA e fizer uma pergunta.
- Marque as três declarações: não vende dados a terceiros; não usa nem transfere dados para fins não relacionados à finalidade única; não usa para avaliar crédito.

**URL da política de privacidade:** https://leilometro.com.br/privacidade

## 4. Depois de publicar

- Confira se o ID da extensão continua `oifmcimfbbbjenddghinhddmmihfolpi` (o site usa esse ID para detectar a extensão instalada).
- Teste num perfil limpo do Chrome: instalar pela loja → abrir boas-vindas → abrir um lote → ativar rastreio → testar o som.
