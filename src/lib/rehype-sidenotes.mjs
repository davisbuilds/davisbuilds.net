// WHY: Attach each note after the citing block so the same markup can appear beside the essay or inline on narrow screens.

const isEl = (n, tag) => n && n.type === 'element' && (!tag || n.tagName === tag);

function walk(node, fn, parent = null) {
  fn(node, parent);
  if (node.children) for (const c of [...node.children]) walk(c, fn, node);
}

function noteBody(li) {
  walk(li, (n, parent) => {
    if (isEl(n, 'a') && n.properties?.dataFootnoteBackref !== undefined) {
      parent.children = parent.children.filter((c) => c !== n);
    }
  });
  const blocks = li.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  // WHY: Trim the space GFM leaves before the removed back-reference.
  const last = blocks.at(-1);
  const tail = last?.children?.at(-1);
  if (tail?.type === 'text') tail.value = tail.value.replace(/\s+$/, '');
  return blocks;
}

export default function rehypeSidenotes() {
  return (tree) => {
    const section = tree.children.find((n) => isEl(n, 'section') && n.properties?.dataFootnotes !== undefined);
    if (!section) return;
    tree.children = tree.children.filter((n) => n !== section);

    const defs = new Map();
    walk(section, (n) => {
      if (isEl(n, 'li') && typeof n.properties?.id === 'string') {
        defs.set(n.properties.id.replace(/^user-content-fn-/, ''), n);
      }
    });

    const placed = new Set();
    const out = [];
    for (const block of tree.children) {
      const notes = [];
      walk(block, (n, parent) => {
        if (!isEl(n, 'sup') || !parent) return;
        const a = n.children.find((c) => isEl(c, 'a') && c.properties?.dataFootnoteRef !== undefined);
        if (!a) return;
        const name = String(a.properties.href).replace(/^#user-content-fn-/, '');
        const num = a.children.map((c) => c.value ?? '').join('');
        const first = !placed.has(name);
        const marker = {
          type: 'element',
          tagName: 'a',
          properties: { className: ['ref'], href: `#sn-${name}`, dataNote: `sn-${name}`, ...(first ? { id: `ref-${name}` } : {}) },
          children: [{ type: 'text', value: num }],
        };
        parent.children = parent.children.map((c) => (c === n ? marker : c));
        if (first && defs.has(name)) {
          placed.add(name);
          notes.push({ name, num, body: noteBody(defs.get(name)) });
        }
      });
      out.push(block);
      for (const { name, num, body } of notes) {
        const label = { type: 'element', tagName: 'b', properties: {}, children: [{ type: 'text', value: `${num}.` }] };
        const [head, ...rest] = body;
        if (isEl(head, 'p')) head.children = [label, { type: 'text', value: ' ' }, ...head.children];
        else body.unshift(label);
        out.push({
          type: 'element',
          tagName: 'aside',
          properties: { className: ['sidenote'], id: `sn-${name}`, role: 'note' },
          children: isEl(head, 'p') ? [head, ...rest] : body,
        });
      }
    }
    tree.children = out;
  };
}
