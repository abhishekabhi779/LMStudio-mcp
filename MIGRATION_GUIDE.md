# LMStudio-mcp → Universal Local Tools Migration Guide

## The Problem You Solved
Local models (via LM Studio, Ollama, etc.) are great at **reasoning** but bad at **execution**:
- No sandboxed file system access
- No shell command execution
- No web search/fetch
- No code execution
- No git operations

Your original `LMStudio-mcp` gave them **one** tool: DOCX generation from templates.  
This improved version gives them a **complete toolbox** while keeping your template-first philosophy.

---

## Architecture: Intent → Validation → Deterministic Execution

```
Local Model (LM Studio)                    MCP Server (This Repo)
┌─────────────────────────┐                ┌─────────────────────────┐
│  "Create a Python       │  MCP Tool Call │  1. Validate input      │
│  script that fetches    │ ───────────►   │  2. Sandbox path        │
│  GitHub stars and       │                │  3. Execute in          │
│  saves to CSV"          │                │     isolated env        │
└─────────────────────────┘                │  4. Return structured   │
       ▲                                    │     result              │
       │                                    └─────────────────────────┘
       │  Structured JSON result
       └─────────────────────────────────────
```

**Key principle:** The model provides *intent + parameters*. The tool handles *execution, validation, safety, fallbacks*.

---

## New Tools Available

| Tool | Purpose | Safety |
|------|---------|--------|
| `read_file` | Read any file in sandbox | Path traversal blocked |
| `write_file` | Write file to sandbox | Path traversal blocked |
| `list_files` | List directory contents | Sandbox-only |
| `delete_file` | Delete file/dir | Sandbox-only, confirm |
| `shell` | Run allowlisted commands | Command allowlist + timeout |
| `web_fetch` | HTTP GET/POST | Timeout, no auth leakage |
| `code_exec` | Python/JS/TS execution | Isolated dir, package install |
| `git` | Git operations | Sandbox repo only |
| `generate_docx` | Your existing DOCX tool | Enhanced with sandbox paths |

---

## Quick Start

### 1. Install dependencies
```bash
cd /path/to/LMStudio-mcp
cp package.json.improved package.json
npm install
```

### 2. Add zod-to-json-schema
```bash
npm install zod-to-json-schema
```

### 3. Start the server
```bash
npm run mcp:server
```

### 4. Configure LM Studio
Update `mcp.lmstudio.example.json`:
```json
{
  "mcpServers": {
    "universal-local-tools": {
      "command": "node",
      "args": ["C:/path/to/LMStudio-mcp/scripts/mcp-server-improved.mjs"]
    }
  }
}
```

---

## Sandbox Model

All file operations are restricted to:
```
<project-root>/sandbox/
├── files/          # read_file, write_file, list_files, delete_file
├── code_exec/      # code_exec working directory
├── git/            # git operations
└── output/         # generate_docx outputs
```

**No access outside this tree** — prevents local models from touching your real files.

---

## Allowlist Configuration (shell tool)

Default allowed commands:
```bash
ls, cat, head, tail, grep, find, wc, echo,
mkdir, rm, cp, mv, touch, chmod, chown,
git, npm, npx, node, python, python3, pip,
curl, wget, jq, sed, awk, sort, uniq
```

Extend per-call via `allowed_commands` parameter.

---

## Example Workflows

### "Create a lead scraper and save results"
1. Model calls `shell` → `mkdir -p sandbox/files/leads`
2. Model calls `write_file` → saves Python scraper to `sandbox/files/leads/scraper.py`
3. Model calls `code_exec` → runs scraper, outputs CSV to `sandbox/files/leads/results.csv`
4. Model calls `read_file` → reads CSV to verify
4. Model calls `git` → commits to `sandbox/git/leads-repo`

### "Generate resume then push to GitHub"
1. Model calls `generate_docx` → creates `sandbox/output/resume.docx`
2. Model calls `shell` → `cd sandbox/git && git add resume.docx && git commit -m "Update resume"`
3. Model calls `git` → `push origin main`

### "Research company then create profile"
1. Model calls `web_fetch` → gets company page
2. Model calls `code_exec` → Python extracting key info
3. Model calls `write_file` → saves JSON profile
4. Model calls `generate_docx` → creates formatted profile DOCX

---

## Migration Checklist

- [ ] Replace `mcp-server.mjs` with `mcp-server-improved.mjs` (or merge)
- [ ] Update `package.json` with new deps + scripts
- [ ] Run `npm install`
- [ ] Update LM Studio config to point to new entry point
- [ ] Test each tool: `npm run mcp:debug`
- [ ] Add your custom templates to `sandbox/templates/`

---

## Extending with Your Own Tools

Add to `TOOLS` array in `mcp-server-improved.mjs`:

```javascript
const MyToolSchema = z.object({
  input: z.string(),
  option: z.enum(["a", "b"]).default("a"),
});

TOOLS.push({
  name: "my_custom_tool",
  description: "What it does",
  schema: MyToolSchema,
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "my_custom_tool") {
    const result = await myCustomLogic(request.params.arguments);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
  // ... existing handlers
});
```

---

## Security Notes

1. **No credentials in tools** — Use environment variables, never pass API keys to model
2. **Sandbox is enforced** — All paths resolve under `SANDBOX_ROOT`
3. **Timeouts everywhere** — Prevents runaway processes
4. **Output truncation** — Prevents context overflow (50KB default)
5. **Command allowlist** — Shell tool only runs approved commands

---

## Your DOCX Tool Preserved

The `generate_docx` tool wraps your existing logic:
- Same `template-renderer.js` 
- Same `create-template.js`
- Now sandboxed output paths
- Works alongside all other tools

---

## Next Steps for You

1. **Test the server** — Run it, connect LM Studio
2. **Add domain-specific tools** — Lead sourcing, CRM sync, etc.
3. **Create tool combos** — "Research → Code → Doc → Git" as single prompts
4. **Share with team** — Other local-model users get same capabilities