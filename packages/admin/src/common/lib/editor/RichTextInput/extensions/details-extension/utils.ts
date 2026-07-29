import { DETAILS_ANIMATION } from './constants';

/**
 * Toggle details element with smooth animation
 * @param {HTMLElement} detailsElement - The details element to toggle
 * @param {HTMLElement} contentDiv - The content div to animate
 * @param {(open: boolean) => void} persistOpen - Writes the new open state to
 * the actual ProseMirror node (via a transaction). This element's `hidden`
 * attribute is owned by @tiptap/extension-details-content's own NodeView,
 * which resyncs it from the node's `open` attribute on every update — so the
 * document state has to be the source of truth, not a DOM-only toggle.
 */
export function toggleDetailsWithAnimation(
  detailsElement: HTMLElement,
  contentDiv: HTMLElement,
  persistOpen: (open: boolean) => void,
): void {
  if (!detailsElement || !contentDiv) return;

  const isOpen = detailsElement.hasAttribute('open');

  if (isOpen) {
    closeDetails(detailsElement, contentDiv, persistOpen);
  } else {
    openDetails(detailsElement, contentDiv, persistOpen);
  }
}

/**
 * Open details element with animation
 * @param {HTMLElement} detailsElement - The details element
 * @param {HTMLElement} contentDiv - The content div to animate
 * @param {(open: boolean) => void} persistOpen - See toggleDetailsWithAnimation
 */
function openDetails(
  detailsElement: HTMLElement,
  contentDiv: HTMLElement,
  persistOpen: (open: boolean) => void,
): void {
  // Persist first: @tiptap/extension-details' own NodeView.update() reacts to
  // this synchronously and removes `hidden` from contentDiv itself (via its
  // 'toggleDetailsContent' event), which the animation below then builds on.
  persistOpen(true);
  detailsElement.setAttribute('open', '');
  contentDiv.style.maxHeight = '0';
  contentDiv.style.opacity = '0';

  requestAnimationFrame(() => {
    contentDiv.style.maxHeight = `${contentDiv.scrollHeight}px`;
    contentDiv.style.opacity = '1';
  });

  setTimeout(() => {
    contentDiv.style.maxHeight = 'none';
  }, DETAILS_ANIMATION.DURATION);
}

/**
 * Close details element with animation
 * @param {HTMLElement} detailsElement - The details element
 * @param {HTMLElement} contentDiv - The content div to animate
 * @param {(open: boolean) => void} persistOpen - See toggleDetailsWithAnimation
 */
function closeDetails(
  detailsElement: HTMLElement,
  contentDiv: HTMLElement,
  persistOpen: (open: boolean) => void,
): void {
  contentDiv.style.maxHeight = `${contentDiv.scrollHeight}px`;

  requestAnimationFrame(() => {
    contentDiv.style.maxHeight = '0';
    contentDiv.style.opacity = '0';
  });

  setTimeout(() => {
    detailsElement.removeAttribute('open');
    // Persist only after the collapse animation visually finishes — doing it
    // upfront would let @tiptap/extension-details-content's NodeView re-add
    // `hidden` immediately and skip the animation entirely.
    persistOpen(false);
  }, DETAILS_ANIMATION.DURATION);
}
