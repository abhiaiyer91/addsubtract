import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Loader2,
  AtSign,
  Slash,
  FileCode,
  FolderOpen,
  Bug,
  TestTube,
  FileText,
  Sparkles,
  Wand2,
  MessageSquare,
  GitPullRequest,
  Code2,
  RefreshCw,
  X,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// Slash commands
const SLASH_COMMANDS = [
  { 
    id: 'fix', 
    label: '/fix', 
    description: 'Fix bugs or issues in the code',
    icon: Bug,
    prompt: (arg: string) => `Fix the following issue: ${arg}`,
  },
  { 
    id: 'explain', 
    label: '/explain', 
    description: 'Explain how code works',
    icon: MessageSquare,
    prompt: (arg: string) => `Explain this code: ${arg}`,
  },
  { 
    id: 'refactor', 
    label: '/refactor', 
    description: 'Refactor and improve code',
    icon: RefreshCw,
    prompt: (arg: string) => `Refactor this code to be cleaner: ${arg}`,
  },
  { 
    id: 'test', 
    label: '/test', 
    description: 'Generate tests for code',
    icon: TestTube,
    prompt: (arg: string) => `Write tests for: ${arg}`,
  },
  { 
    id: 'docs', 
    label: '/docs', 
    description: 'Generate documentation',
    icon: FileText,
    prompt: (arg: string) => `Add documentation for: ${arg}`,
  },
  { 
    id: 'create', 
    label: '/create', 
    description: 'Create a new file',
    icon: FileCode,
    prompt: (arg: string) => `Create a new file: ${arg}`,
  },
  { 
    id: 'edit', 
    label: '/edit', 
    description: 'Edit an existing file',
    icon: Wand2,
    prompt: (arg: string) => `Edit the file to: ${arg}`,
  },
  { 
    id: 'pr', 
    label: '/pr', 
    description: 'Create a pull request',
    icon: GitPullRequest,
    prompt: (arg: string) => `Create a PR for: ${arg}`,
  },
];

// Mention types
const MENTION_TYPES = [
  { id: 'file', label: '@file', description: 'Reference a specific file', icon: FileCode },
  { id: 'folder', label: '@folder', description: 'Reference a folder', icon: FolderOpen },
  { id: 'codebase', label: '@codebase', description: 'Search the entire codebase', icon: Code2 },
  { id: 'selection', label: '@selection', description: 'Reference current selection', icon: Sparkles },
];

interface SmartChatInputProps {
  onSend: (message: string, context?: { type: string; value: string }[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  currentFile?: string | null;
  currentSelection?: string | null;
  availableFiles?: string[];
}

interface Suggestion {
  type: 'command' | 'mention' | 'file';
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  value?: string;
}

export function SmartChatInput({
  onSend,
  isLoading,
  disabled,
  placeholder = 'Ask wit anything... Use / for commands, @ for mentions',
  currentFile,
  currentSelection,
  availableFiles = [],
}: SmartChatInputProps) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [contexts, setContexts] = useState<{ type: string; value: string; label: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  // Parse input for suggestions
  useEffect(() => {
    const lastWord = value.split(/\s/).pop() || '';
    
    if (lastWord.startsWith('/')) {
      const query = lastWord.slice(1).toLowerCase();
      const filtered = SLASH_COMMANDS.filter(
        cmd => cmd.label.toLowerCase().includes(query) || 
               cmd.description.toLowerCase().includes(query)
      );
      setSuggestions(filtered.map(cmd => ({
        type: 'command',
        id: cmd.id,
        label: cmd.label,
        description: cmd.description,
        icon: cmd.icon,
      })));
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else if (lastWord.startsWith('@')) {
      const query = lastWord.slice(1).toLowerCase();
      
      // First show mention types
      const mentionSuggestions: Suggestion[] = MENTION_TYPES
        .filter(m => m.label.toLowerCase().includes(query))
        .map(m => ({
          type: 'mention',
          id: m.id,
          label: m.label,
          description: m.description,
          icon: m.icon,
        }));
      
      // Then show matching files
      const fileSuggestions: Suggestion[] = availableFiles
        .filter(f => f.toLowerCase().includes(query))
        .slice(0, 5)
        .map(f => ({
          type: 'file',
          id: f,
          label: `@${f}`,
          description: 'Reference this file',
          icon: FileCode,
          value: f,
        }));
      
      setSuggestions([...mentionSuggestions, ...fileSuggestions]);
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [value, availableFiles]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading || disabled) return;
    
    // Check for slash command
    const commandMatch = value.match(/^\/(\w+)\s*(.*)/);
    if (commandMatch) {
      const [, cmdId, arg] = commandMatch;
      const command = SLASH_COMMANDS.find(c => c.id === cmdId);
      if (command) {
        onSend(command.prompt(arg), contexts.map(c => ({ type: c.type, value: c.value })));
        setValue('');
        setContexts([]);
        return;
      }
    }
    
    onSend(value.trim(), contexts.map(c => ({ type: c.type, value: c.value })));
    setValue('');
    setContexts([]);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, disabled, onSend, contexts]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }
    
    // Submit on Enter (without shift) or Cmd/Ctrl+Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectSuggestion = (suggestion: Suggestion) => {
    const words = value.split(/\s/);
    words.pop(); // Remove the partial word
    
    if (suggestion.type === 'command') {
      words.push(suggestion.label + ' ');
    } else if (suggestion.type === 'mention') {
      if (suggestion.id === 'selection' && currentSelection) {
        // Add selection as context
        setContexts(prev => [...prev, { 
          type: 'selection', 
          value: currentSelection, 
          label: 'Current selection' 
        }]);
        words.push(''); // Just remove the @
      } else if (suggestion.id === 'file' && currentFile) {
        setContexts(prev => [...prev, { 
          type: 'file', 
          value: currentFile, 
          label: currentFile 
        }]);
        words.push('');
      } else if (suggestion.id === 'codebase') {
        setContexts(prev => [...prev, { 
          type: 'codebase', 
          value: '', 
          label: 'Entire codebase' 
        }]);
        words.push('');
      } else {
        words.push(suggestion.label + ' ');
      }
    } else if (suggestion.type === 'file' && suggestion.value) {
      setContexts(prev => [...prev, { 
        type: 'file', 
        value: suggestion.value!, 
        label: suggestion.value! 
      }]);
      words.push('');
    }
    
    setValue(words.join(' '));
    setShowSuggestions(false);
    textareaRef.current?.focus();
  };

  const removeContext = (index: number) => {
    setContexts(prev => prev.filter((_, i) => i !== index));
  };

  const contextIcons: Record<string, React.ElementType> = {
    file: FileCode,
    selection: Sparkles,
    codebase: Code2,
    folder: FolderOpen,
  };

  return (
    <div className="relative">
      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div 
          ref={suggestionsRef}
          className="absolute bottom-full left-0 right-0 mb-2 p-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-h-64 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            return (
              <button
                key={`${suggestion.type}-${suggestion.id}`}
                onClick={() => selectSuggestion(suggestion)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 text-left rounded-md transition-colors",
                  index === selectedIndex ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                )}
              >
                <Icon className={cn(
                  "h-4 w-4 flex-shrink-0",
                  suggestion.type === 'command' && "text-violet-400",
                  suggestion.type === 'mention' && "text-blue-400",
                  suggestion.type === 'file' && "text-emerald-400"
                )} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono text-zinc-200">{suggestion.label}</span>
                  {suggestion.description && (
                    <span className="text-xs text-zinc-500 ml-2">{suggestion.description}</span>
                  )}
                </div>
              </button>
            );
          })}
          
          <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-800 mt-1 text-xs text-zinc-600">
            <span className="flex items-center gap-1">
              <ChevronUp className="h-3 w-3" />
              <ChevronUp className="h-3 w-3 rotate-180" />
              navigate
            </span>
            <span>Tab to select</span>
            <span>Esc to dismiss</span>
          </div>
        </div>
      )}
      
      {/* Context pills */}
      {contexts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {contexts.map((ctx, index) => {
            const Icon = contextIcons[ctx.type] || FileCode;
            return (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-xs"
              >
                <Icon className="h-3 w-3 text-blue-400" />
                <span className="text-zinc-300 max-w-[150px] truncate">{ctx.label}</span>
                <button
                  onClick={() => removeContext(index)}
                  className="text-zinc-500 hover:text-zinc-300 ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      
      {/* Input area */}
      <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/50 focus-within:border-zinc-700 transition-colors">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800/50">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={() => {
              setValue(prev => prev + '@');
              textareaRef.current?.focus();
            }}
            title="Add mention"
          >
            <AtSign className="h-3.5 w-3.5" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={() => {
              setValue(prev => prev + '/');
              textareaRef.current?.focus();
            }}
            title="Commands"
          >
            <Slash className="h-3.5 w-3.5" />
          </Button>
          
          {currentSelection && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 gap-1 text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => {
                setContexts(prev => [...prev, { 
                  type: 'selection', 
                  value: currentSelection, 
                  label: 'Selection' 
                }]);
              }}
              title="Add current selection as context"
            >
              <Sparkles className="h-3 w-3" />
              Add selection
            </Button>
          )}
          
          <div className="flex-1" />
          
          <span className="text-[10px] text-zinc-600">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
          </span>
        </div>
        
        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          className={cn(
            "min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "placeholder:text-zinc-600 text-zinc-200"
          )}
          rows={2}
        />
        
        {/* Send button */}
        <div className="flex items-center justify-end px-2 py-1.5">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading || disabled}
            className={cn(
              "h-7 px-3 gap-1.5",
              "bg-emerald-600 hover:bg-emerald-500 text-white",
              "disabled:bg-zinc-800 disabled:text-zinc-600"
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span className="text-xs">Send</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
