# LM Studio + Node (Template-First) Integration Plan

## Objective
Use LM Studio as a local content generator and Node.js as a deterministic DOCX renderer.

## Architecture
1. LM Studio prompt -> generate JSON that matches the template schema.
2. Node script `src/generate-from-template.js` validates JSON and renders `.docx`.
3. Output file is saved to `output/` and returned to caller.

## Why This Works Better Than Model-Written JS
1. No runtime execution of arbitrary model code.
2. Stable rendering pipeline with strict placeholders.
3. Easy testing and predictable failures (missing fields, bad arrays).

## MCP Tool Design (Minimal)
1. `create_docx_from_template`
2. Inputs:
   - `templatePath`
   - `dataJsonPath` or inline `data`
   - `outputPath`
3. Returns:
   - `success`
   - `outputPath`
   - `error` (if failed)

## Recommended Prompt Pattern For LM Studio
Ask the model to return only valid JSON with required keys:
- `full_name`
- `role_title`
- `email`
- `phone`
- `summary`
- `skills` (array of strings)

## Rollout Steps
1. Create template (`npm run template:create`).
2. Generate output from sample JSON (`npm run generate:template`).
3. Hook LM Studio output JSON into `--data`.
4. Wrap script as MCP tool for one-command generation from your local model workflow.
