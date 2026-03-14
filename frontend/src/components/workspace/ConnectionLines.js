import React, { useMemo, memo } from "react";

const ConnectionLines = memo(({ snippets, editableBoxes, connections }) => {
  // Pre-index items for O(1) lookup
  const itemsMap = useMemo(() => {
    const map = new Map();
    snippets.forEach(s => map.set(String(s.id), s));
    editableBoxes.forEach(b => map.set(String(b.id), b));
    return map;
  }, [snippets, editableBoxes]);

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "visible", // Enable lines to draw outside initial viewport
      }}
    >
      {connections.map(({ from, to }, i) => {
        const fromNote = itemsMap.get(String(from));
        const toNote = itemsMap.get(String(to));

        if (!fromNote || !toNote) return null;

        // SKIP ANCHOR LINES (Legacy Data Support)
        // Even though new anchors aren't created, old data may exist.
        // We must hide lines connected to them to prevent visual clutter.
        if (
          fromNote.type === 'anchor' ||
          toNote.type === 'anchor' ||
          String(from).includes('anchor-') ||
          String(to).includes('anchor-')
        ) {
          return null;
        }

        // Visual offsets (centered on the item)
        // Ensure ALL values are numbers to avoid string concatenation bugs (e.g. "100" + 50 = "10050")
        const getVal = (val, defaultVal) => {
          const n = parseFloat(val);
          return (isNaN(n) || !isFinite(n)) ? defaultVal : n;
        };

        const w1 = getVal(fromNote.width, 180);
        const h1 = getVal(fromNote.height, 60);
        const w2 = getVal(toNote.width, 180);
        const h2 = getVal(toNote.height, 60);

        const x1 = getVal(fromNote.x, 0) + w1 / 2;
        const y1 = getVal(fromNote.y, 0) + h1 / 2;
        const x2 = getVal(toNote.x, 0) + w2 / 2;
        const y2 = getVal(toNote.y, 0) + h2 / 2;

        return (
          <line
            key={`${from}-${to}-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#007bff" // Brighter blue for visibility
            strokeWidth="2.5"
            strokeOpacity="0.7"
            strokeDasharray="0" // Force NO dashing
          />
        );
      })}
    </svg>
  );
});

export default ConnectionLines;
