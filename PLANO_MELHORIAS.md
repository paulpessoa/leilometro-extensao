# Plano de melhorias — Leilômetro

> **Status (13/10/2026): fases 0 a 4 aplicadas na v1.1.0, mais o backup da Fase 5.3.** Diferenças em relação ao plano:
> - O service worker usa `importScripts` (worker clássico), não `"type": "module"`.
> - A amostra da API mostrou que `valor.totalDespesas` já inclui a comissão. As taxas do leilão agora são a soma dos itens, e o custo no leilão bate com `totalAPagar`.
> - O painel se remonta sozinho se o site o remover.
>
> Pendentes: Fase 5 (exceto o backup) e Fase 6 (publicação).

Este plano é para ser executado por um agente (Claude Opus) **uma fase por vez**, com commit ao final de cada fase e teste manual do usuário entre elas. Leia "Contexto" e "Regras" antes de começar qualquer fase.

---

## Contexto

- Extensão Chrome **Manifest V3**, JavaScript puro, **sem build**. Arquivos atuais: `manifest.json`, `content.js` (~1800 linhas, tudo do painel), `styles.css`, `background.js` (só responde ping do site), `popup/` (lotes salvos + configurações + ajuda).
- Site alvo: `leilo.com.br`. Página de veículo: `/lote/<uuid>/`. O site é SPA; `handleRoute()` em `content.js` reavalia a URL a cada 1s.
- Fonte de dados principal: `GET https://api.leilo.com.br/v1/lote/by-id/<uuid>` (`fetchLoteFromApi`). Fallback: DOM com classes `*-julho2026` (`SITE_SELECTORS`). Ver `DIAGNOSTICO_LEILO.md`.
- Lote de exemplo para testes: `https://leilo.com.br/lote/d3be22d3-9f8f-4bd2-88cd-9364ec0fcc5a/?tipo=Carros&tipoLista=Carros`.
- Hoje o painel mostra score, custo real, preço limite, KM/ano, notas e impressão. O popup lista lotes salvos e edita a configuração global.

## Regras para o executor

1. **Sem dependências de runtime nem bundler.** Para dividir arquivos, liste vários scripts em `content_scripts[].js` no manifest (eles compartilham o mesmo escopo isolado). Exponha módulos em `globalThis.LM` (ex.: `LM.calc`, `LM.storage`).
2. **Estilo do código existente:** sem ponto e vírgula, aspas duplas, 2 espaços, cabeçalhos de seção `// ─── TÍTULO ───`, textos de interface em pt-BR.
3. **Nunca** interpolar dado externo (site, API, usuário, resposta de IA) em `innerHTML` sem passar por `esc()`. A saída de IA é renderizada como texto, ou por um mini-renderizador de markdown que escapa antes de formatar.
4. **Não adivinhar campos da API.** Antes de usar um campo novo (data de encerramento, situação, etc.), baixe a resposta real com `curl https://api.leilo.com.br/v1/lote/by-id/d3be22d3-9f8f-4bd2-88cd-9364ec0fcc5a` e salve em `docs/amostra-api-lote.json`. Se a chamada falhar, pare e peça ao usuário para colar o JSON da aba Network.
5. **Ao fim de cada fase:** `node --check` em todos os `.js`, `node --test tests/`, atualizar a seção de funcionalidades do `README.md` e fazer um commit no estilo do repositório (`feat: ...`, `fix: ...`). Não suba a versão no meio do caminho; isso acontece na Fase 6.
6. O agente **não consegue carregar a extensão no Chrome**. Ao fim de cada fase, entregue ao usuário o checklist de teste manual da fase e espere o retorno antes de seguir.
7. Permissões novas: **só as listadas neste plano**. Toda permissão nova entra na lista de justificativas da Fase 6.

### Estrutura de arquivos alvo (chegar nela na Fase 0)

```
lib/util.js          esc, BRL, NUM, extractNumber/Year/KM/Pct, tsStr
lib/calc.js          calcularOportunidade, calcularScore, classifyKmAno, getScoreLabel (sem DOM)
lib/storage.js       CRUD de lotes em chrome.storage.local + migração
lib/sound.js         (Fase 2) sons via Web Audio
lib/ai.js            (Fase 4) adaptadores OpenAI / Gemini — usado só pelo background
content/scrape.js    fetchLoteFromApi, scrapeJsonLd, scrapePageData, SITE_SELECTORS
content/panel.js     createPanel, attachEventListeners, makeDraggable, printAnalise
content/live.js      (Fase 2) modo leilão
content/assistant.js (Fase 4) balão de IA
content/main.js      init, handleRoute, atalho de teclado, easter egg
options/             (Fase 1) página de configurações completa
compare/             (Fase 3) comparador
welcome/             (Fase 1) boas-vindas
tests/calc.test.js
```

`lib/calc.js` precisa rodar no content script **e** no Node (para os testes):

```js
;(function (root) {
  "use strict"
  const api = { calcularOportunidade, calcularScore, classifyKmAno, getScoreLabel }
  if (typeof module !== "undefined") module.exports = api
  else (root.LM = root.LM || {}).calc = api
  // ...funções
})(globalThis)
```

As páginas da extensão (`compare.html`, `options.html`) carregam os mesmos `lib/*.js` com `<script src>`.

---

## Fase 0 — Correções e base (obrigatória, fazer primeiro)

### 0.1 Preço limite ignora a comissão e as taxas reais (bug de cálculo, prioridade máxima)

Hoje `calcularOportunidade` faz `precoLimite = fipe − margem − (doc + IPVA + conserto + CONFIG.taxaPatio)` e compara o resultado direto com o **lance**. Na prática, ele não considera:
- a comissão sobre o lance (5% em R$ 40 mil são R$ 2 mil);
- as taxas reais do lote (`totalDespesas` e depósito, remoção etc.), porque sempre usa a taxa de pátio padrão.

O resultado é que o usuário vê um teto **acima** do valor que ainda dá lucro.

Fórmula correta: o lance máximo `L` é aquele em que o lucro é exatamente a margem desejada.

```
custoTotal(L) = L × (1 + comissaoPct) + taxasLeilao + doc + ipva + conserto
lucro(L)      = fipe − custoTotal(L)
precoLimite   = (fipe × (1 − margem) − taxasLeilao − doc − ipva − conserto) / (1 + comissaoPct)
```

`taxasLeilao` é `taxaPatioEfetiva`, que já é calculada na função (despesas detectadas, ou a taxa de pátio padrão quando não há nenhuma).

- `potencialLucro` = `fipe − custoTotal(lance)`.
- `lancesRestantes` = `floor((precoLimite − lance) / incremento)`, com mínimo 0.
- O subtexto de "Margem até o limite" em `createPanel` usa `precoLimite − custoReal + CONFIG.taxaPatio`. Troque por `precoLimite − lance`.
- **Testes em `tests/calc.test.js` (`node:test` + `node:assert`):**
  - com `lance = precoLimite`, o lucro é igual a `fipe × margem` (tolerância de R$ 1);
  - as despesas detectadas substituem a taxa de pátio padrão;
  - FIPE nula resulta em `precoLimite`, `score` e `potencialLucro` nulos (ver 0.2);
  - lance acima do limite resulta em `lancesRestantes = 0`;
  - casos de `classifyKmAno` nas faixas 9.999 / 10.000 / 35.000.

### 0.2 FIPE falsa

`CONFIG_DEFAULTS.fipeMock = 45000` faz o painel mostrar score e limite calculados sobre uma FIPE inventada quando nenhuma é detectada. Além disso, o popup usa 0 como padrão e o content script usa 45000.

- Padrão `fipeMock: 0`. Se for 0, a opção fica desligada.
- Sem FIPE detectada nem informada: limite, score e lucro aparecem como "—", e o card "📊 Análise FIPE" vira um aviso **"Informe a FIPE para calcular"**, com o campo em foco.
- Se a API trouxer `veiculo.infocarFipeCodigo`, mostre o código e um link para `veiculos.fipe.org.br`, com botão de copiar o código.

### 0.3 HTML injetável (XSS e quebra de layout)

Valores do site e do usuário entram crus no `innerHTML`: `dados.modelo`, `fipeNome`, `tipoRetomada`, `laudo`, as notas (dentro do `<textarea>` e do `printAnalise`, onde um `</textarea>` nas notas quebra o painel) e, no popup, `item.modelo`/`item.url`.

Crie `esc()` em `lib/util.js` e aplique em todos esses pontos. Em `printAnalise`, use `esc()` também, ou monte o documento com `textContent`.

### 0.4 Vazamento de listeners ao arrastar

Cada chamada de `renderPanel` executa `makeDraggable`, que adiciona `mousemove`/`mouseup` no `document`. Depois de alguns lances são dezenas de listeners. Registre os listeners do `document` uma única vez, no `init`, operando sobre o painel atual.

### 0.5 A impressão ignora os valores do lote

`printAnalise` usa `CONFIG.margemRevenda`, `CONFIG.custoConserto` etc., e não a margem e os custos que o usuário editou naquele lote. Passe os parâmetros já resolvidos (os mesmos usados em `calcularOportunidade`).

### 0.6 Migrar dados do `localStorage` do site para `chrome.storage.local`

Hoje os lotes ficam no `localStorage` **da origem `leilo.com.br`**. Isso traz três problemas:
- o próprio site pode ler e apagar esses dados;
- o popup e as futuras páginas (comparador) não têm acesso a eles;
- o limite é de 50 lotes.

Novo esquema em `chrome.storage.local`, chave `lm_lots` (objeto `{ [id]: Lot }`):

```js
Lot = {
  id, url, site: "leilo.com.br",
  createdAt, updatedAt,
  favorito: false, comparar: false,
  snapshot: {            // último dado lido do site/API
    modelo, ano, km, kmAno, combustivel, lance, incremento,
    fipeScraped, fipeNome, fipeCodigo, comissaoPage, totalDespesas,
    depositoBens, taxaRemocao, taxaVistoria, taxaDespachante,
    laudo, tipoRetomada, situacao, fonte, lidoEm
  },
  user: {                // o que o usuário editou
    fipe, marg, incremento, tetoLance,
    custoConserto, custoDocumentacao, custoIPVA,
    ano, km, notas
  },
  live: { alertas: [], historico: [] },   // Fase 2
  ai: { ultimoInsight: null, ultimoRelatorio: null }  // Fase 4
}
```

- `lib/storage.js`: `getLot(id)`, `saveLot(id, patch)` (merge raso por bloco), `deleteLot(id)`, `listLots()`, `onLotsChanged(cb)`. Tudo `async` (Promise sobre `chrome.storage.local`).
- Limite de 300 lotes. Ao passar do limite, remover o de `updatedAt` mais antigo que não seja favorito. O histórico de lances fica limitado a 300 pontos por lote.
- **Migração** (roda uma vez no content script, já que só ele enxerga o `localStorage` do site): ler `lm_lote_v3_*`, converter para o esquema novo, gravar e remover as chaves antigas. Marcar `lm_migrated_v1 = true`.
- O popup passa a ler de `lm_lots`. Remover `lm_lots_index`, mantendo a migração dele.
- **Atenção:** `renderPanel` passa a fazer `await` do storage. O fluxo que hoje é síncrono (`loadLote`) precisa ser ajustado.

### 0.7 Pequenos ajustes

- A versão está escrita em 5 lugares (`content.js` em 3 pontos, `popup.html`, `printAnalise`). Use `chrome.runtime.getManifest().version`.
- `max="2026"` no input de ano: usar o ano atual + 1.
- Código morto: `btnNotify` no popup (não existe no HTML) e o handler de `.li-btn-settings:not(.li-btn-print-footer)` (nenhum botão casa com ele). Remover.
- `SITE_SELECTORS` tem seletores de 6 sites, mas o manifest só injeta o script no leilo. Mover os outros sites para um comentário "não suportado ainda" ou removê-los. Não ampliar `matches` nesta fase.

### Critérios de aceite da Fase 0

- `node --test tests/` passa.
- Painel abre no lote de exemplo, com valores iguais aos de antes, exceto o preço limite, que fica menor (comissão incluída).
- Anotação com `</textarea><b>x</b>` é salva e exibida literalmente.
- Lotes salvos antes da atualização continuam aparecendo no popup.
- Arrastar o painel depois de 10 atualizações de lance continua fluido.

---

## Fase 1 — Usabilidade (o usuário entender e confiar no painel)

### 1.1 Boas-vindas (`welcome/welcome.html`)
Abrir em `chrome.runtime.onInstalled` com `reason === "install"`. A página tem três passos:
1. o que o painel mostra;
2. configurar margem e custos padrão, com um formulário curto ali mesmo;
3. abrir um lote no leilo.com.br e usar o atalho `Ctrl+Shift+L`.

Incluir também uma nota de privacidade: os dados ficam no navegador e nada é enviado a terceiros sem a IA ligada.

### 1.2 Página de opções (`options/options.html`, `options_ui.open_in_tab: true`)
Centralizar a configuração em abas: **Cálculo** (o que hoje está no popup), **Alertas** (Fase 2), **IA** (Fase 4) e **Dados** (backup/importar/apagar tudo). O popup fica com lotes salvos e atalhos para "Configurações" e "Comparador".

### 1.3 Clareza dos números
- Cada valor indica a origem: `auto` (site/API), `editado` (usuário) ou `padrão` (configuração). A tag `li-auto-tag` já existe; generalizar.
- Tooltips (já existe `renderTooltip`) em Custo Real, Score e Lances restantes, explicando a conta com os números do lote.
- Estados vazios com instrução, e não só "—": "Lance não detectado — clique em ↻", "FIPE não informada — digite acima".

### 1.4 Campo "Meu teto"
Novo campo `user.tetoLance` ("quanto eu topo pagar"), que por padrão é igual ao preço limite. Os alertas da Fase 2 e o modo compacto usam o teto.

### 1.5 Modo compacto
Botão no cabeçalho que alterna para uma barra de uma linha: `Lance R$ 38.300 · Teto R$ 41.000 · 13 lances · Score 72`, com cor de fundo pela situação (verde, amarelo perto do teto, vermelho acima). É o modo pensado para usar durante o pregão.

### 1.6 Persistência do estado do painel
Posição, minimizado/compacto e seções recolhidas ficam em `chrome.storage.local` (`lm_ui`). Hoje a posição se perde a cada página e as seções usam o `localStorage` do site.

### 1.7 Badge no ícone
O content script envia `{ type: "badge", score, cor }` e o background chama `chrome.action.setBadgeText({ tabId, text })`. Mostra o score na aba do lote e "●" quando o rastreio está ligado (Fase 2).

### 1.8 Acessibilidade básica
`aria-label` nos botões só de ícone, foco visível, contraste mínimo de 4.5:1 nos textos cinza do painel.

### Aceite da Fase 1
Instalação nova abre as boas-vindas. Configurar no options reflete no painel sem recarregar (`chrome.storage.onChanged`). O modo compacto sobrevive a uma navegação SPA entre dois lotes.

---

## Fase 2 — Modo Leilão: rastreio ao vivo e apito

Objetivo: durante o pregão, o usuário liga o rastreio e é avisado (som + visual + notificação) quando o lance chega nos valores que importam, mesmo se estiver em outra aba.

### 2.1 Interface
Nova seção **"🔔 Modo Leilão"** no painel (e um botão `🔔` no modo compacto):
- Botão grande **"▶ Ativar rastreio"** / **"■ Parar rastreio"**. Ligado, o cabeçalho do painel ganha uma borda pulsante e o badge mostra "●".
- Lista de alertas do lote, cada um com toggle:
  - **Lance atingiu R$ X** (valor livre; pode haver vários);
  - **Faltam N lances para o meu teto** (padrão N = 3);
  - **Lance passou do meu teto**: alerta crítico, som diferente;
  - **Novo lance** (bip curto opcional, desligado por padrão).
- Botão **"🔊 Testar som"** e controle de volume.
- Painel de dados ao vivo: lance atual, **último lance há Xs**, **ritmo** (lances/min nos últimos 5 min), distância até o teto em R$ e em lances, e um **mini-gráfico** (SVG inline) do histórico de lances.

### 2.2 Detecção do lance
- **Primária:** o `MutationObserver` que já existe (`observeLanceChanges`), que reage ao DOM atualizado pelo site em tempo real.
- **Reserva:** com o rastreio ligado, consultar a API a cada 3s (configurável de 2 a 10s em Opções › Alertas), com `forceRefresh = true`.
- **Verificar com o usuário** como o site recebe os lances ao vivo (WebSocket ou polling). Peça para abrir DevTools › Network › WS no lote durante um pregão. Se for WebSocket, o DOM é a fonte mais rápida e a API vira só a reserva.
- **Throttling do Chrome:** em abas ocultas há mais de 5 minutos, timers encadeados rodam no máximo 1 vez por minuto. O observer do DOM não sofre isso. Documente a limitação na ajuda: deixar a aba do leilão aberta, mesmo em segundo plano.
- Atualização **parcial**: no modo leilão, um novo lance atualiza só os elementos ao vivo (`data-live="lance"` etc.) e não recria o painel inteiro. Isso evita perder o foco e piscar a tela.

### 2.3 Som (`lib/sound.js`)
Gerar com Web Audio API, sem arquivos de áudio:

```js
// apito: dois tons curtos; crítico: três tons descendentes mais longos
function tocar(padrao, volume) {
  const ctx = LM.sound.ctx || (LM.sound.ctx = new AudioContext())
  const notas = { apito: [[1800, .12], [2400, .18]], critico: [[2000, .25], [1500, .25], [1000, .4]], bip: [[1200, .06]] }[padrao]
  let t = ctx.currentTime
  for (const [freq, dur] of notas) {
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t); osc.stop(t + dur)
    t += dur + 0.05
  }
}
```

O `AudioContext` só toca depois de um gesto do usuário. Crie ou retome (`ctx.resume()`) o contexto no clique de "Ativar rastreio". Por isso o rastreio **não** liga sozinho ao abrir a página.

### 2.4 Disparo dos alertas
- Cada alerta dispara **uma vez** ao cruzar o limiar e se rearma quando o lance volta para baixo (por exemplo, quando o lote reinicia) ou quando o usuário edita o alerta.
- Ao disparar:
  1. tocar o som;
  2. piscar o painel;
  3. trocar o título da aba para `🔔 R$ 41.200 — <título original>` até o usuário focar a aba;
  4. enviar notificação do sistema via background (`chrome.notifications.create`) com o modelo e o valor. Clicar na notificação foca a aba (`chrome.tabs.update` + `chrome.windows.update`).
- Estado salvo em `lot.live.alertas`. O histórico de lances vai para `lot.live.historico` (`{ t, valor }`, máximo de 300).

### 2.5 Permissões
Adicionar `"notifications"`. A notificação pode ser desligada em Opções › Alertas.

### Aceite da Fase 2
- "Testar som" toca nos três padrões.
- Com o rastreio ligado e alerta em `lance atual + 1 incremento`, o som e a notificação disparam quando o lance muda. Para simular sem pregão real, criar em `content/live.js` uma função de debug `LM.live.simularLance(valor)`, ativa só com `localStorage.lm_debug = 1`.
- Com o usuário em outra aba, a notificação aparece e o clique volta para o lote.
- Digitar nas notas durante o rastreio não perde o foco.

---

## Fase 3 — Comparador de veículos

### 3.1 Marcar para comparar
- Botão **"➕ Comparar"** no painel, que alterna `lot.comparar` e mostra o contador "Comparando 3".
- No popup: checkbox por lote, botão **"Abrir comparador"** e link direto para `compare/compare.html`.

### 3.2 Página `compare/compare.html`
- Carrega `lib/util.js`, `lib/calc.js` e `lib/storage.js` e **recalcula** cada lote com `LM.calc`, para que todos usem a mesma regra.
- Tabela lado a lado, com 2 a 6 colunas (uma por lote) e uma linha por métrica: foto/modelo, ano, KM, KM/ano + classificação, combustível, FIPE, lance atual (com "lido há X" a partir de `snapshot.lidoEm`), custo real, preço limite, meu teto, lucro potencial, lucro %, score, laudo, origem/retomada, notas.
- Por linha, destacar o **melhor** em verde e o **pior** em vermelho (onde fizer sentido: menor custo, maior lucro, menor KM/ano...).
- Ações:
  - ordenar colunas por score ou lucro;
  - remover do comparador;
  - abrir o lote;
  - **"↻ Atualizar lances"**, que busca a API de cada lote em sequência com intervalo de 500ms. As páginas da extensão podem chamar a API porque `host_permissions` já cobre `*.leilo.com.br`;
  - editar FIPE, teto e custos direto na célula (salva em `lot.user` e recalcula);
  - **exportar CSV** e **imprimir**.
- Estado vazio: explicar como adicionar lotes.
- Botão **"🤖 Analisar com IA"** (desabilitado com dica até a Fase 4).

### Aceite da Fase 3
Com 3 lotes marcados, a tabela mostra os 3, e editar a FIPE de um recalcula só a coluna dele. O CSV abre no Excel com acentos corretos (BOM UTF-8 e separador `;`).

---

## Fase 4 — Assistente de IA (OpenAI ou Gemini, chave do usuário)

### 4.1 Configuração (Opções › IA)
- Provedor: **OpenAI** ou **Gemini** (arquitetura de adaptadores, para permitir outros depois).
- Chave de API: campo de senha com mostrar/ocultar, botão **"Testar conexão"** e botão **"Apagar chave"**.
- Modelo: campo de texto com sugestões. **Consultar a documentação oficial no momento da implementação** e escolher como padrão um modelo barato e rápido de cada provedor. Não confiar em nomes de modelo de memória.
- A chave fica **só em `chrome.storage.local`** (nunca `sync`), com o aviso: "A chave fica apenas neste navegador. As consultas são cobradas na sua conta do provedor."
- Permissões: declarar `optional_host_permissions: ["https://api.openai.com/*", "https://generativelanguage.googleapis.com/*"]` e pedir com `chrome.permissions.request` no clique de salvar (precisa de gesto do usuário). Assim a extensão não pede acesso a esses domínios para quem não usa IA.

### 4.2 Arquitetura
- **Todas as chamadas saem do background** (`background.js` importando `lib/ai.js`). Para isso, transformar o service worker em módulo com `"type": "module"` no manifest. Content scripts e páginas pedem via `chrome.runtime.sendMessage({ type: "ai.ask", tarefa, contexto })`. A chave **nunca** passa pelo content script nem pela página do site.
- `lib/ai.js` expõe `perguntar({ provedor, modelo, chave, system, mensagens, json })`, com um adaptador para cada provedor:
  - OpenAI: endpoint e formato de mensagens da doc atual (Chat Completions ou Responses), header `Authorization: Bearer`.
  - Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent`, header `x-goog-api-key`.
- Tratar erros com mensagens claras: chave inválida (401/403), sem saldo ou limite atingido (429), modelo inexistente (404) e timeout de 60s.
- Limitar `max tokens` da resposta e fazer cache por lote + tarefa + hash do contexto em `lot.ai`, para não cobrar duas vezes a mesma pergunta.

### 4.3 Balãozinho no painel (`content/assistant.js`)
- Botão redondo **🤖** fixo no canto inferior do painel (e no modo compacto). Abre uma gaveta de chat ancorada ao painel.
- Sem chave configurada, o balão mostra "Conecte sua chave da OpenAI ou Gemini" e um botão que abre Opções › IA.
- Atalhos prontos (chips):
  - **"Vale a pena?"**: veredito com justificativa;
  - **"Riscos deste lote"**: KM/ano, retomada, laudo, histórico de lances;
  - **"Quanto dar no máximo?"**: sugestão de teto, comparada com o preço limite calculado;
  - **"O que checar na vistoria"**;
  - **"Comparar com meus salvos"**: envia o resumo dos lotes marcados para comparar;
  - **"Gerar relatório"**.
- Campo livre para perguntas.
- Contexto enviado: JSON com `snapshot`, `user` (sem notas se o usuário desmarcar "incluir anotações"), o resultado de `LM.calc` e o resumo do histórico ao vivo. **Nenhum dado pessoal ou de conta do site.**
- System prompt em pt-BR: o assistente analisa leilões de veículos no Brasil, usa os números fornecidos, não inventa FIPE nem dados ausentes, diz quando falta informação e termina com o lembrete de ler o edital e vistoriar.

### 4.4 Insights estruturados
Para "Vale a pena?" e "Analisar com IA" (comparador), pedir JSON:

```json
{ "veredito": "comprar|cautela|evitar", "resumo": "...", "pontosFortes": [], "riscos": [],
  "tetoSugerido": 0, "perguntasVistoria": [], "confianca": "alta|media|baixa" }
```

Validar o formato e cair para texto se vier inválido. Renderizar como cards: veredito colorido, listas, e o teto sugerido com o botão **"Usar como meu teto"**.

No comparador, pedir um ranking com `{ ranking: [{ id, posicao, motivo }], resumo }` e mostrar a posição sugerida no topo de cada coluna.

### 4.5 Relatórios
- Refazer o `printAnalise` como página da extensão (`report/report.html?id=<lote>`) em vez de `window.open` + `document.write`, reaproveitando o CSS atual.
- Seções: dados, valores, análise FIPE, histórico de lances (gráfico), notas e, se houver, **"Parecer da IA"** (do cache ou gerado na hora).
- Relatório do comparador: mesma página com `?ids=a,b,c`.
- Botões: imprimir/salvar PDF e copiar como texto (para mandar no WhatsApp).

### Aceite da Fase 4
- Sem chave, o balão leva às opções. Com chave inválida, aparece a mensagem de erro de chave.
- Com chave válida, "Vale a pena?" responde em menos de 20s e renderiza os cards.
- Repetir a pergunta sem mudar o lote usa o cache (nenhuma chamada nova no Network do service worker).
- A chave não aparece em nenhum lugar do DOM do leilo.com.br.

---

## Fase 5 — Extras (opcionais; confirmar prioridade com o usuário antes)

1. **Lista de acompanhamento com lembrete:** favoritar um lote e receber notificação X minutos antes do pregão (`chrome.alarms` + `notifications`). Depende de a API ter a data do leilão; verificar na amostra (Regra 4).
2. **FIPE automática:** usar `infocarFipeCodigo` para consultar uma API pública de FIPE. Avaliar termos de uso e limites antes; seria uma permissão de host opcional. Hoje o usuário digita a FIPE à mão, e essa é a maior fricção do produto.
3. **Backup:** exportar e importar todos os dados em JSON (Opções › Dados). Necessário porque tudo é local.
4. **Arremates registrados:** quando o lote encerrar (via `situacao`), gravar o valor final. Com o tempo, mostrar "modelos parecidos que você acompanhou saíram por R$ X".
5. **Selos na listagem:** mostrar o score prévio nos cards da página de lista do leilo. Requer um novo diagnóstico de seletores da listagem.
6. **Outros leiloeiros:** só com diagnóstico de cada site (rota + seletores + API, se houver). Não reaproveitar os seletores antigos de `SITE_SELECTORS` sem verificar.

---

## Fase 6 — Publicação na Chrome Web Store

1. Versão `1.1.0` no `manifest.json` (o resto lê do manifest; ver 0.7).
2. Revisar o manifest final:
   - `permissions: ["storage", "notifications"]` (+ `"alarms"` se a Fase 5.1 for feita);
   - `optional_host_permissions` da IA;
   - `options_ui`;
   - `background.type: "module"`;
   - `web_accessible_resources` só se alguma página precisar ser aberta a partir do content script. Prefira abrir via mensagem ao background com `chrome.tabs.create`, que dispensa isso.
3. Texto de justificativa de cada permissão para o formulário da loja:
   - `storage`: salvar análises e configurações localmente;
   - `notifications`: alertas de lance do Modo Leilão;
   - host `leilo.com.br`: ler os dados do lote aberto;
   - hosts opcionais da IA: enviar a análise ao provedor escolhido pelo usuário, só quando ele configura a própria chave.
4. Atualizar a política de privacidade (leilometro.com.br) e a seção "Práticas de privacidade" da loja: com a IA ativada, dados do lote (sem dados pessoais) são enviados ao provedor escolhido.
5. Gerar o zip **sem** `.git`, `docs/`, `tests/` e `*.md`:
   ```powershell
   $files = Get-ChildItem -Exclude .git,docs,tests,*.md,*.zip
   Compress-Archive -Path $files -DestinationPath leilometro-1.1.0.zip -Force
   ```
6. Atualizar capturas de tela e descrição da loja com Modo Leilão, Comparador e IA.

---

## Ordem e tamanho estimado

| Fase | Entrega | Tamanho | Depende de |
|---|---|---|---|
| 0 | Correções + reorganização + storage novo | médio | — |
| 1 | Usabilidade (boas-vindas, opções, teto, compacto) | médio | 0 |
| 2 | Modo Leilão + apito | médio | 0 (melhor com 1.4/1.5) |
| 3 | Comparador | médio | 0 |
| 4 | IA (balão, insights, relatórios) | grande | 0, 1.2; usa 3 |
| 5 | Extras | variável | — |
| 6 | Publicação | pequeno | tudo que for lançar |

Lançamento mínimo útil: **0 + 1.4 + 1.5 + 2**. Isso já resolve o uso durante o leilão. Comparador e IA podem ir em uma 1.2.0.

## Como pedir ao Opus

Uma fase por conversa (ou por vez), por exemplo:

> Leia `PLANO_MELHORIAS.md` e `DIAGNOSTICO_LEILO.md`. Execute a **Fase 0** inteira seguindo as Regras. Ao terminar, rode as verificações, faça o commit e me passe o checklist de teste manual.

Depois do teste: "Testei a Fase 0, funcionou (ou: problema X). Execute a Fase 1."
