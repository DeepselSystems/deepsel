import { create } from 'zustand';
import BackendHostURLState from './BackendHostURLState.js';
import { createApiHeaders } from '../../utils/apiUtils.js';

const initialState = {
  history: [],
  question: '',
  isOpen: false,
  isLoading: false,
  streamingAnswer: null,
};

const ChatBoxState = create((set, get) => ({
  ...initialState,
  setQuestion: (question) => {
    set({ question });
  },
  toggleChatbox: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },
  closeChatbox: () => {
    set({ isOpen: false });
  },
  updateStreamingAnswer: (content, sources = null) => {
    set({
      streamingAnswer: {
        content,
        sources: sources || [],
      },
    });
  },
  completeStreamingAnswer: (onComplete) => {
    const { streamingAnswer } = get();
    if (streamingAnswer) {
      const completedAnswer = {
        id: Date.now(),
        type: 'answer',
        content: streamingAnswer.content,
        sources: streamingAnswer.sources,
        timestamp: new Date(),
      };

      set((state) => ({
        history: [...state.history, completedAnswer],
        streamingAnswer: null,
        isLoading: false,
      }));

      // Call onComplete callback if provided
      if (onComplete) {
        setTimeout(onComplete, 100);
      }
    }
  },
  sendChat: async (message, onComplete) => {
    if (!message.trim()) return;

    set({ isLoading: true, streamingAnswer: null });

    const newQuestion = {
      id: Date.now(),
      type: 'question',
      content: message,
      timestamp: new Date(),
    };

    set((state) => ({
      history: [...state.history, newQuestion],
      question: '',
    }));

    // Get current history (excluding the new question we just added)
    const currentHistory = get().history.slice(0, -1);

    try {
      const backendHost = BackendHostURLState.getState().backendHost;
      const response = await fetch(`${backendHost}/chat/stream`, {
        method: 'POST',
        headers: createApiHeaders(),
        body: JSON.stringify({
          message,
          history: currentHistory
            .filter((item) => item.content) // Only include items with content
            .map((item) => ({
              id: item.id,
              type: item.type,
              content: item.content,
              timestamp: item.timestamp.toISOString(),
            })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let streamingSources = [];

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'content') {
                  get().updateStreamingAnswer(data.content, streamingSources);
                } else if (data.type === 'sources') {
                  streamingSources = data.sources;
                  get().updateStreamingAnswer(
                    get().streamingAnswer?.content || '',
                    streamingSources,
                  );
                } else if (data.type === 'done') {
                  get().completeStreamingAnswer(onComplete);
                  return;
                }
              } catch (parseError) {
                console.error('Error parsing streaming data:', parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorAnswer = {
        id: Date.now() + 1,
        type: 'answer',
        content: 'Sorry, I encountered an error. Please try again.',
        sources: [],
        timestamp: new Date(),
      };

      set((state) => ({
        history: [...state.history, errorAnswer],
        isLoading: false,
        streamingAnswer: null,
      }));
    }
  },
}));

export default ChatBoxState;
