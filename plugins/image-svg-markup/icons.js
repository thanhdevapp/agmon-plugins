const SVG_NS = "http://www.w3.org/2000/svg";

const ICON_PATHS = {
  select: ["M4 3l12 6-5.5 1.8L8.8 16 4 3z"],
  pen: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"],
  highlighter: ["M9 11l-6 6v3h9l3-3", "M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"],
  arrow: ["M5 19L19 5", "M9 5h10v10"],
  box: ["M4 4h16v16H4z"],
  ellipse: ["M12 5a9 7 0 1 0 0 14a9 7 0 1 0 0-14z"],
  text: ["M4 7V4h16v3", "M9 20h6", "M12 4v16"],
  step: ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z", "M12 8v8", "M10 10l2-2"],
  redact: ["M3 7h18v10H3z", "M7 12h10"],
  undo: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
  redo: ["M21 7v6h-6", "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
};

export function createIcon(name, size = 14) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICON_PATHS[name] || ICON_PATHS.box) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}
