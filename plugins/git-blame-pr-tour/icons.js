const SVG_NS = "http://www.w3.org/2000/svg";

const ICON_PATHS = {
  gitCommit: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M3 12h6", "M15 12h6"],
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z", "M21 21l-4.35-4.35"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"],
  chevronLeft: ["M15 18l-6-6 6-6"],
  chevronRight: ["M9 18l6-6-6-6"],
  refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"],
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
  for (const d of ICON_PATHS[name] || ICON_PATHS.gitCommit) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}
