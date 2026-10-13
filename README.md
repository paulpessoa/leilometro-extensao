# Leilômetro — Extensão Chrome

O **Leilômetro** é uma ferramenta para arrematantes de leilões de veículos. Ela abre um painel na página do lote no [leilo.com.br](https://leilo.com.br) e ajuda a decidir o lance pelos números, não pela emoção.

## 🚀 Funcionalidades

- **Custo no leilão:** lance + comissão + taxas do lote (lidas da API do site; bate com o "total a pagar").
- **Preço limite:** o maior lance em que você ainda lucra a margem desejada, já descontando comissão, taxas e custos pós-arremate (conserto, documentação, IPVA).
- **Meu teto:** um limite pessoal opcional, usado pelos alertas.
- **Score de oportunidade (0–100)** e **análise de KM/ano** (particular, frota, aplicativo).
- **Sinais de atenção:** lote **sem vídeo** (normalmente o carro não liga ou não anda), sem chave, sem laudo cautelar, laudo reprovado ou com observações. O score não muda, mas o selo de oportunidade avisa "com sinais de risco".
- **Lembrete:** marque ⏰/★ e receba uma notificação X minutos antes do encerramento previsto, mesmo com a aba fechada.
- **Modo Leilão:** botão "Ativar rastreio" durante o pregão. Apita quando faltam N lances para o teto, quando passa do teto (som crítico), quando o lance chega num valor escolhido e 1 minuto antes do encerramento previsto. Também envia notificação do sistema, muda o título da aba e mostra gráfico e ritmo dos lances.
- **Modo compacto:** uma barra com lance, teto, lances restantes e score, colorida pela situação.
- **Comparador:** até vários veículos lado a lado, com o melhor/pior de cada item destacado, edição de FIPE/teto/conserto na tabela e exportação para CSV.
- **Relatório:** página para imprimir/salvar em PDF ou copiar um resumo para o WhatsApp.
- **Assistente de IA (opcional, chave própria da OpenAI ou do Gemini):** veredito, riscos, teto sugerido, checklist de vistoria, comparação com os lotes salvos, ranking no comparador e parecer no relatório.
- **Dados locais:** lotes, anotações e alertas ficam no navegador (`chrome.storage.local`), com backup/importação em JSON.

## 🛠️ Como instalar (modo desenvolvedor)

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions/` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta do repositório.
4. Se a versão da Chrome Web Store estiver instalada, desative-a para não haver dois painéis.
5. Abra um lote, por exemplo `https://leilo.com.br/lote/<id>/`.

Atalho: `Ctrl+Shift+L` abre/fecha o painel.

## 📂 Estrutura

| Caminho | O que é |
|---|---|
| `manifest.json` | Manifest V3 |
| `background.js` | Service worker: abre páginas, badge, notificações e chamadas de IA |
| `lib/util.js` | Formatação, escape de HTML, mini-markdown |
| `lib/calc.js` | Regras de cálculo (sem DOM), usadas em todo lugar e nos testes |
| `lib/api.js` | Leitura da API pública do leilo.com.br (`/v1/lote/by-id/<uuid>`) |
| `lib/storage.js` | Armazenamento (`lot:<id>`, configuração, estado do painel, IA) e migração da v1.0 |
| `lib/sound.js` | Sons de alerta via Web Audio |
| `lib/ai.js` | Prompts e adaptadores OpenAI/Gemini (só roda no service worker) |
| `content/` | Painel na página: `scrape.js` (rota/DOM), `panel.js`, `live.js` (Modo Leilão), `assistant.js` (balão 🤖), `main.js` (inicialização) |
| `popup/` | Lista de lotes salvos |
| `options/` | Configurações: cálculo, alertas, IA, backup |
| `compare/` | Comparador |
| `report/` | Relatório imprimível |
| `welcome/` | Boas-vindas (abre ao instalar) |
| `styles.css` | Estilo do painel injetado |
| `ui/pages.css` | Estilo das páginas da extensão |
| `tests/` | Testes (`node --test "tests/*.test.js"`) |
| `scripts/empacotar.mjs` | Gera o zip para a Chrome Web Store |
| `docs/amostra-api-lote.json` | Resposta real da API, usada nos testes |

Quando o site mudar o layout, veja `DIAGNOSTICO_LEILO.md` (seletores) e `content/scrape.js`.

## 🧪 Testes

```bash
node --test "tests/*.test.js"
```

Para simular lances no Modo Leilão sem um pregão real, rode no console da página do lote com o rastreio ligado:

```js
localStorage.setItem("lm_debug", "1")
document.dispatchEvent(new CustomEvent("leilometro:simular", { detail: 40000 }))
```

## 📦 Empacotar para a Chrome Web Store

```bash
node scripts/empacotar.mjs   # gera dist/leilometro-<versão>.zip
```

Textos da ficha da loja, justificativas de permissão e formulário de privacidade: [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md).

Permissões: `storage` (dados locais), `notifications` (alertas do Modo Leilão), `alarms` (lembrete antes do encerramento), host `*.leilo.com.br` (ler o lote aberto) e, só se o usuário ativar a IA, `api.openai.com` ou `generativelanguage.googleapis.com` (permissões opcionais).

## 📄 Licença

Este projeto é para uso pessoal e profissional de arrematantes. Consulte os termos de uso na nossa Landing Page.

---
Desenvolvido por [Paul Pessoa](https://github.com/paulpessoa)
