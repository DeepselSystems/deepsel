import { Extension } from '@tiptap/core';
import { EditorState, Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { AUTOCOMPLETE_CONSTANTS } from './constants';
import { createGhostTextCSS, isIncompleteSentence, isRelevantKey } from './utils';

interface AutocompleteOptions {
  fetchAutocompletion: ((text: string, position: number) => Promise<string>) | null;
  backendHost: string;
  enabled: boolean;
}

interface AutocompletePluginState {
  suggestion: string;
  isLoading: boolean;
  abortController: AbortController | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  hasFocus: boolean;
  view: EditorView | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    autocomplete: {
      setSuggestion: (suggestion: string) => ReturnType;
      clearSuggestion: () => ReturnType;
    };
  }
}

/**
 * Custom Tiptap extension for AI-powered autocomplete with Tab functionality
 * Features:
 * - 1000ms debounce for API calls
 * - Cancel pending requests on every keystroke
 * - Tab key accepts entire suggestion at once
 * - Shows "Tab" badge at end of ghost text
 */
export const AutocompleteExtension = Extension.create<AutocompleteOptions>({
  name: 'autocomplete',

  addOptions() {
    return {
      fetchAutocompletion: null,
      backendHost: '',
      enabled: true,
    };
  },

  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const extension = this;
    const { fetchAutocompletion, backendHost, enabled } = this.options;

    if (!enabled || (!fetchAutocompletion && !backendHost)) {
      return [];
    }

    if (typeof document !== 'undefined') {
      const styleId = 'autocomplete-extension-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = createGhostTextCSS();
        document.head.appendChild(style);
      }
    }

    const pluginKey = new PluginKey<AutocompletePluginState>('autocomplete');

    return [
      new Plugin<AutocompletePluginState>({
        key: pluginKey,

        state: {
          init(): AutocompletePluginState {
            return {
              suggestion: '',
              isLoading: false,
              abortController: null,
              debounceTimer: null,
              hasFocus: true,
              view: null,
            };
          },

          apply(
            transaction: Transaction,
            oldState: AutocompletePluginState,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _oldEditorState: EditorState,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _newEditorState: EditorState,
          ): AutocompletePluginState {
            const newState = { ...oldState };
            const suggestionUpdate = transaction.getMeta('autocomplete-suggestion-update');

            if (transaction.docChanged) {
              newState.suggestion = '';
              newState.abortController?.abort();
              newState.abortController = null;
              newState.isLoading = false;

              if (newState.debounceTimer) {
                clearTimeout(newState.debounceTimer);
                newState.debounceTimer = null;
              }

              if (enabled && (fetchAutocompletion || backendHost)) {
                newState.debounceTimer = setTimeout(() => {
                  const view = extension?.editor?.view;
                  if (!view) {
                    return;
                  }

                  void checkForSuggestion(view, pluginKey, fetchAutocompletion, backendHost);
                }, AUTOCOMPLETE_CONSTANTS.DEBOUNCE_DELAY);

                if (newState.debounceTimer) {
                  newState.isLoading = true;
                }
              }
            }

            if (
              transaction.selectionSet &&
              !transaction.docChanged &&
              !transaction.getMeta('autocomplete-suggestion-update')
            ) {
              newState.suggestion = '';
              newState.abortController?.abort();
              newState.abortController = null;
              newState.isLoading = false;
              if (newState.debounceTimer) {
                clearTimeout(newState.debounceTimer);
                newState.debounceTimer = null;
              }
            }

            if (suggestionUpdate) {
              return {
                ...newState,
                ...suggestionUpdate,
              };
            }

            return newState;
          },
        },

        props: {
          handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
            const pluginState = pluginKey.getState(view.state);

            if (!pluginState || !isRelevantKey(event)) {
              return false;
            }

            if (event.key === AUTOCOMPLETE_CONSTANTS.KEYS.TAB && pluginState.suggestion) {
              event.preventDefault();

              const { state, dispatch } = view;
              const { from } = state.selection;

              const tr = state.tr
                .insertText(pluginState.suggestion, from, from)
                .setMeta('autocomplete-suggestion-update', {
                  ...pluginState,
                  suggestion: '',
                });

              dispatch(tr);
              return true;
            }

            if (event.key === AUTOCOMPLETE_CONSTANTS.KEYS.ESCAPE && pluginState.suggestion) {
              event.preventDefault();

              const { state, dispatch } = view;

              pluginState.abortController?.abort();
              pluginState.abortController = null;

              if (pluginState.debounceTimer) {
                clearTimeout(pluginState.debounceTimer);
                pluginState.debounceTimer = null;
              }

              const newPluginState = { ...pluginState, suggestion: '' };
              const tr = state.tr.setMeta('autocomplete-suggestion-update', newPluginState);
              tr.setMeta(AUTOCOMPLETE_CONSTANTS.EVENTS.DISMISS, true);
              dispatch(tr);

              return true;
            }

            return false;
          },

          decorations(state: EditorState): DecorationSet | null {
            const pluginState = pluginKey.getState(state);

            if (!pluginState?.suggestion || typeof document === 'undefined') {
              return null;
            }

            if (pluginState.view && !pluginState.view.hasFocus()) {
              return null;
            }

            const { from } = state.selection;

            const container = document.createElement('span');
            container.className = AUTOCOMPLETE_CONSTANTS.CSS_CLASSES.CONTAINER;
            container.style.pointerEvents = 'none';
            container.style.userSelect = 'none';

            const suggestionSpan = document.createElement('span');
            suggestionSpan.className = AUTOCOMPLETE_CONSTANTS.CSS_CLASSES.GHOST_TEXT;
            suggestionSpan.textContent = pluginState.suggestion;

            const badge = document.createElement('span');
            badge.className = AUTOCOMPLETE_CONSTANTS.CSS_CLASSES.TAB_BADGE;
            badge.textContent = AUTOCOMPLETE_CONSTANTS.TAB_BADGE_TEXT;

            container.appendChild(suggestionSpan);
            container.appendChild(badge);

            return DecorationSet.create(state.doc, [Decoration.widget(from, container)]);
          },
        },

        view(editorView: EditorView) {
          const pluginState = pluginKey.getState(editorView.state);
          if (pluginState && !pluginState.view) {
            editorView.dispatch(
              editorView.state.tr.setMeta('autocomplete-suggestion-update', {
                view: editorView,
              }),
            );
          }

          const handleFocusOut = (event: FocusEvent) => {
            if (
              !event.relatedTarget ||
              !(event.relatedTarget instanceof Node) ||
              !editorView.dom.contains(event.relatedTarget)
            ) {
              const currentPluginState = pluginKey.getState(editorView.state);
              if (currentPluginState) {
                currentPluginState.abortController?.abort();
                currentPluginState.abortController = null;

                if (currentPluginState.debounceTimer) {
                  clearTimeout(currentPluginState.debounceTimer);
                  currentPluginState.debounceTimer = null;
                }

                const { state, dispatch } = editorView;
                const tr = state.tr.setMeta('autocomplete-suggestion-update', {
                  ...currentPluginState,
                  hasFocus: false,
                  suggestion: '',
                  isLoading: false,
                  abortController: null,
                });
                dispatch(tr);
              }
            }
          };

          const handleFocusIn = (event: FocusEvent) => {
            if (event.target instanceof Node && editorView.dom.contains(event.target)) {
              const currentPluginState = pluginKey.getState(editorView.state);
              if (currentPluginState) {
                const { state, dispatch } = editorView;
                const tr = state.tr.setMeta('autocomplete-suggestion-update', {
                  ...currentPluginState,
                  hasFocus: true,
                });
                dispatch(tr);
              }
            }
          };

          editorView.dom.addEventListener('focusout', handleFocusOut);
          editorView.dom.addEventListener('focusin', handleFocusIn);

          return {
            update: (view: EditorView, prevState: EditorState) => {
              const prevPluginState = pluginKey.getState(prevState);
              const currentPluginState = pluginKey.getState(view.state);

              if (prevPluginState?.suggestion !== currentPluginState?.suggestion) {
                if (typeof view.updateState === 'function') {
                  view.updateState(view.state);
                }
              }
            },

            destroy: () => {
              editorView.dom.removeEventListener('focusout', handleFocusOut);
              editorView.dom.removeEventListener('focusin', handleFocusIn);

              const pluginState = pluginKey.getState(editorView.state);
              if (pluginState?.abortController) {
                pluginState.abortController.abort();
                pluginState.abortController = null;
              }

              if (pluginState?.debounceTimer) {
                clearTimeout(pluginState.debounceTimer);
              }
            },
          };
        },
      }),
    ];
  },
});

/**
 * Check for and fetch autocomplete suggestions
 */
async function checkForSuggestion(
  view: EditorView,
  pluginKey: PluginKey<AutocompletePluginState>,
  fetchAutocompletion: ((text: string, position: number) => Promise<string>) | null,
  backendHost: string,
): Promise<void> {
  const { state } = view;
  const pluginState = pluginKey.getState(state);

  if (!pluginState) {
    return;
  }

  pluginState.debounceTimer = null;

  if (pluginState.abortController) {
    pluginState.abortController.abort();
  }

  const abortController = new AbortController();
  pluginState.abortController = abortController;

  view.dispatch(
    state.tr.setMeta('autocomplete-suggestion-update', {
      isLoading: true,
      abortController,
    }),
  );

  try {
    const text = state.doc.textBetween(0, state.doc.content.size, '\n');
    const position = state.selection.from;

    if (text.trim().length < AUTOCOMPLETE_CONSTANTS.MIN_TEXT_LENGTH) {
      view.dispatch(
        state.tr.setMeta('autocomplete-suggestion-update', {
          suggestion: '',
          isLoading: false,
          abortController: null,
        }),
      );
      return;
    }

    if (!isIncompleteSentence(text, position)) {
      view.dispatch(
        state.tr.setMeta('autocomplete-suggestion-update', {
          suggestion: '',
          isLoading: false,
          abortController: null,
        }),
      );
      return;
    }

    let suggestion = '';

    if (fetchAutocompletion) {
      suggestion = await fetchAutocompletion(text, position);
    } else {
      const orgId =
        typeof window !== 'undefined'
          ? parseInt(localStorage.getItem('organizationId') || '', 10)
          : NaN;

      const response = await fetch(`${backendHost}${AUTOCOMPLETE_CONSTANTS.API_ENDPOINT}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(Number.isFinite(orgId) ? { 'X-Organization-Id': String(orgId) } : {}),
        },
        body: JSON.stringify({
          text,
          cursor_position: position,
        }),
        signal: abortController.signal,
      });

      if (response.ok) {
        const data = await response.json();
        suggestion = data.completion || data.suggestions?.[0] || '';
      }
    }

    view.dispatch(
      state.tr.setMeta('autocomplete-suggestion-update', {
        suggestion: suggestion || '',
        isLoading: false,
        abortController: null,
      }),
    );
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('Error fetching autocomplete suggestion:', error);
    }
    view.dispatch(
      state.tr.setMeta('autocomplete-suggestion-update', {
        suggestion: '',
        isLoading: false,
        abortController: null,
      }),
    );
  } finally {
    if (pluginState.abortController === abortController) {
      pluginState.abortController = null;
    }
  }
}

export default AutocompleteExtension;
