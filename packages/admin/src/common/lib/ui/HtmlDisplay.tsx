import React, { useEffect, useState } from 'react';

interface HtmlDisplayProps {
  content?: string;
  className?: string;
  width?: string;
  height?: string;
}

/**
 * Renders HTML content safely inside an iframe using a blob URL
 */
export const HtmlDisplay = ({
  content,
  className = '',
  width = '100%',
  height = '500px',
}: HtmlDisplayProps) => {
  const [iframeSrc, setIframeSrc] = useState<string | null>('');

  useEffect(() => {
    if (!content) {
      setIframeSrc(null);
      return;
    }
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setIframeSrc(url);
  }, [content]);

  return (
    <div className={className}>
      {iframeSrc && <iframe src={iframeSrc} width={width} height={height} />}
    </div>
  );
};
