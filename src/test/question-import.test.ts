import { describe, expect, it } from "vitest";

import { parseImportedQuestionsFromText } from "@/lib/question-import";

describe("parseImportedQuestionsFromText", () => {
  it("extracts only question lines ending with a question mark and keeps options without importing answer lines", () => {
    const importedQuestions = parseImportedQuestionsFromText(`
      1) ما عدد أركان الإسلام؟
      أ) ثلاثة
      ب) خمسة
      ج) سبعة
      الإجابة الصحيحة: خمسة

      هذا السطر ليس سؤالا

      2) اذكر فضل طلب العلم؟

      3) ما عاصمة المملكة؟
      أ) جدة
      ب) الرياض
    `);

    expect(importedQuestions).toEqual([
      {
        prompt: "ما عدد أركان الإسلام؟",
        type: "multiple",
        options: ["ثلاثة", "خمسة", "سبعة"],
      },
      {
        prompt: "اذكر فضل طلب العلم؟",
        type: "text",
        options: [],
      },
      {
        prompt: "ما عاصمة المملكة؟",
        type: "multiple",
        options: ["جدة", "الرياض"],
      },
    ]);
  });

  it("extracts Arabic-numbered questions with colon endings and parenthesized Arabic options", () => {
    const importedQuestions = parseImportedQuestionsFromText(`
      الاسم (اختياري): ................. الحلقة: ................. التاريخ: ...... / ...... / 1447هـ
      التعليمات: اختر الإجابة الصحيحة لكل سؤال بوضع علامة (✓) أمامها.

      ١. وجد الباحث جون هاتي أن أهم عامل مؤثر في تعلم الطالب هو:
      (أ) حجم الفصل وعدد الطلاب.
      (ب) كمية الواجبات المنزلية.
      (ج) العلاقة بين المعلم والطالب.
      (د) جودة المنهج الدراسي.

      ٢. ما أعلى مستوى في مستويات التواصل الأربعة مع ولي الأمر؟
      (أ) الإبلاغ.
      (ب) التشاور.
      (ج) التنسيق.
      (د) الشراكة.
    `);

    expect(importedQuestions).toEqual([
      {
        prompt: "وجد الباحث جون هاتي أن أهم عامل مؤثر في تعلم الطالب هو:",
        type: "multiple",
        options: [
          "حجم الفصل وعدد الطلاب.",
          "كمية الواجبات المنزلية.",
          "العلاقة بين المعلم والطالب.",
          "جودة المنهج الدراسي.",
        ],
      },
      {
        prompt: "ما أعلى مستوى في مستويات التواصل الأربعة مع ولي الأمر؟",
        type: "multiple",
        options: ["الإبلاغ.", "التشاور.", "التنسيق.", "الشراكة."],
      },
    ]);
  });

  it("extracts inline options when they are on the same question line", () => {
    const importedQuestions = parseImportedQuestionsFromText(`
      1) وجد الباحث أن أهم عامل مؤثر في تعلم الطالب هو: (أ) حجم الفصل وعدد الطلاب. (ب) كمية الواجبات المنزلية. (ج) العلاقة بين المعلم والطالب. (د) جودة المنهج الدراسي.
    `);

    expect(importedQuestions).toEqual([
      {
        prompt: "وجد الباحث أن أهم عامل مؤثر في تعلم الطالب هو:",
        type: "multiple",
        options: [
          "حجم الفصل وعدد الطلاب.",
          "كمية الواجبات المنزلية.",
          "العلاقة بين المعلم والطالب.",
          "جودة المنهج الدراسي.",
        ],
      },
    ]);
  });

  it("extracts options when markers appear at the end of each option line", () => {
    const importedQuestions = parseImportedQuestionsFromText(`
      2) ما أعلى مستوى في مستويات التواصل الأربعة مع ولي الأمر؟
      الإبلاغ. (أ)
      التشاور. (ب)
      التنسيق. (ج)
      الشراكة. (د)
    `);

    expect(importedQuestions).toEqual([
      {
        prompt: "ما أعلى مستوى في مستويات التواصل الأربعة مع ولي الأمر؟",
        type: "multiple",
        options: ["الإبلاغ.", "التشاور.", "التنسيق.", "الشراكة."],
      },
    ]);
  });
});