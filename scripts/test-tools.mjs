import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["src/mcp-server-improved.mjs"],
  });
  
  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
  
  await client.connect(transport);
  
  // Test write_file
  console.log("Testing write_file...");
  const writeResult = await client.callTool({
    name: "write_file",
    arguments: { path: "files/test.txt", content: "Hello from MCP!" }
  });
  console.log(writeResult.content[0].text);
  
  // Test read_file
  console.log("\nTesting read_file...");
  const readResult = await client.callTool({
    name: "read_file",
    arguments: { path: "files/test.txt" }
  });
  console.log(readResult.content[0].text);
  
  // Test shell
  console.log("\nTesting shell...");
  const shellResult = await client.callTool({
    name: "shell",
    arguments: { command: "ls -la files/" }
  });
  console.log(shellResult.content[0].text);
  
  // Test list_files
  console.log("\nTesting list_files...");
  const listResult = await client.callTool({
    name: "list_files",
    arguments: { path: "files" }
  });
  console.log(listResult.content[0].text);
  
  // Test code_exec
  console.log("\nTesting code_exec (Python)...");
  const codeResult = await client.callTool({
    name: "code_exec",
    arguments: { 
      language: "python", 
      code: "print('Python works!'); import json; print(json.dumps({'status': 'ok'}))" 
    }
  });
  console.log(codeResult.content[0].text);
  
  await client.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
