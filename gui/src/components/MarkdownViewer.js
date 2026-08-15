import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownViewer({ content, filePath, onClose }) {
  let processedContent = content || "";
  // Strip block-level XML tags at start of lines
  processedContent = processedContent.replace(/^<[A-Z]+(?: [^>]*)?>\s*/gm, "");
  
  // Remove duplicate top-level title: find first two H1s, if their text content is identical, remove the first one
  const lines = processedContent.split('\n');
  let firstH1Index = -1;
  let firstH1Text = "";
  for (let i = 0; i < lines.length && i < 20; i++) {
    const match = lines[i].match(/^#\s+(.*?)(?:\s+\{#.*?\})?\s*$/);
    if (match) {
      if (firstH1Index === -1) {
        firstH1Index = i;
        firstH1Text = match[1].trim();
      } else {
        if (match[1].trim() === firstH1Text) {
          lines[firstH1Index] = ""; // Blank out the duplicate title
          break;
        }
      }
    }
  }
  processedContent = lines.join('\n');

  // Custom renderers for ReactMarkdown
  const components = {
    // Custom header rendering to extract and hide {#namespace:slug:id} and assign it as the HTML id
    ...[1, 2, 3, 4, 5, 6].reduce((acc, level) => {
      acc[`h${level}`] = ({ node, children, ...props }) => {
        const Tag = `h${level}`;
        let id = '';

        // We need to inspect the children (which could be nested, but usually the {#id} is at the very end of the string array)
        // A simple approach is to map over children, find a string matching \{#([^}]+)\}, extract it, and remove it.
        const cleanChildren = React.Children.toArray(children).map(child => {
          if (typeof child === 'string') {
            const match = child.match(/\{#([^}]+)\}/);
            if (match) {
              id = match[1];
              return child.replace(/\{#([^}]+)\}/, '').trim();
            }
          }
          return child;
        });

        // Use standard tailwind typography classes based on header level
        const sizes = {
          1: 'text-4xl font-bold mt-8 mb-4 border-b border-gray-700 pb-2',
          2: 'text-3xl font-bold mt-8 mb-4 border-b border-gray-800 pb-2',
          3: 'text-2xl font-semibold mt-6 mb-3',
          4: 'text-xl font-semibold mt-4 mb-2',
          5: 'text-lg font-semibold mt-4 mb-2',
          6: 'text-base font-semibold mt-4 mb-2 text-gray-400 uppercase tracking-wider',
        };

        return (
          <Tag id={id} className={sizes[level]} {...props}>
            {cleanChildren}
          </Tag>
        );
      };
      return acc;
    }, {}),

    // Custom link rendering to handle anchor jump links
    a: ({ node, href, children, ...props }) => {
      if (href && href.startsWith('#')) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              const targetId = href.substring(1);
              const targetElement = document.getElementById(targetId);
              if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/30 hover:decoration-blue-400 transition-colors"
            {...props}
          >
            {children}
          </a>
        );
      }
      return (
        <a 
          href={href} 
          className="text-red-400 hover:text-red-300 underline decoration-red-400/30 hover:decoration-red-400 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            alert(`External or relative link clicked: ${href}`);
          }}
          {...props}
        >
          {children}
        </a>
      );
    },

    // Some basic styling for other standard markdown elements
    p: ({ children, ...props }) => <p className="mb-4 leading-relaxed" {...props}>{children}</p>,
    ul: ({ children, ...props }) => <ul className="list-disc list-outside ml-6 mb-4 space-y-1" {...props}>{children}</ul>,
    ol: ({ children, ...props }) => <ol className="list-decimal list-outside ml-6 mb-4 space-y-1" {...props}>{children}</ol>,
    li: ({ children, ...props }) => <li className="pl-1" {...props}>{children}</li>,
    blockquote: ({ children, ...props }) => (
      <blockquote className="border-l-4 border-gray-600 pl-4 py-1 mb-4 text-gray-400 bg-gray-800/30 rounded-r" {...props}>
        {children}
      </blockquote>
    ),
    code: ({ node, inline, className, children, ...props }) => {
      return inline ? (
        <code className="bg-gray-800 text-red-200 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      ) : (
        <pre className="bg-gray-900 border border-gray-800 p-4 rounded-lg overflow-x-auto mb-4 font-mono text-sm text-gray-300 styled-scrollbar">
          <code {...props}>{children}</code>
        </pre>
      );
    },
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto mb-6 border border-gray-700 rounded-lg">
        <table className="w-full text-left border-collapse" {...props}>{children}</table>
      </div>
    ),
    th: ({ children, ...props }) => <th className="bg-gray-800 px-4 py-2 font-semibold border-b border-gray-700" {...props}>{children}</th>,
    td: ({ children, ...props }) => <td className="px-4 py-2 border-b border-gray-700/50 bg-gray-900/50" {...props}>{children}</td>,
    hr: ({ ...props }) => <hr className="border-gray-700 my-8" {...props} />
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-xl border border-gray-800 shadow-2xl overflow-hidden relative">
      <div className="bg-gray-900 border-b border-gray-800 p-3 flex justify-between items-center z-10 shrink-0 shadow-sm">
        <h3 className="font-mono text-xs text-gray-500 truncate" title={filePath}>
          {filePath ? filePath.replace(/\\/g, '/').split('/').pop() : ''}
        </h3>
        <div className="flex gap-2">
          {filePath && (
            <button 
              onClick={() => window.electronAPI && window.electronAPI.openInBrowser(processedContent, filePath ? filePath.replace(/\\/g, '/').split('/').pop() : 'Document')}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1 rounded text-xs font-bold transition-colors"
            >
              Open in Browser
            </button>
          )}
          {onClose && (
            <button 
              onClick={onClose}
              className="bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1 rounded text-xs font-bold transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 styled-scrollbar relative text-gray-300">
        <div className="max-w-4xl mx-auto pb-32">
          <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
            {processedContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
