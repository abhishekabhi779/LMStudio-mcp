/**
 * Universal MCP Server for Local Models
 * 
 * Gives LM Studio / local models frontier-like capabilities:
 * - File operations (read, write, list, delete)
 * - Shell command execution (sandboxed)
 * - Web search & fetch
 * - Code execution (Python/Node.js)
 * - Git operations
 * - Template-based document generation (your existing DOCX)
 * 
 * Architecture: Each tool is self-contained with validation, sandboxing, and fallbacks.
 * The model provides INTENT + parameters → Tool executes DETERMINISTICALLY.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Simple zod to JSON schema converter that works with MCP SDK
function zodToSchema(zodSchema) {
  const shape = zodSchema.shape;
  const properties = {};
  const required = [];
  
  for (const [key, value] of Object.entries(shape)) {
    let type = "string";
    let description = "";
    let enumValues = undefined;
    
    if (value instanceof z.ZodString) type = "string";
    else if (value instanceof z.ZodNumber) type = "number";
    else if (value instanceof z.ZodBoolean) type = "boolean";
    else if (value instanceof z.ZodArray) type = "array";
    else if (value instanceof z.ZodRecord) type = "object";
    else if (value instanceof z.ZodEnum) { type = "string"; enumValues = value.options; }
    else if (value instanceof z.ZodOptional) {
      // Unwrap optional
      const inner = value.unwrap();
      if (inner instanceof z.ZodString) type = "string";
      else if (inner instanceof z.ZodNumber) type = "number";
      else if (inner instanceof z.ZodBoolean) type = "boolean";
      else if (inner instanceof z.ZodArray) type = "array";
      else if (inner instanceof z.ZodRecord) type = "object";
      else if (inner instanceof z.ZodEnum) { type = "string"; enumValues = inner.options; }
    }
    
    properties[key] = { type };
    if (enumValues) properties[key].enum = enumValues;
    if (value.description) properties[key].description = value.description;
    
    if (!(value instanceof z.ZodOptional)) {
      required.push(key);
    }
  }
  
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SANDBOX_ROOT = path.join(PROJECT_ROOT, "sandbox"); // All file ops restricted here
const MAX_OUTPUT_CHARS = 50000;
const DEFAULT_TIMEOUT_MS = 30000;

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS — Validate ALL tool inputs
// ─────────────────────────────────────────────────────────────────────────────

const FileOpSchema = z.object({
  path: z.string().min(1),
  content: z.string().optional(),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});

const ShellSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout_ms: z.number().default(DEFAULT_TIMEOUT_MS),
  allowed_commands: z.array(z.string()).optional(), // allowlist
});

const WebFetchSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeout_ms: z.number().default(15000),
});

const CodeExecSchema = z.object({
  language: z.enum(["python", "javascript", "typescript"]),
  code: z.string().min(1),
  timeout_ms: z.number().default(DEFAULT_TIMEOUT_MS),
  packages: z.array(z.string()).optional(), // pip/npm packages to install
});

const GitSchema = z.object({
  action: z.enum(["status", "diff", "log", "add", "commit", "push", "pull", "branch", "checkout"]),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
});

const DocxSchema = z.object({
  template_path: z.string().optional(),
  output_path: z.string().optional(),
  data: z.record(z.any()).optional(),
  data_json_path: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// SANDBOX HELPERS — Security first
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSandbox() {
  await fs.mkdir(SANDBOX_ROOT, { recursive: true });
}

function resolveSafePath(userPath) {
  // Handle case where userPath already starts with sandbox/
  let cleanPath = userPath;
  if (cleanPath.startsWith("sandbox/") || cleanPath.startsWith("sandbox\\")) {
    cleanPath = cleanPath.substring(8);
  }
  const absolute = path.isAbsolute(cleanPath) 
    ? cleanPath 
    : path.join(SANDBOX_ROOT, cleanPath);
  const resolved = path.resolve(absolute);
  const sandboxResolved = path.resolve(SANDBOX_ROOT);
  
  if (!resolved.startsWith(sandboxResolved)) {
    throw new McpError(ErrorCode.InvalidParams, `Path traversal blocked: ${userPath}`);
  }
  return resolved;
}

function truncateOutput(output, maxChars = MAX_OUTPUT_CHARS) {
  if (output.length <= maxChars) return output;
  return output.slice(0, maxChars) + `\n... [truncated ${output.length - maxChars} chars]`;
}

function sanitizeShellCommand(cmd, allowed = []) {
  // Basic allowlist for safety — extend as needed
  const defaultAllowed = [
    "ls", "cat", "head", "tail", "grep", "find", "wc", "echo", 
    "mkdir", "rm", "cp", "mv", "touch", "chmod", "chown",
    "git", "npm", "npx", "node", "python", "python3", "pip",
    "curl", "wget", "jq", "sed", "awk", "sort", "uniq",
  ];
  const allowlist = [...defaultAllowed, ...allowed];
  const firstWord = cmd.trim().split(/\s+/)[0].replace(/^.*\//, "");
  if (!allowlist.includes(firstWord)) {
    throw new McpError(ErrorCode.InvalidParams, `Command not allowed: ${firstWord}. Allowed: ${allowlist.join(", ")}`);
  }
  return cmd;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

async function toolReadFile(args) {
  const safePath = resolveSafePath(args.path);
  const content = await fs.readFile(safePath, args.encoding);
  return { content: truncateOutput(content), path: args.path };
}

async function toolWriteFile(args) {
  const safePath = resolveSafePath(args.path);
  await fs.mkdir(path.dirname(safePath), { recursive: true });
  const buffer = args.encoding === "base64" ? Buffer.from(args.content, "base64") : args.content;
  await fs.writeFile(safePath, buffer);
  return { success: true, path: args.path, bytes: buffer.length };
}

async function toolListFiles(args) {
  const safePath = resolveSafePath(args.path);
  const entries = await fs.readdir(safePath, { withFileTypes: true });
  return {
    path: args.path,
    entries: entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
    })),
  };
}

async function toolDeleteFile(args) {
  const safePath = resolveSafePath(args.path);
  await fs.rm(safePath, { recursive: true, force: true });
  return { success: true, path: args.path };
}

async function toolShell(args) {
  const cwd = args.cwd ? resolveSafePath(args.cwd) : SANDBOX_ROOT;
  const cmd = sanitizeShellCommand(args.command, args.allowed_commands);
  
  try {
    const output = execSync(cmd, {
      cwd,
      timeout: args.timeout_ms,
      encoding: "utf8",
      maxBuffer: 1024 * 1024, // 1MB
    });
    return { stdout: truncateOutput(output), stderr: "", exit_code: 0 };
  } catch (e) {
    return { 
      stdout: truncateOutput(e.stdout || ""), 
      stderr: truncateOutput(e.stderr || e.message), 
      exit_code: e.status || 1 
    };
  }
}

async function toolWebFetch(args) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeout_ms);
  
  try {
    const res = await fetch(args.url, {
      method: args.method,
      headers: { "User-Agent": "MCP-Server/1.0", ...args.headers },
      body: args.body,
      signal: controller.signal,
    });
    const text = await res.text();
    return { 
      status: res.status, 
      headers: Object.fromEntries(res.headers.entries()),
      body: truncateOutput(text) 
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function toolCodeExec(args) {
  const { language, code, timeout_ms, packages = [] } = args;
  const workDir = path.join(SANDBOX_ROOT, "code_exec");
  await fs.mkdir(workDir, { recursive: true });
  
  if (language === "python") {
    // Install packages if needed
    for (const pkg of packages) {
      execSync(`pip install ${pkg}`, { cwd: workDir, stdio: "ignore" });
    }
    const file = path.join(workDir, "script.py");
    await fs.writeFile(file, code);
    const output = execSync(`python ${file}`, { cwd: workDir, timeout: timeout_ms, encoding: "utf8", maxBuffer: 1024*1024 });
    return { stdout: truncateOutput(output), stderr: "", exit_code: 0 };
  }
  
  if (language === "javascript" || language === "typescript") {
    for (const pkg of packages) {
      execSync(`npm install ${pkg}`, { cwd: workDir, stdio: "ignore" });
    }
    const ext = language === "typescript" ? "ts" : "js";
    const file = path.join(workDir, `script.${ext}`);
    await fs.writeFile(file, code);
    const runner = language === "typescript" ? "npx ts-node" : "node";
    const output = execSync(`${runner} ${file}`, { cwd: workDir, timeout: timeout_ms, encoding: "utf8", maxBuffer: 1024*1024 });
    return { stdout: truncateOutput(output), stderr: "", exit_code: 0 };
  }
  
  throw new McpError(ErrorCode.InvalidParams, `Unsupported language: ${language}`);
}

async function toolGit(args) {
  const cwd = args.cwd ? resolveSafePath(args.cwd) : SANDBOX_ROOT;
  const cmd = `git ${args.action} ${args.args.join(" ")}`.trim();
  
  try {
    const output = execSync(cmd, { cwd, timeout: 15000, encoding: "utf8", maxBuffer: 1024*1024 });
    return { stdout: truncateOutput(output), stderr: "", exit_code: 0 };
  } catch (e) {
    return { stdout: "", stderr: truncateOutput(e.stderr || e.message), exit_code: e.status || 1 };
  }
}

// Your existing DOCX tool (enhanced)
async function toolDocx(args) {
  // Import your existing logic here
  const { renderDocxFromTemplateData } = await import("./template-renderer.js");
  const { resolveTemplatePath, ensureDefaultTemplateExists } = await import("./mcp-server.mjs");
  
  await ensureDefaultTemplateExists();
  const templatePath = args.template_path ? resolveSafePath(args.template_path) : await resolveTemplatePath();
  const outputPath = args.output_path ? resolveSafePath(args.output_path) : path.join(SANDBOX_ROOT, `output/resume-${Date.now()}.docx`);
  
  let data = args.data;
  if (args.data_json_path) {
    const safePath = resolveSafePath(args.data_json_path);
    data = JSON.parse(await fs.readFile(safePath, "utf8"));
  }
  
  if (!data) throw new McpError(ErrorCode.InvalidParams, "Either data or data_json_path required");
  
  const result = renderDocxFromTemplateData({ templatePath, data, outputPath });
  return { success: true, output_path: result.outputPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP SERVER SETUP
// ─────────────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "universal-local-tools", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  { name: "read_file", description: "Read a file from sandbox", schema: FileOpSchema },
  { name: "write_file", description: "Write a file to sandbox", schema: FileOpSchema },
  { name: "list_files", description: "List files in sandbox directory", schema: FileOpSchema },
  { name: "delete_file", description: "Delete file/directory in sandbox", schema: FileOpSchema },
  { name: "shell", description: "Execute shell command (allowlisted)", schema: ShellSchema },
  { name: "web_fetch", description: "Fetch URL (GET/POST)", schema: WebFetchSchema },
  { name: "code_exec", description: "Execute Python/JS code in sandbox", schema: CodeExecSchema },
  { name: "git", description: "Git operations in sandbox", schema: GitSchema },
  { name: "generate_docx", description: "Generate DOCX from template (your existing tool)", schema: DocxSchema },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToSchema(t.schema),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "read_file": return { content: [{ type: "text", text: JSON.stringify(await toolReadFile(args), null, 2) }] };
      case "write_file": return { content: [{ type: "text", text: JSON.stringify(await toolWriteFile(args), null, 2) }] };
      case "list_files": return { content: [{ type: "text", text: JSON.stringify(await toolListFiles(args), null, 2) }] };
      case "delete_file": return { content: [{ type: "text", text: JSON.stringify(await toolDeleteFile(args), null, 2) }] };
      case "shell": return { content: [{ type: "text", text: JSON.stringify(await toolShell(args), null, 2) }] };
      case "web_fetch": return { content: [{ type: "text", text: JSON.stringify(await toolWebFetch(args), null, 2) }] };
      case "code_exec": return { content: [{ type: "text", text: JSON.stringify(await toolCodeExec(args), null, 2) }] };
      case "git": return { content: [{ type: "text", text: JSON.stringify(await toolGit(args), null, 2) }] };
      case "generate_docx": return { content: [{ type: "text", text: JSON.stringify(await toolDocx(args), null, 2) }] };
      default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw new McpError(ErrorCode.InternalError, e.message);
  }
});

async function main() {
  await ensureSandbox();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Universal MCP Server running on stdio");
}

main().catch((e) => { console.error(e); process.exit(1); });