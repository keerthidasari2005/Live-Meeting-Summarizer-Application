export type ReportExportFormat = "pdf" | "docx";

export type ExportReportOptions = {
  title: string;
  reportText: string;
  format: ReportExportFormat;
  visualSection?: string;
};

export type ReportExportFile = {
  blob: Blob;
  fileName: string;
  format: ReportExportFormat;
  mimeType: string;
};

type EnterpriseField = {
  label: string;
  value: string;
};

type EnterpriseSection = {
  title: string;
  lines: string[];
};

type EnterpriseReport = {
  title: string;
  classification: string;
  fieldHint: string;
  metadata: EnterpriseField[];
  sections: EnterpriseSection[];
};

const ENTERPRISE_TITLE = "MeetingMind AI Summary Report";
const ENTERPRISE_SEPARATOR = "-----------------------------------------";

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "meeting_report";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function lineKind(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "blank" as const;
  if (trimmed === "Summary Report" || trimmed === "Printable Summary Report") return "title" as const;
  if (/^---+$/.test(trimmed)) return "divider" as const;
  if (/^(Content Type|Prepared by|Company|Date|Meeting Title|Title|Participants):/.test(trimmed)) return "meta" as const;
  if (/^[IVX]+\.\s/.test(trimmed)) return "section" as const;
  if (/^[A-Z]\.\s/.test(trimmed)) return "subsection" as const;
  if (/^(Metrics|Trends|Comparisons|Metric Overview|Advantages \/ Strengths):?$/.test(trimmed)) return "label" as const;
  if (/^[-•]\s/.test(trimmed)) return "bullet" as const;
  return "paragraph" as const;
}

function parseEnterpriseReport(reportText: string): EnterpriseReport | null {
  const lines = reportText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  let index = 0;
  const nextNonBlank = () => {
    while (index < lines.length && !lines[index]) {
      index += 1;
    }
    return lines[index] || "";
  };

  const title = nextNonBlank();
  if (title !== ENTERPRISE_TITLE) {
    return null;
  }
  index += 1;

  const classification = nextNonBlank();
  if (!classification || classification === ENTERPRISE_SEPARATOR) {
    return null;
  }
  index += 1;

  const fieldHint = nextNonBlank();
  if (!fieldHint.startsWith("Field:")) {
    return null;
  }
  index += 1;

  if (nextNonBlank() !== ENTERPRISE_SEPARATOR) {
    return null;
  }
  index += 1;

  const metadata: EnterpriseField[] = [];
  while (index < lines.length) {
    const line = nextNonBlank();
    if (!line) break;
    if (line === ENTERPRISE_SEPARATOR) {
      index += 1;
      break;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      return null;
    }
    metadata.push({
      label: line.slice(0, separatorIndex).trim(),
      value: line.slice(separatorIndex + 1).trim(),
    });
    index += 1;
  }

  const sections: EnterpriseSection[] = [];
  while (index < lines.length) {
    const titleLine = nextNonBlank();
    if (!titleLine) break;
    if (titleLine === ENTERPRISE_SEPARATOR) {
      index += 1;
      continue;
    }

    index += 1;
    const sectionLines: string[] = [];

    while (index < lines.length) {
      const candidate = lines[index];
      if (candidate === ENTERPRISE_SEPARATOR) {
        index += 1;
        break;
      }
      if (candidate) {
        sectionLines.push(candidate);
      }
      index += 1;
    }

    sections.push({
      title: titleLine,
      lines: sectionLines,
    });
  }

  if (metadata.length === 0 || sections.length === 0) {
    return null;
  }

  return {
    title,
    classification,
    fieldHint,
    metadata,
    sections,
  };
}

function composeExportText(reportText: string, visualSection?: string) {
  const base = reportText.trim();
  if (parseEnterpriseReport(base)) {
    return base;
  }

  const extra = visualSection?.trim();
  return extra ? `${base}\n\n${extra}` : base;
}

async function exportEnterpriseDocx(report: EnterpriseReport) {
  const docx = await import("docx");
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = docx;

  const FONT_FAMILY = "Arial";
  const TITLE_COLOR = "16365D";
  const MUTED_COLOR = "64748B";
  const BODY_COLOR = "111827";
  const BORDER_COLOR = "AAB6C6";
  const HEADER_FILL = "E9EFF7";
  const LABEL_FILL = "F8FAFC";

  const children: any[] = [];

  const bodyRun = (text: string, bold = false) =>
    new TextRun({
      text,
      bold,
      size: 22,
      font: FONT_FAMILY,
      color: BODY_COLOR,
    });

  const divider = () =>
    new Paragraph({
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          color: BORDER_COLOR,
          size: 6,
        },
      },
      spacing: {
        before: 80,
        after: 220,
      },
    });

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: report.title,
          bold: true,
          size: 40,
          font: FONT_FAMILY,
          color: TITLE_COLOR,
        }),
      ],
      spacing: {
        after: 80,
      },
    }),
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: report.classification,
          size: 18,
          font: FONT_FAMILY,
          color: MUTED_COLOR,
        }),
      ],
      spacing: {
        after: 220,
      },
    }),
  );

  children.push(
    new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              shading: { fill: HEADER_FILL },
              borders: {
                top: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                bottom: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                left: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                right: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Field",
                      bold: true,
                      size: 22,
                      font: FONT_FAMILY,
                      color: BODY_COLOR,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              shading: { fill: HEADER_FILL },
              borders: {
                top: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                bottom: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                left: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                right: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Value",
                      bold: true,
                      size: 22,
                      font: FONT_FAMILY,
                      color: BODY_COLOR,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        ...report.metadata.map(
          (row) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 28, type: WidthType.PERCENTAGE },
                  shading: { fill: LABEL_FILL },
                  borders: {
                    top: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                    bottom: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                    left: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                    right: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                  },
                  children: [
                    new Paragraph({
                      spacing: { after: 40 },
                      children: [
                        new TextRun({
                          text: row.label,
                          bold: true,
                          size: 21,
                          font: FONT_FAMILY,
                          color: BODY_COLOR,
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 72, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                    bottom: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                    left: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                    right: { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 },
                  },
                  children: [
                    new Paragraph({
                      spacing: { after: 40 },
                      children: [bodyRun(row.value)],
                    }),
                  ],
                }),
              ],
            }),
        ),
      ],
    }),
  );

  children.push(divider());

  report.sections.forEach((section) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.title,
            bold: true,
            size: 24,
            font: FONT_FAMILY,
            color: TITLE_COLOR,
          }),
        ],
        spacing: {
          before: 80,
          after: 120,
        },
      }),
    );

    section.lines.forEach((line) => {
      if (/^[-•]\s/.test(line)) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [bodyRun(line.replace(/^[-•]\s+/, ""))],
            spacing: {
              after: 90,
              line: 320,
            },
          }),
        );
        return;
      }

      children.push(
        new Paragraph({
          children: [bodyRun(line)],
          spacing: {
            after: 120,
            line: 320,
          },
        }),
      );
    });

    children.push(divider());
  });

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 900,
              right: 900,
              bottom: 900,
              left: 900,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}

async function exportGenericDocx(reportText: string, visualSection?: string) {
  const docx = await import("docx");
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun } = docx;
  const paragraphs: any[] = [];
  const BODY_SIZE = 28;
  const META_SIZE = 28;
  const LABEL_SIZE = 28;
  const SECTION_SIZE = 34;
  const SUBSECTION_SIZE = 30;
  const TITLE_SIZE = 62;
  const FONT_FAMILY = "Times New Roman";

  const bodyRun = (text: string, bold = false) =>
    new TextRun({
      text,
      bold,
      size: BODY_SIZE,
      font: FONT_FAMILY,
      color: "111111",
    });

  const createDividerParagraph = () =>
    new Paragraph({
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          color: "B6C2CE",
          size: 6,
        },
      },
      spacing: {
        after: 220,
      },
    });

  composeExportText(reportText, visualSection).split("\n").forEach((line) => {
    const trimmed = line.trim();
    const kind = lineKind(line);

    if (kind === "blank") {
      paragraphs.push(
        new Paragraph({
          spacing: {
            after: 90,
          },
        }),
      );
      return;
    }

    if (kind === "divider") {
      paragraphs.push(createDividerParagraph());
      return;
    }

    if (kind === "title") {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              size: TITLE_SIZE,
              font: FONT_FAMILY,
              color: "111111",
            }),
          ],
          spacing: {
            after: 240,
            line: 360,
          },
        }),
      );
      return;
    }

    if (kind === "meta") {
      const [label, ...rest] = trimmed.split(":");
      paragraphs.push(
        new Paragraph({
          spacing: {
            after: 120,
            line: 320,
          },
          children: [
            new TextRun({
              text: `${label}: `,
              bold: true,
              size: META_SIZE,
              font: FONT_FAMILY,
              color: "111111",
            }),
            new TextRun({
              text: rest.join(":").trim(),
              size: META_SIZE,
              font: FONT_FAMILY,
              color: "111111",
            }),
          ],
        }),
      );
      return;
    }

    if (kind === "section") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              size: SECTION_SIZE,
              font: FONT_FAMILY,
              color: "1F4E79",
            }),
          ],
          spacing: {
            before: 140,
            after: 140,
            line: 340,
          },
        }),
      );
      return;
    }

    if (kind === "subsection") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              size: SUBSECTION_SIZE,
              font: FONT_FAMILY,
              color: "111111",
            }),
          ],
          spacing: {
            before: 100,
            after: 100,
            line: 330,
          },
        }),
      );
      return;
    }

    if (kind === "label") {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              size: LABEL_SIZE,
              font: FONT_FAMILY,
              color: "111111",
            }),
          ],
          spacing: {
            before: 80,
            after: 80,
            line: 320,
          },
        }),
      );
      return;
    }

    if (kind === "bullet") {
      paragraphs.push(
        new Paragraph({
          children: [bodyRun(trimmed.replace(/^[-•]\s+/, ""))],
          bullet: {
            level: 0,
          },
          spacing: {
            after: 80,
            line: 320,
          },
        }),
      );
      return;
    }

    paragraphs.push(
      new Paragraph({
        children: [bodyRun(trimmed)],
        spacing: {
          after: 120,
          line: 320,
        },
      }),
    );
  });

  const document = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT_FAMILY,
            size: BODY_SIZE,
            color: "111111",
          },
          paragraph: {
            spacing: {
              line: 320,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return Packer.toBlob(document);
}

async function exportDocx(title: string, reportText: string, visualSection?: string) {
  const parsedEnterprise = parseEnterpriseReport(composeExportText(reportText, visualSection));
  if (parsedEnterprise) {
    return exportEnterpriseDocx(parsedEnterprise);
  }

  return exportGenericDocx(reportText, visualSection);
}

async function exportEnterprisePdf(report: EnterpriseReport) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 56;
  const contentWidth = pageWidth - margin * 2;
  const borderInset = 32;
  const tableFieldWidth = 150;
  const tableValueWidth = contentWidth - tableFieldWidth;
  const titleColor = [22, 54, 93] as const;
  const mutedColor = [100, 116, 139] as const;
  const bodyColor = [17, 24, 39] as const;
  const borderColor = [170, 182, 198] as const;
  const headerFill = [233, 239, 247] as const;
  const labelFill = [248, 250, 252] as const;
  let y = 66;

  const drawFrame = () => {
    pdf.setDrawColor(...borderColor);
    pdf.setLineWidth(0.8);
    pdf.rect(borderInset, borderInset, pageWidth - borderInset * 2, pageHeight - borderInset * 2);
  };

  const resetPage = () => {
    drawFrame();
    y = 66;
  };

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 56) {
      return;
    }
    pdf.addPage();
    resetPage();
  };

  const drawTextBlock = (
    text: string,
    options: {
      fontSize: number;
      fontStyle?: "normal" | "bold";
      color?: readonly [number, number, number];
      align?: "left" | "center";
      indent?: number;
      spacingAfter?: number;
      lineHeight?: number;
    },
  ) => {
    const indent = options.indent || 0;
    const lineHeight = options.lineHeight || options.fontSize * 1.45;
    const spacingAfter = options.spacingAfter ?? 8;
    const availableWidth = contentWidth - indent;
    const lines = pdf.splitTextToSize(text, availableWidth);

    ensureSpace(lines.length * lineHeight + spacingAfter);

    pdf.setFont("helvetica", options.fontStyle || "normal");
    pdf.setFontSize(options.fontSize);
    pdf.setTextColor(...(options.color || bodyColor));

    lines.forEach((line: string) => {
      if (options.align === "center") {
        pdf.text(line, pageWidth / 2, y, { align: "center" });
      } else {
        pdf.text(line, margin + indent, y);
      }
      y += lineHeight;
    });

    y += spacingAfter;
  };

  const drawDivider = () => {
    ensureSpace(22);
    pdf.setDrawColor(...borderColor);
    pdf.setLineWidth(0.8);
    pdf.line(margin, y + 4, pageWidth - margin, y + 4);
    y += 22;
  };

  const drawBullets = (lines: string[]) => {
    lines.forEach((line) => {
      const text = line.replace(/^[-•]\s+/, "");
      const lineHeight = 15;
      const wrapped = pdf.splitTextToSize(text, contentWidth - 24);
      ensureSpace(wrapped.length * lineHeight + 6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(...bodyColor);
      pdf.text("\u2022", margin + 4, y);
      wrapped.forEach((wrappedLine: string, wrappedIndex: number) => {
        pdf.text(wrappedLine, margin + 18, y + wrappedIndex * lineHeight);
      });
      y += wrapped.length * lineHeight + 8;
    });
  };

  const drawMetadataTable = () => {
    const headerHeight = 24;
    const lineHeight = 12;
    const preparedRows = report.metadata.map((row) => {
      const labelLines = pdf.splitTextToSize(row.label, tableFieldWidth - 16);
      const valueLines = pdf.splitTextToSize(row.value, tableValueWidth - 16);
      const rowHeight = Math.max(labelLines.length, valueLines.length) * lineHeight + 12;
      return { ...row, labelLines, valueLines, rowHeight };
    });
    const totalHeight = preparedRows.reduce((sum, row) => sum + row.rowHeight, headerHeight);

    ensureSpace(totalHeight + 18);

    pdf.setDrawColor(...borderColor);
    pdf.setLineWidth(0.8);
    pdf.setFillColor(...headerFill);
    pdf.rect(margin, y, contentWidth, headerHeight, "FD");
    pdf.line(margin + tableFieldWidth, y, margin + tableFieldWidth, y + totalHeight);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.setTextColor(...bodyColor);
    pdf.text("Field", margin + 8, y + 16);
    pdf.text("Value", margin + tableFieldWidth + 8, y + 16);

    let rowY = y + headerHeight;
    preparedRows.forEach((row) => {
      pdf.setFillColor(...labelFill);
      pdf.rect(margin, rowY, tableFieldWidth, row.rowHeight, "FD");
      pdf.rect(margin + tableFieldWidth, rowY, tableValueWidth, row.rowHeight);
      pdf.rect(margin, rowY, tableFieldWidth, row.rowHeight);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(...bodyColor);
      row.labelLines.forEach((labelLine: string, labelIndex: number) => {
        pdf.text(labelLine, margin + 8, rowY + 14 + labelIndex * lineHeight);
      });

      pdf.setFont("helvetica", "normal");
      row.valueLines.forEach((valueLine: string, valueIndex: number) => {
        pdf.text(valueLine, margin + tableFieldWidth + 8, rowY + 14 + valueIndex * lineHeight);
      });

      rowY += row.rowHeight;
    });

    y = rowY + 16;
  };

  resetPage();
  drawTextBlock(report.title, {
    fontSize: 20,
    fontStyle: "bold",
    color: titleColor,
    align: "center",
    spacingAfter: 6,
  });
  drawTextBlock(report.classification, {
    fontSize: 10.5,
    color: mutedColor,
    align: "center",
    spacingAfter: 18,
  });
  drawMetadataTable();
  drawDivider();

  report.sections.forEach((section) => {
    drawTextBlock(section.title, {
      fontSize: 12.5,
      fontStyle: "bold",
      color: titleColor,
      spacingAfter: 8,
      lineHeight: 16,
    });

    const bulletLines = section.lines.filter((line) => /^[-•]\s/.test(line));
    const paragraphLines = section.lines.filter((line) => !/^[-•]\s/.test(line));

    if (paragraphLines.length > 0) {
      drawTextBlock(paragraphLines.join(" "), {
        fontSize: 11,
        color: bodyColor,
        spacingAfter: bulletLines.length > 0 ? 6 : 10,
        lineHeight: 15,
      });
    }

    if (bulletLines.length > 0) {
      drawBullets(bulletLines);
    }

    drawDivider();
  });

  const pageCount = typeof pdf.getNumberOfPages === "function" ? pdf.getNumberOfPages() : pdf.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...mutedColor);
    pdf.text(`Page ${page}`, pageWidth / 2, pageHeight - 20, { align: "center" });
  }

  return pdf.output("blob");
}

async function exportGenericPdf(reportText: string, visualSection?: string) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  let y = 58;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - margin) return;
    pdf.addPage();
    y = 58;
  };

  const drawTextBlock = (
    text: string,
    options: {
      fontSize: number;
      fontStyle?: "normal" | "bold";
      align?: "left" | "center";
      indent?: number;
      spacingAfter?: number;
    },
  ) => {
    const fontSize = options.fontSize;
    const indent = options.indent || 0;
    const spacingAfter = options.spacingAfter ?? 8;
    const lineHeight = fontSize * 1.45;
    const lines = pdf.splitTextToSize(text, contentWidth - indent);

    ensureSpace(lines.length * lineHeight + spacingAfter);

    pdf.setFont("helvetica", options.fontStyle || "normal");
    pdf.setFontSize(fontSize);

    lines.forEach((line: string) => {
      if (options.align === "center") {
        pdf.text(line, pageWidth / 2, y, { align: "center" });
      } else {
        pdf.text(line, margin + indent, y);
      }
      y += lineHeight;
    });

    y += spacingAfter;
  };

  const drawBullet = (text: string) => {
    const bulletIndent = 18;
    const wrapWidth = contentWidth - bulletIndent;
    const lines = pdf.splitTextToSize(text, wrapWidth);
    const lineHeight = 15;

    ensureSpace(lines.length * lineHeight + 6);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("\u2022", margin + 6, y);
    lines.forEach((line: string, index: number) => {
      pdf.text(line, margin + bulletIndent, y + index * lineHeight);
    });
    y += lines.length * lineHeight + 6;
  };

  composeExportText(reportText, visualSection).split("\n").forEach((line) => {
    const trimmed = line.trim();
    const kind = lineKind(line);

    if (kind === "blank") {
      y += 6;
      return;
    }

    if (kind === "divider") {
      ensureSpace(18);
      pdf.setDrawColor(190, 198, 206);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 18;
      return;
    }

    if (kind === "title") {
      drawTextBlock(trimmed, {
        fontSize: 21,
        fontStyle: "bold",
        align: "center",
        spacingAfter: 18,
      });
      return;
    }

    if (kind === "meta") {
      drawTextBlock(trimmed, {
        fontSize: 11,
        spacingAfter: 4,
      });
      return;
    }

    if (kind === "section") {
      drawTextBlock(trimmed, {
        fontSize: 16,
        fontStyle: "bold",
        spacingAfter: 6,
      });
      return;
    }

    if (kind === "subsection") {
      drawTextBlock(trimmed, {
        fontSize: 13,
        fontStyle: "bold",
        spacingAfter: 4,
      });
      return;
    }

    if (kind === "label") {
      drawTextBlock(trimmed, {
        fontSize: 11,
        fontStyle: "bold",
        spacingAfter: 2,
      });
      return;
    }

    if (kind === "bullet") {
      drawBullet(trimmed.replace(/^[-•]\s+/, ""));
      return;
    }

    drawTextBlock(trimmed, {
      fontSize: 11,
      spacingAfter: 4,
    });
  });

  return pdf.output("blob");
}

async function exportPdf(title: string, reportText: string, visualSection?: string) {
  const parsedEnterprise = parseEnterpriseReport(composeExportText(reportText, visualSection));
  if (parsedEnterprise) {
    return exportEnterprisePdf(parsedEnterprise);
  }

  return exportGenericPdf(reportText, visualSection);
}

export async function buildReportExportFile({
  title,
  reportText,
  format,
  visualSection,
}: ExportReportOptions): Promise<ReportExportFile> {
  if (format === "pdf") {
    return {
      blob: await exportPdf(title, reportText, visualSection),
      fileName: `${sanitizeFileName(title)}.pdf`,
      format,
      mimeType: "application/pdf",
    };
  }

  return {
    blob: await exportDocx(title, reportText, visualSection),
    fileName: `${sanitizeFileName(title)}.docx`,
    format,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

export async function exportReport(options: ExportReportOptions) {
  const file = await buildReportExportFile(options);
  downloadBlob(file.blob, file.fileName);
}
