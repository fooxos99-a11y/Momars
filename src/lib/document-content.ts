const stripHtmlTags = (value: string) => value
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

export const getDocumentPlainText = (value: string) => {
  if (!value) {
    return "";
  }

  if (typeof DOMParser === "undefined") {
    return stripHtmlTags(value);
  }

  const parsed = new DOMParser().parseFromString(value, "text/html");
  return (parsed.body.textContent ?? "").replace(/\s+/g, " ").trim();
};

export const hasMeaningfulDocumentContent = (value: string) => {
  const plainText = getDocumentPlainText(value);

  if (plainText) {
    return true;
  }

  return /<(img|table|ul|ol|blockquote|hr)\b/i.test(value);
};

export const getDocumentPreviewText = (value: string, maxLength = 180) => {
  const plainText = getDocumentPlainText(value);

  if (!plainText) {
    return "";
  }

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength).trim()}...`;
};