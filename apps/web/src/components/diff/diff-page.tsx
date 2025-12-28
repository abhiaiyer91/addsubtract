import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DiffViewer, type DiffViewerProps } from './diff-viewer';
import { FileTree } from './file-tree';
import { cn } from '@/lib/utils';

interface DiffPageProps extends DiffViewerProps {
  showFileTree?: boolean;
  defaultFileTreeOpen?: boolean;
}

export function DiffPage({
  files = [],
  showFileTree = true,
  defaultFileTreeOpen = true,
  ...diffProps
}: DiffPageProps) {
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(defaultFileTreeOpen);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Count comments per file
  const commentCounts: Record<string, number> = {};
  if (diffProps.comments) {
    for (const [path, comments] of Object.entries(diffProps.comments)) {
      commentCounts[path] = comments.length;
    }
  }

  const fileInfos = files.map((file) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    status: file.status,
    commentCount: commentCounts[file.path],
    viewed: diffProps.viewedFiles?.has(file.path),
  }));

  const handleSelectFile = (path: string) => {
    setSelectedFile(path);
    // Scroll to file
    const element = fileRefs.current.get(path);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Intersection observer to highlight current file in tree
  useEffect(() => {
    if (!showFileTree) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const path = entry.target.getAttribute('data-file-path');
            if (path) {
              setSelectedFile(path);
            }
          }
        }
      },
      { threshold: 0.3, rootMargin: '-100px 0px -50% 0px' }
    );

    fileRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [files, showFileTree]);

  if (!showFileTree) {
    return <DiffViewer files={files} {...diffProps} />;
  }

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div
        className={cn(
          'border-r bg-muted/20 transition-all duration-200 flex flex-col',
          isFileTreeOpen ? 'w-64' : 'w-0'
        )}
      >
        {isFileTreeOpen && (
          <FileTree
            files={fileInfos}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            className="flex-1"
          />
        )}
      </div>

      {/* Toggle button */}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -left-3 top-2 z-10 h-6 w-6 rounded-full border bg-background shadow-sm"
          onClick={() => setIsFileTreeOpen(!isFileTreeOpen)}
          title={isFileTreeOpen ? 'Hide file tree' : 'Show file tree'}
        >
          {isFileTreeOpen ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <List className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto p-4">
        <DiffViewerWithRefs
          files={files}
          fileRefs={fileRefs}
          {...diffProps}
        />
      </div>
    </div>
  );
}

// Extended DiffViewer that registers refs for file sections
interface DiffViewerWithRefsProps extends DiffViewerProps {
  fileRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

function DiffViewerWithRefs({
  files = [],
  fileRefs,
  ...props
}: DiffViewerWithRefsProps) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{files.length} file{files.length !== 1 ? 's' : ''} changed</span>
        <span className="text-green-500">
          +{files.reduce((acc, f) => acc + f.additions, 0)}
        </span>
        <span className="text-red-500">
          -{files.reduce((acc, f) => acc + f.deletions, 0)}
        </span>
      </div>

      {/* Files with refs */}
      {files.map((file) => (
        <div
          key={file.path}
          ref={(el) => {
            if (el) {
              fileRefs.current.set(file.path, el);
            } else {
              fileRefs.current.delete(file.path);
            }
          }}
          data-file-path={file.path}
        >
          <DiffViewer
            files={[file]}
            comments={props.comments ? { [file.path]: props.comments[file.path] || [] } : undefined}
            {...props}
          />
        </div>
      ))}
    </div>
  );
}
