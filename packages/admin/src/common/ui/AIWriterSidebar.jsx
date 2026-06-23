import { useState, useEffect, useRef } from 'react';
import { Textarea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import useAuthentication from '../api/useAuthentication.js';
import useModel from '../api/useModel.jsx';
import NotificationState from '../stores/NotificationState.js';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import RecordSelect from './RecordSelect.jsx';
import Button from './Button.jsx';
import { IconLoader2, IconSend, IconX } from '@tabler/icons-react';
import clsx from 'clsx';

export default function AIWriterSidebar({
  className,
  opened,
  onClose,
  activeContent,
  updateContentField,
  onContentInserted,
  contentType = 'page',
}) {
  const { t } = useTranslation();
  const { user } = useAuthentication();
  const { notify } = NotificationState();
  const { backendHost } = BackendHostURLState();
  const { organizationId } = OrganizationIdState();
  const messagesEndRef = useRef(null);

  const { record: orgSettings } = useModel('organization', {
    id: 1,
    autoFetch: true,
  });

  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (orgSettings?.ai_default_writing_model_id && !modelId) {
      setModelId(orgSettings.ai_default_writing_model_id);
    }
  }, [modelId, orgSettings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Clear chat on close
  useEffect(() => {
    if (!opened) {
      setMessages([]);
      setPrompt('');
    }
  }, [opened]);

  const handleSend = async () => {
    if (!prompt.trim() || !modelId || loading) return;

    const userMessage = { id: Date.now(), role: 'user', text: prompt.trim() };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setPrompt('');
    setLoading(true);

    try {
      const conversationHistory = currentMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role,
          content: m.role === 'user' ? m.text : m.generatedContent || m.text,
        }));

      const response = await fetch(`${backendHost}/page/ai_writing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
          ...(organizationId ? { 'X-Organization-Id': String(organizationId) } : {}),
        },
        body: JSON.stringify({
          model_id: modelId,
          prompt: userMessage.text,
          messages: conversationHistory,
          content_type: contentType,
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to generate content';
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || errorMsg;
        } catch {
          const errorText = await response.text();
          if (errorText) errorMsg = errorText;
        }
        throw new Error(errorMsg);
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid response from server. Please try again.');
      }

      const content = data.content || '';
      const title = data.title || '';

      if (!content) {
        throw new Error('AI returned empty content. Please try again with a different prompt.');
      }

      // Insert content and title immediately
      if (activeContent) {
        if (content) {
          updateContentField(activeContent.id, 'content', content);
        }
        if (title) {
          updateContentField(activeContent.id, 'title', title);
        }
        onContentInserted?.();
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          text: t('Done! Content has been inserted into the editor.'),
          generatedContent: content,
        },
      ]);
    } catch (error) {
      console.error(error);
      const errorMsg = error.message || 'Failed to generate AI content';
      notify({
        message: errorMsg,
        type: 'error',
      });
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          text: errorMsg,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholder =
    contentType === 'blog'
      ? t('Describe what content you want to generate...')
      : t('Describe what content you want to generate...');

  if (!opened) return null;

  return (
    <div className={clsx('bg-white border-l flex flex-col flex-shrink-0 w-96 h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">{t('AI Writer')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <IconX size={16} />
          </button>
        </div>
        <RecordSelect
          model="openrouter_model"
          displayField="string_id"
          pageSize={1000}
          searchFields={['string_id', 'name']}
          placeholder={t('Select AI model')}
          value={modelId}
          onChange={setModelId}
          size="xs"
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center text-gray-400 text-sm mt-8">
            {t('Send a message to start writing.')}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-lg px-3 py-2 text-sm">
              <IconLoader2 size={16} className="mr-2 animate-spin" />
              {t('Writing...')}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder={placeholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            minRows={3}
            maxRows={6}
            autosize
            radius="md"
            className="flex-1"
            disabled={loading}
          />
          <Button
            onClick={handleSend}
            disabled={!prompt.trim() || !modelId || loading}
            variant="filled"
            size="sm"
            className="px-3 flex-shrink-0"
          >
            <IconSend size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
