import Details from '@tiptap/extension-details';
import DetailsContent from '@tiptap/extension-details-content';
import DetailsSummary from '@tiptap/extension-details-summary';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { toggleDetailsWithAnimation } from './utils';
import { DETAILS_CLASSES } from './constants';

/**
 * Enhanced Details extension with smooth animation support
 * Extends the default TipTap Details extension with custom click handling
 */
const EnhancedDetails = Details.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      persist: true,
      HTMLAttributes: {
        class: DETAILS_CLASSES.WRAPPER,
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || [];

    return [
      ...parentPlugins,
      new Plugin({
        key: new PluginKey('detailsAnimationPlugin'),
        props: {
          handleDOMEvents: {
            click: (view: EditorView, event: Event) => {
              const mouseEvent = event as MouseEvent;
              const target = mouseEvent.target as HTMLElement;

              if (target.tagName === 'SUMMARY') {
                const detailsElement =
                  target.closest('details') || target.closest(`.${DETAILS_CLASSES.WRAPPER}`);

                if (detailsElement) {
                  event.preventDefault();
                  event.stopPropagation();

                  const contentDiv = detailsElement.querySelector(
                    'div[data-type="detailsContent"]',
                  );

                  if (contentDiv && contentDiv instanceof HTMLElement) {
                    toggleDetailsWithAnimation(detailsElement as HTMLElement, contentDiv);
                  }

                  return true;
                }
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});

export { EnhancedDetails, DetailsContent, DetailsSummary };
