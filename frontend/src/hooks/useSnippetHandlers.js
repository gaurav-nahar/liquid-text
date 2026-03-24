export default function useSnippetHandlers({ tool, TOOL_MODES, pdfRef, workspaceRef, setSnippets, setConnections, screenToWorld, getScale, recordHistory, getSnapshot, showToast }) {
  const addSnippet = (data, dropPos) => {
    if (recordHistory && getSnapshot) recordHistory(getSnapshot());
    // ---------- 1. PREPARE SNIPPET OBJECT ----------
    const isFromPDF = !!data.fromPDF;
    const id = Date.now().toString();
    const scale = getScale() || 1;
    const isText = data.type === "text" || !data.type;

    const snippet = {
      ...data,
      id,
      x: dropPos.x,
      y: dropPos.y,
      pageNum: data.pageNum || pdfRef.current?.getCurrentPageNum?.() || 1,
    };

    // ---------- 2. APPLY PDF-SPECIFIC CLEANUP ----------
    if (isFromPDF) {
      snippet.text = (data.text || "").replace(/\s+/g, " ").trim();
      snippet.width = isText ? (data.width / scale) + 40 : (data.width / scale);
      snippet.height = isText ? "auto" : (data.height / scale);

      // Guard: block blank text snippets caused by PDF text extraction failure
      // (common with Hindi/Devanagari or scanned PDFs that lack proper Unicode mappings)
      if (isText && !snippet.text) {
        if (showToast) showToast("Text could not be extracted from this PDF. Use the image crop tool to capture this area.", "warning");
        return;
      }

      setSnippets((prev) => [...prev, snippet]);
    } else {
      if (!data.text) snippet.text = "New note...";
      setSnippets((prev) => [...prev, snippet]);
    }

    // ---------- 4. HANDLE IMAGE CONVERSION (DRY) ----------
    if (data.type === "image" && data.src && typeof data.src === "string" && data.src.startsWith("data:")) {
      const parts = data.src.split(",");
      const mime = parts[0].match(/:(.*?);/)[1];
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      snippet.file = new Blob([u8arr], { type: mime });
    }
  };

  const handleSnippetDrop = (e) => {
    e.preventDefault();
    if (tool !== TOOL_MODES.SELECT) return;

    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      // Calculate drop position in World Coordinates
      const dropPos = screenToWorld(e.clientX, e.clientY);
      addSnippet(data, dropPos);
    } catch (err) {
      console.warn("Invalid drop data:", err);
    }
  };

  return { handleSnippetDrop, addSnippet };
}
