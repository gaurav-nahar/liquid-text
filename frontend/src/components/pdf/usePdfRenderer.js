import { useState, useEffect, useRef } from "react";
import { setupPDF, renderPage } from "./pdfLoader";
// import { attachCanvasDragHandler } from "./pdfDragHandlers";
import { TRANSITION } from "./pdfShrinkExpand";

export const usePdfRenderer = ({ fileUrl, containerRef, contentRef = null, latestRef, shrinkState, pdfRenderScale = 1.5 }) => {
    const [pdfLoaded, setPdfLoaded] = useState(false);
    const [renderedPageMap, setRenderedPageMap] = useState({});
    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });

    const pdfDocRef = useRef(null);
    const loadTokenRef = useRef(0);
    const observerRef = useRef(null);
    const pageCountRef = useRef(0);

    useEffect(() => {
        if (!fileUrl) return;

        // Each run gets a token so a slow load that lost the race can bail out
        // instead of rendering the old document into the new one's page shells.
        const token = ++loadTokenRef.current;
        const isStale = () => token !== loadTokenRef.current;

        // Swapping documents in place — drop whatever the previous one left on screen.
        setPdfLoaded(false);
        setRenderedPageMap({});
        setPdfDimensions({ width: 0, height: 0 });

        let observer = null;

        const load = async () => {
            const container = containerRef.current;
            const contentContainer = contentRef ? contentRef.current : container;
            if (!container || !contentContainer) return;

            observer = new IntersectionObserver((entries) => {
                if (isStale()) return;
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        // ⚡ PERFORMANCE FIX: Do NOT render pages that are shrunk/hidden in the stack.
                        if (entry.target.classList.contains("page-above") || entry.target.classList.contains("page-below")) {
                            return;
                        }

                        if (pdfDocRef.current) {
                            renderPage(pdfDocRef.current, entry.target, pdfRenderScale).then((result) => {
                                if (isStale()) return;

                                // A failed render leaves the page blank and the observer
                                // won't fire again on its own, so force a fresh delivery.
                                if (!result) {
                                    const tries = parseInt(entry.target.dataset.renderRetries || "0", 10) + 1;
                                    if (tries <= 3) {
                                        entry.target.dataset.renderRetries = String(tries);
                                        observer.unobserve(entry.target);
                                        observer.observe(entry.target);
                                    }
                                    return;
                                }

                                // ✨ CRITICAL: Highlights search matches on the newly rendered page.
                                if (latestRef.current.highlightMatchesOnPage) {
                                    latestRef.current.highlightMatchesOnPage(entry.target);
                                }
                                // 📝 Render dynamic text annotations
                                if (latestRef.current.renderPdfAnnotation) {
                                    (latestRef.current.pdfAnnotations || [])
                                        .filter(a => a.pageNum === parseInt(entry.target.dataset.pageNumber, 10))
                                        .forEach(a => latestRef.current.renderPdfAnnotation(entry.target, a));
                                }

                                // 🎨 Track this page for Konva/Portal Rendering
                                if (result.canvas) {
                                    const pageNum = entry.target.dataset.pageNumber;
                                    const width = result.canvas.width / pdfRenderScale;
                                    const height = result.canvas.height / pdfRenderScale;
                                    setRenderedPageMap(prev => {
                                        // Re-observing (shrink/expand) replays records for pages that
                                        // are already rendered. Keep the same state object then, or
                                        // every portal layer would remount and lose its live state.
                                        const existing = prev[pageNum];
                                        if (existing && existing.wrapper === entry.target &&
                                            existing.width === width && existing.height === height) {
                                            return prev;
                                        }
                                        return { ...prev, [pageNum]: { wrapper: entry.target, width, height } };
                                    });
                                }
                            }).catch(() => { /* document was swapped out mid-render */ });
                        }
                    }
                });
            }, {
                root: container,
                rootMargin: "200px",
                // 0, not a ratio: a page zoomed past the viewport's height can never
                // reach a fractional threshold, and would silently never render.
                threshold: 0
            });
            observerRef.current = observer;

            // 📄 setupPDF: Loads the PDF and creates page shells.
            // It bails out on its own if this load is superseded, so a stale run can
            // no longer wipe and re-append the container the current run is building.
            const { pdfDocument, numPages, totalUnscaledHeight, maxUnscaledWidth, wrappers, aborted } = await setupPDF(
                fileUrl,
                contentContainer,
                pdfRenderScale,
                (pageNum, wrapper) => {
                    wrapper.style.transition = TRANSITION;
                    wrapper.style.transformOrigin = "top center";
                },
                isStale
            );

            if (aborted || isStale()) {
                Promise.resolve(pdfDocument?.destroy?.()).catch(() => {});
                return;
            }

            setPdfDimensions({ width: maxUnscaledWidth, height: totalUnscaledHeight });
            pdfDocRef.current = pdfDocument;
            pageCountRef.current = numPages;
            setPdfLoaded(true);

            // Observe only now. IntersectionObserver delivers its first records
            // asynchronously, and the callback renders from pdfDocRef — observing
            // during setup meant those first records could arrive before the document
            // was published, get dropped, and never be re-sent for a page that is
            // already on screen (its visibility never changes again).
            wrappers.forEach((wrapper) => observer.observe(wrapper));
        };

        load();

        // Runs before the next load and on unmount — release this document so a new
        // fileUrl renders from scratch rather than being blocked by the old one.
        return () => {
            if (observer) observer.disconnect();
            if (observerRef.current === observer) observerRef.current = null;
            const previousDoc = pdfDocRef.current;
            if (previousDoc) {
                pdfDocRef.current = null;
                Promise.resolve(previousDoc.destroy?.()).catch(() => {});
            }
        };
    }, [fileUrl, pdfRenderScale]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle Mode changes (Select/Pen/Eraser) without reloading everything
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
    }, [latestRef.current.mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-trigger observer on every shrink/expand change to render previously skipped
    // pages. A shrunk page is still geometrically intersecting (clip-path is invisible
    // to IntersectionObserver), so once the callback skips it, expanding rarely moves
    // its ratio across the threshold again and no further record is ever delivered.
    // This also has to run for shrink-to-shrink transitions ("bottom" -> "top",
    // contractBetween), not only when the state clears — those never reached null.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const container = containerRef.current;
        const contentContainer = contentRef ? contentRef.current : container;
        const observer = observerRef.current;
        if (!observer || !container || !contentContainer) return;
        Array.from(contentContainer.children)
            .filter(el => el.dataset && el.dataset.pageNumber)
            .forEach(child => {
                observer.unobserve(child);
                observer.observe(child);
            });
    }, [shrinkState]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle pages rendered by scrollToSnippet to ensure PDFTextHighlightLayer gets rendered
    useEffect(() => {
        const handlePageRenderedByScroll = (event) => {
            const { pageNum, wrapper, width, height } = event.detail;
            // The event is global, so every open viewer hears it. Without this check a
            // scroll-render in one panel injects the other panel's wrapper into this
            // map, and its layers get portalled into a DOM node it doesn't own.
            const contentContainer = contentRef ? contentRef.current : containerRef.current;
            if (!contentContainer || !wrapper || !contentContainer.contains(wrapper)) return;
            if (pageNum) {
                //it is used to render the layer
                const w = width || wrapper.clientWidth;
                const h = height || wrapper.clientHeight;
                setRenderedPageMap(prev => {
                    // Same no-op guard as the observer path: this fires on every
                    // scrollToPage/scrollToSnippet, including for pages already mapped.
                    const existing = prev[pageNum];
                    if (existing && existing.wrapper === wrapper &&
                        existing.width === w && existing.height === h) {
                        return prev;
                    }
                    return { ...prev, [pageNum]: { wrapper, width: w, height: h } };
                });
            }
        };

        window.addEventListener('page-rendered-by-scroll', handlePageRenderedByScroll);
        return () => window.removeEventListener('page-rendered-by-scroll', handlePageRenderedByScroll);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable, read at event time

    return { pdfDocRef, pdfLoaded, renderedPageMap, pageCountRef, observerRef, pdfDimensions };
};