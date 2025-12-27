import { useState, useEffect, useCallback, useMemo } from 'react';
import { File, Search, X } from 'lucide-react';
import { useIDEStore } from '@/lib/ide-store';
import { trpc } from '@/lib/trpc';
import { getLanguageFromFilename, cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface QuickOpenProps {
  isOpen: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  currentRef: string;
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export function QuickOpen({ isOpen, onClose, owner, repo, currentRef }: QuickOpenProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const { openFile } = useIDEStore();

  // Fetch file to open
  const fetchFile = trpc.repos.getFile.useMutation();

  // Recursively fetch all files
  const fetchTree = trpc.repos.getTree.useMutation();

  // Load all files on open
  useEffect(() => {
    if (!isOpen) return;

    const loadFiles = async (path: string = ''): Promise<FileEntry[]> => {
      try {
        const result = await fetchTree.mutateAsync({ owner, repo, ref: currentRef, path });
        const entries = result.entries || [];
        
        let files: FileEntry[] = [];
        for (const entry of entries) {
          if (entry.type === 'file') {
            files.push(entry);
          } else if (entry.type === 'directory') {
            // Recursively load subdirectories (limit depth for performance)
            const depth = entry.path.split('/').length;
            if (depth < 5) {
              const subFiles = await loadFiles(entry.path);
              files = [...files, ...subFiles];
            }
          }
        }
        return files;
      } catch {
        return [];
      }
    };

    loadFiles().then(setAllFiles);
  }, [isOpen, owner, repo, currentRef]);

  // Filter files based on query
  const filteredFiles = useMemo(() => {
    if (!query.trim()) {
      return allFiles.slice(0, 50);
    }

    const lowerQuery = query.toLowerCase();
    const terms = lowerQuery.split(/\s+/);

    return allFiles
      .map((file) => {
        const lowerPath = file.path.toLowerCase();
        const lowerName = file.name.toLowerCase();
        
        // Calculate score based on matches
        let score = 0;
        let allMatch = true;
        
        for (const term of terms) {
          if (lowerName.includes(term)) {
            score += 10;
            if (lowerName.startsWith(term)) score += 5;
            if (lowerName === term) score += 10;
          } else if (lowerPath.includes(term)) {
            score += 2;
          } else {
            allMatch = false;
          }
        }

        return { file, score, allMatch };
      })
      .filter(({ allMatch }) => allMatch)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(({ file }) => file);
  }, [allFiles, query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFiles]);

  // Reset query when dialog opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleSelect = useCallback(async (file: FileEntry) => {
    try {
      const result = await fetchFile.mutateAsync({
        owner,
        repo,
        ref: currentRef,
        path: file.path,
      });
      
      if (result.encoding === 'utf-8') {
        const language = getLanguageFromFilename(file.name);
        openFile(file.path, result.content, language);
      }
      onClose();
    } catch {
      // Handle error
    }
  }, [owner, repo, currentRef, fetchFile, openFile, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredFiles[selectedIndex]) {
          handleSelect(filteredFiles[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredFiles, selectedIndex, handleSelect, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground mr-2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="border-0 focus-visible:ring-0 h-12 text-base"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 hover:bg-muted rounded">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Results */}
        <ScrollArea className="max-h-80">
          {fetchTree.isPending ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading files...
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {query ? 'No files found' : 'No files in repository'}
            </div>
          ) : (
            <div className="py-1">
              {filteredFiles.map((file, index) => (
                <button
                  key={file.path}
                  onClick={() => handleSelect(file)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 text-left',
                    'hover:bg-muted/50 transition-colors',
                    index === selectedIndex && 'bg-muted'
                  )}
                >
                  <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {file.path}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-3 py-2 border-t text-xs text-muted-foreground">
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">↑↓</kbd> navigate</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd> open</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted rounded">esc</kbd> close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
