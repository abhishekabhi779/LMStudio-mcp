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
const SERVER_VERSION = "1.1.0";

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

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirst(text, regex) {
  const match = text.match(regex);
  return match?.[1] ? normalizeWhitespace(match[1]) : "";
}

function parseSkills(skillsText) {
  const raw = normalizeWhitespace(skillsText);
  if (!raw) {
    return [];
  }

  return raw
    .split(/,|;|\||\band\b/gi)
    .map((item) => normalizeWhitespace(item).replace(/[.]+$/g, ""))
    .filter(Boolean);
}

function buildResumeDataFromPrompt(promptText) {
  const text = String(promptText || "");

  const fullName =
    extractFirst(text, /name\s*[:\-]\s*([^\n,]+)/i) ||
    extractFirst(text, /for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/);

  const roleTitle =
    extractFirst(text, /role(?:\s*title)?\s*[:\-]\s*([^\n,.]+)/i) ||
    extractFirst(text, /title\s*[:\-]\s*([^\n,.]+)/i);

  const email = extractFirst(
    text,
    /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/
  );
  const phone = extractFirst(
    text,
    /(\+?\d(?:[\d\s().\-]{7,}\d))/
  );

  const summary =
    extractFirst(
      text,
      /summary\s*[:\-]\s*([\s\S]*?)(?:\bskills?\s*[:\-]|\bemail\s*[:\-]|\bphone\s*[:\-]|\brole(?:\s*title)?\s*[:\-]|$)/i
    ) ||
    normalizeWhitespace(text).slice(0, 300);

  const skillsSection =
    extractFirst(text, /skills?\s*[:\-]\s*([^\n]+)/i) ||
    extractFirst(text, /skills?\s+include\s*([^\n]+)/i);
  const parsedSkills = parseSkills(skillsSection);

  return {
    full_name: fullName || "Unknown Candidate",
    role_title: roleTitle || "Professional",
    email: email || "unknown@example.com",
    phone: phone || "N/A",
    summary: summary || "Profile summary was not provided.",
    skills: parsedSkills.length > 0 ? parsedSkills : ["Communication", "Problem Solving"],
  };
}

function isSamplingUnavailable(errorMessage) {
  return (
    errorMessage.includes("-32601") ||
    errorMessage.includes("Method not found") ||
    errorMessage.includes("does not support sampling") ||
    errorMessage.includes("sampling/createMessage")
  );
}

const server = new McpServer({
  name: "docx-template-mcp",
  version: SERVER_VERSION,
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
      version: SERVER_VERSION,
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
      const templatePath = resolvePath(template_path, "templates/resume-template.docx");
      const outputPath = resolvePath(output_path, "output/resume-from-lm-prompt.docx");
      let structuredData;
      let generationMode = "sampling";
      let samplingErrorText = "";

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

        structuredData = extractJsonObject(samplingResponse.content.text);
      } catch (samplingError) {
        const errorMessage = String(samplingError?.message || samplingError);
        samplingErrorText = errorMessage;

        // LM Studio can expose tools without supporting sampling/createMessage.
        // In that case we degrade gracefully using deterministic local extraction.
        if (isSamplingUnavailable(errorMessage)) {
          generationMode = "fallback";
          structuredData = buildResumeDataFromPrompt(prompt_text);
        } else {
          // For non-sampling failures, still attempt fallback to keep the workflow moving.
          generationMode = "fallback";
          structuredData = buildResumeDataFromPrompt(prompt_text);
        }
      }

      validateData(structuredData);

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
            text: `Generation mode: ${generationMode}`,
          },
          {
            type: "text",
            text: `Structured JSON used: ${JSON.stringify(structuredData)}`,
          },
          ...(samplingErrorText
            ? [
                {
                  type: "text",
                  text: `Sampling note: ${samplingErrorText}`,
                },
              ]
            : []),
        ],
      };
    } catch (error) {
      const errorMessage = String(error?.message || error);

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Prompt-to-DOCX failed: ${errorMessage}`,
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
