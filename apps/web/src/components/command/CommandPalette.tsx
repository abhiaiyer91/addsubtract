import { useState, useCallback, useEffect } from 'react';
import {
  BookOpen,
  GitPullRequest,
  CircleDot,
  Search,
  Loader2,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useCommandPalette, useCommandSearch } from '@/hooks/useCommandPalette';
import { formatShortcut } from '@/lib/commands';

// Icons for different result types
const typeIcons = {
  repository: BookOpen,
  pull_request: GitPullRequest,
  issue: CircleDot,
  command: Search,
};

export function CommandPalette() {
  const [query, setQuery] = useState('');
  const {
    isOpen,
    close,
    availableCommands,
    executeCommand,
    navigateToResult,
    repoContext,
  } = useCommandPalette();

  const { results, isLoading } = useCommandSearch(query);

  // Clear query when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (value: string) => {
      // Check if it's a command
      for (const group of availableCommands) {
        const command = group.commands.find((c) => c.id === value);
        if (command) {
          executeCommand(command);
          return;
        }
      }

      // Check if it's a search result
      const result = results.find((r) => r.id === value);
      if (result) {
        navigateToResult(result);
      }
    },
    [availableCommands, executeCommand, navigateToResult, results]
  );

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder={
          repoContext
            ? `Search ${repoContext.owner}/${repoContext.repo} or type a command...`
            : 'Type a command or search...'
        }
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Loading state - subtle, in corner */}
        {isLoading && (
          <div className="absolute top-3 right-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        <CommandEmpty>
          {query ? 'No results found.' : 'Start typing to search...'}
        </CommandEmpty>

        {/* Search Results */}
        {query && results.length > 0 && (
          <>
            <CommandGroup heading="Results">
              {results.map((result) => {
                const Icon = typeIcons[result.type] || Search;
                return (
                  <CommandItem
                    key={result.id}
                    value={result.id}
                    onSelect={handleSelect}
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{result.title}</span>
                      {result.subtitle && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {result.subtitle}
                        </span>
                      )}
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground capitalize">
                      {result.type.replace('_', ' ')}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Commands */}
        {availableCommands.map((group) => (
          <CommandGroup key={group.id} heading={group.name}>
            {group.commands.map((command) => (
              <CommandItem
                key={command.id}
                value={command.id}
                onSelect={handleSelect}
                keywords={command.keywords}
                className="flex items-center gap-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
                  <command.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{command.name}</span>
                  {command.description && (
                    <span className="text-xs text-muted-foreground">
                      {command.description}
                    </span>
                  )}
                </div>
                {command.shortcut && (
                  <CommandShortcut>
                    {command.shortcut.map((key, i) => (
                      <kbd key={i} className="kbd ml-0.5">
                        {formatShortcut([key])}
                      </kbd>
                    ))}
                  </CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {/* Footer hint */}
        <div className="border-t border-border/40 px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="kbd">
                <span className="text-[10px]">&#8593;&#8595;</span>
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">
                <span className="text-[10px]">&#8629;</span>
              </kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">esc</kbd>
              Close
            </span>
          </div>
        </div>
      </CommandList>
    </CommandDialog>
  );
}
