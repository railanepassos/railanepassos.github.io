/**
 * Shared inline-SVG icon set (Lucide-like, 1.8 stroke). Built with
 * createElementNS so it works under the strict CSP (no innerHTML).
 * Icons are always decorative: the owning control carries the label.
 */

type Shape =
  | ["path", string]
  | ["circle", number, number, number]
  | ["rect", number, number, number, number, number]
  | ["dot", number, number, number];

const ICONS = {
  check: [["circle", 12, 12, 9], ["path", "m8 12.5 2.7 2.7L16 9.8"]],
  calendar: [["rect", 3.5, 5, 17, 15.5, 2], ["path", "M8 3v4M16 3v4M3.5 10h17"]],
  share: [["path", "M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"]],
  more: [["dot", 5, 12, 1.8], ["dot", 12, 12, 1.8], ["dot", 19, 12, 1.8]],
  plus: [["path", "M12 5v14M5 12h14"]],
  close: [["path", "M6 6l12 12M18 6 6 18"]],
  back: [["path", "m15 18-6-6 6-6"]],
  external: [["path", "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"]],
  search: [["circle", 11, 11, 7], ["path", "m20 20-3.5-3.5"]],
  home: [["path", "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"]],
  deck: [["rect", 4, 5, 12, 16, 2], ["path", "M8 3h10a2 2 0 0 1 2 2v13"]],
  shuffle: [["path", "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"]],
  logout: [["path", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"]],
  pin: [["path", "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"], ["circle", 12, 9.5, 2.5]],
  link: [["path", "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"]],
  note: [["path", "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"], ["path", "M14 3v5h5M9 13h6M9 17h4"]],
  clipboard: [["rect", 8, 3, 8, 4, 1], ["path", "M16 5h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2"]],
  heart: [["path", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"]],
  edit: [["path", "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"], ["path", "m13.5 6.5 4 4"]],
  trash: [["path", "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"]],
  tag: [["path", "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"], ["circle", 7.5, 7.5, 1.5]],
  user: [["circle", 12, 8, 4], ["path", "M4 21a8 8 0 0 1 16 0"]],
  clock: [["circle", 12, 12, 9], ["path", "M12 7v5l3 2"]],
  sparkle: [["path", "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"]],
  memory: [["path", "M4 5h16v11H8l-4 4z"]],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

const NS = "http://www.w3.org/2000/svg";

export function uiIcon(name: IconName, size = 20): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("ui-icon");

  for (const shape of ICONS[name] as Shape[]) {
    let el: SVGElement;
    if (shape[0] === "path") {
      el = document.createElementNS(NS, "path");
      el.setAttribute("d", shape[1]);
    } else if (shape[0] === "rect") {
      el = document.createElementNS(NS, "rect");
      el.setAttribute("x", String(shape[1]));
      el.setAttribute("y", String(shape[2]));
      el.setAttribute("width", String(shape[3]));
      el.setAttribute("height", String(shape[4]));
      el.setAttribute("rx", String(shape[5]));
    } else {
      el = document.createElementNS(NS, "circle");
      el.setAttribute("cx", String(shape[1]));
      el.setAttribute("cy", String(shape[2]));
      el.setAttribute("r", String(shape[3]));
      if (shape[0] === "dot") {
        el.setAttribute("fill", "currentColor");
        el.setAttribute("stroke", "none");
      }
    }
    svg.appendChild(el);
  }
  return svg;
}
