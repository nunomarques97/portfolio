// A small HTML tree for asserting on rendered component markup in unit tests.

export interface Element {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}
export type Node = Element | string;

const voidTags = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);

/** Parses the rendered markup into a tree. Enough for component output; not a general HTML parser. */
export function parse(html: string): Element {
  const root: Element = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const pattern = /<!--[\s\S]*?-->|<\/([a-z0-9-]+)\s*>|<([a-z0-9-]+)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
  for (const match of html.matchAll(pattern)) {
    const [, closing, opening, rawAttrs = '', selfClosing, text] = match;
    const parent = stack.at(-1) ?? root;
    if (text !== undefined) {
      parent.children.push(text);
    } else if (opening) {
      const attrs: Record<string, string> = {};
      for (const [, name = '', value = ''] of rawAttrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[name] = value;
      const element: Element = { tag: opening.toLowerCase(), attrs, children: [] };
      parent.children.push(element);
      if (!selfClosing && !voidTags.has(element.tag)) stack.push(element);
    } else if (closing) {
      const index = stack.map((item) => item.tag).lastIndexOf(closing.toLowerCase());
      if (index > 0) stack.length = index;
    }
  }
  return root;
}

export function all(element: Element, test: (item: Element) => boolean): Element[] {
  return element.children.flatMap((child) =>
    typeof child === 'string' ? [] : [...(test(child) ? [child] : []), ...all(child, test)],
  );
}

export const byTag = (element: Element, tag: string) => all(element, (item) => item.tag === tag);

export function text(node: Node): string {
  const raw = typeof node === 'string' ? node : node.children.map(text).join('');
  return raw
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}
