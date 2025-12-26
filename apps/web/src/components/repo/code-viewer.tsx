import { useState } from 'react';
import { Copy, Check, Download, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CodeViewerProps {
  content: string;
  filename: string;
  className?: string;
}

export function CodeViewer({ content, filename, className }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2 text-sm">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{filename}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{lines.length} lines</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{formatBytes(content.length)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-8"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="hover:bg-muted/30 group">
                <td className="w-12 px-4 py-0.5 text-right text-muted-foreground select-none border-r border-border sticky left-0 bg-background">
                  <a
                    href={`#L${index + 1}`}
                    id={`L${index + 1}`}
                    className="hover:text-primary"
                  >
                    {index + 1}
                  </a>
                </td>
                <td className="px-4 py-0.5 whitespace-pre">
                  {line || '\u00A0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
