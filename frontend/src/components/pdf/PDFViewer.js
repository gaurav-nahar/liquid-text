import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/web/pdf_viewer.css";
import pdfWorker from "pdfjs-dist/build/pdf.worker.entry";

// --- SECTION 1: PDF SUB-COMPONENTS & LAYERS ---
import PDFHighlightBrush from "./PDFHighlightBrush";
import SelectionPopup from "./SelectionPopup";
import PDFDrawingLayer from "./PDFDrawingLayer";
import { PDFTextHighlightLayer } from "./PDFTextHighlightLayer";

// --- SECTION 2: CUSTOM PDF HOOKS ---
import { usePdfRenderer } from "./usePdfRenderer";
import { useShrinkExpand } from "./pdfShrinkExpand";
import { useSearchHighlight } from "./pdfSearchHighlight";
import { useSelection } from "./pdfSelection";
import { usePdfText } from "./addpdftext.js";
import { useHighlightLogic } from "./PDFTextHighlightLayer";

// --- SECTION 3: UTILS & HANDLERS ---
import { scrollToSnippet as scrollToSnippetUtil, scrollToPage as scrollToPageUtil } from "./pdfScrollUtils";
import { useApp } from "../../context/AppContext";
// --- SECTION 4: LAZY LOADED OVERLAYS ---
const PDFThumbnailView = React.lazy(() => import("./PDFThumbnailView"));

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * PDFViewer Component
 * Manages PDF rendering, interaction layers, and side-features.
 */
const PDFViewer = React.memo(
    forwardRef(
        (
            {
                fileUrl,
                sourcePdfId = null,
                localZoom = null,       // when set, overrides AppContext zoomLevel (independent panel)
            },
            ref
        ) => {
            const {
                tool: mode,
                searchText,
                currentMatchIndex,
                pdfAnnotations, setPdfAnnotations,
                handleDeletePdfText: onDeletePdfText,
                tool,
                brushHighlights,
                showThumbnails, setShowThumbnails,
                setIsDirty,
                highlights,
                setSearchMatches,
                pdfDrawingColor,
                zoomLevel: contextZoomLevel, setZoomLevel,
                pdfRenderScale,
                isResizing,
                handleAddBookmark,
                TOOL_MODES,
                pendingCrossLink, startCrossLink, completeCrossLink,
                startDragWire,
            } = useApp();

            // Use localZoom when provided (right panel independent zoom), else fall back to shared context zoom
            const zoomLevel = localZoom !== null ? localZoom : contextZoomLevel;

            // Cursor style per tool
            const toolCursor = {
                [TOOL_MODES?.PEN]:              "crosshair",
                [TOOL_MODES?.ERASER]:           "cell",
                [TOOL_MODES?.HIGHLIGHT_BRUSH]:  "crosshair",
                [TOOL_MODES?.STICKY_NOTE]:      "copy",
                [TOOL_MODES?.DRAW_LINE]:        "crosshair",
                [TOOL_MODES?.ADD_BOX]:          "crosshair",
            }[tool] || "text";

            const onMatchesFound = setSearchMatches;
            const selectedColor = pdfDrawingColor;

            // Updated internal handlers
            const onThumbnailsClose = () => setShowThumbnails(false);

            // --- SECTION 5: REFS & CORE STATE ---
            const containerRef = useRef();
            const zoomContentRef = useRef();
            const latestRef = useRef({
                searchText,
                currentMatchIndex,
                mode,
                highlightMatchesOnPage: null,
                pdfAnnotations,
            });

            // --- SECTION 6: FEATURE HOOK CALLS ---

            // From pdfShrinkExpand.js
            const {
                shrinkMapRef, getCurrentPageNum, expandAll, shrinkState, contractBetween, dynamicHeight
            } = useShrinkExpand(containerRef, zoomContentRef);

            // From usePdfRenderer.js
            const {
                pdfDocRef, pdfLoaded, renderedPageMap, pdfDimensions
            } = usePdfRenderer({
                fileUrl, containerRef, contentRef: zoomContentRef, latestRef, shrinkState, pdfRenderScale
            });

            // From pdfSearchHighlight.js
            const { highlightMatchesOnPage } = useSearchHighlight(
                containerRef, pdfDocRef, shrinkMapRef, pdfLoaded, zoomContentRef
            );

            // From pdfSelection.js
            const {
                popupData, multiSelections, setMultiSelections, addToMultiSelect, clearPopup: clearSelectionPopup
            } = useSelection(containerRef, mode, zoomContentRef, zoomLevel, sourcePdfId);

            // From usePdfText.js
            const { renderPdfAnnotation, addPdfText: addPdfTextLogic } = usePdfText(
                containerRef, getCurrentPageNum, zoomContentRef
            );

            // From PDFTextHighlightLayer.js
            const { handleHighlight } = useHighlightLogic(
                containerRef, clearSelectionPopup
            );

            // --- SECTION 7: SYNC EFFECTS ---
            useEffect(() => {
                latestRef.current = {
                    ...latestRef.current,
                    searchText,
                    currentMatchIndex,
                    mode,
                    highlightMatchesOnPage,
                    highlights,
                    pdfAnnotations,
                    renderPdfAnnotation,
                };
            }, [searchText, currentMatchIndex, mode, highlightMatchesOnPage, highlights, pdfAnnotations, renderPdfAnnotation]);

            // On first PDF load, fit to panel width (never zooms in, only out if needed)
            const hasAutoFit = useRef(false);
            useEffect(() => {
                if (pdfDimensions.width <= 0 || hasAutoFit.current) return;
                const timer = setTimeout(() => {
                    if (!containerRef.current) return;
                    const containerWidth = containerRef.current.clientWidth;
                    if (containerWidth <= 100) return;
                    // Only zoom out if PDF is wider than panel; cap at 1.0 so we don't zoom in
                    const fitZoom = Math.min(1.0, (containerWidth - 40) / pdfDimensions.width);
                    setZoomLevel(Math.max(0.4, fitZoom));
                    hasAutoFit.current = true;
                }, 200);
                return () => clearTimeout(timer);
            }, [pdfDimensions.width]); // eslint-disable-line react-hooks/exhaustive-deps

            // --- SECTION 8: EXPOSED COMMANDS (useImperativeHandle) ---
            useImperativeHandle(ref, () => ({
                scrollToSnippet(snippet) {
                    scrollToSnippetUtil(containerRef.current, snippet, pdfDocRef.current, { isResizing, scale: pdfRenderScale });
                },
                getCurrentPageNum() {
                    return getCurrentPageNum();
                },
                getLatestSelection() {
                    const current = containerRef.current._lastSelection;
                    if (multiSelections.length > 0) {
                        return current ? [...multiSelections, current] : multiSelections;
                    }
                    return current;
                },
                clearSelection() {
                    const selection = window.getSelection();
                    if (selection) selection.removeAllRanges();
                    containerRef.current._lastSelection = null; // Clear internal state
                    setMultiSelections([]); // Clear multi-selections
                    clearSelectionPopup(); // Clear popup
                },
                // Returns screen coordinates of a position on a specific page (used by CrossPdfConnectionLayer)
                getAnchorScreenPos(pageNum, xPct, yPct) {
                    const content = zoomContentRef.current || containerRef.current;
                    if (!content) return null;
                    const pageEl = content.querySelector(`.pdf-page-wrapper[data-page-number="${pageNum}"]`);
                    if (!pageEl) return null;
                    const canvas = pageEl.querySelector("canvas");
                    const el = canvas || pageEl;
                    const rect = el.getBoundingClientRect();
                    return {
                        x: rect.left + (xPct || 0.5) * rect.width,
                        y: rect.top  + (yPct || 0.5) * rect.height,
                    };
                },
                // Returns { pageNum, xPct, yPct } for a screen coordinate, or null if not over any page
                getPageAnchorFromScreen(screenX, screenY) {
                    const content = zoomContentRef.current || containerRef.current;
                    if (!content) return null;
                    const pages = content.querySelectorAll(".pdf-page-wrapper[data-page-number]");
                    for (const pageEl of pages) {
                        const canvas = pageEl.querySelector("canvas");
                        const el = canvas || pageEl;
                        const rect = el.getBoundingClientRect();
                        if (screenX >= rect.left && screenX <= rect.right &&
                            screenY >= rect.top  && screenY <= rect.bottom) {
                            const pageNum = parseInt(pageEl.dataset.pageNumber, 10);
                            return {
                                pageNum,
                                xPct: Math.max(0, Math.min(1, (screenX - rect.left) / rect.width)),
                                yPct: Math.max(0, Math.min(1, (screenY - rect.top)  / rect.height)),
                            };
                        }
                    }
                    return null;
                },
                scrollToPage(pageNum) {
                    //pdfscrollutils.js
                    scrollToPageUtil(containerRef.current, pageNum, pdfDocRef.current, {
                        shrinkState,
                        expandAll,
                        scale: pdfRenderScale
                    });
                },
                pdfDoc: pdfDocRef.current,
                getTotalPages() { return pdfDocRef.current?.numPages || 0; },
                contractBetweenPages(p1, p2) {
                    // Logic from pdfShrinkExpand.js
                    contractBetween(p1, p2);
                },
                addPdfText() {
                    addPdfTextLogic();
                },
                async extractAllText() {
                    // Wait up to 15s for PDF to finish loading
                    let doc = pdfDocRef.current;
                    if (!doc) {
                        for (let i = 0; i < 30 && !pdfDocRef.current; i++) {
                            await new Promise(r => setTimeout(r, 500));
                        }
                        doc = pdfDocRef.current;
                    }
                    if (!doc) return "";
                    const parts = [];
                    for (let i = 1; i <= doc.numPages; i++) {
                        const page = await doc.getPage(i);
                        let pageText = "";

                        // 1) Try regular content stream text
                        const content = await page.getTextContent();
                        for (const item of content.items) {
                            if (!item.str) continue;
                            pageText += item.str;
                            if (item.hasEOL) pageText += "\n";
                            else pageText += " ";
                        }

                        // 2) If empty, try form field annotations (AcroForm / court system PDFs)
                        if (!pageText.trim()) {
                            try {
                                const annotations = await page.getAnnotations();
                                for (const ann of annotations) {
                                    // fieldValue = user-entered data, alternativeText = label
                                    if (ann.fieldValue) pageText += `${ann.fieldName || ""}: ${ann.fieldValue}\n`;
                                    else if (ann.alternativeText) pageText += ann.alternativeText + "\n";
                                    else if (ann.contents) pageText += ann.contents + "\n";
                                }
                            } catch (e) { /* ignore */ }
                        }

                        pageText = pageText.trim();
                        if (pageText) parts.push(`[Page ${i}]\n${pageText}`);
                    }
                    const fullText = parts.join("\n\n");
                    console.log(`[extractAllText] Extracted ${fullText.length} chars from ${doc.numPages} pages`);
                    return fullText;
                }
            }));

            // --- SECTION 9: FINAL UI RENDER ---
            const effectiveHeight = (dynamicHeight > 0) ? dynamicHeight : pdfDimensions.height;

            return (
                <div className="pdf-viewer-outer-wrapper" style={{ position: "relative", width: "100%", height: "100%" }}>

                    {/* [BASE LAYER] Scrollable PDF Container - Handled by pdfDragHandlers.js */}
                    <div ref={containerRef} className="pdf-viewer-container"
                        style={{
                            width: "100%", height: "100%", overflow: "auto",
                            backgroundColor: "#f9f9f9", position: "relative",
                            userSelect: (tool === "pen" || tool === "eraser") ? "none" : "text",
                            cursor: toolCursor,
                            scrollBehavior: "auto",
                        }}
                    >
                        <div className="pdf-zoom-centering-wrapper" style={{
                            width: pdfDimensions.width > 0 ? (pdfDimensions.width + 40) * zoomLevel : "100%",
                            height: effectiveHeight > 0 ? (effectiveHeight + 40) * zoomLevel : "100%",
                            display: "flex",
                            justifyContent: "flex-start",
                            alignItems: "flex-start",
                            position: "relative",
                            overflow: "visible", // 🚀 Allow drawing handles to overflow if needed
                            pointerEvents: (tool === "pen" || tool === "eraser") ? "auto" : "auto",
                            zIndex: (tool === "pen" || tool === "eraser") ? 200 : 1
                        }}>
                            <div
                                ref={zoomContentRef}
                                className="pdf-zoom-content"
                                style={{
                                    transform: `scale(${zoomLevel})`,
                                    transformOrigin: "top left",
                                    transition: isResizing ? "none" : "transform 0.2s ease", // 🚀 Interpolation Sync: No lag during resize
                                    willChange: isResizing ? "transform" : "auto", // 🚀 GPU Acceleration
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    padding: "20px 20px",
                                    width: "fit-content" // 🚀 FIX: Prevent double-scaling by not inheriting scaled parent width
                                }}
                            />
                        </div>
                    </div>

                    {/* [TOOL LAYER] Expand All Button - Logic from pdfShrinkExpand.js */}
                    {shrinkState && (
                        <button
                            className="pdf-expand-all-btn"
                            onClick={expandAll}
                            style={{
                                position: "absolute", left: "10px", zIndex: 201, cursor: "pointer",
                                top: shrinkState === "top" ? "20%" : shrinkState === "bottom" ? "80%" : "50%",
                                width: "30px", height: "120px", transform: "translateY(-50%)",
                                backgroundColor: "#4a90e2", color: "white", border: "none",
                                borderRadius: "0 8px 8px 0", boxShadow: "2px 0 8px rgba(0,0,0,0.2)",
                                transition: "width 0.2s, top 0.3s ease", display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                            title="Expand All"
                        >
                            <div style={{ writingMode: "vertical-rl", fontSize: "20px", fontWeight: "bold" }}>⬍</div>
                        </button>
                    )}

                    {/* [INTERACTION LAYER] Selection Popup - Component from SelectionPopup.js */}
                    {popupData && (
                        <SelectionPopup
                            onHighlight={handleHighlight}
                            position={popupData.position}
                            onSelectMore={addToMultiSelect}
                            showSelectMore={multiSelections.length === 0}
                            onLink={() => {
                                window.dispatchEvent(new CustomEvent("request-link-selection"));
                                clearSelectionPopup();
                            }}
                            onClose={clearSelectionPopup}
                            onBookmark={() => {
                                const text = popupData.selectedText || "";
                                const pg = popupData.pageNum || getCurrentPageNum() || 1;
                                const name = text.trim().slice(0, 80) || `Page ${pg}`;
                                handleAddBookmark(pg, name);
                            }}
                            hasPendingCrossLink={!!(pendingCrossLink && String(pendingCrossLink.pdfId) !== String(sourcePdfId))}
                            onConnectPdf={() => {
                                const endpoint = {
                                    pdfId: sourcePdfId,
                                    pageNum: popupData.pageNum || 1,
                                    xPct: popupData.anchorXPct ?? 0.5,
                                    yPct: popupData.anchorYPct ?? 0.5,
                                    text: (popupData.selectedText || "").slice(0, 120),
                                };
                                if (pendingCrossLink && String(pendingCrossLink.pdfId) !== String(sourcePdfId)) {
                                    completeCrossLink(endpoint);
                                } else {
                                    startCrossLink(endpoint);
                                }
                                clearSelectionPopup();
                            }}
                            onDragWireStart={(mouseX, mouseY) => {
                                const endpoint = {
                                    pdfId: sourcePdfId,
                                    pageNum: popupData.pageNum || 1,
                                    xPct: popupData.anchorXPct ?? 0.5,
                                    yPct: popupData.anchorYPct ?? 0.5,
                                    text: (popupData.selectedText || "").slice(0, 120),
                                };
                                startDragWire(endpoint, mouseX, mouseY);
                                clearSelectionPopup();
                            }}
                        />
                    )}

                    {/* [PAGE LAYERS] Rendering Layers into Page Portals */}
                    {Object.entries(renderedPageMap).map(([pageNum, info]) => (
                        <React.Fragment key={`portal-${pageNum}`}>
                            {/* Handled by PDFDrawingLayer.js */}
                            {createPortal(
                                <PDFDrawingLayer
                                    pageNum={parseInt(pageNum, 10)}
                                    width={info.wrapper.clientWidth} height={info.wrapper.clientHeight}
                                    tool={tool} selectedColor={selectedColor}
                                    zoomLevel={zoomLevel}
                                    isResizing={isResizing}
                                />, info.wrapper
                            )}

                            {/* Handled by PDFTextHighlightLayer.js */}
                            {createPortal(<PDFTextHighlightLayer pageNum={parseInt(pageNum, 10)} />, info.wrapper)}

                            {/* Handled by PDFHighlightBrush.js */}
                            {createPortal(
                                <PDFHighlightBrush
                                    pageNum={parseInt(pageNum, 10)}
                                    width={info.wrapper.clientWidth} height={info.wrapper.clientHeight}
                                    zoomLevel={zoomLevel}
                                    isResizing={isResizing}
                                />, info.wrapper
                            )}
                        </React.Fragment>
                    ))}

                    {/* PageJump is now inline in Navbar — no modal here */}

                    {showThumbnails && pdfDocRef.current && (
                        <React.Suspense fallback={<div className="pdf-thumbnail-overlay">Loading...</div>}>
                            <PDFThumbnailView
                                pdfDoc={pdfDocRef.current}
                                onClose={onThumbnailsClose}
                                onPageClick={(n) => { ref.current?.scrollToPage(n); onThumbnailsClose(); }}
                            />
                        </React.Suspense>
                    )}
                </div>
            );
        }
    )
);

export default PDFViewer;