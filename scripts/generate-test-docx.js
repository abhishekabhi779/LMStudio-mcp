const fs = require("fs");
const path = require("path");
const {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} = require("docx");

async function generateTestDocx() {
  const outputDir = path.join(__dirname, "..", "output");
  const defaultOutputFile = path.join(outputDir, "test-output.docx");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "DOCX Generation Test",
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun("This file was generated using Node.js and "),
              new TextRun({ text: "docx", bold: true }),
              new TextRun("."),
            ],
          }),
          new Paragraph({
            text: `Generated at: ${new Date().toISOString()}`,
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  let outputFile = defaultOutputFile;
  try {
    fs.writeFileSync(outputFile, buffer);
  } catch (error) {
    if (error.code === "EBUSY") {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      outputFile = path.join(outputDir, `test-output-${timestamp}.docx`);
      fs.writeFileSync(outputFile, buffer);
    } else {
      throw error;
    }
  }

  console.log(`DOCX file created: ${outputFile}`);
}

generateTestDocx().catch((error) => {
  console.error("Failed to generate DOCX:", error);
  process.exit(1);
});
