const SVG_NS = "http://www.w3.org/2000/svg";

const ICON_PATHS = {
  box: ["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"],
  diamond: ["M12 2 22 12 12 22 2 12Z"],
  database: ["M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3Z", "M3 6v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6", "M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"],
  sticky: ["M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z", "M15 3v6h6"],
  arrow: ["M5 12h14", "M13 5l7 7-7 7"],
  undo: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
  redo: ["M21 7v6h-6", "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"],
  zoomIn: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z", "M21 21l-4.35-4.35", "M11 8v6", "M8 11h6"],
  zoomOut: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z", "M21 21l-4.35-4.35", "M8 11h6"],
  sun: ["M12 4V2", "M12 22v-2", "M4.93 4.93l1.41 1.41", "M17.66 17.66l1.41 1.41", "M2 12h2", "M20 12h2", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  save: ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z", "M17 21v-8H7v8", "M7 3v5h8"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"],
};

export function createIcon(name, size = 14) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  for (const d of ICON_PATHS[name] || ICON_PATHS.box) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}
