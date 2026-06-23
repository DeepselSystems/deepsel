import { useState, useEffect, useRef } from 'react';
import ChatBoxState from '../../common/stores/ChatBoxState.js';
import ChatQuestionItem from './ChatQuestionItem.jsx';
import ChatAnswerItem from './ChatAnswerItem.jsx';

export default function Chatbox() {
  const { isOpen, history, isLoading, streamingAnswer, toggleChatbox, closeChatbox, sendChat } =
    ChatBoxState();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, streamingAnswer]);

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendChat(inputValue, focusInput);
      setInputValue('');
      // Focus back to input after sending (for immediate response)
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50">
        <button
          onClick={toggleChatbox}
          className="bg-primary-main hover:bg-red-700 text-primary-contrastText p-4 rounded-full shadow-lg transition-colors duration-200"
          aria-label="Open chat"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 md:bottom-6 md:right-6 md:top-auto md:left-auto md:w-96 md:h-[600px] w-full h-full bg-white border-0 md:border md:border-gray-200 rounded-none md:rounded-lg shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-none md:rounded-t-lg">
        <h3 className="font-medium text-heading">How can we help?</h3>
        <button
          onClick={closeChatbox}
          className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          aria-label="Close chat"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.length === 0 && (
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-primary-main rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div className="text-primary-text">
                Hi there! Please let me know if you have any questions.
              </div>
            </div>
          </div>
        )}

        {history.map((item) => (
          <div key={item.id}>
            {item.type === 'question' ? (
              <ChatQuestionItem content={item.content} />
            ) : (
              <ChatAnswerItem content={item.content} sources={item.sources} />
            )}
          </div>
        ))}

        {streamingAnswer && (
          <div key="streaming">
            <ChatAnswerItem
              content={streamingAnswer.content}
              sources={streamingAnswer.sources}
              isStreaming={true}
            />
          </div>
        )}

        {isLoading && !streamingAnswer && (
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-primary-main rounded-full flex items-center justify-center flex-shrink-0">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="text-primary-text">Thinking...</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type here and press Enter to chat"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-1 focus:ring-primary-main focus:border-transparent"
            disabled={isLoading || streamingAnswer}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || streamingAnswer}
            className="bg-primary-main text-primary-contrastText px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
