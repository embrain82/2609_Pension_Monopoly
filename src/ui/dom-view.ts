/** 동일한 화면 요소는 유지하고 속성·텍스트만 동기화한다. 입력 포커스와 보드 노드를 보존한다. */
function key(node: Node): string {
  if (!(node instanceof Element)) return node.nodeName;
  return [node.tagName, node.id, node.getAttribute('data-key') ?? '', node.getAttribute('data-action') ?? '',
    node.getAttribute('data-view') ?? '', node.getAttribute('class')?.split(' ')[0] ?? ''].join(':');
}
function sync(current: Node, next: Node): void {
  if (current.nodeType === Node.TEXT_NODE) { if (current.textContent !== next.textContent) current.textContent = next.textContent; return; }
  if (!(current instanceof Element) || !(next instanceof Element)) return;
  for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  syncChildren(current, next);
  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) { current.checked = next.checked; if (current.value !== next.value) current.value = next.value; }
  if (current instanceof HTMLSelectElement && next instanceof HTMLSelectElement && current.value !== next.value) current.value = next.value;
}
function syncChildren(current: Node, next: Node): void {
  const unused = [...current.childNodes];
  for (const [index, desired] of [...next.childNodes].entries()) {
    const found = unused.find(node => key(node) === key(desired));
    if (found) {
      unused.splice(unused.indexOf(found), 1);
      if (current.childNodes[index] !== found) current.insertBefore(found, current.childNodes[index] ?? null);
      sync(found, desired);
    } else current.insertBefore(desired.cloneNode(true), current.childNodes[index] ?? null);
  }
  for (const node of unused) current.removeChild(node);
}
export function updateView(root: Element, html: string): void {
  const template = document.createElement('template'); template.innerHTML = html;
  syncChildren(root, template.content);
}
