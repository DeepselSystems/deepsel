export default function ChatAnswerItem({ content, sources = [], isStreaming = false }) {
  return (
    <div className="bg-gray-100 rounded-lg p-4">
      <div className="flex items-start space-x-3">
        <div className="w-8 h-8 bg-primary-main rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <div className="text-primary-text flex-1">
          <div>
            {content}
            {isStreaming && (
              <span className="inline-block w-2 h-5 bg-primary-main ml-1 animate-pulse"></span>
            )}
          </div>
          {sources && sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-chateau mb-2">Sources:</div>
              <div className="space-y-1">
                {sources.map((source, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                    <a
                      href={source.url}
                      className="text-sm text-primary-main hover:text-red-700 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}
                    </a>
                    <span className="text-xs text-gray-400 px-1 py-0.5 bg-gray-200 rounded">
                      {source.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
