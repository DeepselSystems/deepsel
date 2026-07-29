import Details from '@tiptap/extension-details';
import DetailsContent from '@tiptap/extension-details-content';
import DetailsSummary from '@tiptap/extension-details-summary';
import { findParentNode } from '@tiptap/core';
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
    const detailsType = this.type;
    const editor = this.editor;

    return [
      ...parentPlugins,
      new Plugin({
        key: new PluginKey('detailsAnimationPlugin'),
        props: {
          handleDOMEvents: {
            click: (view: EditorView, event: Event) => {
              const mouseEvent = event as MouseEvent;
              const target = mouseEvent.target as HTMLElement;

              // `.closest('summary')`, not a `target.tagName === 'SUMMARY'`
              // equality check: once the summary's text carries any mark
              // (e.g. after typing, TipTap wraps it in <strong>/<em>/etc.),
              // the actual click target is that inline element, not
              // <summary> itself, and an exact-tag check silently drops the
              // click — confirmed live: a second click meant to re-close an
              // already-titled collapse never reached this handler at all.
              const summaryElement = target.closest('summary');

              if (summaryElement) {
                const detailsElement =
                  target.closest('details') || target.closest(`.${DETAILS_CLASSES.WRAPPER}`);

                if (detailsElement) {
                  event.preventDefault();
                  event.stopPropagation();

                  const contentDiv = detailsElement.querySelector(
                    'div[data-type="detailsContent"]',
                  );

                  // ProseMirror's selection is already resolved into the clicked
                  // summary by mousedown time (fires before this click handler),
                  // so the details node is reliably the selection's own parent —
                  // same lookup @tiptap/extension-details' own toggle button uses.
                  const match = findParentNode((node) => node.type === detailsType)(
                    view.state.selection,
                  );

                  if (contentDiv && contentDiv instanceof HTMLElement && match) {
                    // Persisting via a real transaction (not raw DOM writes) is
                    // required: @tiptap/extension-details-content's NodeView
                    // resets `hidden` from the node's own `open` attribute on
                    // *any* nearby transaction (e.g. typing in the summary). A
                    // DOM-only toggle here left that attribute permanently
                    // false, so the very next keystroke silently re-hid the
                    // content div — see harden-page-module memory, TC_014.
                    // Mirrors @tiptap/extension-details' own official toggle
                    // button handler exactly (setNodeMarkup + setTextSelection
                    // + focus), rather than a raw view.dispatch. A bare
                    // dispatch left the browser's native DOM selection out of
                    // sync with ProseMirror's — confirmed via a MutationObserver
                    // trace: the next native keystroke (Home) triggered the
                    // browser's own contenteditable DOM repair, which
                    // ProseMirror then reconciled by fully recreating
                    // `summary`/`detailsContent`'s node views — and a freshly
                    // created DetailsContent NodeView always starts `hidden`
                    // (see its own addNodeView), permanently re-breaking this.
                    // The explicit .focus() call is what the official handler
                    // has that a raw dispatch doesn't — see TC_014.
                    const persistOpen = (open: boolean) => {
                      const { from, to } = editor.state.selection;
                      editor
                        .chain()
                        .command(({ tr }) => {
                          const currentNode = tr.doc.nodeAt(match.pos);
                          if (currentNode?.type !== detailsType) {
                            return false;
                          }
                          tr.setNodeMarkup(match.pos, undefined, { open });
                          return true;
                        })
                        .setTextSelection({ from, to })
                        .focus(undefined, { scrollIntoView: false })
                        .run();
                    };
                    toggleDetailsWithAnimation(
                      detailsElement as HTMLElement,
                      contentDiv,
                      persistOpen,
                    );
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
