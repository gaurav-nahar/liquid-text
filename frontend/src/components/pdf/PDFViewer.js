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
const PageJumpBox = React.lazy(() => import("./PageJumpBox"));

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * PDFViewer Component
 * Manages PDF rendering, interaction layers, and side-features.
 */
const PDFViewer = React.memo(
    forwardRef(
        (
            {
                fileUrl
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
                brushHighlights, // Still might be useful for latestRef
                showThumbnails, setShowThumbnails,
                showPageJump, setShowPageJump,
                setIsDirty,
                highlights,
                setSearchMatches,
                pdfDrawingColor,
                zoomLevel,
                pdfRenderScale,
                isResizing
            } = useApp();

            const onMatchesFound = setSearchMatches;
            const selectedColor = pdfDrawingColor;

            // Updated internal handlers
            const onThumbnailsClose = () => setShowThumbnails(false);
            const onPageJumpClose = () => setShowPageJump(false);

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
            } = useSelection(containerRef, mode, zoomContentRef, zoomLevel);

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
                scrollToPage(pageNum) {
                    //pdfscrollutils.js
                    scrollToPageUtil(containerRef.current, pageNum, pdfDocRef.current, {
                        shrinkState,
                        expandAll,
                        scale: pdfRenderScale
                    });
                },
                pdfDoc: pdfDocRef.current,
                contractBetweenPages(p1, p2) {
                    // Logic from pdfShrinkExpand.js
                    contractBetween(p1, p2);
                },
                addPdfText() {
                    addPdfTextLogic();
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
                            scrollBehavior: "auto" // 🚀 Immediate response
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

                    {/* [MODAL LAYER] Side UI Overlays - Lazy Loaded from PageJumpBox.js and PDFThumbnailView.js */}
                    {showPageJump && (
                        <React.Suspense fallback={null}>
                            <PageJumpBox pdfRef={ref} onClose={onPageJumpClose} />
                        </React.Suspense>
                    )}

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