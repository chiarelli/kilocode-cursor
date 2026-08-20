# kilo-cursor-plugin

Ponte transparente entre **Kilo Code** e **cursor-agent**, baseada no [opencode-cursor](https://github.com/Nomadcxx/opencode-cursor).

Kilo é um fork do OpenCode — este plugin reutiliza a mesma arquitetura (proxy, streaming, tool loop, hooks `@kilocode/plugin`) com adaptações de config, OAuth e MCP.

Documentação de referência: [Kilo Plugins](https://kilo.ai/docs/automate/extending/plugins)

## O que faz

- Conecta modelos da assinatura Cursor ao Kilo via `cursor-agent` ou `@cursor/sdk` (API key)
- **OAuth PKCE** via `kilo auth login --provider cursor` (JWT → cursor-agent; API key `sk-...` → SDK)
- **Mapeia tools nativas**: `glob`, `read`, `websearch`, `bash`, etc. → tools do Kilo
- **Ponte MCP em dois caminhos** (ver abaixo)
- Hooks: `tool`, `auth`, `chat.params`, `experimental.chat.system.transform`

## Pré-requisitos

- [Kilo Code](https://kilo.ai) CLI ≥ 7.0 ou extensão VS Code
- Assinatura Cursor + autenticação

```bash
curl -fsS https://cursor.com/install | bash
kilo auth login --provider cursor
# ou: cursor-agent login  /  CURSOR_API_KEY=sk-...
```

## Instalação

### Opção 1 — comando oficial do Kilo (recomendado)

```bash
kilo plugin kilo-cursor-plugin --global
kilo-cursor install --skip-models
kilo-cursor sync-models
```

### Opção 2 — CLI deste pacote

```bash
npm install -g kilo-cursor-plugin
kilo-cursor install
kilo-cursor sync-models
```

### Opção 3 — desenvolvimento local

```bash
bun install && bun run build
kilo-cursor install
# ou symlink em local-kilo/.kilo/kilo.jsonc → dist/plugin-entry.js
```

### Config resultante (~/.config/kilo/kilo.jsonc)

```jsonc
{
  "$schema": "https://app.kilo.ai/config.json",
  "plugin": ["kilo-cursor-plugin"],
  "provider": {
    "cursor": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Cursor",
      "options": {
        "baseURL": "http://127.0.0.1:32124/v1"
      },
      "models": { /* sync via kilo-cursor sync-models */ }
    }
  }
}
```

> **IDs:** `"kilo-cursor-plugin"` no array `plugin` carrega o plugin; `"cursor"` em `provider` registra o model provider (provider ID interno: `cursor`).

## Uso

```bash
kilo run "Resuma este repo" --model cursor/auto
kilo auth login --provider cursor
```

Selecione `cursor/*` no picker de modelos (variantes com `reasoning.effort` quando disponíveis).

## Ponte de tools (nativas)

```
cursor-agent ──glob/read/bash──► proxy (intercept) ──► Kilo executa nativamente
```

Modo padrão: `CURSOR_KILO_TOOL_LOOP_MODE=opencode` — o Kilo possui a lista de tools; o plugin só traduz `stream-json` → OpenAI `tool_calls`.

## Ponte MCP

Dois mecanismos complementares:

### 1. Passthrough (sempre ativo)

MCP cadastrado **no Kilo** (ex.: context7 no painel MCP) — o Kilo executa; o plugin só mapeia nomes:

| Kilo (execução) | cursor-agent (prompt) |
|----------------|------------------------|
| `context7_resolve-library-id` | `mcp__context7__resolve_library_id` |

- Tools nativas do Kilo são mescladas em `chat.params` via `client.mcp.tool.list()`
- Aliases `mcp__*` são injetados no prompt
- `GetMcpTools` / `CallMcpTool` nativos do cursor-agent são bloqueados/redirecionados
- Com passthrough ativo, grava `.cursor/cli.json` com `deny: ["Mcp(*:*)"]` para o cursor-agent não tentar MCP próprio

### 2. Direct MCP (default ON)

Conecta servidores declarados em `kilo.jsonc` → `mcp` via stdio e registra hooks no plugin:

```jsonc
{
  "mcp": {
    "my-server": {
      "type": "local",
      "command": ["npx", "-y", "my-mcp-server"]
    }
  }
}
```

Desabilitar: `CURSOR_KILO_DIRECT_MCP=false` (ou legado `CURSOR_KILO_MCP_BRIDGE=false`).

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `CURSOR_KILO_TOOL_LOOP_MODE` | `opencode` | `opencode` \| `proxy-exec` \| `off` |
| `CURSOR_KILO_DIRECT_MCP` | `true` | Bridge stdio a partir de `kilo.jsonc` |
| `CURSOR_KILO_MCP_BRIDGE` | — | Legado; alias de `CURSOR_KILO_DIRECT_MCP` |
| `CURSOR_KILO_BACKEND` | `auto` | `auto` \| `cursor-agent` \| `sdk` |
| `CURSOR_KILO_BRIDGE_JSON` | `true` | Bridge JSON para tool `write` |
| `CURSOR_KILO_PROVIDER_BOUNDARY` | `v1` | Boundary de interceptação de tools |
| `KILO_PURE=1` | — | Desabilita plugins externos (doc Kilo) |

Prefixo legado `CURSOR_ACP_*` ainda é lido em vários pontos.

## Comandos

```bash
kilo-cursor install       # provider cursor + plugin
kilo-cursor sync-models   # modelos autenticados (OAuth/API key do Kilo)
kilo-cursor status
kilo-cursor doctor
mcptool tools             # debug MCP direct bridge
kilo-cursor uninstall
```

## Documentação adicional

| Arquivo | Conteúdo |
|---|---|
| [docs/architecture/runtime-tool-loop.md](docs/architecture/runtime-tool-loop.md) | Tool loop, boundary, bridge JSON |
| [docs/cursor-agent-tools.md](docs/cursor-agent-tools.md) | Inventário de tools cursor-agent |
| [docs/architecture/cursor-acp-mcp-future.md](docs/architecture/cursor-acp-mcp-future.md) | Roadmap ACP/MCP (referência) |

Docs em `docs/architecture/*` com prefixo `opencode` / `cursor-acp` descrevem o fork upstream ou decisões históricas — o runtime Kilo usa `CURSOR_KILO_*` e provider ID `cursor`.

## Desenvolvimento

```bash
bun install
bun run build
bun test
kilo --print-logs --log-level DEBUG
```

## Licença

BSD-3-Clause
