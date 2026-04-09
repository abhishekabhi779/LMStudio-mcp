import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import renderer from "./template-renderer.js";

const { renderDocxFromTemplateData, renderDocxFromTemplateFile, validateData } = renderer;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const REQUIRED_RESUME_KEYS = [
  "full_name",
  "role_title",
  "email",
  "phone",
  "summary",
  "skills",
];

function resolvePath(inputPath, fallbackRelativePath) {
  if (!inputPath || inputPath.trim() === "") {
    return path.resolve(projectRoot, fallbackRelativePath);
  }
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(projectRoot, inputPath);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  const direct = tryParseJson(trimmed);
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct;
  }

  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const block of fencedBlocks) {
    const candidate = tryParseJson((block[1] || "").trim());
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = trimmed.slice(firstBrace, lastBrace + 1);
    const candidate = tryParseJson(sliced);
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not parse a valid JSON object from model output.");
}

function buildSchemaPrompt(userPromptText) {
  return [
    "Convert the user request into one JSON object for a resume DOCX template.",
    "Return only valid JSON with no markdown or extra text.",
    `Required keys: ${REQUIRED_RESUME_KEYS.join(", ")}.`,
    "Type requirements:",
    "- full_name: string",
    "- role_title: string",
    "- email: string",
    "- phone: string",
    "- summary: string",
    "- skills: array of strings",
    "If a value is unknown, provide a sensible placeholder string.",
    "User request:",
    userPromptText,
  ].join("\n");
}

const server = new McpServer({
  name: "docx-template-mcp",
  version: "1.0.0",
});

server.registerTool(
  "ping_docx_server",
  {
    description:
      "Health-check tool to verify this MCP server is reachable and to confirm active tool/version info.",
    inputSchema: {},
  },
  async () => {
    const health = {
      name: "docx-template-mcp",
      version: "1.0.0",
      status: "ok",
      timestamp: new Date().toISOString(),
      project_root: projectRoot,
      tools: [
        "ping_docx_server",
        "create_docx_from_template",
        "create_docx_from_lm_prompt",
        "validate_resume_template_data",
      ],
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(health),
        },
      ],
    };
  }
);

server.registerTool(
  "create_docx_from_template",
  {
    description:
      "Render a DOCX from a template using JSON data. Pass either inline `data` or `data_json_path`.",
    inputSchema: {
      template_path: z
        .string()
        .optional()
        .describe("Absolute or project-relative path to a .docx template file."),
      data_json_path: z
        .string()
        .optional()
        .describe("Absolute or project-relative path to input data JSON."),
      data: z
        .record(z.string(), z.any())
        .optional()
        .describe("Inline input data object. Use this instead of data_json_path."),
      output_path: z
        .string()
        .optional()
        .describe("Absolute or project-relative output path for generated .docx."),
    },
  },
  async ({ template_path, data_json_path, data, output_path }) => {
    try {
      if (data && data_json_path) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Provide either `data` or `data_json_path`, not both.",
            },
          ],
        };
      }

      if (!data && !data_json_path) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "You must provide one of: `data` or `data_json_path`.",
            },
          ],
        };
      }

      const templatePath = resolvePath(template_path, "templates/resume-template.docx");
      const outputPath = resolvePath(output_path, "output/resume-output.docx");

      let result;
      if (data_json_path) {
        const dataJsonPath = resolvePath(data_json_path, "data/resume-data.example.json");
        result = renderDocxFromTemplateFile({
          templatePath,
          dataPath: dataJsonPath,
          outputPath,
        });
      } else {
        validateData(data);
        result = renderDocxFromTemplateData({
          templatePath,
          data,
          outputPath,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `DOCX generated successfully at: ${result.outputPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `DOCX generation failed: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.registerTool(
  "create_docx_from_lm_prompt",
  {
    description:
      "Use MCP sampling to transform free text into template JSON, validate it, then generate a DOCX in one call.",
    inputSchema: {
      prompt_text: z
        .string()
        .describe("Natural language prompt describing the resume/profile content to generate."),
      template_path: z
        .string()
        .optional()
        .describe("Absolute or project-relative path to a .docx template file."),
      output_path: z
        .string()
        .optional()
        .describe("Absolute or project-relative output path for generated .docx."),
    },
  },
  async ({ prompt_text, template_path, output_path }) => {
    try {
      const samplingResponse = await server.server.createMessage({
        systemPrompt:
          "You are a data formatter. Return strictly valid JSON only with the exact required schema.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildSchemaPrompt(prompt_text),
            },
          },
        ],
        maxTokens: 1200,
        temperature: 0.2,
      });

      if (samplingResponse.content?.type !== "text") {
        throw new Error("Model response was not text; unable to extract JSON.");
      }

      const structuredData = extractJsonObject(samplingResponse.content.text);
      validateData(structuredData);

      const templatePath = resolvePath(template_path, "templates/resume-template.docx");
      const outputPath = resolvePath(output_path, "output/resume-from-lm-prompt.docx");

      const result = renderDocxFromTemplateData({
        templatePath,
        data: structuredData,
        outputPath,
      });

      return {
        content: [
          {
            type: "text",
            text: `DOCX generated from prompt at: ${result.outputPath}`,
          },
          {
            type: "text",
            text: `Structured JSON used: ${JSON.stringify(structuredData)}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = String(error?.message || error);
      const maybeSamplingUnsupported =
        errorMessage.includes("does not support sampling") ||
        errorMessage.includes("sampling/createMessage");
      const guidance = maybeSamplingUnsupported
        ? " Client does not expose MCP sampling. In LM Studio, ensure this tool is invoked from a context where sampling is supported."
        : "";

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Prompt-to-DOCX failed: ${errorMessage}.${guidance}`,
          },
        ],
      };
    }
  }
);

server.registerTool(
  "validate_resume_template_data",
  {
    description:
      "Validate the JSON data shape expected by the current resume template.",
    inputSchema: {
      data_json_path: z
        .string()
        .optional()
        .describe("Absolute or project-relative path to input data JSON."),
      data: z
        .record(z.string(), z.any())
        .optional()
        .describe("Inline input data object."),
    },
  },
  async ({ data_json_path, data }) => {
    try {
      if (data && data_json_path) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Provide either `data` or `data_json_path`, not both.",
            },
          ],
        };
      }

      if (!data && !data_json_path) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "You must provide one of: `data` or `data_json_path`.",
            },
          ],
        };
      }

      let effectiveData = data;
      if (data_json_path) {
        const dataJsonPath = resolvePath(data_json_path, "data/resume-data.example.json");
        if (!fs.existsSync(dataJsonPath)) {
          throw new Error(`Data file not found: ${dataJsonPath}`);
        }
        effectiveData = JSON.parse(fs.readFileSync(dataJsonPath, "utf8"));
      }

      validateData(effectiveData);

      return {
        content: [
          {
            type: "text",
            text: "Data is valid for the resume template.",
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Validation failed: ${error.message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server failed:", error);
  process.exit(1);
});
