# Universal MCP Tools for Local Models

This repo builds **MCP tools for LM Studio / local models** so they get frontier-like capabilities: file operations, shell commands, web fetch, code execution, git, and document generation — all sandboxed and validated.

The idea is simple: local models are good at reasoning, but bad at execution. Instead of trusting the model to do everything, give it focused tools with guardrails. The model handles **intent**, the tool handles **deterministic execution**.

---

## What This Repo Is

A growing collection of practical MCP tools that turn messy model output into dependable results:

1. **Give the model a narrow, useful tool**
2. **Validate input before doing anything important**
3. **Add fallback behavior when the model or MCP flow is flaky**
4. **Return structured output instead of hoping the model improvises correctly**

This pattern applies to way more than documents:
- Lead sourcing & business intelligence pipelines
- CRM integration & automation
- Local file transforms & data processing
- Structured content generation
- Internal workflow tools

---

## The Universal Tool Server (`mcp-server-improved.mjs`)

**9 tools** giving local models (Qwen3.5-9B, Gemma, etc.) frontier-like capabilities:

| Tool | Description |
|------|-------------|
| `read_file` | Read any file in sandbox |
| `write_file` | Create/edit files in sandbox |
| `list_files` | Browse directory structure |
| `delete_file` | Clean up files |
| `shell` | Run allowlisted commands (ls, git, npm, python, curl, jq, etc.) |
| `web_fetch` | HTTP GET/POST to any URL |
| `code_exec` | Execute Python / JavaScript / TypeScript in isolated env |
| `git` | Full git operations (status, diff, log, add, commit, push, pull, branch, checkout) |
| `generate_docx` | Template-first DOCX generation (your existing resume tool, preserved) |

**Safety built-in:**
- Sandboxed execution (all ops under `sandbox/`)
- Path traversal protection
- Command allowlist
- Timeouts (30s default)
- Output truncation (50KB)

---

## Quick Start

```bash
npm install
npm run mcp:server
node scripts/debug-improved.mjs
node scripts/test-tools.mjs
```

### LM Studio Setup

```json
{
  "mcpServers": {
    "universal-local-tools": {
      "command": "node",
      "args": ["src/mcp-server-improved.mjs"]
    }
  }
}
```

See [`docs/LMSTUDIO_CONNECT.md`](docs/LMSTUDIO_CONNECT.md) for full LM Studio integration guide.

---

## Example Workflows

### "Research a company, create a profile, save to git"

1. Model calls `web_fetch` → gets company page
2. Model calls `code_exec` (Python) → extracts key info, structures as JSON
3. Model calls `write_file` → saves profile to `sandbox/files/company-profile.json`
4. Model calls `git` → commits to `sandbox/git/profiles`

### "Build a lead scraper and run it"

1. Model calls `write_file` → saves Python scraper to `sandbox/files/leads/scraper.py`
2. Model calls `code_exec` → runs scraper, outputs CSV to `sandbox/files/leads/results.csv`
3. Model calls `read_file` → verifies output
4. Model calls `shell` → `ls -la` to confirm

### "Generate resume, push to GitHub"

1. Model calls `generate_docx` → creates `sandbox/output/resume.docx`
2. Model calls `git` → adds, commits, pushes

---

## Why This Approach Works

I didn't want the local model to generate random JavaScript and hope it runs.

**That breaks:**
- Bad syntax / missing imports
- Wrong file paths
- Unpredictable structure
- Tool calls that half-work and then fail

**The fix: stop treating the model like a compiler.**
- Model → suggests content + intent
- MCP tool → validates, enforces structure, executes deterministically
- Output → predictable, safe, usable

---

## What's Next (Planned Tools)

- **Firecrawl web search** — Structured search + extract
- **Salesforce REST API** — CRM read/write for automation
- **Tableau API** — Dashboard publishing / data source refresh
- **n8n workflow trigger** — Orchestrate multi-step automations
- **Vector DB (pgvector/FAISS)** — Semantic search for RAG
- **LLM evaluation harness** — RAGAS/TruLens-style pipelines

---

## Legacy: Original Resume-Only Server

The original `mcp-server.mjs` with 4 DOCX-specific tools is preserved in `src/mcp-server.mjs` and still works via:

```bash
node src/mcp-server.mjs
npm run mcp:debug-tools
```

See [`MIGRATION_GUIDE.md`](MIGRATION_GUIDE.md) for upgrade details.

---

## Target Models

- **Qwen 3.5** (9B, 14B, 32B)
- **Gemma E4B / 2B / 7B / 9B**
- **Claude Distilled** (Qwen/Claude distills)
- Any model supporting MCP via LM Studio / Ollama

---

## License

ISC — Use freely, improve wildly.