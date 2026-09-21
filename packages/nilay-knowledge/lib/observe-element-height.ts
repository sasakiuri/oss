/** Keep inherited offsets current without invalidating the whole page at its default size. */
export function observeElementHeight(element: HTMLElement, property: string): () => void {
  const root = document.documentElement;
  const observer = new ResizeObserver(([entry]) => {
    const height = entry!.borderBoxSize[0]!.blockSize;
    // A hidden mobile control does not contribute to the desktop offset.
    if (height === 0) return;
    const styles = getComputedStyle(root);
    const value = styles.getPropertyValue(property).trim();
    const current = parseFloat(value) * (value.endsWith('rem') ? parseFloat(styles.fontSize) : 1);
    if (height !== current) root.style.setProperty(property, `${height}px`);
  });
  observer.observe(element, { box: 'border-box' });
  return () => {
    observer.disconnect();
    root.style.removeProperty(property);
  };
}
