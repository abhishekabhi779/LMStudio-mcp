const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

function validateData(data) {
  const required = ["full_name", "role_title", "email", "phone", "summary", "skills"];
  const missing = required.filter((key) => !(key in data));

  if (missing.length > 0) {
    throw new Error(`Missing required fields in data JSON: ${missing.join(", ")}`);
  }
  if (!Array.isArray(data.skills)) {
    throw new Error("`skills` must be an array.");
  }
}

function renderDocxFromTemplateData({ templatePath, data, outputPath }) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  validateData(data);

  const templateBinary = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(templateBinary);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(data);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const resultBuffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  fs.writeFileSync(outputPath, resultBuffer);

  return {
    outputPath,
  };
}

function renderDocxFromTemplateFile({ templatePath, dataPath, outputPath }) {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data file not found: ${dataPath}`);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  return renderDocxFromTemplateData({
    templatePath,
    data,
    outputPath,
  });
}

module.exports = {
  validateData,
  renderDocxFromTemplateData,
  renderDocxFromTemplateFile,
};
