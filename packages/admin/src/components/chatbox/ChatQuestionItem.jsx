export default function ChatQuestionItem({ content }) {
  return (
    <div className="flex justify-end">
      <div className="bg-primary-main text-primary-contrastText rounded-lg px-4 py-2 max-w-xs">
        {content}
      </div>
    </div>
  );
}
