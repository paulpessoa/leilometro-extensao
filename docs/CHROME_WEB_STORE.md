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
Leilômetro é a sua calculadora de bordo para leilões de veículos. Abra um lote no leilo.com.br e um painel mostra, antes do seu lance, quanto o carro vai custar de verdade e até onde vale a pena ir. Durante o pregão, ele acompanha os lances e apita quando você estiver chegando no seu limite.

🏎️ O QUE APARECE NO PAINEL

• Custo no leilão: lance + comissão + taxas do lote (depósito, remoção, vistoria), lidos direto do leiloeiro. Bate com o "total a pagar" do site.
• Preço limite: o maior lance em que você ainda lucra a margem que escolheu, já descontando comissão, taxas, conserto, documentação e IPVA.
• Meu teto: defina quanto você topa pagar e veja quantos lances ainda cabem até ele.
• Score de oportunidade: de 0 a 100, compara o lance atual com o preço limite.
• KM/ano: classifica o uso do veículo (particular, frota, aplicativo).
• Sinais de atenção: avisa quando o lote não tem vídeo (normalmente o carro não liga ou não anda), não tem chave, não tem laudo cautelar ou tem laudo com observações.
• Anotações por lote: ficam salvas e voltam quando você reabre o veículo.

🔔 MODO LEILÃO

Clique em "Ativar rastreio" durante o pregão. O Leilômetro acompanha cada lance e apita quando:
• faltarem poucos lances para o seu teto;
• o lance passar do teto (com um som diferente, mais forte);
• o lance chegar num valor que você escolher;
• faltar 1 minuto para o encerramento previsto.

Também envia notificação se você estiver em outra aba, mostra o gráfico dos lances e tem um modo compacto que não tampa a tela.

⏰ Marque um lote e receba um lembrete alguns minutos antes de ele encerrar, mesmo com a aba fechada.

📊 ANÁLISE FIPE

O Leilômetro usa o valor de mercado informado no lote e mostra o modelo e o código FIPE de referência. Prefere outra base? Digite o valor e tudo é recalculado na hora. Sem FIPE, ele avisa em vez de inventar um número.

⚖️ COMPARADOR E RELATÓRIO

• Compare vários veículos lado a lado, com o melhor e o pior de cada item destacados, e exporte para planilha.
• Gere um relatório do lote para imprimir, salvar em PDF ou mandar um resumo no WhatsApp.

🤖 ASSISTENTE DE IA (OPCIONAL)

Conecte a sua própria chave da OpenAI ou do Google Gemini e pergunte: vale a pena? Quais os riscos? Quanto dar no máximo? O que checar na vistoria? A IA usa os números do painel e também ranqueia os lotes do comparador. As consultas são cobradas pelo provedor, na sua conta.

⚙️ CONFIGURAÇÕES

Na página de configurações você define a margem de revenda, os custos padrão de conserto, documentação e IPVA, o volume do apito, as notificações e os minutos do lembrete. Cada lote pode ser ajustado no próprio painel. Dá para exportar e importar um backup dos seus dados.

🔒 PRIVACIDADE

O Leilômetro não coleta dados pessoais e não tem servidor que receba suas informações: lotes, anotações e configurações ficam no seu navegador. A única exceção é o assistente de IA, se você ativar: nesse caso, os dados do lote vão direto para o provedor que você escolheu, e só quando você faz uma pergunta.
Política completa: leilometro.com.br/privacidade

🌐 ONDE FUNCIONA

leilo.com.br. Outros leiloeiros em breve.

⌨️ Ctrl+Shift+L abre e fecha o painel na página do lote.

⚠️ Ferramenta de apoio à decisão: leia o edital e vistorie o veículo antes de arrematar.

Desenvolvido por QiSites | contato@qisites.com.br e contato@leilometro.com.br
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

Textos usados na publicação da v1.1.0 (cada campo aceita até 1.000 caracteres).

**Descrição do único propósito:**

```
Ajudar quem compra em leilões de veículos a avaliar e acompanhar o lote aberto no site do leiloeiro (leilo.com.br): um painel calcula o custo real de arrematação (lance, comissão e taxas), o preço limite para a margem desejada, o score de oportunidade e o uso do veículo por KM/ano, aponta sinais de risco do lote e, se o usuário ativar, avisa com som e notificação quando o lance se aproxima do teto dele ou quando o lote está para encerrar.
```

**Justificativa de storage:**

```
Usada para salvar no navegador do usuário: as configurações (margem de revenda, custos estimados, preferências de alerta) via chrome.storage.sync; e, via chrome.storage.local, os lotes que ele analisa (valores editados, anotações, alertas cadastrados e histórico de lances acompanhado), o estado do painel e, se ele ativar o assistente de IA, a chave de API dele. Os dados ficam só no navegador e não são enviados a servidores do desenvolvedor. O usuário pode exportar, importar ou apagar tudo na página de configurações.
```

**Justificativa de notifications:**

```
Usada para avisar o usuário durante um leilão ao vivo. Quando ele ativa o "Modo Leilão" num lote, a extensão mostra uma notificação do sistema quando o lance chega perto do teto definido por ele, passa do teto, atinge um valor que ele cadastrou ou quando falta 1 minuto para o encerramento. Também é usada para o lembrete opcional que avisa alguns minutos antes do encerramento de um lote que o usuário marcou. As notificações existem para que o aviso chegue mesmo com a aba do leilão em segundo plano. Nenhuma notificação é exibida sem o usuário ativar o rastreio ou marcar um lote, e todas podem ser desligadas nas configurações da extensão.
```

**Justificativa de alarms:**

```
Usada para agendar o lembrete opcional dos lotes que o usuário marca com "Lembrar": a extensão cria um alarme para alguns minutos antes do horário de encerramento previsto do lote (10 minutos por padrão, configurável) e, quando ele dispara, confere o horário atualizado no site do leiloeiro e mostra a notificação de lembrete. O alarme é necessário porque o lembrete precisa funcionar mesmo com a aba do lote fechada. Nenhum alarme é criado se o usuário não marcar um lote, e os alarmes são removidos quando ele desmarca o lote ou desliga o lembrete nas configurações.
```

**Justificativa de permissão do host:**

```
O acesso a *.leilo.com.br é necessário para exibir o painel na página do lote e ler os dados públicos desse lote (lance atual, comissão, taxas, informações do veículo e horário de encerramento), tanto na página quanto na API pública do próprio site (api.leilo.com.br), que é a mesma que o site usa para mostrar esses dados. Sem esse acesso a função principal não existe. A extensão também declara acesso opcional a api.openai.com, generativelanguage.googleapis.com e leilometro-api.onrender.com: ele só é pedido ao usuário, com o aviso do Chrome, se ele ativar o assistente de IA com a própria chave de API ou a IA do Leilômetro, e serve apenas para enviar as perguntas dele ao provedor escolhido. No modo padrão (sem chave) a extensão apenas copia o texto da pergunta para a área de transferência e abre o site do ChatGPT, do Gemini ou do Claude em uma nova aba, sem permissão extra.
```

**Código remoto:** Não. Todo o JavaScript está no pacote; as chamadas às APIs de IA e do leiloeiro só trafegam dados (JSON).

**Uso de dados** (formulário de divulgação):
- Marque só **Conteúdo do site**. A loja considera coleta o que sai do navegador; o único dado que sai é o conteúdo do lote (veículo, valores e anotações do usuário), enviado ao provedor de IA quando o usuário usa o assistente.
- Deixe desmarcados os demais: identificação pessoal, saúde, financeiros, comunicações pessoais, localização, histórico da web e atividade do usuário. A IA não recebe URLs e não há rastreamento de cliques.
- A chave de API vai só ao próprio provedor a que pertence, para autenticar a chamada. Não é coleta do desenvolvedor, então "Informações de autenticação" fica desmarcado. Marcar também não é errado, se quiser ser mais conservador.
- Marque as três declarações: não vende dados a terceiros; não usa nem transfere dados para fins não relacionados ao único propósito; não usa para avaliar crédito.

**URL da política de privacidade:** https://leilometro.com.br/privacidade

## 4. Depois de publicar

- Confira se o ID da extensão continua `oifmcimfbbbjenddghinhddmmihfolpi` (o site usa esse ID para detectar a extensão instalada).
- Teste num perfil limpo do Chrome: instalar pela loja → abrir boas-vindas → abrir um lote → ativar rastreio → testar o som.
