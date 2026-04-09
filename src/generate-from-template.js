const path = require("path");
const { renderDocxFromTemplateFile } = require("./template-renderer");

function parseArgs(argv) {
  const defaults = {
    template: path.join(__dirname, "..", "templates", "resume-template.docx"),
    data: path.join(__dirname, "..", "data", "resume-data.example.json"),
    output: path.join(__dirname, "..", "output", "resume-output.docx"),
  };

  const args = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--template" && next) args.template = path.resolve(next);
    if (token === "--data" && next) args.data = path.resolve(next);
    if (token === "--output" && next) args.output = path.resolve(next);
  }
  return args;
}

function main() {
  const { template, data, output } = parseArgs(process.argv.slice(2));
  const result = renderDocxFromTemplateFile({
    templatePath: template,
    dataPath: data,
    outputPath: output,
  });
  console.log(`Generated DOCX: ${result.outputPath}`);
}

try {
  main();
} catch (error) {
  console.error("Template generation failed:", error.message);
  process.exit(1);
}
