import type { QuestionType } from "@/lib/dashboard-store";

export interface ImportedQuestionDraft {
  prompt: string;
  type: QuestionType;
  options: string[];
}

const QUESTION_LINE_PATTERN = /[؟?؛:.]\s*$/;
const NUMBER_TOKEN = "0-9\u0660-\u0669\u06F0-\u06F9";
const OPTION_LETTER_TOKEN = "A-Da-d\u0623\u0628\u062C\u062F\u0627";
const QUESTION_START_PATTERN = new RegExp(`^\\s*[${NUMBER_TOKEN}]{1,3}\\s*[).:؛/-]?\\s+`);
const QUESTION_END_NUMBER_PATTERN = new RegExp(`\\s*[).:؛/-]?\\s*[${NUMBER_TOKEN}]{1,3}\\s*$`);
const LEADING_LIST_MARKER_PATTERN = new RegExp(`^\\s*(?:\\(?[${NUMBER_TOKEN}]{1,3}\\)?\\s*[-–—.)(:/؛]\\s*|\\(?[${NUMBER_TOKEN}]{1,3}\\)?\\s+|(?:\\([${OPTION_LETTER_TOKEN}]\\)|[${OPTION_LETTER_TOKEN}]\\s*[-–—.)(:/؛])\\s*)`);
const OPTION_MARKER_PATTERN = new RegExp(`^\\s*(?:[-*•●▪◦]|\\(?[${NUMBER_TOKEN}]{1,3}\\)?\\s*[)(.:؛/-]|\\([${OPTION_LETTER_TOKEN}]\\)|[${OPTION_LETTER_TOKEN}]\\s*[)(.:؛/-])\\s*`);
const TRAILING_OPTION_MARKER_PATTERN = new RegExp(`\\s*(?:\\([${OPTION_LETTER_TOKEN}]\\)|\\(?[${NUMBER_TOKEN}]{1,3}\\)?\\s*[)(.:؛/-])\\s*$`);
const OPTION_MARKER_ANYWHERE_PATTERN = new RegExp(`(?:\\([${OPTION_LETTER_TOKEN}]\\)|[${OPTION_LETTER_TOKEN}]\\s*[)(.:؛/-]|\\(?[${NUMBER_TOKEN}]{1,3}\\)?\\s*[)(.:؛/-])`);
const INLINE_OPTION_SPLIT_PATTERN = new RegExp(`\\s+(?=(?:\\([${OPTION_LETTER_TOKEN}]\\)|[${OPTION_LETTER_TOKEN}]\\s*[)(.:؛/-]|\\(?[${NUMBER_TOKEN}]{1,3}\\)?\\s*[)(.:؛/-]))`, "g");
const ANSWER_LINE_PATTERN = /^(?:الإجابة(?:\s+الصحيحة)?|الجواب(?:\s+الصحيح)?|answer|correct\s*answer|solution|الدرجة|التعليل|التفسير)\s*[:：-]/i;
const NOISE_LINE_PATTERN = /^(?:page\s*\d+|\d+\s*\/\s*\d+|\d+)$/i;
const ARABIC_CHAR_PATTERN = /[\u0600-\u06FF]/g;
const LATIN_CHAR_PATTERN = /[A-Za-z]/g;

/**
 * Word-level corrections for known Arabic PDF font-encoding artifacts.
 * The main systematic issue: the ل in the definite article "ال" swaps with the following letter,
 * so "ال" + X becomes "ا" + X + "ل" (e.g. "المنهج" → "املنهج", "الجيد" → "اجليد").
 * We fix this with a broad regex, then patch known edge-cases individually.
 */
const ARABIC_WORD_CORRECTIONS: [RegExp, string][] = [
  // ── Systematic fix: definite-article lam (ل) swapped with next consonant ──
  // Pattern: word starts with plain-alef (ا) + consonant + ل + Arabic letter
  // → swap back to: ا + ل + consonant  (restores "ال" prefix)
  // Covers: المنهج←املنهج, المتحدث←املتحدث, الجيد←اجليد, العلم←اعلم, etc.
  [
    /(^|[\s(])ا([بتثجحخدذرزسشصضطظعغفقكمنهوي])ل(?=[\u0600-\u06FF])/g,
    "$1ال$2",
  ],

  // ── Lam-alef ligature (لا) reversed inside words ──
  [/(^|[\s(])العالقة(?=[\s.,;؟؛!)]|$)/g, "$1العلاقة"],
  [/(^|[\s(])عالقة(?=[\s.,;؟؛!)]|$)/g, "$1علاقة"],
  [/(^|[\s(])تالميذ(?=[\s.,;؟؛!)]|$)/g, "$1تلاميذ"],
  [/(^|[\s(])مالاحظة(?=[\s.,;؟؛!)]|$)/g, "$1ملاحظة"],
  [/(^|[\s(])الاريبعة(?=[\s.,;؟؛!)]|$)/g, "$1الأربعة"],
  [/(^|[\s(])اريبعة(?=[\s.,;؟؛!)]|$)/g, "$1أربعة"],

  // ── Reversed ي/ت at end of words ──
  [/(^|[\s(])ويل(?=[\s.,;؟؛!)]|$)/g, "$1ولي"],   // ولي ← ويل (e.g. ولي الأمر)

  // ── Researcher / author names ──
  [/(^|[\s(])هايت(?=[\s.,;؟؛!)]|$)/g, "$1هاتي"],
  [/(^|[\s(])بلووم(?=[\s.,;؟؛!)]|$)/g, "$1بلوم"],

  // ── Hamza / alef dropped from definite article ──
  // (cases where the systematic regex above doesn't catch because consonant+ل is not present)
  [/(^|[\s(])امعلم(?=[\s.,;؟؛!)]|$)/g, "$1المعلم"],
  [/(^|[\s(])امطالب(?=[\s.,;؟؛!)]|$)/g, "$1المطالب"],
];


const applyWordCorrections = (value: string) =>
  ARABIC_WORD_CORRECTIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement as string),
    value,
  );

// ── Custom corrections (persisted in localStorage) ───────────────────────────
const CUSTOM_CORRECTIONS_KEY = "momars_custom_word_corrections";

export interface CustomCorrection {
  wrong: string;
  correct: string;
}

export const getCustomCorrections = (): CustomCorrection[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_CORRECTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomCorrection =>
        item && typeof item.wrong === "string" && typeof item.correct === "string",
    );
  } catch {
    return [];
  }
};

export const setCustomCorrections = (corrections: CustomCorrection[]): void => {
  try {
    localStorage.setItem(CUSTOM_CORRECTIONS_KEY, JSON.stringify(corrections));
  } catch {
    // storage might be unavailable
  }
};

const applyCustomCorrections = (value: string): string => {
  const corrections = getCustomCorrections();
  return corrections.reduce((text, { wrong, correct }) => {
    if (!wrong) return text;
    // Escape for use in regex
    const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return text.replace(new RegExp(escaped, "g"), correct);
    } catch {
      return text;
    }
  }, value);
};

const normalizeLine = (value: string) => applyCustomCorrections(applyWordCorrections(value
  .replace(/\u00a0/g, " ")
  .replace(/\s+/g, " ")
  .replace(/\s+([؟?؛:.,])/g, "$1")
  .replace(/([.،؛:?؟])\1+/g, "$1")
  .replace(/^[-–—•●▪◦.،؛:]+\s*/, "")
  // Remove isolated Latin uppercase letters embedded in Arabic words (font encoding artifacts)
  .replace(/([\u0600-\u06FF])[A-Z]([\u0600-\u06FF])/g, "$1$2")
  // Fix reversed Arabic words caused by RTL glyph extraction errors
  .replace(/(^|\s)يف(\s|$)/g, "$1في$2")
  .replace(/(^|\s)بف(\s|$)/g, "$1في$2")
  .trim()));

const countMatches = (value: string, pattern: RegExp) => (value.match(pattern) || []).length;

const stripLeadingMarker = (value: string) => normalizeLine(value.replace(LEADING_LIST_MARKER_PATTERN, ""));
const stripTrailingQuestionNumber = (value: string) => normalizeLine(value.replace(QUESTION_END_NUMBER_PATTERN, ""));
const stripOptionMarker = (value: string) => normalizeLine(
  value.replace(OPTION_MARKER_PATTERN, "").replace(TRAILING_OPTION_MARKER_PATTERN, ""),
);
const isQuestionLine = (value: string) => QUESTION_LINE_PATTERN.test(normalizeLine(value));
const isQuestionStartLine = (value: string) => {
  const normalized = normalizeLine(value);
  if (!normalized) return false;
  return QUESTION_START_PATTERN.test(normalized) || QUESTION_END_NUMBER_PATTERN.test(normalized);
};
const isOptionLine = (value: string) => {
  const normalized = normalizeLine(value);
  if (!normalized) return false;
  return OPTION_MARKER_PATTERN.test(normalized) || TRAILING_OPTION_MARKER_PATTERN.test(normalized);
};

const splitInlineOptions = (value: string) => {
  const normalized = normalizeLine(value);
  const firstMarkerIndex = normalized.search(OPTION_MARKER_ANYWHERE_PATTERN);

  if (firstMarkerIndex <= 0) {
    return { prompt: normalized, options: [] as string[] };
  }

  const prompt = normalizeLine(normalized.slice(0, firstMarkerIndex));
  const inlineOptionsSource = normalizeLine(normalized.slice(firstMarkerIndex));

  if (!prompt || !inlineOptionsSource) {
    return { prompt: normalized, options: [] as string[] };
  }

  const options = inlineOptionsSource
    .split(INLINE_OPTION_SPLIT_PATTERN)
    .map(stripOptionMarker)
    .filter(Boolean);

  if (options.length < 2) {
    return { prompt: normalized, options: [] as string[] };
  }

  return { prompt, options };
};

const shouldIgnoreLine = (value: string) => {
  const normalizedValue = normalizeLine(value);

  return !normalizedValue || NOISE_LINE_PATTERN.test(normalizedValue) || ANSWER_LINE_PATTERN.test(normalizedValue);
};

export const parseImportedQuestionsFromText = (text: string) => {
  const rawLines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(normalizeLine);

  const importedQuestions: ImportedQuestionDraft[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    // Skip empty/noise/answer lines
    if (shouldIgnoreLine(line)) {
      i++;
      continue;
    }

    // Accept if: has numeric marker OR ends with question/colon punctuation
    if (!isQuestionStartLine(line) && !isQuestionLine(line)) {
      i++;
      continue;
    }

    // Collect question text (may span multiple lines) until we find punctuation or reach options
    const questionParts: string[] = [stripTrailingQuestionNumber(stripLeadingMarker(line))];
    let j = i + 1;

    if (!isQuestionLine(questionParts[0])) {
      while (j < rawLines.length) {
        const nextLine = rawLines[j];

        if (!nextLine) {
          j++;
          continue;
        }

        // Stop if next numbered question starts
        if (isQuestionStartLine(nextLine)) break;
        // Stop if an option line starts (question hasn't ended yet but options shouldn't mix in)
        if (isOptionLine(nextLine)) break;

        questionParts.push(stripTrailingQuestionNumber(nextLine));
        j++;

        if (isQuestionLine(nextLine)) break;
      }
    }

    const prompt = questionParts.join(" ").trim();
    const inlineSplit = splitInlineOptions(prompt);
    const resolvedPrompt = inlineSplit.prompt;

    // Skip if empty or can't be a question
    if (!resolvedPrompt) {
      i++;
      continue;
    }

    // Collect options below the question
    const markedOptions: string[] = [...inlineSplit.options];

    while (j < rawLines.length) {
      const candidate = rawLines[j];

      if (!candidate) {
        j++;
        continue;
      }

      if (shouldIgnoreLine(candidate)) {
        j++;
        continue;
      }

      // Check option lines FIRST — options ending with "." would falsely match isQuestionLine
      if (isOptionLine(candidate)) {
        markedOptions.push(stripOptionMarker(candidate));
        j++;
        continue;
      }

      // Stop at the next numbered question or another question line
      if (isQuestionStartLine(candidate)) break;
      if (isQuestionLine(candidate)) break;

      // Non-option line after options started = end of options block
      if (markedOptions.length > 0) break;

      // Non-option line before options = skip
      j++;
    }

    // Only include if it has a question mark/punctuation OR has options
    if (!isQuestionLine(resolvedPrompt) && markedOptions.length === 0) {
      i++;
      continue;
    }

    importedQuestions.push({
      prompt: resolvedPrompt,
      type: markedOptions.length >= 2 ? "multiple" : "text",
      options: markedOptions.filter(
        (option, optionIndex, collection) => collection.findIndex((candidate) => candidate === option) === optionIndex,
      ),
    });

    i = j;
  }

  return importedQuestions.filter(
    (question, index, collection) => collection.findIndex((candidate) => candidate.prompt === question.prompt) === index,
  );
};

let pdfWorkerSourcePromise: Promise<string> | null = null;

const getPdfWorkerSource = () => {
  if (!pdfWorkerSourcePromise) {
    pdfWorkerSourcePromise = import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((module) => module.default);
  }

  return pdfWorkerSourcePromise;
};

const countEncodingArtifacts = (text: string) =>
  (text.match(/([\u0600-\u06FF])[A-Za-z]([\u0600-\u06FF])/g) || []).length +
  (text.match(/(^|\s)(يف|بف)(\s|$)/g) || []).length;

const chooseBestRowDirectionText = (parts: Array<{ x: number; text: string }>) => {
  // natural order = as returned by pdfjs (may already be logical Unicode order)
  const natural = normalizeLine(parts.map((part) => part.text).join(" "));
  const asc  = normalizeLine(parts.slice().sort((l, r) => l.x - r.x).map((p) => p.text).join(" "));
  const desc = normalizeLine(parts.slice().sort((l, r) => r.x - l.x).map((p) => p.text).join(" "));

  if (!asc && !desc) return natural;
  if (!asc) return desc;
  if (!desc) return asc;

  const arabicCount = countMatches(`${asc} ${desc}`, ARABIC_CHAR_PATTERN);
  const latinCount  = countMatches(`${asc} ${desc}`, LATIN_CHAR_PATTERN);
  // For Arabic-dominant rows, default direction is right-to-left (descending x)
  const baseline = arabicCount > latinCount ? desc : asc;

  // Pick the candidate with the fewest encoding artifacts
  return [natural, asc, desc].reduce((best, candidate) =>
    countEncodingArtifacts(candidate) < countEncodingArtifacts(best) ? candidate : best,
    baseline,
  );
};

const extractPdfPageLines = async (page: any) => {
  const content = await page.getTextContent();
  const rows: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];

  for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
    if (typeof item.str !== "string") {
      continue;
    }

    const text = normalizeLine(item.str);

    if (!text) {
      continue;
    }

    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = typeof transform[4] === "number" ? transform[4] : 0;
    const y = typeof transform[5] === "number" ? transform[5] : 0;
    const existingRow = rows.find((row) => Math.abs(row.y - y) <= 2.5);

    if (existingRow) {
      existingRow.parts.push({ x, text });
      continue;
    }

    rows.push({ y, parts: [{ x, text }] });
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => chooseBestRowDirectionText(row.parts))
    .map(normalizeLine)
    .filter(Boolean);
};

export interface ExtractedStudentRow {
  name: string;
  loginId: string;
}

export const extractStudentsFromPdf = async (file: File, existingLoginIds: string[] = []): Promise<ExtractedStudentRow[]> => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = await getPdfWorkerSource();

  const pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  const ARABIC_CHAR = /[\u0600-\u06FF]/g;
  const NOISE_LINE = /^(الاسم(\s+الرباعي)?(\s+ملاحظات)?|ملاحظات|م|رقم|#|no\.?)$/i;
  const PHONE = /^\d{7,}$/;

  const seen = new Set<string>();
  const students: ExtractedStudentRow[] = [];

  for (let p = 1; p <= pdfDocument.numPages; p++) {
    const page = await pdfDocument.getPage(p);
    const content = await page.getTextContent();

    // Group text items by Y coordinate (each table row = same Y)
    const rowMap: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];

    for (const item of (content.items as Array<{ str?: string; transform?: number[] }>)) {
      const raw = String(item.str ?? "").replace(/\s+/g, " ").trim();
      if (!raw) continue;
      const transform = Array.isArray(item.transform) ? item.transform : [];
      const x = typeof transform[4] === "number" ? transform[4] : 0;
      const y = typeof transform[5] === "number" ? transform[5] : 0;
      const existing = rowMap.find((r) => Math.abs(r.y - y) <= 3);
      if (existing) {
        existing.items.push({ x, text: raw });
      } else {
        rowMap.push({ y, items: [{ x, text: raw }] });
      }
    }

    // Sort rows top to bottom (descending Y in PDF space)
    rowMap.sort((a, b) => b.y - a.y);

    for (const row of rowMap) {
      // Join items right-to-left (descending X = Arabic RTL order)
      const line = row.items
        .slice()
        .sort((a, b) => b.x - a.x)
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!line) continue;

      // Separate Arabic name parts from potential loginId tokens
      const parts = line.split(/\s+/);
      const nonArabicParts = parts.filter((t) => {
        const ac = (t.match(ARABIC_CHAR) || []).length;
        return ac === 0 && t.length >= 3 && !PHONE.test(t);
      });
      const arabicParts = parts.filter((t) => (t.match(ARABIC_CHAR) || []).length > 0);

      const loginId = nonArabicParts[0] ?? "";
      const namePart = arabicParts.join(" ").replace(/\s+/g, " ").trim();

      if (!namePart) continue;

      // Must have at least 2 words
      if (namePart.split(/\s+/).filter(Boolean).length < 2) continue;

      // Must be mostly Arabic
      const arabicCount = (namePart.match(ARABIC_CHAR) || []).length;
      const totalChars = namePart.replace(/\s/g, "").length;
      if (totalChars === 0 || arabicCount / totalChars < 0.7) continue;

      // Skip headers / noise rows
      if (NOISE_LINE.test(namePart) || NOISE_LINE.test(line)) continue;

      if (seen.has(namePart)) continue;
      seen.add(namePart);
      students.push({ name: namePart, loginId });
    }
  }

  // If no student has a loginId, generate unique random 4-digit codes
  const anyHasLogin = students.some((s) => s.loginId);
  if (!anyHasLogin) {
    const usedCodes = new Set<string>(existingLoginIds);
    for (const student of students) {
      let code: string;
      do {
        code = String(Math.floor(1000 + Math.random() * 9000));
      } while (usedCodes.has(code));
      usedCodes.add(code);
      student.loginId = code;
    }
  }

  return students;
};

export const extractQuestionsFromPdf = async (file: File) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = await getPdfWorkerSource();

  const pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const collectedLines: string[] = [];
  const collectedRawChunks: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const lines = await extractPdfPageLines(page);
    collectedLines.push(...lines);

    const rawContent = await page.getTextContent();
    const rawChunk = (rawContent.items as Array<{ str?: string }>)
      .map((item) => normalizeLine(typeof item.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");

    if (rawChunk) {
      collectedRawChunks.push(rawChunk);
    }
  }

  const fromLines = parseImportedQuestionsFromText(collectedLines.join("\n"));
  const fromRaw = parseImportedQuestionsFromText(collectedRawChunks.join("\n"));
  const fromMerged = parseImportedQuestionsFromText(`${collectedLines.join("\n")}\n${collectedRawChunks.join("\n")}`);

  const scoreResult = (questions: ImportedQuestionDraft[]) => questions.reduce((score, question) => {
    const optionBonus = question.options.length * 0.4;
    const typeBonus = question.type === "multiple" ? 0.8 : 0;
    const promptArabicBonus = countMatches(question.prompt, ARABIC_CHAR_PATTERN) * 0.01;
    const allText = question.prompt + " " + question.options.join(" ");
    const artifactPenalty = countEncodingArtifacts(allText) * 0.5;
    return score + 1 + optionBonus + typeBonus + promptArabicBonus - artifactPenalty;
  }, 0);

  const candidates = [fromLines, fromRaw, fromMerged].filter((candidate) => candidate.length > 0);

  if (candidates.length === 0) {
    return [];
  }

  return candidates
    .map((candidate) => ({ candidate, score: scoreResult(candidate) }))
    .sort((left, right) => right.score - left.score)[0].candidate;
};
