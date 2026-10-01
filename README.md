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
| **Routers** | HTTP/TCP/UDP com busca, filtro, ordenação e linha expansível. **Criar, editar e remover** direto da tabela. Cada router HTTP com `Host()` ganha o link do serviço, que abre numa aba nova (scheme e porta saem do entrypoint) |
| **Services** | Servidores do load balancer com estado individual, health check e sessão fixa. **CRUD na própria tela** |
| **Middlewares** | Tipo, configuração completa e onde cada um é usado. **CRUD na própria tela** |
| **Entrypoints** | Portas em escuta, redirecionamentos e cert resolver (somente leitura — vêm da config estática) |
| **Gerenciar** | A mesma edição, organizada por tipo, a lista de backups com comparação e restauração, e um editor de YAML bruto do arquivo inteiro — com números de linha, guias de indentação e Tab/Enter de IDE (Ctrl+M devolve o Tab à navegação) |
| **Servidor** | Atalho ao lado do selo live/demo: IP público (A/AAAA) e interno para apontamento DNS, com botão de copiar; versão e uptime do Traefik; arquivo, métricas e autenticação em uso |

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
- **Limite de tentativas**: 5 senhas erradas bloqueiam aquele cliente por 15 min
  (identificado pelo IP que o proxy anota em `X-Forwarded-For`).
- **Proteção contra CSRF**: toda rota que escreve exige `application/json` e
  requisição da mesma origem (`Sec-Fetch-Site`/`Origin`). O cookie é `SameSite=lax`,
  e isso sozinho não bastaria — "site" inclui qualquer outro subdomínio seu.
- **Gravações em fila**: uma por vez, então duas abas salvando juntas não apagam
  uma a outra. Vale por processo — com réplicas, cada uma tem a sua fila.
- **A API do Traefik nunca é exposta ao navegador.** Todo acesso passa pelo servidor
  Next.js; o `docker-compose.yml` deliberadamente **não publica a porta 8080**.
- **Escrita atômica** (arquivo temporário + `rename`), então o watcher do Traefik
  jamais lê um YAML pela metade.
- **Backup automático** da versão anterior a cada gravação, em `.backups/` ao lado
  do arquivo (as 20 mais recentes), com extensão `.yml.bak`: com
  `providers.file.directory`, o Traefik lê a pasta recursivamente, e um backup
  `.yml` viraria configuração ativa.
- **Seu arquivo continua seu.** Os formulários editam o YAML como documento: só as
  linhas da entrada tocada mudam. Comentários, linhas em branco, aspas, âncoras e
  aliases, indentação e listas `[a, b]` do resto do arquivo ficam como estão. (A
  única normalização: o espaço antes de um `# comentário` de fim de linha vira um.)
- **Validação antes do disco**: nomes são checados contra `[a-zA-Z0-9._-]+` e o YAML
  é parseado antes de qualquer escrita. Mapas estruturais vazios (`middlewares: {}`,
  `tcp: {}`…) são removidos — o Traefik recusa o arquivo **inteiro** por causa de um.
  Remover uma entrada que é âncora de um alias em outro ponto é recusado.
- **Restaurar backup pela tela.** Em Gerenciar → Backups, cada versão mostra a
  comparação com o arquivo atual (o que volta, o que sai) antes de restaurar. A
  restauração passa pelas mesmas validações do editor bruto, é recusada se o
  arquivo mudou desde a comparação ou se alteraria uma entrada protegida, e a
  versão atual vira backup — restaurar também se desfaz.
- **Editor YAML sem atropelo**: se o arquivo mudou no disco depois que você abriu o
  editor (edição por fora, outra aba), gravar é recusado e o painel pergunta se
  você quer a versão do disco ou gravar a sua por cima.
- **Não deixa você se trancar para fora.** As entradas listadas em `UI_PROTECTED`
  (o router, o service e a whitelist do próprio painel) não podem ser editadas,
  renomeadas nem removidas — nem pelos formulários, nem pelo YAML bruto, nem
  restaurando backup. Aparecem com cadeado. Comentar ou reformatar em volta delas
  continua permitido; recriar uma que sumiu do arquivo também (é o conserto).
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

O serviço `dynamic-init` roda uma vez antes dos outros: cria o `dynamic.yml` se não
existir (um Traefik que sobe sem o arquivo desiste do file provider e não o pega
depois) e entrega a pasta ao usuário do painel (uid 1001).

**Já tem um `dynamic.yml` em produção?** Troque o volume nomeado por um bind mount
da **pasta** dele nos três serviços — por exemplo `/etc/traefik/dynamic:/dynamic`. A
pasta, não só o arquivo: o painel grava um temporário ao lado e renomeia, e guarda
os backups ali.

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
| `UI_PROTECTED` | — | Entradas que o painel recusa alterar, `secao.tipo.nome` separadas por vírgula. Ex.: `http.routers.painel,http.services.painel,http.middlewares.painel-ip` |
| `UI_SESSION_SECRET` | aleatório por boot | Segredo do cookie. Gere com `openssl rand -hex 32`; sem ele, todo restart desloga |
| `SERVER_PUBLIC_IP` | descoberto | IP(s) público(s) na Visão geral, separados por vírgula |
| `SERVER_INTERNAL_IP` | interfaces de rede | IP(s) interno(s). **No Docker, informe** — o container só vê o próprio IP |
| `PUBLIC_IP_LOOKUP` | `1` | `0` impede o painel de perguntar o IP público a `api.ipify.org` |
| `FRAME_ANCESTORS` | — (só o próprio painel) | Origens que podem exibi-lo num `<iframe>`, ex.: `https://intranet.empresa.com.br` |
| `UI_HOST` | `traefik.exemplo.com` | Só no compose: o `Host()` do router do painel no Traefik |

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

## Embutir na intranet (iframe)

Por padrão o painel só pode ser exibido por ele mesmo (`frame-ancestors 'self'`) —
nenhum outro site consegue emoldurá-lo para induzir cliques (clickjacking). Para
abrir dentro da intranet:

```bash
UI_HOST=traefik.empresa.com.br
FRAME_ANCESTORS=https://intranet.empresa.com.br
```

- **Mesmo domínio registrável.** `intranet.` e `traefik.empresa.com.br` contam como o
  mesmo site, e o cookie de sessão funciona dentro do iframe. Em domínios
  diferentes, Safari e Chrome bloqueiam o cookie e o login não fica.
- **O iframe não substitui o login.** O painel continua acessível pelo endereço
  direto; quem dispensa a senha é o SSO abaixo, não a moldura.
- O header sai do `src/proxy.ts`, lido a cada requisição — dá para mudar a variável
  sem refazer a imagem. Valores que não sejam origens `http(s)://host[:porta]` são
  descartados.

### Próximo passo: SSO com Keycloak (planejado, não implementado)

O desenho previsto, para que o usuário logado na intranet entre direto:

1. **OIDC no próprio painel** (Authorization Code + PKCE), como client confidencial
   do realm da intranet. Preferido a um `oauth2-proxy` na frente porque permite
   autorizar por papel (ex.: `traefik-viewer` só lê, `traefik-admin` grava) e
   registrar **quem** fez cada alteração junto do backup.
2. **Login silencioso no iframe**: tenta `prompt=none` aproveitando a sessão do
   Keycloak; sem sessão, abre o login numa janela própria — o Keycloak, por padrão,
   não aceita ser exibido em iframe.
3. **Senha como acesso de emergência**: o login por `UI_PASSWORD` fica desligado por
   padrão e reativável, para entrar quando o Keycloak estiver fora.

No Keycloak será preciso: um client novo (confidencial, com a URL de retorno
`https://<UI_HOST>/api/auth/callback`) e os papéis/grupos de quem pode ver e gravar.

## Primeiro deploy: o que conferir

O painel foi testado de ponta a ponta contra um Traefik v3.3.7 real (CRUD pelo
painel, recarga do Traefik, tráfego, métricas, autenticação). **O caminho via
Docker não foi** — valide estes pontos na primeira subida, de preferência numa
máquina de teste:

1. **`docker compose up -d --build` sobe os três serviços.** O `dynamic-init` deve
   sair com código 0 (`docker compose ps -a`); `traefik` e `traefik-ui` só sobem
   depois dele.
2. **O Traefik carregou o file provider.** `docker compose logs traefik` não pode ter
   `Cannot start the provider *file.Provider`.
3. **O painel grava.** Crie um router de teste pela UI e confira que ele aparece no
   Traefik e em `/dynamic/dynamic.yml`. Erro de permissão aqui = o `dynamic-init` não
   acertou o dono da pasta (uid 1001).
4. **A imagem não carrega segredos.** `docker compose exec traefik-ui ls -a /app` não
   pode listar `.env` (o `.dockerignore` o exclui).
5. **O botão Sair volta para o seu domínio.** O redirect para `/login` é montado a
   partir da URL da requisição; atrás do Traefik, confira que ele não leva ao host
   interno do container.
6. **Login por https.** Em produção o cookie de sessão é `secure`: acessado por http
   puro (ex.: `IP:3000`), o login parece funcionar mas a sessão não é guardada.
7. **IP interno na página Servidor.** Dentro do container o painel só vê o próprio IP;
   defina `SERVER_INTERNAL_IP` no `.env` com o IP da máquina.

## Limitações conhecidas

- **Uma réplica por arquivo.** A fila que serializa as gravações vive no processo.
  Duas instâncias do painel gravando no mesmo `dynamic.yml` podem perder edições —
  isso exigiria lock no disco.
- **Limite de login depende do proxy.** O cliente é identificado pelo último valor de
  `X-Forwarded-For`. Sem proxy na frente, todos contam como o mesmo cliente e 5 erros
  de qualquer um bloqueiam o login de todos por 15 min.
- **Formatação do YAML: quase intacta.** O espaço antes de um `# comentário` de fim de
  linha vira um só. Numa entrada editada, um valor cuja estrutura muda (ex.: uma lista
  que muda de tamanho) é recriado e perde os comentários dentro dele.
- **Editar só no arquivo do painel.** Com `providers.file.directory`, o painel edita
  um arquivo da pasta; o que vem dos outros aparece como somente leitura.
- **IP público via serviço externo.** Sem `SERVER_PUBLIC_IP`, o painel consulta
  `api.ipify.org` (cache de 10 min). `PUBLIC_IP_LOOKUP=0` desliga a consulta.
- **Histórico de métricas em memória.** Ver [O histórico começa vazio](#o-histórico-começa-vazio).

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
  proxy.ts          headers por requisição (quem pode exibir o painel num iframe)
  app/
    (app)/            páginas protegidas (dashboard, listas, gerenciar)
    login/            tela de acesso
    api/
      auth/           login e logout
      config/         GET/PUT do YAML + CRUD por entrada
      server/         endereços do servidor (IP público/interno)
      traefik/        proxy somente-leitura para a API do Traefik
  components/
    shell/            header, nav, footer, estado de erro
    ui/               primitivos (botão, badge, tabela, modal, campos, CodeEditor)
    views/            telas com estado de cliente
    charts/           SVG à mão: área empilhada, linhas, espelhado, barras
  lib/
    traefik.ts        cliente da API REST
    prometheus.ts     parser do formato de exposição + quantis de histograma
    metrics.ts        amostrador em anel e derivação de taxas
    config-store.ts   escrita atômica, em fila, editando o YAML como documento
    auth.ts           sessão HMAC + limite de tentativas de login
    request-guard.ts  barreira contra CSRF nas rotas que escrevem
    router-links.ts   link do serviço a partir da regra do router
    server-addresses.ts  IP público e interno da máquina
    mock.ts           dados de demonstração
```
