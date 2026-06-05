import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["src/mcp-server-improved.mjs"],
  });
  
  const client = new Client({ name: "debug-client", version: "1.0.0" }, { capabilities: {} });
  
  await client.connect(transport);
  const tools = await client.listTools();
  
  console.log("Registered tools:");
  for (const tool of tools.tools) {
    console.log(`- ${tool.name}: ${tool.description}`);
  }
  
  await client.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
