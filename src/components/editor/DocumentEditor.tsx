import { Component, useEffect, useRef, useState } from "react";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import TipTapImage from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Extension, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Table as TableIcon,
  Columns3,
  Rows3,
  Undo2,
  Underline as UnderlineIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return {
      types: ["textStyle"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) {
                return {};
              }

              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const fontSizeOptions = ["12px", "14px", "16px", "18px", "22px", "26px", "32px"];

/**
 * Extension that allows deleting a table by:
 * 1. Pressing Backspace when cursor is at position 0 of a paragraph that immediately follows a table.
 * 2. Pressing Delete/Backspace when the entire table node is selected (node selection).
 */
const TableDeleteExtension = Extension.create({
  name: "tableDelete",
  addKeyboardShortcuts() {
    const deleteTableBefore = () => {
      const { state, dispatch } = this.editor.view;
      const { selection, doc } = state;
      const { $from } = selection;

      // Case 1: node selection covering a table → delete it
      if ((selection as { node?: { type: { name: string } } }).node?.type.name === "table") {
        const tr = state.tr.delete(selection.from, selection.to);
        dispatch(tr);
        return true;
      }

      // Case 2: cursor at offset 0 inside a block right after a table
      if ($from.parentOffset !== 0) return false;

      const nodeBefore = $from.nodeBefore;
      if (nodeBefore && nodeBefore.type.name === "table") {
        // cursor is inside a cell — let TipTap handle
        return false;
      }

      // Walk up to find if the immediate previous sibling of the parent block is a table
      const depth = $from.depth;
      for (let d = depth; d >= 0; d--) {
        const beforePos = $from.before(d + 1);
        if (beforePos <= 0) continue;
        const resolvedBefore = doc.resolve(beforePos - 1);
        const prevNode = resolvedBefore.nodeBefore;
        if (prevNode && prevNode.type.name === "table") {
          const tableStart = beforePos - 1 - prevNode.nodeSize;
          const tableEnd   = beforePos - 1;
          const tr = state.tr.delete(tableStart, tableEnd);
          dispatch(tr);
          return true;
        }
        break;
      }
      return false;
    };

    return {
      Backspace: deleteTableBefore,
      Delete: () => {
        const { state, dispatch } = this.editor.view;
        const { selection } = state;
        // Delete key: if a table node is selected, remove it
        if ((selection as { node?: { type: { name: string } } }).node?.type.name === "table") {
          const tr = state.tr.delete(selection.from, selection.to);
          dispatch(tr);
          return true;
        }
        return false;
      },
    };
  },
});

// ── Error Boundary ───────────────────────────────────────────────────────────
class EditorErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-right text-sm text-red-700">
          حدث خطأ في المحرر. يرجى تحديث الصفحة.
        </div>
      );
    }
    return this.props.children;
  }
}

const ResizableImageView = ({
  node,
  updateAttributes,
  selected,
  editor,
}: {
  node: { attrs: { src: string; alt?: string; width?: number | null; offsetX?: number | null; offsetY?: number | null } };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  selected: boolean;
  editor: { isEditable: boolean; options?: { editorProps?: { attributes?: Record<string, unknown> } } };
}) => {
  const [localWidth, setLocalWidth] = useState<number | null>((node.attrs.width as number) || null);
  const [localOffsetX, setLocalOffsetX] = useState<number>(node.attrs.offsetX ?? 0);
  const [localOffsetY, setLocalOffsetY] = useState<number>(node.attrs.offsetY ?? 0);
  const [hovered, setHovered] = useState(false);
  const [touched, setTouched] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imageEditingAttr = editor.options?.editorProps?.attributes?.["data-image-editing"];
  const canEditImage = editor.isEditable && imageEditingAttr !== "false";
  const showEditControls = canEditImage && (hovered || selected || touched);

  useEffect(() => {
    setLocalWidth((node.attrs.width as number) || null);
  }, [node.attrs.width]);

  useEffect(() => {
    setLocalOffsetX(node.attrs.offsetX ?? 0);
    setLocalOffsetY(node.attrs.offsetY ?? 0);
  }, [node.attrs.offsetX, node.attrs.offsetY]);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (!canEditImage) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startOffX = localOffsetX;
    const startOffY = localOffsetY;

    const onMouseMove = (ev: MouseEvent) => {
      setLocalOffsetX(startOffX + ev.clientX - startX);
      setLocalOffsetY(startOffY + ev.clientY - startY);
    };
    const onMouseUp = (ev: MouseEvent) => {
      const ox = Math.round(startOffX + ev.clientX - startX);
      const oy = Math.round(startOffY + ev.clientY - startY);
      setLocalOffsetX(ox);
      setLocalOffsetY(oy);
      updateAttributes({ offsetX: ox, offsetY: oy });
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleDragTouchStart = (e: React.TouchEvent) => {
    if (!canEditImage) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.touches[0].clientX;
    const startY = e.touches[0].clientY;
    const startOffX = localOffsetX;
    const startOffY = localOffsetY;

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      setLocalOffsetX(startOffX + ev.touches[0].clientX - startX);
      setLocalOffsetY(startOffY + ev.touches[0].clientY - startY);
    };
    const onTouchEnd = (ev: TouchEvent) => {
      const ox = Math.round(startOffX + ev.changedTouches[0].clientX - startX);
      const oy = Math.round(startOffY + ev.changedTouches[0].clientY - startY);
      setLocalOffsetX(ox);
      setLocalOffsetY(oy);
      updateAttributes({ offsetX: ox, offsetY: oy });
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
  };

  const commitResize = (nextWidth: number, nextOffsetX?: number) => {
    const roundedWidth = Math.max(80, Math.round(nextWidth));
    setLocalWidth(roundedWidth);
    if (typeof nextOffsetX === "number") {
      const roundedOffsetX = Math.round(nextOffsetX);
      setLocalOffsetX(roundedOffsetX);
      updateAttributes({ width: roundedWidth, offsetX: roundedOffsetX });
      return;
    }
    updateAttributes({ width: roundedWidth });
  };

  const handleResizeMouseDown = (edge: "left" | "right") => (e: React.MouseEvent) => {
    if (!canEditImage) return;
    e.preventDefault();
    e.stopPropagation();

    const renderedWidth = imgRef.current?.getBoundingClientRect().width;
    const startWidth = localWidth || renderedWidth || node.attrs.width || 240;
    const startX = e.clientX;
    const startOffsetX = localOffsetX;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const nextWidth = edge === "left" ? startWidth - dx : startWidth + dx;

      if (edge === "left") {
        const clampedWidth = Math.max(80, nextWidth);
        const nextOffsetX = startOffsetX + (startWidth - clampedWidth);
        setLocalWidth(Math.round(clampedWidth));
        setLocalOffsetX(Math.round(nextOffsetX));
        return;
      }

      setLocalWidth(Math.round(Math.max(80, nextWidth)));
    };

    const onMouseUp = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const nextWidth = edge === "left" ? startWidth - dx : startWidth + dx;

      if (edge === "left") {
        const clampedWidth = Math.max(80, nextWidth);
        const nextOffsetX = startOffsetX + (startWidth - clampedWidth);
        commitResize(clampedWidth, nextOffsetX);
      } else {
        commitResize(nextWidth);
      }

      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleResizeTouchStart = (edge: "left" | "right") => (e: React.TouchEvent) => {
    if (!canEditImage) return;
    e.preventDefault();
    e.stopPropagation();

    const renderedWidth = imgRef.current?.getBoundingClientRect().width;
    const startWidth = localWidth || renderedWidth || node.attrs.width || 240;
    const startX = e.touches[0].clientX;
    const startOffsetX = localOffsetX;

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const dx = ev.touches[0].clientX - startX;
      const nextWidth = edge === "left" ? startWidth - dx : startWidth + dx;

      if (edge === "left") {
        const clampedWidth = Math.max(80, nextWidth);
        const nextOffsetX = startOffsetX + (startWidth - clampedWidth);
        setLocalWidth(Math.round(clampedWidth));
        setLocalOffsetX(Math.round(nextOffsetX));
        return;
      }

      setLocalWidth(Math.round(Math.max(80, nextWidth)));
    };

    const onTouchEnd = (ev: TouchEvent) => {
      const dx = ev.changedTouches[0].clientX - startX;
      const nextWidth = edge === "left" ? startWidth - dx : startWidth + dx;

      if (edge === "left") {
        const clampedWidth = Math.max(80, nextWidth);
        const nextOffsetX = startOffsetX + (startWidth - clampedWidth);
        commitResize(clampedWidth, nextOffsetX);
      } else {
        commitResize(nextWidth);
      }

      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
  };

  const displayWidth = localWidth || node.attrs.width;

  return (
    <NodeViewWrapper
      as="span"
      style={{
        display: "inline-block",
        position: "relative",
        maxWidth: "100%",
        width: displayWidth ? `${displayWidth}px` : "auto",
        verticalAlign: "bottom",
        transform: `translate(${localOffsetX}px, ${localOffsetY}px)`,
        zIndex: showEditControls ? 10 : "auto",
      }}
    >
      <span
        ref={containerRef}
        style={{ display: "block", position: "relative" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={() => { if (canEditImage) setTouched(true); }}
        onTouchEnd={() => setTimeout(() => setTouched(false), 1500)}
      >
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ""}
          style={{
            display: "block", width: "100%", height: "auto",
            borderRadius: "0.5rem", userSelect: "none",
            cursor: canEditImage ? "move" : "default",
            outline: showEditControls ? "1.5px dashed #0ea5e9" : "none",
            outlineOffset: "2px",
          }}
          draggable={false}
          onMouseDown={handleDragMouseDown}
          onTouchStart={handleDragTouchStart}
        />
        {showEditControls && (
          <>
            <span
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                right: -8,
                width: 16,
                cursor: "ew-resize",
                zIndex: 15,
                background: "transparent",
              }}
              onMouseDown={handleResizeMouseDown("right")}
              onTouchStart={handleResizeTouchStart("right")}
            />
            <span
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: -8,
                width: 16,
                cursor: "ew-resize",
                zIndex: 15,
                background: "transparent",
              }}
              onMouseDown={handleResizeMouseDown("left")}
              onTouchStart={handleResizeTouchStart("left")}
            />
          </>
        )}
      </span>
    </NodeViewWrapper>
  );
};

const imageBaseAttrs = () => ({
  width: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("width") ? Number(el.getAttribute("width")) : null, renderHTML: (attrs: { width?: number | null }) => attrs.width ? { width: String(attrs.width) } : {} },
  offsetX: {
    default: 0,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-offset-x") ? Number(el.getAttribute("data-offset-x")) : 0,
    renderHTML: (attrs: { offsetX?: number | null }) => attrs.offsetX ? { "data-offset-x": String(attrs.offsetX) } : {},
  },
  offsetY: {
    default: 0,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-offset-y") ? Number(el.getAttribute("data-offset-y")) : 0,
    renderHTML: (attrs: { offsetY?: number | null }) => attrs.offsetY ? { "data-offset-y": String(attrs.offsetY) } : {},
  },
});

/**
 * Full resizable/movable image for admins (uses ReactNodeViewRenderer).
 */
const ResizableImage = TipTapImage.configure({ allowBase64: true }).extend({
  inline() { return true; },
  group() { return "inline"; },
  draggable: false,
  addAttributes() { return { ...this.parent?.(), ...imageBaseAttrs() }; },
  addNodeView() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ReactNodeViewRenderer(ResizableImageView as any);
  },
});

/**
 * Read-only image extension for student view — no NodeView, renders as a
 * plain <img> so images always appear regardless of TipTap editable state.
 * Images cannot be deleted via keyboard or selection.
 */
const StudentImage = TipTapImage.configure({ allowBase64: true }).extend({
  inline() { return true; },
  group() { return "inline"; },
  draggable: false,
  selectable: false,
  addAttributes() { return { ...this.parent?.(), ...imageBaseAttrs() }; },
  renderHTML({ HTMLAttributes }) {
    const { width, offsetX: _ox, offsetY: _oy, ...rest } = HTMLAttributes as Record<string, unknown>;
    return ["img", {
      ...rest,
      ...(width ? { width: String(width) } : {}),
      style: `max-width:100%;height:auto;display:inline-block;border-radius:0.5rem;vertical-align:bottom;margin:0.35rem;${width ? `width:${width}px;` : ""}`,
    }];
  },
  addKeyboardShortcuts() {
    // Block Backspace and Delete from removing image nodes
    const preventImageDelete = () => {
      const { state } = this.editor.view;
      const { selection, doc } = state;
      // Block if an image is directly selected
      const selectedNode = (selection as { node?: { type: { name: string } } }).node;
      if (selectedNode?.type.name === "image") return true;
      // Block Backspace if the character before cursor is an image
      const { $from } = selection;
      const nodeBefore = $from.nodeBefore;
      if (nodeBefore?.type.name === "image") return true;
      // Block Delete if the character after cursor is an image
      const { $to } = selection;
      const nodeAfter = doc.resolve($to.pos).nodeAfter;
      if (nodeAfter?.type.name === "image") return true;
      return false;
    };
    return {
      Backspace: preventImageDelete,
      Delete: preventImageDelete,
    };
  },
  addProseMirrorPlugins() {
    // Transaction-level guard: reject any transaction that removes image nodes.
    // This catches select-all + delete, cut, drag-drop, etc.
    return [
      new Plugin({
        key: new PluginKey("protect-student-images"),
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true;
          // Count images before and after
          let before = 0;
          let after = 0;
          state.doc.descendants((node) => { if (node.type.name === "image") before++; });
          tr.doc.descendants((node) => { if (node.type.name === "image") after++; });
          // Block the transaction if it would remove any image
          return after >= before;
        },
      }),
    ];
  },
});

interface DocumentEditorProps {
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  allowImageEditing?: boolean;
  className?: string;
  pageClassName?: string;
}

const SHARED_FONT_STACK = '"Tajawal", "Amiri", "Segoe UI", Tahoma, Arial, sans-serif';

const isPortableImageSrc = (src: string) => {
  const lowerSrc = src.trim().toLowerCase();
  return lowerSrc.startsWith("data:") || lowerSrc.startsWith("http://") || lowerSrc.startsWith("https://") || lowerSrc.startsWith("/");
};

const hasNonPortableImagesInHtml = (rawHtml: string) => {
  if (!rawHtml || typeof DOMParser === "undefined") {
    return false;
  }

  const parsed = new DOMParser().parseFromString(rawHtml, "text/html");
  return Array.from(parsed.body.querySelectorAll<HTMLImageElement>("img")).some((image) => !isPortableImageSrc(image.getAttribute("src") ?? ""));
};

const normalizeDocumentHtml = (rawHtml: string) => {
  if (!rawHtml || typeof DOMParser === "undefined") {
    return rawHtml || "<p></p>";
  }

  const parsed = new DOMParser().parseFromString(rawHtml, "text/html");

  parsed.body.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const style = element.getAttribute("style") ?? "";
    const normalizedStyle = style
      .replace(/(?:^|;)\s*font-family\s*:[^;]*/gi, "")
      .replace(/(?:^|;)\s*font\s*:[^;]*/gi, "")
      .replace(/^;|;;+/g, ";")
      .trim();

    if (!normalizedStyle) {
      element.removeAttribute("style");
      return;
    }

    element.setAttribute("style", normalizedStyle);
  });

  return parsed.body.innerHTML || "<p></p>";
};

// Removes images whose src cannot be accessed by other users/devices.
// Only called during paste processing — never during normal editing.
const stripNonPortableImages = (rawHtml: string) => {
  if (!rawHtml || typeof DOMParser === "undefined") return rawHtml || "<p></p>";
  const parsed = new DOMParser().parseFromString(rawHtml, "text/html");
  parsed.body.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const src = (image.getAttribute("src") ?? "").trim();
    if (!isPortableImageSrc(src)) image.remove();
  });
  return parsed.body.innerHTML || "<p></p>";
};

const compressImageFileToDataUrl = async (file: File) => {
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!rawDataUrl) {
        resolve("");
        return;
      }

      const image = new window.Image();
      image.onload = () => {
        const MAX_W = 900;
        const scale = image.width > MAX_W ? MAX_W / image.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };

      image.onerror = () => resolve(rawDataUrl);
      image.src = rawDataUrl;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
};

const replaceNonPortableImagesInHtml = async (rawHtml: string, imageFiles: File[]) => {
  if (!rawHtml || typeof DOMParser === "undefined") {
    return rawHtml;
  }

  const parsed = new DOMParser().parseFromString(rawHtml, "text/html");
  const nonPortableImages = Array.from(parsed.body.querySelectorAll<HTMLImageElement>("img")).filter(
    (image) => !isPortableImageSrc(image.getAttribute("src") ?? ""),
  );

  if (nonPortableImages.length === 0 || imageFiles.length === 0) {
    return rawHtml;
  }

  const mappedCount = Math.min(nonPortableImages.length, imageFiles.length);

  for (let index = 0; index < mappedCount; index += 1) {
    const dataUrl = await compressImageFileToDataUrl(imageFiles[index]);

    if (!dataUrl) {
      continue;
    }

    nonPortableImages[index].setAttribute("src", dataUrl);
  }

  return parsed.body.innerHTML;
};

const ToolbarButton = ({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) => (
  <Button
    type="button"
    variant="outline"
    size="icon"
    title={title}
    className={cn("h-9 w-9 rounded-xl bg-white", active && "border-primary bg-primary/10 text-primary")}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </Button>
);

const DocumentEditor = ({ value, onChange, editable = true, allowImageEditing = true, className, pageClassName }: DocumentEditorProps) => {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  // A4 = 794px, toolbar ≈ 56px (44px + 12px gap) when editable.
  const A4_PX = 794;
  const MOBILE_BREAKPOINT_PX = 768;
  const computeZoom = (el: HTMLElement) => {
    if (typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      return 1;
    }

    const style = getComputedStyle(el);
    const innerWidth =
      el.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    return innerWidth > 0 && innerWidth < A4_PX ? innerWidth / A4_PX : 1;
  };
  const [contentZoom, setContentZoom] = useState(1);
  const insertImageDataUrl = (dataUrl: string, alt = "", insertPos?: number) => {
    if (!editor || !dataUrl) {
      return;
    }

    const chain = editor.chain().focus();

    if (typeof insertPos === "number") {
      chain.setTextSelection(insertPos);
    } else {
      const editorDom = editor.view.dom as HTMLElement;
      if (!editorDom.contains(document.activeElement)) {
        chain.setTextSelection(editor.state.doc.content.size);
      }
    }

    const maxEditorContentWidth = Math.max(120, (editor.view.dom as HTMLElement).clientWidth - 32);
    const initialWidth = Math.min(560, maxEditorContentWidth);
    chain.setImage({ src: dataUrl, alt, width: Math.round(initialWidth), offsetX: 0, offsetY: 0 }).run();
  };

  const insertImageFile = async (file: File, insertPos?: number) => {
    if (!editor || !allowImageEditing) {
      return;
    }

    const dataUrl = await compressImageFileToDataUrl(file);
    if (!dataUrl) {
      return;
    }

    insertImageDataUrl(dataUrl, file.name, insertPos);
  };

  const insertTableOutsideCurrentTable = () => {
    if (!editor) {
      return;
    }

    if (!editor.isActive("table")) {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return;
    }

    const { state } = editor;
    const selectionFrom = state.selection.from;
    let tableStart: number | null = null;
    let tableEnd: number | null = null;

    state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
      if (node.type.name !== "table") {
        return;
      }

      const end = pos + node.nodeSize;
      if (pos <= selectionFrom && selectionFrom <= end) {
        // Keep the nearest containing table if multiple matches exist.
        if (tableStart === null || pos >= tableStart) {
          tableStart = pos;
          tableEnd = end;
        }
      }
    });

    if (tableEnd === null) {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return;
    }

    editor.chain().focus().setTextSelection(tableEnd).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ image: false, dropcursor: false }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      TableDeleteExtension,
      // Use simple plain-HTML image extension for student view so images always show.
      // Use full resizable NodeView only when the admin is editing.
      allowImageEditing ? ResizableImage : StudentImage,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "word-document-prosemirror",
        dir: "rtl",
        style: `width:210mm;min-height:297mm;margin:0 auto;background:#ffffff;box-shadow:0 4px 24px rgba(15,23,42,0.18);border-radius:2px;padding:20mm 25mm;color:#0f172a;font-size:14px;line-height:1.9;text-align:right;direction:rtl;outline:none;display:block;box-sizing:border-box;font-family:${SHARED_FONT_STACK};`,
        "data-image-editing": allowImageEditing ? "true" : "false",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const normalizedHtml = normalizeDocumentHtml(currentEditor.getHTML());

      if (normalizedHtml !== currentEditor.getHTML()) {
        currentEditor.commands.setContent(normalizedHtml, false);
      }

      onChange?.(normalizedHtml);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentHtml = editor.getHTML();
    const nextValue = value || "<p></p>";

    if (currentHtml !== nextValue) {
      editor.commands.setContent(nextValue, false);
    }

    editor.setEditable(editable);
  }, [editable, editor, value]);

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !editor || !allowImageEditing) {
      return;
    }

    await insertImageFile(file);

    event.target.value = "";
  };

  const isDisabled = !editor || !editable;

  // ── Mobile scaling ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const update = () => setContentZoom(computeZoom(el));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  // ── Table resize handles ─────────────────────────────────────────────────
  useEffect(() => {
    if (!editor || !editable) return;
    const editorEl = editor.view.dom as HTMLElement;
    const ATTR = "data-tbl-handles";

    type Dir = "se"|"sw"|"ne"|"nw"|"e"|"w"|"n"|"s";
    const CURSORS: Record<Dir,string> = {
      se:"se-resize", sw:"sw-resize", ne:"ne-resize", nw:"nw-resize",
      e:"e-resize", w:"w-resize", n:"n-resize", s:"s-resize",
    };
    const POSITIONS: Record<Dir, string> = {
      nw: "top:0;left:0;width:16px;height:16px",
      ne: "top:0;right:0;width:16px;height:16px",
      sw: "bottom:0;left:0;width:16px;height:16px",
      se: "bottom:0;right:0;width:16px;height:16px",
      n:  "top:0;left:16px;right:16px;height:10px",
      s:  "bottom:0;left:16px;right:16px;height:10px",
      w:  "top:16px;left:0;bottom:16px;width:10px",
      e:  "top:16px;right:0;bottom:16px;width:10px",
    };

    const injectHandle = (wrapper: HTMLElement) => {
      if (wrapper.getAttribute(ATTR)) return;
      wrapper.setAttribute(ATTR, "1");
      wrapper.style.position = "relative";

      (Object.keys(CURSORS) as Dir[]).forEach((dir) => {
        const span = document.createElement("span");
        span.style.cssText = `position:absolute;${POSITIONS[dir]};cursor:${CURSORS[dir]};background:transparent;z-index:20;`;

        span.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const startW = wrapper.offsetWidth;
          const startH = wrapper.offsetHeight;
          const isLeft = dir==="sw"||dir==="nw"||dir==="w";
          const isTop  = dir==="ne"||dir==="nw"||dir==="n";
          const isVert = dir==="n"||dir==="s";

          const calc = (ev: MouseEvent) => {
            if (isVert) {
              const dy = ev.clientY - startY;
              return { w: startW, h: Math.max(40, Math.round(isTop ? startH - dy : startH + dy)) };
            }
            const dx = ev.clientX - startX;
            return { w: Math.max(80, Math.round(isLeft ? startW - dx : startW + dx)), h: startH };
          };

          const onMove = (ev: MouseEvent) => {
            const { w, h } = calc(ev);
            wrapper.style.width = `${w}px`;
            wrapper.style.maxWidth = `${w}px`;
            wrapper.style.minHeight = h > startH || isVert ? `${h}px` : "";
          };
          const onUp = (ev: MouseEvent) => {
            const { w, h } = calc(ev);
            wrapper.style.width = `${w}px`;
            wrapper.style.maxWidth = `${w}px`;
            wrapper.style.minHeight = h > startH || isVert ? `${h}px` : "";
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });

        wrapper.appendChild(span);
      });
    };

    const processAll = () => {
      editorEl.querySelectorAll<HTMLElement>(".tableWrapper").forEach(injectHandle);
    };

    processAll();
    const observer = new MutationObserver(processAll);
    observer.observe(editorEl, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !allowImageEditing || !editable) {
      return;
    }

    const editorDom = editor.view.dom as HTMLElement;

    const handlePaste = (event: ClipboardEvent) => {
      const html = event.clipboardData?.getData("text/html") ?? "";
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageFiles = items
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      const hasWordHtmlWithImages = Boolean(html) && hasNonPortableImagesInHtml(html);

      if (hasWordHtmlWithImages) {
        event.preventDefault();
        void (async () => {
          const htmlWithEmbeddedImages = await replaceNonPortableImagesInHtml(html, imageFiles);
          const normalizedHtml = stripNonPortableImages(normalizeDocumentHtml(htmlWithEmbeddedImages));
          editor.chain().focus().insertContent(normalizedHtml).run();
        })();
        return;
      }

      const file = imageFiles[0];

      if (!file) {
        return;
      }

      event.preventDefault();
      void insertImageFile(file);
    };

    const handleDrop = (event: DragEvent) => {
      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      const imageFile = droppedFiles.find((file) => file.type.startsWith("image/"));

      if (!imageFile) {
        return;
      }

      event.preventDefault();
      const posAtCoords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      void insertImageFile(imageFile, posAtCoords?.pos);
    };

    editorDom.addEventListener("paste", handlePaste);
    editorDom.addEventListener("drop", handleDrop);

    return () => {
      editorDom.removeEventListener("paste", handlePaste);
      editorDom.removeEventListener("drop", handleDrop);
    };
  }, [allowImageEditing, editable, editor]);

  return (
    <div className={cn("word-document-shell", className)}>
      {/* Force table borders regardless of TipTap default CSS */}
      <style>{`
        .word-document-prosemirror table { border-collapse: collapse !important; width: 100% !important; table-layout: fixed !important; display: table !important; }
        .word-document-prosemirror td,
        .word-document-prosemirror th { border: 2px solid #334155 !important; border-color: #334155 !important; padding: 0.6rem !important; word-break: break-word !important; white-space: pre-wrap !important; overflow-wrap: break-word !important; }
        .word-document-prosemirror th { background: #ffffff !important; font-weight: 700 !important; }
        .word-document-prosemirror td { background: #fff !important; }
        .word-document-prosemirror .tableWrapper { position: relative; display: block; margin: 0.5rem 0; overflow-x: auto; overflow-y: visible; }
        /* A4 page break indicator lines every 297mm */
        .word-document-prosemirror {
          background-image: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent calc(297mm - 1px),
            #94a3b8 calc(297mm - 1px),
            #94a3b8 297mm
          ) !important;
        }
      `}</style>

      <div
        ref={pageRef}
        className={cn("word-document-page", !editable && "word-document-page-readonly", pageClassName)}
      >
        <div className="word-document-shell-inner" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "0.5rem", direction: "ltr" }}>
          {editable && editor && (
            <div className="word-document-toolbar-horizontal word-document-toolbar-slot word-document-toolbar-top">
              <div className="word-document-toolbar-row-horizontal">
                {/* Undo/Redo — always visible */}
                <ToolbarButton title="تراجع" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 className="size-4" /></ToolbarButton>
                <ToolbarButton title="إعادة" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 className="size-4" /></ToolbarButton>
                {/* Formatting tools — hidden on mobile (moved to bottom toolbar) */}
                <div className="word-document-toolbar-separator-h word-document-toolbar-desktop-only" />
                <ToolbarButton title="غامق" className="word-document-toolbar-desktop-only" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
                <ToolbarButton title="مائل" className="word-document-toolbar-desktop-only" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
                <ToolbarButton title="تسطير" className="word-document-toolbar-desktop-only" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h word-document-toolbar-desktop-only" />
                <ToolbarButton title="محاذاة لليمين" className="word-document-toolbar-desktop-only" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="size-4" /></ToolbarButton>
                <ToolbarButton title="محاذاة للوسط" className="word-document-toolbar-desktop-only" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="size-4" /></ToolbarButton>
                <ToolbarButton title="محاذاة لليسار" className="word-document-toolbar-desktop-only" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h word-document-toolbar-desktop-only" />
                <ToolbarButton title="قائمة نقطية" className="word-document-toolbar-desktop-only" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolbarButton>
                <ToolbarButton title="قائمة مرقمة" className="word-document-toolbar-desktop-only" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h word-document-toolbar-desktop-only" />
                <span className="relative shrink-0 inline-flex word-document-toolbar-desktop-only">
                  <input
                    ref={colorInputRef}
                    type="color"
                    className="absolute bottom-0 left-1/2 h-px w-px -translate-x-1/2 opacity-0 pointer-events-none"
                    defaultValue="#0f172a"
                    onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
                  />
                  <button
                    type="button"
                    title="لون النص"
                    className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-border bg-white hover:bg-muted/50"
                    onClick={() => colorInputRef.current?.click()}
                  >
                    <span className="text-sm font-bold" style={{ color: (editor.getAttributes("textStyle").color as string) || "#0f172a" }}>أ</span>
                    <span className="absolute bottom-1 left-1 right-1 h-1 rounded-full" style={{ background: (editor.getAttributes("textStyle").color as string) || "#0f172a" }} />
                  </button>
                </span>
                <select
                  title="حجم الخط"
                  className="h-9 w-9 rounded-xl border border-border bg-white text-xs text-center cursor-pointer word-document-toolbar-desktop-only"
                  value={(editor.getAttributes("textStyle").fontSize as string) || "16px"}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue) editor.chain().focus().setFontSize(nextValue).run();
                  }}
                >
                  {fontSizeOptions.map((option) => (
                    <option key={option} value={option}>{option.replace("px", "")}</option>
                  ))}
                </select>
                <ToolbarButton title="مسح التنسيق" className="word-document-toolbar-desktop-only" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h word-document-toolbar-desktop-only" />
                {allowImageEditing && (
                  <>
                    <button
                      type="button"
                      title="إدراج صورة"
                      className="shrink-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-white hover:bg-muted/50 word-document-toolbar-desktop-only"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImagePlus className="size-4" />
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => void handleImageSelect(event)}
                    />
                  </>
                )}
                <ToolbarButton title="إضافة جدول" className="word-document-toolbar-desktop-only" onClick={insertTableOutsideCurrentTable} disabled={isDisabled}><TableIcon className="size-4" /></ToolbarButton>
                <ToolbarButton title="إضافة صف" className="word-document-toolbar-desktop-only" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={isDisabled}><Rows3 className="size-4" /></ToolbarButton>
                <ToolbarButton title="إضافة عمود" className="word-document-toolbar-desktop-only" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={isDisabled}><Columns3 className="size-4" /></ToolbarButton>
              </div>
            </div>
          )}
          <div
            className="word-document-page-slot"
            style={
              contentZoom < 1
                ? {
                    // transform: scale() works on iOS Safari; zoom does not.
                    // We scale from top-center so the page stays centered.
                    transform: `scale(${contentZoom})`,
                    transformOrigin: "top center",
                    // Collapse the extra whitespace that scale() leaves behind
                    // (the element keeps its original layout size after scaling).
                    marginBottom: `calc((${contentZoom} - 1) * 100%)`,
                  }
                : undefined
            }
          >
          <EditorContent editor={editor} className="word-document-content" />
          </div>
          {editable && editor && (
            <div className="word-document-toolbar-horizontal word-document-toolbar-slot word-document-toolbar-bottom">
              <div className="word-document-toolbar-row-horizontal">
                {/* Undo/Redo — only shown here on mobile (top toolbar hidden) */}
                <ToolbarButton title="تراجع" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 className="size-4" /></ToolbarButton>
                <ToolbarButton title="إعادة" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h" />
                <ToolbarButton title="غامق" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
                <ToolbarButton title="مائل" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
                <ToolbarButton title="تسطير" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h" />
                <ToolbarButton title="محاذاة لليمين" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="size-4" /></ToolbarButton>
                <ToolbarButton title="محاذاة للوسط" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="size-4" /></ToolbarButton>
                <ToolbarButton title="محاذاة لليسار" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h" />
                <ToolbarButton title="قائمة نقطية" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolbarButton>
                <ToolbarButton title="قائمة مرقمة" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h" />
                <span className="relative shrink-0 inline-flex">
                  <button
                    type="button"
                    title="لون النص"
                    className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-border bg-white hover:bg-muted/50"
                    onClick={() => colorInputRef.current?.click()}
                  >
                    <span className="text-sm font-bold" style={{ color: (editor.getAttributes("textStyle").color as string) || "#0f172a" }}>أ</span>
                    <span className="absolute bottom-1 left-1 right-1 h-1 rounded-full" style={{ background: (editor.getAttributes("textStyle").color as string) || "#0f172a" }} />
                  </button>
                </span>
                <select
                  title="حجم الخط"
                  className="h-9 w-14 rounded-xl border border-border bg-white text-xs text-center cursor-pointer"
                  value={(editor.getAttributes("textStyle").fontSize as string) || "16px"}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue) editor.chain().focus().setFontSize(nextValue).run();
                  }}
                >
                  {fontSizeOptions.map((option) => (
                    <option key={option} value={option}>{option.replace("px", "")}</option>
                  ))}
                </select>
                <ToolbarButton title="مسح التنسيق" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="size-4" /></ToolbarButton>
                <div className="word-document-toolbar-separator-h" />
                <ToolbarButton title="إضافة جدول" onClick={insertTableOutsideCurrentTable} disabled={isDisabled}><TableIcon className="size-4" /></ToolbarButton>
                <ToolbarButton title="إضافة صف" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={isDisabled}><Rows3 className="size-4" /></ToolbarButton>
                <ToolbarButton title="إضافة عمود" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={isDisabled}><Columns3 className="size-4" /></ToolbarButton>
                {allowImageEditing && (
                  <>
                    <div className="word-document-toolbar-separator-h" />
                    <button
                      type="button"
                      title="إدراج صورة"
                      className="shrink-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-white hover:bg-muted/50"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImagePlus className="size-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DocumentEditorWithBoundary = (props: DocumentEditorProps) => (
  <EditorErrorBoundary>
    <DocumentEditor {...props} />
  </EditorErrorBoundary>
);

export default DocumentEditorWithBoundary;
