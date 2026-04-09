# Connect This MCP Server To LM Studio

## 1) Ensure the project is ready
Run once from the project root:

```bash
npm.cmd run template:create
```

This creates:

- `templates/resume-template.docx`

## 2) Add this server in LM Studio
In LM Studio:

1. Open the right sidebar `Program`
2. Click `Install`
3. Click `Edit mcp.json`
4. Add this block inside `mcpServers`:

```json
{
  "mcpServers": {
    "docx-template-local": {
      "command": "node",
      "args": [
        "C:/Users/abhis/OneDrive/Documents/Playground/docx-node-project/src/mcp-server.mjs"
      ]
    }
  }
}
```

5. Save and enable/toggle the server in LM Studio.

## 3) Use the tools in chat
The server exposes:

- `ping_docx_server`
- `create_docx_from_template`
- `create_docx_from_lm_prompt`
- `validate_resume_template_data`

`create_docx_from_lm_prompt` behavior:
- Preferred path: uses MCP sampling to convert prompt text to JSON.
- Fallback path: if sampling is unavailable (for example `-32601 Method not found`), it uses a local parser and still generates DOCX.
- If `template_path` is not a valid `.docx` file path (for example `mcp/docx-template-local-v2`), the server ignores it and uses the default template.

Example tool arguments (inline data):

```json
{
  "data": {
    "full_name": "Abhishek Sattu",
    "role_title": "AI Product Specialist",
    "email": "abhishek@example.com",
    "phone": "+1-555-0100",
    "summary": "Template-first DOCX generation using local models and MCP.",
    "skills": ["Node.js", "LM Studio", "MCP", "DOCX"]
  },
  "output_path": "output/resume-from-lmstudio.docx"
}
```

Health-check call (no args):

```json
{}
```

Example tool arguments (JSON file input):

```json
{
  "data_json_path": "data/resume-data.example.json",
  "output_path": "output/resume-from-json-file.docx"
}
```

Example tool arguments (prompt -> JSON -> DOCX in one call):

```json
{
  "prompt_text": "Create a resume for Abhishek Sattu, AI Product Specialist, email abhishek@example.com, phone +1-555-0100. Summary: builds AI automation systems and local MCP workflows. Skills: Node.js, MCP, LM Studio, Prompt Engineering, Product Ops.",
  "output_path": "output/resume-from-lm-prompt.docx"
}
```

## 4) If you call MCP via LM Studio API
In LM Studio `Server Settings`:

1. Turn on `Require Authentication`
2. Turn on `Allow calling servers from mcp.json`

Then use integration id:

- `mcp/docx-template-local`

## Troubleshooting `MCP error -32601: Method not found`
This almost always means LM Studio is not calling the updated server instance.

1. In LM Studio, disable `docx-template-local`, save, then re-enable it.
2. Fully restart LM Studio after editing `mcp.json`.
3. Confirm the `args` path points to:
   - `C:/Users/abhis/OneDrive/Documents/Playground/docx-node-project/src/mcp-server.mjs`
4. Verify server tool registration locally:

```bash
npm.cmd run mcp:debug-tools
```

Expected output includes:

- `ping_docx_server`
- `create_docx_from_template`
- `create_docx_from_lm_prompt`
- `validate_resume_template_data`

If `create_docx_from_lm_prompt` does not appear, LM Studio cannot call it yet.
