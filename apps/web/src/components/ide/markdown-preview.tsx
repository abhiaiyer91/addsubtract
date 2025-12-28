import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Eye,
  Code,
  Columns,
  Copy,
  Check,
  FileText,
  ExternalLink,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MarkdownPreviewProps {
  content: string;
  path: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
}

type ViewMode = 'preview' | 'source' | 'split';

// Extract sidenotes from content (format: [^note]: content)
function extractSidenotes(content: string): Map<string, string> {
  const sidenotes = new Map<string, string>();
  const regex = /\[\^(\w+)\]:\s*(.+?)(?=\n\[\^|\n\n|$)/gs;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    sidenotes.set(match[1], match[2].trim());
  }
  
  return sidenotes;
}

// Remove sidenote definitions from content
function removeSidenoteDefinitions(content: string): string {
  return content.replace(/\[\^(\w+)\]:\s*(.+?)(?=\n\[\^|\n\n|$)/gs, '');
}

// Code block with syntax highlighting and copy
function CodeBlock({ 
  children, 
  className,
  inline,
}: { 
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace('language-', '') || '';
  const code = String(children).replace(/\n$/, '');
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[0.85em]">
        {children}
      </code>
    );
  }

  return (
    <figure className="my-6 -mx-4 sm:mx-0">
      <div className="relative group rounded-none sm:rounded-lg overflow-hidden border-y sm:border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">{language || 'code'}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3 text-zinc-400" />
            )}
          </Button>
        </div>
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 leading-relaxed">{code}</code>
        </pre>
      </div>
    </figure>
  );
}

// Sidenote component (Tufte-style margin notes)
function Sidenote({ number, children }: { number: number; children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <>
      {/* Sidenote number in text */}
      <label
        htmlFor={`sn-${number}`}
        className="sidenote-number cursor-pointer text-emerald-600 dark:text-emerald-400"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {number}
      </label>
      
      {/* Sidenote content - shown in margin on large screens, expandable on small */}
      <span 
        className={cn(
          "sidenote",
          // Mobile: show as expandable block
          "block sm:hidden mt-2 mb-4 pl-4 border-l-2 border-emerald-500/30 text-sm text-zinc-500 dark:text-zinc-400 italic",
          !isExpanded && "hidden",
          // Desktop: show in margin
          "sm:float-right sm:clear-right sm:w-[200px] sm:mr-[-220px] sm:mt-1 sm:mb-0 sm:pl-0 sm:border-l-0",
          "sm:block sm:text-xs sm:leading-relaxed"
        )}
      >
        <span className="sm:hidden font-semibold not-italic text-emerald-600 dark:text-emerald-400 mr-1">{number}.</span>
        {children}
      </span>
    </>
  );
}



export function MarkdownPreview({ 
  content, 
  path,
  onChange,
  readOnly = false,
}: MarkdownPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(readOnly ? 'preview' : 'source');
  const [editContent, setEditContent] = useState(content);
  
  const sidenotes = useMemo(() => extractSidenotes(content), [content]);
  const cleanContent = useMemo(() => removeSidenoteDefinitions(content), [content]);
  
  const fileName = path.split('/').pop() || 'README.md';
  let sidenoteCounter = 0;

  const handleContentChange = (newContent: string) => {
    setEditContent(newContent);
    onChange?.(newContent);
  };

  const renderMarkdown = () => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Tufte-style headings - no numbering, elegant spacing
        h1: ({ children }) => (
          <h1 className="text-[2.5rem] leading-tight font-normal text-zinc-900 dark:text-zinc-100 mt-0 mb-6 tracking-tight">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-[1.8rem] leading-tight font-normal text-zinc-800 dark:text-zinc-200 mt-12 mb-4 tracking-tight">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[1.4rem] leading-snug font-normal italic text-zinc-700 dark:text-zinc-300 mt-8 mb-3">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-normal italic text-zinc-600 dark:text-zinc-400 mt-6 mb-2">
            {children}
          </h4>
        ),
        
        // Tufte body text - optimal line length, generous leading
        p: ({ children }) => {
          // Check for sidenote references and replace them
          const processedChildren = Array.isArray(children) 
            ? children.map((child) => {
                if (typeof child === 'string') {
                  const parts = child.split(/\[\^(\w+)\]/g);
                  if (parts.length > 1) {
                    return parts.map((part, j) => {
                      if (j % 2 === 1) {
                        // This is a sidenote reference
                        const noteContent = sidenotes.get(part);
                        if (noteContent) {
                          sidenoteCounter++;
                          return (
                            <Sidenote key={`sn-${j}`} number={sidenoteCounter}>
                              {noteContent}
                            </Sidenote>
                          );
                        }
                      }
                      return part;
                    });
                  }
                }
                return child;
              })
            : children;
          
          return (
            <p className="text-[1.1rem] leading-[1.8] text-zinc-700 dark:text-zinc-300 mb-6 max-w-prose">
              {processedChildren}
            </p>
          );
        },
        
        // Links with subtle styling
        a: ({ href, children }) => {
          const isExternal = href?.startsWith('http');
          return (
            <a
              href={href}
              className="text-zinc-900 dark:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-2 hover:decoration-emerald-500 dark:hover:decoration-emerald-400 transition-colors inline-flex items-center gap-0.5"
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
            >
              {children}
              {isExternal && <ExternalLink className="h-3 w-3 opacity-50" />}
            </a>
          );
        },
        
        // Code blocks
        code: ({ className, children, ...props }) => {
          const inline = !className;
          return (
            <CodeBlock className={className} inline={inline} {...props}>
              {children}
            </CodeBlock>
          );
        },
        pre: ({ children }) => <>{children}</>,
        
        // Lists with proper indentation
        ul: ({ children }) => (
          <ul className="list-none mb-6 space-y-2 text-[1.1rem] leading-[1.8] text-zinc-700 dark:text-zinc-300 max-w-prose">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside ml-6 mb-6 space-y-2 text-[1.1rem] leading-[1.8] text-zinc-700 dark:text-zinc-300 max-w-prose">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="pl-0 before:content-['—'] before:mr-2 before:text-zinc-400 dark:before:text-zinc-600">
            {children}
          </li>
        ),
        
        // Tufte-style blockquotes (can be used as epigraphs)
        blockquote: ({ children }) => (
          <blockquote className="my-8 pl-6 border-l-[3px] border-zinc-200 dark:border-zinc-700">
            <div className="text-[1.1rem] italic text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {children}
            </div>
          </blockquote>
        ),
        
        // Tables with clean styling
        table: ({ children }) => (
          <figure className="my-8 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {children}
            </table>
          </figure>
        ),
        thead: ({ children }) => (
          <thead className="border-b-2 border-zinc-200 dark:border-zinc-700">
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400 text-xs uppercase tracking-wider">
            {children}
          </th>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {children}
          </tbody>
        ),
        td: ({ children }) => (
          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
            {children}
          </td>
        ),
        
        // Horizontal rules - subtle
        hr: () => (
          <hr className="my-12 border-0 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-700 to-transparent" />
        ),
        
        // Images as figures with captions
        img: ({ src, alt }) => (
          <figure className="my-8">
            <img
              src={src}
              alt={alt}
              className="max-w-full rounded-sm"
              loading="lazy"
            />
            {alt && (
              <figcaption className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 italic text-center">
                {alt}
              </figcaption>
            )}
          </figure>
        ),
        
        // Task lists
        input: ({ type, checked }) => {
          if (type === 'checkbox') {
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled
                className="mr-2 rounded border-zinc-300 dark:border-zinc-600 bg-transparent text-emerald-500"
              />
            );
          }
          return null;
        },
        
        // Strong/emphasis
        strong: ({ children }) => (
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
      }}
    >
      {viewMode === 'split' ? editContent : cleanContent}
    </ReactMarkdown>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{fileName}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setViewMode('preview')}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preview</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {!readOnly && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode('split')}
                    >
                      <Columns className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Split view</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === 'source' ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode('source')}
                    >
                      <Code className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Source</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' && (
          <div className="h-full overflow-y-auto">
            {/* Tufte-style layout: content with wide right margin for sidenotes */}
            <article className="tufte-article py-12 px-6 sm:px-12 lg:px-24 lg:pr-[280px] max-w-4xl">
              {/* Subtitle/date area */}
              <div className="mb-12">
                {renderMarkdown()}
              </div>
            </article>
          </div>
        )}
        
        {viewMode === 'source' && (
          <div className="h-full">
            <textarea
              value={editContent}
              onChange={(e) => handleContentChange(e.target.value)}
              className={cn(
                "w-full h-full p-6 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 font-mono text-sm resize-none leading-relaxed",
                "focus:outline-none border-none",
                readOnly && "cursor-not-allowed opacity-60"
              )}
              readOnly={readOnly}
              spellCheck={false}
            />
          </div>
        )}
        
        {viewMode === 'split' && (
          <div className="h-full flex divide-x divide-zinc-200 dark:divide-zinc-800">
            {/* Source */}
            <div className="flex-1 h-full overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
                  <span className="text-xs text-zinc-500 font-medium">Source</span>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className={cn(
                    "flex-1 w-full p-4 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 font-mono text-sm resize-none leading-relaxed",
                    "focus:outline-none border-none",
                    readOnly && "cursor-not-allowed opacity-60"
                  )}
                  readOnly={readOnly}
                  spellCheck={false}
                />
              </div>
            </div>
            
            {/* Preview */}
            <div className="flex-1 h-full overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
                  <span className="text-xs text-zinc-500 font-medium">Preview</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <article className="tufte-article py-8 px-6">
                    {renderMarkdown()}
                  </article>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Tufte CSS overrides */}
      <style>{`
        .tufte-article {
          font-family: 'Georgia', 'Palatino', 'Palatino Linotype', 'Times New Roman', serif;
        }
        
        .tufte-article code,
        .tufte-article pre {
          font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', monospace;
        }
        
        .sidenote-number {
          font-size: 0.7em;
          vertical-align: super;
          line-height: 0;
        }
        
        .sidenote-number::after {
          content: '';
        }
        
        @media (min-width: 1024px) {
          .sidenote {
            position: relative;
          }
        }
        
        /* Improve list styling for Tufte */
        .tufte-article ul > li::before {
          content: '—';
          margin-right: 0.5rem;
          color: rgb(161 161 170);
        }
        
        .tufte-article ul > li {
          padding-left: 0;
          list-style: none;
        }
        
        /* First paragraph styling */
        .tufte-article > div > p:first-of-type {
          font-size: 1.2rem;
        }
        
        /* Drop cap effect for first letter (optional) */
        .tufte-article > div > p:first-of-type::first-letter {
          font-size: 3.5rem;
          float: left;
          line-height: 1;
          padding-right: 0.5rem;
          padding-top: 0.1rem;
          font-weight: 400;
        }
      `}</style>
    </div>
  );
}
