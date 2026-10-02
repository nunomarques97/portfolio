// Lays out an architecture diagram (see `Diagram` in src/content/case-studies) for Diagram.astro.
// Nodes stack top to bottom in one column, so the drawing keeps the same reading order at every width. An edge to
// the next node is a straight arrow with its label in the gap; an edge further down runs in a lane on the right and
// an edge back up runs in a lane on the left. Labels are wrapped here because SVG text does not wrap on its own.
import type { Diagram, DiagramEdge, DiagramNode, DiagramNodeKind } from '../content/case-studies';

/** Width of the viewBox. At 390 px the drawing is about 350 px wide, so one unit is at least one CSS pixel. */
export const VIEW_WIDTH = 320;

/** Font sizes in viewBox units. The smallest stays at 12 CSS px or more whenever the drawing is 320 px wide or more. */
export const FONT = { label: 15, detail: 13, edge: 12, group: 12 } as const;

const PAD = 12;
const LANE_SPACING = 10;
const LANE_MARGIN = 8;
const GROUP_INSET = 10;
const GROUP_HEADER = 26;
const GROUP_FOOTER = 10;
const NODE_PAD_X = 12;
const NODE_PAD_Y = 10;
const LABEL_LINE = 19;
const DETAIL_LINE = 17;
const EDGE_LINE = 15;
const GAP_MIN = 24;
const GAP_PLAIN = 14;
const ARROW_INSET = 22;
const ARROW_HEAD = 8;
// Extra top padding of a data store, below the band that marks it.
const STORE_BAND = 6;

// Average glyph widths as a share of the font size, rounded up so estimated lines are never shorter than drawn ones.
const GLYPH = { label: 0.62, detail: 0.57, edge: 0.57, group: 0.74 } as const;

export interface TextLine {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export interface NodeBox {
  readonly id: string;
  readonly kind: DiagramNodeKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: readonly TextLine[];
  readonly detail: readonly TextLine[];
}

export interface GroupBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Drawn right-aligned at `x`. */
  readonly label: TextLine;
}

export interface EdgePath {
  readonly from: string;
  readonly to: string;
  /** SVG path data of the line, ending where the arrowhead starts. */
  readonly line: string;
  /** Points of the arrowhead triangle. */
  readonly head: string;
  /** Label lines drawn beside a straight arrow; lane edges carry theirs in the text equivalent only. */
  readonly label: readonly TextLine[];
}

export interface DiagramLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly NodeBox[];
  readonly groups: readonly GroupBox[];
  readonly edges: readonly EdgePath[];
}

/** Splits `text` into lines of at most `max` characters, breaking words only when one is longer than a line. */
export function wrap(text: string, max: number): string[] {
  const limit = Math.max(1, Math.floor(max));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest.length > limit) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= limit) line = `${line} ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const charsFor = (width: number, role: keyof typeof GLYPH) => width / (FONT[role] * GLYPH[role]);

/** Throws when the diagram refers to unknown nodes or groups, or splits a group. */
export function validateDiagram(diagram: Diagram): void {
  const ids = new Set<string>();
  for (const node of diagram.nodes) {
    if (ids.has(node.id)) throw new Error(`diagram "${diagram.title}": duplicate node id "${node.id}"`);
    ids.add(node.id);
  }
  const groups = new Set((diagram.groups ?? []).map((group) => group.id));
  const closed = new Set<string>();
  let current: string | undefined;
  for (const node of diagram.nodes) {
    if (node.group !== undefined && !groups.has(node.group)) {
      throw new Error(`diagram "${diagram.title}": node "${node.id}" is in unknown group "${node.group}"`);
    }
    if (node.group !== current) {
      if (current !== undefined) closed.add(current);
      if (node.group !== undefined && closed.has(node.group)) {
        throw new Error(`diagram "${diagram.title}": the nodes of group "${node.group}" are not consecutive`);
      }
      current = node.group;
    }
  }
  for (const edge of diagram.edges) {
    for (const end of [edge.from, edge.to]) {
      if (!ids.has(end)) throw new Error(`diagram "${diagram.title}": edge refers to unknown node "${end}"`);
    }
    if (edge.from === edge.to) throw new Error(`diagram "${diagram.title}": edge from "${edge.from}" to itself`);
  }
}

export function layoutDiagram(diagram: Diagram): DiagramLayout {
  validateDiagram(diagram);
  const { nodes } = diagram;
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const at = (id: string) => index.get(id) as number;

  const adjacent = new Map<number, DiagramEdge>();
  const down: DiagramEdge[] = [];
  const up: DiagramEdge[] = [];
  for (const edge of diagram.edges) {
    const from = at(edge.from);
    const to = at(edge.to);
    if (to === from + 1 && !adjacent.has(from)) adjacent.set(from, edge);
    else (to > from ? down : up).push(edge);
  }
  // The longest edge takes the outermost lane, so shorter ones nest inside it.
  const span = (edge: DiagramEdge) => Math.abs(at(edge.to) - at(edge.from));
  down.sort((a, b) => span(b) - span(a));
  up.sort((a, b) => span(b) - span(a));

  const laneArea = (count: number) => (count ? LANE_MARGIN + count * LANE_SPACING : 0);
  const contentLeft = PAD + laneArea(up.length);
  const contentRight = VIEW_WIDTH - PAD - laneArea(down.length);

  const groupLabel = new Map((diagram.groups ?? []).map((group) => [group.id, group.label]));
  const boxes: NodeBox[] = [];
  const groups: GroupBox[] = [];
  const gaps = new Map<number, { top: number; bottom: number }>();
  let open: { id: string; top: number } | null = null;
  let y = PAD;

  const closeGroup = () => {
    if (!open) return;
    y += GROUP_FOOTER;
    groups.push({
      id: open.id,
      x: contentLeft,
      y: open.top,
      width: contentRight - contentLeft,
      height: y - open.top,
      // Right-aligned, clear of the arrow that enters the group on the left.
      label: { x: contentRight - GROUP_INSET, y: open.top + 17, text: (groupLabel.get(open.id) ?? '').toUpperCase() },
    });
    open = null;
  };

  nodes.forEach((node: DiagramNode, position) => {
    if (position > 0) {
      if (open && open.id !== node.group) closeGroup();
      const edge = adjacent.get(position - 1);
      const lines = edge?.label ? wrap(edge.label, charsFor(edgeLabelWidth(), 'edge')).length : 0;
      const top = y;
      y += edge ? Math.max(GAP_MIN, lines * EDGE_LINE + 12) : GAP_PLAIN;
      gaps.set(position - 1, { top, bottom: y });
    }
    if (node.group !== undefined && open?.id !== node.group) {
      open = { id: node.group, top: y };
      y += GROUP_HEADER;
    }
    const inset = node.group !== undefined ? GROUP_INSET : 0;
    const x = contentLeft + inset;
    const width = contentRight - contentLeft - 2 * inset;
    const textX = x + NODE_PAD_X;
    const textWidth = width - 2 * NODE_PAD_X;
    const labelLines = wrap(node.label, charsFor(textWidth, 'label'));
    const detailLines = node.detail ? wrap(node.detail, charsFor(textWidth, 'detail')) : [];
    const bandTop = node.kind === 'store' ? STORE_BAND : 0;
    let baseline = y + bandTop + NODE_PAD_Y + FONT.label - 2;
    const label = labelLines.map((text) => {
      const line = { x: textX, y: baseline, text };
      baseline += LABEL_LINE;
      return line;
    });
    baseline += DETAIL_LINE - LABEL_LINE + 2;
    const detail = detailLines.map((text) => {
      const line = { x: textX, y: baseline, text };
      baseline += DETAIL_LINE;
      return line;
    });
    const height =
      bandTop + NODE_PAD_Y * 2 + labelLines.length * LABEL_LINE + (detailLines.length ? detailLines.length * DETAIL_LINE + 2 : 0);
    boxes.push({ id: node.id, kind: node.kind, x, y, width, height, label, detail });
    y += height;
  });
  closeGroup();
  y += PAD;

  function edgeLabelWidth() {
    // The widest box is outside any group; inside one the label still fits, because the arrow moves in with it.
    return contentRight - contentLeft - 2 * GROUP_INSET - ARROW_INSET - 10 - NODE_PAD_X;
  }

  const edges: EdgePath[] = [];
  for (const [from, edge] of adjacent) {
    const source = boxes[from] as NodeBox;
    const target = boxes[from + 1] as NodeBox;
    const x = Math.max(source.x, target.x) + ARROW_INSET;
    const top = source.y + source.height;
    const bottom = target.y;
    const gap = gaps.get(from) as { top: number; bottom: number };
    const lines = edge.label ? wrap(edge.label, charsFor(edgeLabelWidth(), 'edge')) : [];
    let baseline = gap.top + (gap.bottom - gap.top - lines.length * EDGE_LINE) / 2 + FONT.edge - 1;
    const label = lines.map((text) => {
      const line = { x: x + 10, y: baseline, text };
      baseline += EDGE_LINE;
      return line;
    });
    edges.push({
      from: edge.from,
      to: edge.to,
      line: `M ${x} ${top} V ${bottom - ARROW_HEAD}`,
      head: `${x - 5},${bottom - ARROW_HEAD} ${x + 5},${bottom - ARROW_HEAD} ${x},${bottom}`,
      label,
    });
  }

  // Where several lane edges meet one box, their ends are spread along its side.
  const ends = new Map<string, string[]>();
  for (const edge of [...down, ...up]) {
    for (const end of [edge.from, edge.to]) ends.set(end, [...(ends.get(end) ?? []), `${edge.from}>${edge.to}`]);
  }
  const endY = (id: string, key: string) => {
    const box = boxes[at(id)] as NodeBox;
    const list = ends.get(id) ?? [key];
    const offset = (list.indexOf(key) - (list.length - 1) / 2) * 10;
    return box.y + box.height / 2 + offset;
  };

  const laneEdges = (list: DiagramEdge[], side: 'left' | 'right') =>
    list.forEach((edge, lane) => {
      const key = `${edge.from}>${edge.to}`;
      const source = boxes[at(edge.from)] as NodeBox;
      const target = boxes[at(edge.to)] as NodeBox;
      const sy = endY(edge.from, key);
      const ty = endY(edge.to, key);
      if (side === 'right') {
        const laneX = VIEW_WIDTH - PAD - 4 - lane * LANE_SPACING;
        const sx = source.x + source.width;
        const tx = target.x + target.width;
        edges.push({
          from: edge.from,
          to: edge.to,
          line: `M ${sx} ${sy} H ${laneX} V ${ty} H ${tx + ARROW_HEAD}`,
          head: `${tx + ARROW_HEAD},${ty - 5} ${tx + ARROW_HEAD},${ty + 5} ${tx},${ty}`,
          label: [],
        });
      } else {
        const laneX = PAD + 4 + lane * LANE_SPACING;
        const sx = source.x;
        const tx = target.x;
        edges.push({
          from: edge.from,
          to: edge.to,
          line: `M ${sx} ${sy} H ${laneX} V ${ty} H ${tx - ARROW_HEAD}`,
          head: `${tx - ARROW_HEAD},${ty - 5} ${tx - ARROW_HEAD},${ty + 5} ${tx},${ty}`,
          label: [],
        });
      }
    });
  laneEdges(down, 'right');
  laneEdges(up, 'left');

  return { width: VIEW_WIDTH, height: y, nodes: boxes, groups, edges };
}

export interface FlowStep {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly group?: string;
  /** Edges leaving this node, in diagram order. */
  readonly next: readonly { readonly to: string; readonly label?: string }[];
}

/** The text equivalent of the drawing: every node in order, with where it sends what. */
export function flowSteps(diagram: Diagram): FlowStep[] {
  const labelOf = new Map(diagram.nodes.map((node) => [node.id, node.label]));
  const groupOf = new Map((diagram.groups ?? []).map((group) => [group.id, group.label]));
  return diagram.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    detail: node.detail,
    group: node.group === undefined ? undefined : groupOf.get(node.group),
    next: diagram.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => ({ to: labelOf.get(edge.to) ?? edge.to, label: edge.label })),
  }));
}
