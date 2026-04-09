const fs = require("fs");
const path = require("path");
const { Document, HeadingLevel, Packer, Paragraph } = require("docx");

async function createTemplate() {
  const templatesDir = path.join(__dirname, "..", "templates");
  const templatePath = path.join(templatesDir, "resume-template.docx");

  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Candidate Profile",
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph("Name: {full_name}"),
          new Paragraph("Role: {role_title}"),
          new Paragraph("Email: {email}"),
          new Paragraph("Phone: {phone}"),
          new Paragraph(""),
          new Paragraph("Summary"),
          new Paragraph("{summary}"),
          new Paragraph(""),
          new Paragraph("Skills"),
          new Paragraph("{#skills}"),
          new Paragraph("- {.}"),
          new Paragraph("{/skills}"),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(templatePath, buffer);
  console.log(`Template created: ${templatePath}`);
}

createTemplate().catch((error) => {
  console.error("Failed to create template:", error);
  process.exit(1);
});
