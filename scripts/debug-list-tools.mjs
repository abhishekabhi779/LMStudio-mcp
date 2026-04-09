import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const serverPath = path.resolve("src/mcp-server.mjs");
  const client = new Client({ name: "docx-debug-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    cwd: process.cwd(),
  });

  await client.connect(transport);
  const result = await client.listTools();
  console.log("Registered tools:");
  for (const tool of result.tools) {
    console.log(`- ${tool.name}`);
  }
  await transport.close();
}

main().catch((error) => {
  console.error("Failed to list tools:", error);
  process.exit(1);
});
