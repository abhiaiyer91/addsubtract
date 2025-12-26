import { useState } from 'react';
import { ChevronDown, ChevronRight, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  oldLines: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

interface DiffViewerProps {
  files: DiffFile[];
}

export function DiffViewer({ files }: DiffViewerProps) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{files.length} files changed</span>
        <span className="text-green-500">
          +{files.reduce((acc, f) => acc + f.additions, 0)}
        </span>
        <span className="text-red-500">
          -{files.reduce((acc, f) => acc + f.deletions, 0)}
        </span>
      </div>

      {/* File list */}
      {files.map((file) => (
        <DiffFileView key={file.path} file={file} />
      ))}
    </div>
  );
}

function DiffFileView({ file }: { file: DiffFile }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const statusColors = {
    added: 'text-green-500 bg-green-500/10',
    deleted: 'text-red-500 bg-red-500/10',
    modified: 'text-yellow-500 bg-yellow-500/10',
    renamed: 'text-blue-500 bg-blue-500/10',
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* File header */}
      <div
        className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b cursor-pointer hover:bg-muted/70"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <File className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm flex-1">
          {file.oldPath && file.oldPath !== file.path ? (
            <>
              <span className="text-muted-foreground">{file.oldPath}</span>
              <span className="mx-2">→</span>
              <span>{file.path}</span>
            </>
          ) : (
            file.path
          )}
        </span>
        <Badge variant="outline" className={cn('text-xs', statusColors[file.status])}>
          {file.status}
        </Badge>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-500">+{file.additions}</span>
          <span className="text-red-500">-{file.deletions}</span>
        </div>
      </div>

      {/* File content */}
      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm">
            <tbody>
              {file.hunks.map((hunk, hunkIndex) => (
                <HunkView key={hunkIndex} hunk={hunk} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HunkView({ hunk }: { hunk: DiffHunk }) {
  return (
    <>
      {/* Hunk header */}
      <tr className="bg-blue-500/10 text-blue-400">
        <td colSpan={3} className="px-4 py-1 text-xs">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </td>
      </tr>

      {/* Lines */}
      {hunk.lines.map((line, lineIndex) => (
        <tr
          key={lineIndex}
          className={cn(
            'hover:bg-muted/30',
            line.type === 'add' && 'bg-green-500/10',
            line.type === 'remove' && 'bg-red-500/10'
          )}
        >
          {/* Old line number */}
          <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border sticky left-0 bg-inherit">
            {line.oldLineNumber || ''}
          </td>

          {/* New line number */}
          <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border sticky left-12 bg-inherit">
            {line.newLineNumber || ''}
          </td>

          {/* Content */}
          <td className="px-4 py-0.5 whitespace-pre">
            <span
              className={cn(
                'mr-2 inline-block w-3',
                line.type === 'add' && 'text-green-400',
                line.type === 'remove' && 'text-red-400'
              )}
            >
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>
            {line.content}
          </td>
        </tr>
      ))}
    </>
  );
}
