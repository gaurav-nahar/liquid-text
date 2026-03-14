import { useCallback } from "react";
// this is used for when user click on any note it will scroll to that note
export default function useConnections({ tool, TOOL_MODES, lineStartId, setLineStartId, connections, setConnections, pdfRef, snippets, setSelectedItem }) {
  const handleNoteClick = useCallback((snippet) => {
    // 🎯 Set global selection
    if (setSelectedItem) {
      setSelectedItem({ id: snippet.id, type: snippet.type === 'box' ? 'box' : 'snippet' });
    }
    if (tool === TOOL_MODES.DRAW_LINE) {
      if (!lineStartId) {
        setLineStartId(snippet.id);
      } else if (lineStartId !== snippet.id) {
        const exists = connections.some(
          (c) =>
            //check if connection already exists
            (String(c.from) === String(lineStartId) && String(c.to) === String(snippet.id)) ||
            (String(c.from) === String(snippet.id) && String(c.to) === String(lineStartId))
        );
        if (!exists) {
          setConnections((prev) => [...prev, { from: String(lineStartId), to: String(snippet.id) }]);
        }
        setLineStartId(null);
      } else {
        setLineStartId(null);
      }
    }
    //if user want to scroll to any note
    else if (tool === TOOL_MODES.SELECT) {
      try {
        if (!pdfRef.current || typeof pdfRef.current.scrollToSnippet !== "function") return;

        // DB COMPATIBILITY FIX:
        // Instead of looking for a separate "anchor" object (which requires DB schema changes),
        // we check if the SNIPPET ITSELF has PDF coordinates.
        // If it does, we treat it as its own source.
        const hasPdfData = snippet.pageNum && snippet.xPct !== undefined;

        if (hasPdfData) {
          // It's a PDF snippet! Trigger the trace directly from its data.
          const targetData = {
            pageNum: snippet.pageNum,
            xPct: snippet.xPct,
            yPct: snippet.yPct,
            widthPct: snippet.widthPct,
            heightPct: snippet.heightPct
          };

          // 1. Start scrolling (pass snippet itself as the target)
          pdfRef.current.scrollToSnippet(snippet);

          // 2. Trigger Bezier curve ONLY when scroll is truly finished and stable
          const checkStability = () => {
            let lastTop = null;
            let stableFrames = 0;
            const maxFrames = 120; // ~2 seconds max wait
            let frameCount = 0;

            const poll = () => {
              const pdfContainer = document.querySelector(".pdf-viewer-container");
              if (!pdfContainer) return;

              const pageWrapper = pdfContainer.querySelector(`.pdf-page-wrapper[data-page-number="${targetData.pageNum}"]`);
              if (!pageWrapper) {
                if (frameCount < maxFrames) requestAnimationFrame(poll);
                return;
              }

              const canvas = pageWrapper.querySelector("canvas");
              const rect = canvas ? canvas.getBoundingClientRect() : pageWrapper.getBoundingClientRect();

              if (rect) {
                const currentTop = rect.top;

                if (lastTop !== null && Math.abs(currentTop - lastTop) < 1) {
                  stableFrames++;
                } else {
                  stableFrames = 0;
                }

                lastTop = currentTop;

                // If stable for 5 frames (~80ms), we consider scroll finished
                if (stableFrames > 5) {
                  if (rect.height > 0) {
                    // 🎯 Get zoom scale from parent container
                    const zoomWrapper = pdfContainer.querySelector(".pdf-zoom-content");
                    let zoomScale = 1;
                    if (zoomWrapper && zoomWrapper.style.transform.includes("scale(")) {
                      const match = zoomWrapper.style.transform.match(/scale\(([^)]+)\)/);
                      if (match) zoomScale = parseFloat(match[1]);
                    }

                    // 🎯 Calculate coordinates in screen space (will be converted in canvas)
                    const highlightRect = {
                      left: rect.left + (targetData.xPct * rect.width),
                      top: rect.top + (targetData.yPct * rect.height),
                      width: (targetData.widthPct || 0) * rect.width,
                      height: (targetData.heightPct || 0) * rect.height,
                      right: rect.left + (targetData.xPct * rect.width) + ((targetData.widthPct || 0) * rect.width),
                      bottom: rect.top + (targetData.yPct * rect.height) + ((targetData.heightPct || 0) * rect.height)
                    };

                    window.dispatchEvent(new CustomEvent('trace-snippet-connection', {
                      detail: { snippetId: snippet.id, highlightRect }
                    }));
                  }
                  return; // Done
                }
              }

              frameCount++;
              if (frameCount < maxFrames) {
                requestAnimationFrame(poll);
              } else {
                // Fallback
                if (rect && rect.height > 0) {
                  // 🎯 Get zoom scale from parent container
                  const zoomWrapper = pdfContainer.querySelector(".pdf-zoom-content");
                  let zoomScale = 1;
                  if (zoomWrapper && zoomWrapper.style.transform.includes("scale(")) {
                    const match = zoomWrapper.style.transform.match(/scale\(([^)]+)\)/);
                    if (match) zoomScale = parseFloat(match[1]);
                  }

                  // 🎯 Normalize coordinates by dividing by zoom scale
                  const highlightRect = {
                    left: rect.left + (targetData.xPct * rect.width / zoomScale),
                    top: rect.top + (targetData.yPct * rect.height / zoomScale),
                    width: (targetData.widthPct || 0) * rect.width / zoomScale,
                    height: (targetData.heightPct || 0) * rect.height / zoomScale,
                    right: rect.left + (targetData.xPct * rect.width / zoomScale) + ((targetData.widthPct || 0) * rect.width / zoomScale),
                    bottom: rect.top + (targetData.yPct * rect.height / zoomScale) + ((targetData.heightPct || 0) * rect.height / zoomScale)
                  };
                  window.dispatchEvent(new CustomEvent('trace-snippet-connection', {
                    detail: { snippetId: snippet.id, highlightRect }
                  }));
                }
              }
            };
            requestAnimationFrame(poll);
          };

          checkStability();
          return;
        }

        // Check for MULTIPLE connected anchors (Legacy support or manual linking)
        // If the snippet is manually linked to other PDF anchors, we still support that using the old logic,
        // but for fresh drag-drops, the above logic takes precedence.
        const connectedAnchors = [];
        connections.forEach(c => {
          if (String(c.from) === String(snippet.id) || String(c.to) === String(snippet.id)) {
            const otherId = String(c.from) === String(snippet.id) ? c.to : c.from;
            // FIXED: Allow ANY connected node that has PDF data to act as an anchor
            // This includes legacy 'anchor' types AND modern 'text'/'image' snippets with xPct/pageNum
            const target = snippets?.find(s => String(s.id) === String(otherId));
            const isPdfSource = target && (target.type === 'anchor' || (target.pageNum && target.xPct !== undefined));

            if (isPdfSource) connectedAnchors.push(target);
          }
        });

        if (connectedAnchors.length > 0) {
          const targetAnchor = connectedAnchors.sort((a, b) => a.pageNum - b.pageNum)[0];

          // Logic for Shrink-Between
          const pages = connectedAnchors.map(a => a.pageNum).filter(p => p).sort((a, b) => a - b);
          const uniquePages = [...new Set(pages)];

          if (uniquePages.length >= 2) {
            const minPage = uniquePages[0];
            const maxPage = uniquePages[uniquePages.length - 1];
            if (maxPage - minPage > 1 && typeof pdfRef.current.contractBetweenPages === "function") {
              pdfRef.current.contractBetweenPages(minPage, maxPage);
            }
          }

          // 2. Start scrolling
          pdfRef.current.scrollToSnippet(connectedAnchors);

          // 3. Trigger Bezier curve ONLY when scroll is truly finished and stable
          const checkStability = () => {
            let lastTop = null;
            let stableFrames = 0;
            const maxFrames = 120; // ~2 seconds max wait
            let frameCount = 0;

            const poll = () => {
              const pdfContainer = document.querySelector(".pdf-viewer-container");
              if (!pdfContainer) return;

              const pageWrapper = pdfContainer.querySelector(`.pdf-page-wrapper[data-page-number="${targetAnchor.pageNum}"]`);
              if (!pageWrapper) {
                if (frameCount < maxFrames) requestAnimationFrame(poll);
                return;
              }

              const canvas = pageWrapper.querySelector("canvas");
              const rect = canvas ? canvas.getBoundingClientRect() : pageWrapper.getBoundingClientRect();

              if (rect) {
                const currentTop = rect.top;

                if (lastTop !== null && Math.abs(currentTop - lastTop) < 1) {
                  stableFrames++;
                } else {
                  stableFrames = 0;
                }

                lastTop = currentTop;

                // If stable for 5 frames (~80ms), we consider scroll finished
                if (stableFrames > 5) {
                  if (rect.height > 0) {
                    // 🎯 Get zoom scale from parent container
                    const zoomWrapper = pdfContainer.querySelector(".pdf-zoom-content");
                    let zoomScale = 1;
                    if (zoomWrapper && zoomWrapper.style.transform.includes("scale(")) {
                      const match = zoomWrapper.style.transform.match(/scale\(([^)]+)\)/);
                      if (match) zoomScale = parseFloat(match[1]);
                    }

                    // 🎯 Normalize coordinates by dividing by zoom scale
                    const highlightRect = {
                      left: rect.left + (targetAnchor.xPct * rect.width / zoomScale),
                      top: rect.top + (targetAnchor.yPct * rect.height / zoomScale),
                      width: (targetAnchor.widthPct || 0) * rect.width / zoomScale,
                      height: (targetAnchor.heightPct || 0) * rect.height / zoomScale,
                      right: rect.left + (targetAnchor.xPct * rect.width / zoomScale) + ((targetAnchor.widthPct || 0) * rect.width / zoomScale),
                      bottom: rect.top + (targetAnchor.yPct * rect.height / zoomScale) + ((targetAnchor.heightPct || 0) * rect.height / zoomScale)
                    };

                    window.dispatchEvent(new CustomEvent('trace-snippet-connection', {
                      detail: { snippetId: snippet.id, highlightRect }
                    }));
                  }
                  return; // Done
                }
              }

              frameCount++;
              if (frameCount < maxFrames) {
                requestAnimationFrame(poll);
              } else {
                // Fallback
                if (rect && rect.height > 0) {
                  // 🎯 Get zoom scale from parent container
                  const zoomWrapper = pdfContainer.querySelector(".pdf-zoom-content");
                  let zoomScale = 1;
                  if (zoomWrapper && zoomWrapper.style.transform.includes("scale(")) {
                    const match = zoomWrapper.style.transform.match(/scale\(([^)]+)\)/);
                    if (match) zoomScale = parseFloat(match[1]);
                  }

                  // 🎯 Calculate coordinates in screen space
                  const highlightRect = {
                    left: rect.left + (targetAnchor.xPct * rect.width),
                    top: rect.top + (targetAnchor.yPct * rect.height),
                    width: (targetAnchor.widthPct || 0) * rect.width,
                    height: (targetAnchor.heightPct || 0) * rect.height,
                    right: rect.left + (targetAnchor.xPct * rect.width) + ((targetAnchor.widthPct || 0) * rect.width),
                    bottom: rect.top + (targetAnchor.yPct * rect.height) + ((targetAnchor.heightPct || 0) * rect.height)
                  };
                  window.dispatchEvent(new CustomEvent('trace-snippet-connection', {
                    detail: { snippetId: snippet.id, highlightRect }
                  }));
                }
              }
            };
            requestAnimationFrame(poll);
          };

          checkStability();
          return;
        }

        // Fallback
        pdfRef.current.scrollToSnippet(snippet);

      } catch (err) {
        console.warn("Error calling scrollToSnippet:", err);
      }
    }
  }, [tool, TOOL_MODES, lineStartId, setLineStartId, connections, setConnections, pdfRef, snippets, setSelectedItem]);

  return { handleNoteClick };
}