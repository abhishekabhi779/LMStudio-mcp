# DOCX Template MCP (Weekend Build)

Build reliable `.docx` files from local AI output without executing unsafe AI-generated code.

## Problem
Local models are great at writing content, but unreliable at writing executable code that always runs cleanly.  
When you ask a model to generate code and compile it on the fly, failures are common:

- runtime errors
- missing imports
- invalid syntax
- inconsistent output structure

## Solution
This project uses a **template-first pipeline**:

1. Model generates structured data (JSON), not runnable code.
2. Node.js validates that data.
3. A `.docx` template is filled with the validated data.
4. Result is written to disk as a deterministic output file.

This gives you repeatable output and clear failure points.

## What You Get
- Local Node.js DOCX generation
- MCP server tools for LM Studio
- Health check tool to verify live MCP connectivity
- Prompt-to-DOCX one-call flow (`create_docx_from_lm_prompt`)

## Project Structure
```text
docx-node-project/
  data/
    resume-data.example.json
  docs/
    LMSTUDIO_CONNECT.md
    LMSTUDIO_MCP_TEMPLATE_PLAN.md
    PROJECT_PLAN.md
  output/
    .gitkeep
  scripts/
    debug-list-tools.mjs
    generate-test-docx.js
  src/
    create-template.js
    generate-from-template.js
    mcp-server.mjs
    template-renderer.js
  templates/
    .gitkeep
  mcp.lmstudio.example.json
  package.json
```

## Quick Start
1. Install dependencies:
```bash
npm install
```

2. Create template + generate sample output:
```bash
npm run template:smoke
```

3. Start MCP server:
```bash
npm run mcp:server
```

4. Verify tool registration:
```bash
npm run mcp:debug-tools
```

## MCP Tools
1. `ping_docx_server`  
Use first. Confirms server version, status, and active tools.

2. `create_docx_from_template`  
Generate DOCX from either inline JSON or a JSON file.

3. `create_docx_from_lm_prompt`  
Takes plain-English prompt, uses MCP sampling to produce schema-valid JSON, then generates DOCX.

4. `validate_resume_template_data`  
Validates JSON before generation.

## LM Studio Integration
Use [docs/LMSTUDIO_CONNECT.md](docs/LMSTUDIO_CONNECT.md) for full setup.

Use this order in LM Studio:
1. Call `ping_docx_server`
2. Call `create_docx_from_lm_prompt`

If you get `MCP error -32601 Method not found`, you are usually hitting a stale MCP process or old server id.  
Fix by restarting LM Studio and cache-busting the server id (`docx-template-local-v2`, etc.).

## Why This Design Works
- No dynamic execution of AI-written JavaScript
- Controlled schema = predictable document structure
- Easy to debug:
  - prompt issue -> bad JSON
  - schema issue -> validation failure
  - template issue -> render failure

## Next Improvements
1. Add cover-letter template and tools
2. Add schema versioning (`resume_v1`, `resume_v2`)
3. Add tests for all tool pathways
4. Add CI checks for docs and scripts
