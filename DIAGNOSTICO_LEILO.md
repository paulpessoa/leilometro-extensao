# Diagnóstico — painel não abre na página do veículo (leilo.com.br)

Verificado em 2026-10-13 no Chrome, URL:
`https://leilo.com.br/lote/d3be22d3-9f8f-4bd2-88cd-9364ec0fcc5a/?tipo=Carros&tipoLista=Carros`

## Rota
- Pathname atual: `/lote/<uuid>/` (query `?tipo=Carros&tipoLista=Carros` é ignorada).
- Regex em `content.js` (`VEHICLE_PAGE_PATTERNS`) já cobre `/lote/<uuid>` e a legada `/leilao/<slug>/<uuid>` → **rota OK**.
- O site é SPA; `handleRoute()` reavalia a URL a cada 1s → OK.

## API (principal fonte de dados)
- `GET https://api.leilo.com.br/v1/lote/by-id/<uuid>` → **200 OK**, campos `id`, `nome`, `tipo`, `situacao`, `valor.*`, `veiculo.*` presentes.
- `host_permissions` do manifest cobre `*://*.leilo.com.br/*` → OK.

## Seletores do DOM (fallback) — estado atual do site
| Campo | Seletor atual no site | Em `SITE_SELECTORS` | Status |
|---|---|---|---|
| Título (h1) | `h1.nome-lote.pagina-lote-julho2026__titulo` ("CITROEN C4 Cactus Feel A 2021") | `h1.pagina-lote-julho2026__titulo` | OK |
| Lance atual | `strong.painel-lances-julho2026__valor` ("R$ 38.300,00") | `.painel-lances-julho2026__valor` | OK |
| Itens de info | `.informacoes-lote-julho2026__item` (10 itens) | idem | OK |
| Painel de lances | `.painel-lances-julho2026` / `__card` | usado no observer | OK |

Obs.: o seletor `.painel-lances-julho2026__valor span` não casa mais (é `<strong>` sem span), mas o seguinte da lista cobre.

## Conclusão
Nada na rota, na API ou nos seletores principais quebrou. No Chrome de teste a extensão **não está instalada** (nenhum elemento `#leilometro-panel`), então não consegui reproduzir o bug aqui. Provável causa: versão instalada localmente desatualizada (pré-ajuste de rota `/lote/` e SPA).

## Campos a atualizar / vigiar (a cada mudança de layout do site)
- `VEHICLE_PAGE_PATTERNS["leilo.com.br"]` — rota (`/lote/`).
- `SITE_SELECTORS["leilo.com.br"]`: `lance`, `modelo`, `ano`/`km`/`combustivel`/`fipe` (`.informacoes-lote-julho2026__item`), `custos`.
- Sufixo `-julho2026` nas classes: muda a cada redesign do site — é o primeiro sintoma.
- `fetchLoteFromApi`: `valor.valorProposta`, `valor.comissaoPorcentagem`, `valor.depositoDeBens`, `valor.remocao`, `valor.vistoria`, `valor.despachante`, `valor.totalDespesas`, `valor.incremento`, `veiculo.km`, `veiculo.anoModelo`, `veiculo.valorMercado`, `veiculo.infocarFipe*`.
- Delay de 1500ms em `handleRoute()` antes de `renderPanel` (aumentar se o Vue demorar a renderizar).

## Próximo passo
Reinstalar a extensão local (chrome://extensions → recarregar a pasta) e abrir a URL acima; se o painel não aparecer, ver o console (F12) da aba.
