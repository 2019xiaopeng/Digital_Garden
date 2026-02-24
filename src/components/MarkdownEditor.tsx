import React, { useRef } from 'react';
import { Bold, Italic, List, Link, Code, Image, Heading1, Heading2, Quote } from 'lucide-react';
import { cn } from '../lib/utils';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function MarkdownEditor({ value, onChange, className, placeholder }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormat = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    onChange(newText);

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const toolbarItems = [
    { icon: Heading1, label: 'H1', action: () => insertFormat('# ', '') },
    { icon: Heading2, label: 'H2', action: () => insertFormat('## ', '') },
    { icon: Bold, label: 'Bold', action: () => insertFormat('**', '**') },
    { icon: Italic, label: 'Italic', action: () => insertFormat('*', '*') },
    { icon: Quote, label: 'Quote', action: () => insertFormat('> ', '') },
    { icon: Code, label: 'Code', action: () => insertFormat('`', '`') },
    { icon: Link, label: 'Link', action: () => insertFormat('[', '](url)') },
    { icon: Image, label: 'Image', action: () => insertFormat('![alt](', ')') },
    { icon: List, label: 'List', action: () => insertFormat('- ', '') },
  ];

  return (
    <div className={cn("flex flex-col border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-950 transition-colors", className)}>
      <div className="flex items-center gap-1 p-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 overflow-x-auto">
        {toolbarItems.map((item, index) => (
          <button
            key={index}
            onClick={(e) => { e.preventDefault(); item.action(); }}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title={item.label}
          >
            <item.icon className="w-4 h-4" />
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 w-full p-4 bg-transparent border-none focus:outline-none resize-none font-mono text-sm leading-relaxed text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 min-h-[300px]"
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') {
              e.preventDefault();
              insertFormat('**', '**');
            } else if (e.key === 'i') {
              e.preventDefault();
              insertFormat('*', '*');
            }
          }
        }}
      />
    </div>
  );
}
