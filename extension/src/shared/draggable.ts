/**
 * Make a fixed-position host element draggable.
 * Works with Shadow DOM — attach listeners to an inner "handle" element.
 *
 * The host element should use `position: fixed` with bottom/right (or top/left).
 * After dragging, positioning switches to top/left to reflect the new position.
 */
export function makeDraggable(host: HTMLElement, handle: HTMLElement) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let hostX = 0;
  let hostY = 0;

  handle.style.cursor = 'grab';

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    // Only left-click; ignore if clicking a button/input inside the handle
    if (e.button !== 0) return;
    // Check composed path for interactive elements (works across Shadow DOM)
    const path = e.composedPath();
    if (path.some((el) => el instanceof HTMLElement && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName))) return;

    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = host.getBoundingClientRect();
    hostX = rect.left;
    hostY = rect.top;

    handle.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e: MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newX = Math.max(0, Math.min(window.innerWidth - 40, hostX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - 20, hostY + dy));

    host.style.left = `${newX}px`;
    host.style.top = `${newY}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.transform = 'none';
  }

  function onUp() {
    dragging = false;
    handle.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}
