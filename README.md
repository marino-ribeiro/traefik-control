# Traefik Control

Painel web de gerenciamento para o [Traefik](https://traefik.io) v3 — construído com
**Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Turbopack**.

Lê o estado ao vivo pela API do Traefik e **escreve** configuração no arquivo do
`file` provider, que o Traefik recarrega sozinho. Sem reiniciar container, sem editar
YAML no servidor na unha.

---

## O que ele faz

| Página | O que mostra |
|---|---|
| **Visão geral** | Contadores de routers/services/middlewares, erros e avisos, providers ativos, entrypoints e um painel de diagnóstico com tudo que não está saudável |
| **Métricas** | Requisições por segundo empilhadas por classe de status, percentis de latência, tráfego de entrada/saída e ranking de routers por volume — tudo com tooltip, tabela equivalente e atualização ao vivo |
| **Routers** | HTTP/TCP/UDP com busca, filtro, ordenação e linha expansível. **Criar, editar e remover** direto da tabela |
| **Services** | Servidores do load balancer com estado individual, health check e sessão fixa. **CRUD na própria tela** |
| **Middlewares** | Tipo, configuração completa e onde cada um é usado. **CRUD na própria tela** |
| **Entrypoints** | Portas em escuta, redirecionamentos e cert resolver (somente leitura — vêm da config estática) |
| **Gerenciar** | A mesma edição, organizada por tipo, mais um editor de YAML bruto do arquivo inteiro |

## De onde vêm os dados

São **duas fontes distintas**, e a diferença importa:

| Fonte | O que dá | Usada em |
|---|---|---|
| API REST (`/api/*`) | a configuração **resolvida** — quais routers existem, para onde apontam, se estão saudáveis | todas as telas menos Métricas |
| Endpoint Prometheus (`/metrics`) | o **volume** — quantas requisições, com que latência, quantos bytes | Métricas |

A API REST nunca conta requisição, latência ou tráfego. Sem `metrics.prometheus`
ligado no Traefik, a tela de Métricas fica vazia — e explica isso na própria tela.

### O histórico começa vazio

As métricas do Traefik são **contadores acumulados**: uma raspagem só diz o total
desde o boot. Para ter taxa e série temporal, o painel guarda amostras a cada 5s num
anel em memória (30 min) e deriva as taxas por diferença.

Consequência honesta: ao subir, os gráficos começam vazios e se preenchem enquanto o
painel roda. **Não há retroativo** — para histórico de verdade, use um Prometheus
guardando os dados. O anel também vive no processo: reiniciar o painel zera a série,
e com mais de uma réplica cada uma tem a sua.

## Segurança

Este painel reescreve o roteamento do seu Traefik. Ele foi construído assumindo isso:

- **Senha obrigatória em produção** (`UI_PASSWORD`). Cookie de sessão `httpOnly`
  assinado com HMAC-SHA256, comparação em tempo constante, validade de 12h.
  Deixar `UI_PASSWORD` vazio **desativa a autenticação** — só faça isso localmente.
- **A API do Traefik nunca é exposta ao navegador.** Todo acesso passa pelo servidor
  Next.js; o `docker-compose.yml` deliberadamente **não publica a porta 8080**.
- **Escrita atômica** (arquivo temporário + `rename`), então o watcher do Traefik
  jamais lê um YAML pela metade.
- **Backup automático** da versão anterior a cada gravação, em `data/.backups/`
  (as 20 mais recentes).
- **Validação antes do disco**: nomes são checados contra `[a-zA-Z0-9._-]+` e o YAML
  é parseado antes de qualquer escrita.
- **Só edita o que é seu.** O painel só oferece editar/remover para objetos que
  existem no arquivo que ele mesmo escreve. Objetos vindos do Docker — ou de outros
  arquivos que o file provider observa — aparecem marcados como somente leitura.
  Testar `provider === "file"` não bastaria: o file provider pode observar um
  diretório inteiro, e editar um objeto de outro arquivo daria 404 ou criaria uma
  entrada duplicada.

## Como rodar

### Docker Compose (recomendado)

```bash
cp .env.example .env
# edite UI_PASSWORD e gere UI_SESSION_SECRET com:  openssl rand -hex 32
docker compose up -d --build
```

O volume `dynamic` é a peça central: o painel escreve nele, o Traefik o observa
(`watch: true`). Os dois containers precisam montar **o mesmo caminho**.

Ajuste o `Host()` do label `traefik-ui` no `docker-compose.yml` para o seu domínio.

### Local

```bash
npm install
npm run dev            # Turbopack, http://localhost:3000
```

Sem nenhum Traefik à mão, explore a interface com dados fictícios:

```bash
TRAEFIK_MOCK=1 npm run dev
```

## Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `TRAEFIK_API_URL` | — | Base da API, **sem** `/api`. Ex.: `http://traefik:8080` |
| `TRAEFIK_MOCK` | `0` | `1` serve dados fictícios e ignora `TRAEFIK_API_URL` |
| `TRAEFIK_METRICS_URL` | `TRAEFIK_API_URL` + `/metrics` | Endpoint Prometheus do Traefik |
| `TRAEFIK_API_USER` / `TRAEFIK_API_PASSWORD` | — | Se a API estiver atrás de basic auth |
| `TRAEFIK_DYNAMIC_FILE` | `./data/dynamic.yml` | Arquivo YAML que o painel escreve |
| `UI_PASSWORD` | — | Senha do painel. **Vazio desativa a autenticação** |
| `UI_SESSION_SECRET` | — | Segredo do cookie. Gere com `openssl rand -hex 32` |

Vazio em `TRAEFIK_API_URL` liga o modo mock automaticamente — o painel nunca fica
numa tela em branco por falta de configuração.

## Configuração exigida no Traefik

Em `traefik-example/traefik.yml` há um exemplo completo. O essencial:

```yaml
api:
  dashboard: true
  insecure: true          # ok porque a 8080 não é publicada

providers:
  file:
    filename: /dynamic/dynamic.yml   # o MESMO arquivo do painel
    watch: true                      # sem isso, nada recarrega
```

## Sobre o build nesta máquina

O container de desenvolvimento tem **1 GiB** de RAM (limite de cgroup — o `free`
mostra a memória do host e engana). Duas consequências, ambas medidas:

**Turbopack não fecha o build de produção.** É morto pelo OOM killer (rc=137), e
`--max-old-space-size` não ajuda: a parte Rust do Turbopack aloca fora do heap do
Node. Por isso `build` usa **webpack**. O `dev` segue no **Turbopack** (pico de
~1,0 GiB, Ready em <1s).

**O webpack precisa de heap limitado.** Sem limite, o build passa pelas páginas e
morre em *Collecting build traces* — a etapa que produz o `output: standalone`. O
sintoma é traiçoeiro: as rotas são impressas, parece sucesso, e o `.next/standalone`
simplesmente não existe. Com `--max-old-space-size=700` o V8 coleta lixo em vez de
crescer, e o build fecha em ~40s. O limite já está no script `build`.

Numa máquina com mais memória: `npm run build:nolimit` (webpack sem o teto) ou
`npm run build:turbo` (Turbopack).

## Design

Três linguagens somadas, nesta ordem de prioridade:

**1. netcup** (`legal.netcupvps.marinotech.com.br`) — a identidade. Barlow Condensed
peso 900 em caixa alta, tracking aberto nos micro-rótulos e o vermelho `#FF3B5C` que
esquenta para laranja `#FF6B35` no hover.

**2. Geist** (`nextjs.org`) — o acabamento. Gradiente `110deg` nos botões, headline em
fade via `background-clip: text` e o easing `cubic-bezier(.32,.72,0,1)`.

**3. macOS** — a matéria. Superfícies de vidro (`backdrop-filter: blur(24px)
saturate(180%)`), o realce interno de 1px no topo que simula luz na quina do painel,
e cantos generosos — 14px nos painéis, 8px nos controles.

Tudo sobre **preto OLED absoluto** (`#000000`), com um brilho ambiente em
`radial-gradient` no fundo: sem nada para refratar, vidro sobre preto puro fica
idêntico a superfície opaca.

**Estado é ícone, não quadrado colorido** — ✓, △, ✕ e ○ se distinguem em escala de
cinza, no daltonismo e em modo de alto contraste. Isso não é só estética: a cor de
status nunca carrega o significado sozinha.

### Cores dos gráficos

A paleta foi **validada por script**, não no olho, contra a superfície real (`#0a0a0a`):

| Uso | Paleta | Resultado |
|---|---|---|
| Tráfego entrada/saída | 2 categóricos (azul, laranja) | passa tudo — CVD ΔE 26.8 |
| Latência p50/p95/p99 | ordinal de um matiz só | passa tudo — L monótona |
| Status HTTP 2xx–5xx | paleta de status reservada | CVD adjacente ΔE 10.4, contraste ≥3:1 |

No status, os testes de faixa de luminância e piso de croma acusam falha, mas não se
aplicam: são checagens de paleta **categórica**, e a de status é reservada e fixa — o
cinza do 3xx é deliberadamente neutro, porque redirect não é identidade de série. O
par perigoso é 2xx↔5xx (ΔE 4.1 no deuteranopia, verde × vermelho): na área empilhada
eles **nunca ficam adjacentes**, porque 3xx e 4xx sempre se interpõem. E todo status
vem com ícone e rótulo.

Sem biblioteca de gráficos: SVG escrito à mão, para controle total sobre o vidro e
zero peso no bundle. As dependências de produção são só `next`, `react`, `react-dom`,
`yaml` e `lucide-react`.

Os tokens vivem em `src/app/globals.css`, no bloco `@theme` do Tailwind v4; a
justificativa da paleta está em `src/components/charts/palette.ts`.

## Estrutura

```
src/
  app/
    (app)/            páginas protegidas (dashboard, listas, gerenciar)
    login/            tela de acesso
    api/
      auth/           login e logout
      config/         GET/PUT do YAML + CRUD por entrada
      traefik/        proxy somente-leitura para a API do Traefik
  components/
    shell/            header, nav, footer, estado de erro
    ui/               primitivos (botão, badge, tabela, modal, campos)
    views/            telas com estado de cliente
    charts/           SVG à mão: área empilhada, linhas, espelhado, barras
  lib/
    traefik.ts        cliente da API REST
    prometheus.ts     parser do formato de exposição + quantis de histograma
    metrics.ts        amostrador em anel e derivação de taxas
    config-store.ts   leitura/escrita atômica do file provider
    auth.ts           sessão HMAC
    mock.ts           dados de demonstração
```
