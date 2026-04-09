# Node.js DOCX Project Plan

## Goal
Create `.docx` files from Node.js with a clean structure that can grow into templates, dynamic sections, and production-ready export flows.

## Phase 1 - Foundation (Current)
1. Initialize Node project and install `docx`.
2. Add a smoke-test generator script.
3. Verify a `.docx` file is created in a predictable output path.

## Phase 2 - Core Generation Layer
1. Create a `src/` module to build documents from structured JSON input.
2. Extract reusable blocks (heading, paragraph, bullet list, table).
3. Add configurable styles (font, spacing, alignment, page margins).

## Phase 3 - Templates and Data Mapping
1. Define template schemas for common documents (resume, cover letter, report).
2. Add data validation before generation.
3. Support optional sections and conditional rendering.
4. Use LM Studio to output JSON only; Node fills templates from JSON.

## Phase 4 - Quality and Delivery
1. Add automated tests for content presence and file creation.
2. Add linting/formatting and CI checks.
3. Add a simple CLI (`node src/cli.js --input data.json --output out.docx`).
4. Add MCP server tools so LM Studio can generate DOCX directly.

## Immediate Next Step
Run:

```bash
npm run mcp:server
```

Expected output:

MCP server starts on stdio and exposes `create_docx_from_template`.
