import ExcelJS from "exceljs";

const trimTrailingEmptyCells = (row: string[]) => {
  let end = row.length;

  while (end > 0 && !row[end - 1]?.trim()) {
    end -= 1;
  }

  return row.slice(0, end);
};

const normalizeCellText = (value: string) => value.replace(/\r\n?|\n/g, " ").trim();

const stringifyCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    if ("result" in value && (value as { result?: unknown }).result !== undefined) {
      return stringifyCellValue((value as { result?: unknown }).result);
    }

    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text;
    }

    if ("richText" in value && Array.isArray((value as { richText?: Array<{ text?: string }> }).richText)) {
      return (value as { richText: Array<{ text?: string }> }).richText.map((part) => part.text ?? "").join("");
    }

    if ("hyperlink" in value && typeof (value as { hyperlink?: unknown }).hyperlink === "string") {
      return typeof (value as { text?: unknown }).text === "string"
        ? String((value as { text?: unknown }).text)
        : String((value as { hyperlink: string }).hyperlink);
    }
  }

  return String(value);
};

const parseDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(normalizeCellText(current));
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(normalizeCellText(current));
  return trimTrailingEmptyCells(cells);
};

const detectDelimiter = (headerLine: string) => {
  const candidates = [",", ";", "\t"];
  return candidates.reduce(
    (best, delimiter) => {
      const count = headerLine.split(delimiter).length;
      return count > best.count ? { delimiter, count } : best;
    },
    { delimiter: ",", count: 0 },
  ).delimiter;
};

const parseCsvRows = (text: string) => {
  const normalizedText = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    return [] as string[][];
  }

  const delimiter = detectDelimiter(lines[0]);
  return lines.map((line) => parseDelimitedLine(line, delimiter)).filter((row) => row.some(Boolean));
};

export const loadSpreadsheetSheets = async (file: File): Promise<string[][][]> => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "csv" || file.type.includes("csv")) {
    return [parseCsvRows(await file.text())];
  }

  if (extension === "xls") {
    throw new Error("legacy-xls-unsupported");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheets = workbook.worksheets
    .map((worksheet) => {
      const rows: string[][] = [];

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const normalized = trimTrailingEmptyCells(values.map((value) => normalizeCellText(stringifyCellValue(value))));

        if (normalized.some(Boolean)) {
          rows.push(normalized);
        }
      });

      return rows;
    })
    .filter((rows) => rows.length > 0);

  if (sheets.length === 0) {
    throw new Error("empty-workbook");
  }

  return sheets;
};

export const loadSpreadsheetRows = async (file: File): Promise<string[][]> => {
  const sheets = await loadSpreadsheetSheets(file);
  return sheets[0] ?? [];
};

export const loadSpreadsheetObjects = async (file: File): Promise<Record<string, string>[]> => {
  const rows = await loadSpreadsheetRows(file);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header, index) => header || `Column ${index + 1}`);

  return rows.slice(1).map((row) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {}),
  );
};