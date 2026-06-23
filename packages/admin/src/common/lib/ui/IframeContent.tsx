import React, { useRef, useEffect } from 'react';

interface IframeContentProps extends React.IframeHTMLAttributes<HTMLIFrameElement> {
  html?: string;
}

/**
 * Renders HTML content directly into an iframe's document with default font styling
 */
export const IframeContent = ({ html, ...props }: IframeContentProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentWindow?.document;
      if (!doc) return;
      doc.open();
      /** Add default Helvetica font styling to the content */
      const styledHtml = `
        <style>
          body {
            font-family: Helvetica, Arial, sans-serif;
          }
        </style>
        ${html}
      `;
      doc.write(styledHtml);
      doc.close();
    }
  }, [html]);

  return <iframe ref={iframeRef} {...props} />;
};
