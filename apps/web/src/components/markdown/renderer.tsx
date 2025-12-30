import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn('prose prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold border-b border-border pb-2 mb-4">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold border-b border-border pb-2 mt-6 mb-4">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-bold mt-6 mb-3">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-4 leading-relaxed">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary hover:underline"
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">
                  {children}
                </code>
              );
            }
            return (
              <code className="block p-4 rounded-lg bg-muted font-mono text-sm overflow-x-auto">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-4 p-4 rounded-lg bg-muted overflow-x-auto">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground mb-4">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted px-4 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-4 py-2">{children}</td>
          ),
          hr: () => <hr className="border-border my-6" />,
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="max-w-full rounded-lg"
              loading="lazy"
            />
          ),
          // HTML elements passthrough with styling
          div: ({ children, ...props }) => (
            <div {...props} className={cn('', (props as any).className)}>
              {children}
            </div>
          ),
          span: ({ children, ...props }) => (
            <span {...props}>{children}</span>
          ),
          br: () => <br />,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through">{children}</del>,
          sup: ({ children }) => <sup>{children}</sup>,
          sub: ({ children }) => <sub>{children}</sub>,
          details: ({ children }) => (
            <details className="mb-4 border border-border rounded-lg p-2">
              {children}
            </details>
          ),
          summary: ({ children }) => (
            <summary className="cursor-pointer font-medium">{children}</summary>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Alias for backwards compatibility
export { Markdown as MarkdownRenderer };
