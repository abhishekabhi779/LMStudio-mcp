# Building LM Studio Tools That Actually Work

This repo is my playground for building MCP tools for LM Studio so local models can give more reliable, usable output.

The idea is simple: local models are good at generating text, but they are not always good at producing clean, executable output on their own. So instead of trusting the model to do everything, I give it a tool with guardrails. The model handles the intent, and the tool handles the real work.

Right now, the main example in this repo is a DOCX generation tool. But the bigger point of the repo is not "how to make a Word file." It is "how to build LM Studio tools that turn messy model output into something dependable."

## What This Repo Is

This repo shows a pattern I like using with LM Studio:

1. Give the model a narrow, useful tool.
2. Validate the input before doing anything important.
3. Add fallback behavior when the model or MCP flow is flaky.
4. Return deterministic output instead of hoping the model improvises correctly.

That pattern is reusable for way more than documents:

- job search helpers
- resume tailoring
- local automation
- structured content generation
- file transforms
- internal workflow tools

## What Is In Here Right Now

The current working example is a template-first DOCX tool built with:

- `Node.js`
- `@modelcontextprotocol/sdk`
- `docxtemplater`
- `pizzip`
- `LM Studio`

The tool flow looks like this:

1. LM Studio calls an MCP tool.
2. The tool receives either prompt text or structured JSON.
3. The server validates and reshapes the data.
4. A DOCX template gets filled.
5. A file is saved locally.

## Why I Built It This Way

I did not want the local model to generate random JavaScript and hope it runs.

That breaks too often:

- bad syntax
- missing imports
- wrong file paths
- unpredictable structure
- tool calls that half-work and then fail

So the fix was to stop treating the model like a compiler.

Instead:

- the model suggests content
- the MCP tool enforces structure
- Node does the execution
- the output becomes predictable

That one shift makes local models much more useful.

## MCP Tools In This Repo

The current server exposes these tools:

- `ping_docx_server`
- `create_docx_from_template`
- `create_docx_from_lm_prompt`
- `validate_resume_template_data`

`ping_docx_server` is there because this stuff gets annoying fast when LM Studio is using a stale MCP process. A simple health check saves time.

`create_docx_from_lm_prompt` is the fun one. It tries to use MCP sampling first, but if LM Studio does not support that path cleanly, it falls back to a local parser so the workflow still finishes.

That fallback behavior is a big part of the point of this repo: tools should still be useful when the model environment is imperfect.

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
  scripts/
    debug-list-tools.mjs
    generate-test-docx.js
  src/
    create-template.js
    generate-from-template.js
    mcp-server.mjs
    template-renderer.js
  templates/
  mcp.lmstudio.example.json
  package.json
```

## How To Run It

Install dependencies:

```bash
npm install
```

Create the sample template and output:

```bash
npm run template:smoke
```

Start the MCP server:

```bash
npm run mcp:server
```

Verify that LM Studio can see the tools:

```bash
npm run mcp:debug-tools
```

For the LM Studio setup itself, check [docs/LMSTUDIO_CONNECT.md](docs/LMSTUDIO_CONNECT.md).

## What I Want This Repo To Become

I want this repo to grow into a collection of small, practical LM Studio tools that solve real local-model problems.

Examples:

- turn prompts into validated structured output
- wrap brittle model behavior with safer automation
- build tools that can recover when MCP sampling fails
- make local models useful for actual workflows, not just demos

So even though the first example is DOCX generation, the real topic of this repo is:

**how to build LM Studio tools that make local models behave better**

## If You Want To Reuse This Pattern

The reusable recipe is:

1. Keep the model focused on intent, not execution.
2. Put validation in the tool, not in the prompt.
3. Prefer structured input over free-form output.
4. Add a fallback path for common LM Studio / MCP failures.
5. Return something concrete: a file, a JSON object, a decision, a result.

That is the pattern I will keep using in this repo.
