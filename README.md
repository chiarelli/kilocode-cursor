# kilo-cursor-plugin

Ponte transparente entre **Kilo Code** e **cursor-agent**, baseada no [opencode-cursor](https://github.com/Nomadcxx/opencode-cursor).

Kilo é um fork do OpenCode — este plugin reutiliza a mesma arquitetura (proxy, streaming, tool loop, hooks `@kilocode/plugin`) com adaptações mínimas de config e MCP.

Documentação de referência: [Kilo Plugins](https://kilo.ai/docs/automate/extending/plugins)

## O que faz

- Conecta modelos da assinatura Cursor ao Kilo via `cursor-agent`
- **Mapeia tools transparentemente**: `glob`, `read`, `websearch`, `bash`, etc. → tools nativas do Kilo
- **Ponte MCP** nos dois formatos:
  - Kilo: `{server}_{tool}` (ex: `filesystem_read_file`)
  - cursor-agent: `mcp__{server}__{tool}` (ex: `mcp__filesystem__read_file`)
- Hooks usados: `tool`, `chat.params`, `chat.headers`, `provider`, `event`

## Pré-requisitos

- [Kilo Code](https://kilo.ai) CLI ≥ 7.0 ou extensão VS Code
- Assinatura Cursor + `cursor-agent` autenticado

```bash
curl -fsS https://cursor.com/install | bash
cursor-agent login
```

## Instalação

### Opção 1 — comando oficial do Kilo (recomendado)

```bash
kilo plugin kilo-cursor-plugin --global
kilo-cursor install --skip-models   # adiciona provider cursor-kilo + modelos
```

O Kilo instala o pacote npm automaticamente (cache em `~/.cache/opencode/packages/`) e adiciona `"kilo-cursor-plugin"` ao array `plugin` do config.

### Opção 2 — CLI deste pacote

```bash
npm install -g kilo-cursor-plugin
kilo-cursor install
```

### Opção 3 — desenvolvimento local

Symlink em `~/.config/kilo/plugin/` (mesmo padrão de plugins locais):

```bash
bun install && bun run build
kilo-cursor install
```

### Config resultante (~/.config/kilo/kilo.jsonc)

```jsonc
{
  "$schema": "https://app.kilo.ai/config.json",
  "plugin": ["kilo-cursor-plugin"],
  "provider": {
    "cursor-kilo": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Cursor",
      "options": {
        "baseURL": "http://127.0.0.1:32124/v1"
      },
      "models": { /* sync automático via cursor-agent */ }
    }
  }
}
```

> **Nota:** `"kilo-cursor-plugin"` no array `plugin` carrega o plugin; `"cursor-kilo"` em `provider` registra o model provider. São IDs distintos, conforme a [doc de plugins](https://kilo.ai/docs/automate/extending/plugins#providers--auth).

## Uso

```bash
kilo run "Resuma este repo" --model cursor-kilo/auto
```

Ou selecione `cursor-kilo/*` no picker de modelos.

## Ponte de tools

```
cursor-agent ──glob──► plugin (chat.params intercept) ──► Kilo SDK tool.invoke("glob")
cursor-agent ──mcp__x__y──► plugin ──► Kilo MCP / tool nativa
cursor-agent ──server_tool──► plugin ──► Kilo MCP (formato nativo)
```

Execução em ordem de preferência:

1. **SDK Kilo** — `client.tool.invoke`, respeita permissões do Kilo
2. **Registry local** — fallback (read, write, bash…)
3. **MCP bridge** — servidores do `kilo.jsonc` → expostos ao agent

## MCP no kilo.jsonc

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

Desabilitar ponte: `CURSOR_KILO_MCP_BRIDGE=false`

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `CURSOR_KILO_TOOL_LOOP_MODE` | `opencode` | Modo tool loop (mesmo nome do fork) |
| `CURSOR_KILO_MCP_BRIDGE` | `true` | Ponte MCP |
| `KILO_PURE=1` | — | Desabilita todos plugins externos (doc Kilo) |

`CURSOR_ACP_*` legado também funciona.

## Comandos

```bash
kilo-cursor install       # provider + symlink opcional
kilo-cursor sync-models   # atualiza modelos do cursor-agent
kilo-cursor status
kilo-cursor doctor
kilo-cursor uninstall
```

## Estrutura do plugin (conforme doc Kilo)

```ts
// exports["./server"] em package.json
export default {
  id: "kilo-cursor-plugin",
  server: async (ctx) => ({ tool, "chat.params", ... }),
  setup: createV2Setup(),  // API V2
}
```

## Desenvolvimento

```bash
bun install
bun run build
bun test
kilo --print-logs --log-level DEBUG   # troubleshooting (doc Kilo)
```

## Licença

BSD-3-Clause
