import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from "docx";

/**
 * Convert markdown-ish content into a DOCX without exporting raw markdown markers.
 */
export async function markdownToDocxBlob(opts: {
  title: string;
  content: string;
  generatedAt?: Date;
}): Promise<Blob> {
  const lines = opts.content.replace(/\r\n/g, "\n").split("\n");
  const children: Paragraph[] = [
    new Paragraph({
      text: opts.title,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${ (opts.generatedAt ?? new Date()).toLocaleString() } · slabOS AI Studio`,
          italics: true,
          size: 18,
          color: "666666",
        }),
      ],
      spacing: { after: 300 },
    }),
  ];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    if (line.startsWith("### ")) {
      children.push(
        new Paragraph({
          text: stripMd(line.slice(4)),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }
    if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: stripMd(line.slice(3)),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 120 },
        })
      );
      continue;
    }
    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          text: stripMd(line.slice(2)),
          heading: HeadingLevel.HEADING_1,
        })
      );
      continue;
    }

    const bullet = /^[-*]\s+/.exec(line);
    if (bullet) {
      children.push(
        new Paragraph({
          text: stripMd(line.slice(bullet[0].length)),
          bullet: { level: 0 },
        })
      );
      continue;
    }

    const numbered = /^\d+\.\s+/.exec(line);
    if (numbered) {
      children.push(
        new Paragraph({
          text: stripMd(line.slice(numbered[0].length)),
          numbering: { reference: "numbers", level: 0 },
        })
      );
      continue;
    }

    children.push(
      new Paragraph({
        children: [new TextRun({ text: stripMd(line), size: 22 })],
        spacing: { after: 80 },
        alignment: AlignmentType.LEFT,
      })
    );
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}

function stripMd(input: string): string {
  return input
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
