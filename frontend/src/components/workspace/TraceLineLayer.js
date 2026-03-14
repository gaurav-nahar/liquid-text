import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const TraceLineLayer = () => {
    const svgRef = useRef(null);
    const pathRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => {
        const handleTrace = (e) => {
            const { snippetId, highlightRect } = e.detail || {};
            if (!highlightRect || !snippetId) return;

            const snippetEl = document.getElementById(`workspace-item-${snippetId}`);
            if (!snippetEl) return;

            const snippetRect = snippetEl.getBoundingClientRect();

            const startX = highlightRect.right;
            const startY = highlightRect.top + highlightRect.height / 2;
            const endX = snippetRect.left;
            const endY = snippetRect.top + snippetRect.height / 2;

            const curvature = Math.max(40, Math.abs(endX - startX) * 0.5);
            const cp1x = startX + curvature;
            const cp1y = startY;
            const cp2x = endX - curvature;
            const cp2y = endY;

            const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

            const svgEl = svgRef.current;
            const pathEl = pathRef.current;
            if (!svgEl || !pathEl) return;

            // Apply path and prepare dash animation directly on DOM for speed
            pathEl.setAttribute('d', d);

            // ensure no layout thrash before measuring
            const len = pathEl.getTotalLength();
            pathEl.style.transition = 'none';
            pathEl.style.strokeDasharray = `${len}`;
            pathEl.style.strokeDashoffset = `${len}`;
            pathEl.style.opacity = '1';

            // Make SVG visible (fast show)
            svgEl.style.opacity = '1';

            // Trigger draw using rAF for immediate, smooth animation
            requestAnimationFrame(() => {
                // short transition for a snappy trace
                pathEl.style.transition = 'stroke-dashoffset 180ms cubic-bezier(0.2,0,0,1), opacity 220ms linear';
                pathEl.style.strokeDashoffset = '0';
            });

            if (timerRef.current) clearTimeout(timerRef.current);
            // keep visible briefly after draw, then hide quickly
            timerRef.current = setTimeout(() => {
                // fade out fast
                pathEl.style.opacity = '0';
                svgEl.style.opacity = '0';
            }, 350);
        };

        window.addEventListener('trace-snippet-connection', handleTrace);
        return () => {
            window.removeEventListener('trace-snippet-connection', handleTrace);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    // Keep SVG mounted, toggle visibility via inline styles for zero React re-renders on animation
    return createPortal(
        <svg
            ref={svgRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: 2147483647,
                opacity: 0,
                transition: 'opacity 120ms linear'
            }}
        >
            <path
                ref={pathRef}
                d="M0 0"
                stroke="#007bff"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                    filter: 'drop-shadow(0px 0px 6px rgba(0,123,255,0.7))',
                    willChange: 'stroke-dashoffset, opacity',
                    opacity: 0
                }}
            />
        </svg>,
        document.body
    );
};

export default TraceLineLayer;
