import { DETAILS_ANIMATION } from './constants';

/**
 * Toggle details element with smooth animation
 * @param {HTMLElement} detailsElement - The details element to toggle
 * @param {HTMLElement} contentDiv - The content div to animate
 */
export function toggleDetailsWithAnimation(
  detailsElement: HTMLElement,
  contentDiv: HTMLElement,
): void {
  if (!detailsElement || !contentDiv) return;

  const isOpen = detailsElement.hasAttribute('open');

  if (isOpen) {
    closeDetails(detailsElement, contentDiv);
  } else {
    openDetails(detailsElement, contentDiv);
  }
}

/**
 * Open details element with animation
 * @param {HTMLElement} detailsElement - The details element
 * @param {HTMLElement} contentDiv - The content div to animate
 */
function openDetails(detailsElement: HTMLElement, contentDiv: HTMLElement): void {
  detailsElement.setAttribute('open', '');
  contentDiv.removeAttribute('hidden');
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
 */
function closeDetails(detailsElement: HTMLElement, contentDiv: HTMLElement): void {
  contentDiv.style.maxHeight = `${contentDiv.scrollHeight}px`;

  requestAnimationFrame(() => {
    contentDiv.style.maxHeight = '0';
    contentDiv.style.opacity = '0';
  });

  setTimeout(() => {
    contentDiv.setAttribute('hidden', '');
    detailsElement.removeAttribute('open');
  }, DETAILS_ANIMATION.DURATION);
}
