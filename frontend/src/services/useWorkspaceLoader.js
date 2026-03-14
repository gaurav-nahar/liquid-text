import { useEffect } from "react";
import api from "../api/api";
const useWorkspaceLoader = (context) => {
    // Context object se props destructure karein (jaise useApp me karte hain)
    const {
        pdfId,
        activeWorkspace,
        setLoading,
        setSnippets,
        setEditableBoxes,
        setLines,
        setConnections,
        setHighlights,
        setPdfAnnotations,
        setPdfLines,
        setBrushHighlights,
        setExistingSnippetsMap,
        setIsDirty,
        viewStateRef
    } = context;

    // 🔄 Loads saved snippets, boxes, and lines when a PDF is opened.
    useEffect(() => {
        if (!pdfId || !activeWorkspace) return;

        let mounted = true;

        const loadWorkspace = async () => {
            setLoading(true);
            try {
                const data = await api.loadWorkspaceData(pdfId, activeWorkspace.id);
                const {
                    snippets: snipData,
                    boxes: boxData,
                    lines: lineData,
                    connections: connData,
                    highlights: hlData,
                    pdfTexts: textData,
                    pdfDrawingLines: pdfLineData,
                    pdfBrushHighlights: brushData
                } = data;

                if (!mounted) return;

                const snippetsWithFiles = (snipData ?? []).map((s) => {
                    let extra = {};
                    // Backend sends base64 in 'content' field for images
                    if (s.type === "image" && s.content && s.content !== "image") {
                        try {
                            const bstr = atob(s.content);
                            let n = bstr.length;
                            const u8arr = new Uint8Array(n);
                            while (n--) u8arr[n] = bstr.charCodeAt(n);
                            extra.file = new Blob([u8arr], { type: "image/png" });
                            extra.src = `data:image/png;base64,${s.content}`;
                        } catch (e) {
                            console.error("❌ Blob conversion failed for snippet", s.id, e);
                        }
                    }

                    return {
                        ...s,
                        ...extra,
                        id: s.id,
                        type: s.type,
                        x: s.x,
                        y: s.y,
                        width: s.width,
                        height: s.height,
                        pageNum: s.page,
                        text: (s.type === "text" || s.type === "anchor")
                            ? ((s.content && s.content !== "null") ? s.content : (s.text || ""))
                            : "",
                        fromPDF: true,
                        xPct: s.x_pct != null ? parseFloat(s.x_pct) : undefined,
                        yPct: s.y_pct != null ? parseFloat(s.y_pct) : undefined,
                        widthPct: s.width_pct != null ? parseFloat(s.width_pct) : undefined,
                        heightPct: s.height_pct != null ? parseFloat(s.height_pct) : undefined,
                    };
                });

                const map = {};
                snippetsWithFiles.forEach((s) => {
                    if (s.id && s.type === "image") {
                        map[s.id] = { src: s.src || s.content };
                    }
                });
                setExistingSnippetsMap(map);

                setSnippets(snippetsWithFiles);
                setEditableBoxes(boxData ?? []);

                // 🎨 Normalize lines: backend uses stroke_width, frontend uses width
                const normalizedLines = (lineData ?? []).map(l => ({
                    ...l,
                    width: l.stroke_width ?? l.width ?? 2
                }));
                setLines(normalizedLines);
                const normalizedConns = (connData ?? []).map(c => ({
                    ...c,
                    from: c.source_id,
                    to: c.target_id
                }));
                setConnections(normalizedConns);

                if (hlData !== undefined) {
                    const transformedHighlights = hlData.map(hl => ({
                        id: hl.id,
                        pageNum: hl.page_num,
                        color: hl.color,
                        xPct: hl.x_pct,
                        yPct: hl.y_pct,
                        widthPct: hl.width_pct,
                        heightPct: hl.height_pct,
                        content: hl.content
                    }));
                    setHighlights(transformedHighlights);
                }

                if (textData !== undefined) {
                    const transformedAnnots = textData.map(a => ({
                        id: a.id,
                        pageNum: a.page_num,
                        text: a.text,
                        xPct: a.x_pct,
                        yPct: a.y_pct,
                        isEditing: false
                    }));
                    setPdfAnnotations(transformedAnnots);
                }

                if (pdfLineData !== undefined) {
                    const transformedPdfLines = pdfLineData.map(l => ({
                        id: l.id,
                        pageNum: l.page_num,
                        points: l.points,
                        color: l.color,
                        width: l.stroke_width || l.width || 2,
                        tool: "pen"
                    }));
                    setPdfLines(transformedPdfLines);
                }

                if (brushData !== undefined) {
                    const transformedBrushHighlights = brushData.map(h => ({
                        id: `brush-${h.id}`,
                        serverId: h.id,
                        pageNum: h.page_num,
                        path: h.path_data,
                        color: h.color,
                        brushWidth: h.brush_width
                    }));
                    setBrushHighlights(transformedBrushHighlights);
                }

            } catch (err) {
                console.error("❌ Error loading workspace:", err);
                alert("Error loading workspace.");
            } finally {
                setLoading(false);
                setIsDirty(false);

                const savedView = localStorage.getItem(`view-${pdfId}-${activeWorkspace.id}`);
                if (savedView) {
                    try {
                        const viewState = JSON.parse(savedView);
                        if (viewStateRef.current) {
                            viewStateRef.current = viewState;
                        }
                    } catch (e) {
                        console.error("Bad view state", e);
                    }
                }
            }
        };

        loadWorkspace();
        return () => (mounted = false);
    }, [
        pdfId, activeWorkspace, setLoading, setExistingSnippetsMap, setSnippets,
        setEditableBoxes, setLines, setConnections, setHighlights,
        setPdfAnnotations, setPdfLines, setBrushHighlights, setIsDirty, viewStateRef
    ]);


};
export default useWorkspaceLoader;
