# Leilômetro — Extensão Chrome

O **Leilômetro** é uma ferramenta de inteligência para arrematantes de leilões de veículos. Ela injeta um painel de análise diretamente na tela do leiloeiro, ajudando você a tomar decisões baseadas em dados, não em emoção.

## 🚀 Funcionalidades Principais

- **Cálculo de Custo Real:** Soma automaticamente o lance atual com comissão do leiloeiro, taxa de pátio e outros encargos.
- **Score de Oportunidade:** Uma métrica exclusiva (0-100) que avalia se o negócio é seguro com base na margem de lucro e estado do veículo.
- **Análise de KM/Ano:** Classifica o uso do veículo (Particular, Frota, Aplicativo ou Extremo).
- **Preço Limite (FIPE):** Define o valor máximo que você pode pagar para manter sua margem de lucro desejada.
- **Persistência de Dados:** Salva suas anotações e cálculos por lote localmente no seu navegador.

## 🛠️ Como Instalar (Modo Desenvolvedor)

Como esta versão está no GitHub para desenvolvimento, você pode instalá-la manualmente no Chrome:

1.  Faça o download ou clone este repositório.
2.  Abra o Google Chrome e acesse `chrome://extensions/`.
3.  No canto superior direito, ative a chave **"Modo do desenvolvedor"**.
4.  Clique no botão **"Carregar sem compactação"**.
5.  Selecione a pasta onde os arquivos deste repositório estão salvos.
6.  O ícone do Leilômetro aparecerá na sua barra de extensões!

## 📂 Estrutura do Projeto

- `manifest.json`: Configurações principais da extensão (Manifest V3).
- `background.js`: Service worker para processos em segundo plano.
- `content.js`: Script principal que injeta o painel e lê os dados dos leiloeiros.
- `styles.css`: Estilização do painel flutuante.
- `popup/`: Interface que aparece ao clicar no ícone da extensão.
- `icons/`: Logotipos em diferentes resoluções.

## 📄 Licença

Este projeto é para uso pessoal e profissional de arrematantes. Consulte os termos de uso na nossa Landing Page.

---
Desenvolvido por [Paul Pessoa](https://github.com/paulpessoa)
