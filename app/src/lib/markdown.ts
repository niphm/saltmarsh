/**
 * Markdown -> sanitized HTML for the notes preview. marked and DOMPurify are
 * loaded on first use so they stay out of the main bundle.
 */
let renderer: Promise<(md: string) => string> | undefined;

export function loadMarkdown(): Promise<(md: string) => string> {
  renderer ??= Promise.all([import("marked"), import("dompurify")]).then(([{ marked }, { default: DOMPurify }]) => {
    DOMPurify.addHook("afterSanitizeAttributes", node => {
      // Links open in a new tab so following one doesn't leave the app mid-session.
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
      // Images written as raw HTML may lack alt text; treat them as decorative rather than unlabeled.
      if (node.tagName === "IMG" && !node.hasAttribute("alt")) node.setAttribute("alt", "");
    });
    return (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false, gfm: true, breaks: true }));
  });
  return renderer;
}
