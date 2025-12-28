import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus,
  AlertCircle,
  Settings,
  Loader2,
  User,
  Bot,
  Send,
  FileCode,
  FolderOpen,
  GitCommit,
  Pencil,
  Trash2,
  Eye,
  ChevronRight,
  ChevronDown,
  Sparkles,
  PanelRightClose,
  Copy,
  Check,
  ClipboardList,
  Terminal,
  Search,
  GitBranch,
  Clock,
  XCircle,
  AtSign,
  Slash,
  History,
  MoreHorizontal,
  FileText,
  Diff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useIDEStore } from '@/lib/ide-store';
import { useAgentTools } from '@/lib/use-agent-tools';
import { useChatStream } from '@/lib/use-chat-stream';

type AgentMode = 'pm' | 'code';

const MODE_CONFIG: Record<AgentMode, { icon: React.ElementType; label: string; description: string; color: string }> = {
  pm: {
    icon: ClipboardList,
    label: 'PM',
    description: 'Ask questions, create issues & PRs',
    color: 'text-blue-500',
  },
  code: {
    icon: FileCode,
    label: 'Code',
    description: 'Write and edit code (auto-commits)',
    color: 'text-emerald-500',
  },
};

// Tool call types
interface ToolCallPayload {
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolCall {
  type?: string;
  payload?: ToolCallPayload;
  toolName?: string;
  args?: Record<string, unknown>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  thinkingTime?: number;
}

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  repoId?: string;
  repoName?: string;
  owner?: string;
  embedded?: boolean;
}

// Tool status and icons
const TOOL_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  writeFile: { icon: FileCode, label: 'Create file', color: 'text-green-400' },
  readFile: { icon: Eye, label: 'Read file', color: 'text-blue-400' },
  editFile: { icon: Pencil, label: 'Edit file', color: 'text-yellow-400' },
  deleteFile: { icon: Trash2, label: 'Delete file', color: 'text-red-400' },
  listDirectory: { icon: FolderOpen, label: 'List directory', color: 'text-purple-400' },
  createBranch: { icon: GitBranch, label: 'Create branch', color: 'text-orange-400' },
  getHistory: { icon: GitCommit, label: 'Git history', color: 'text-cyan-400' },
  getStatus: { icon: GitCommit, label: 'Git status', color: 'text-cyan-400' },
  commit: { icon: GitCommit, label: 'Commit', color: 'text-green-400' },
  runCommand: { icon: Terminal, label: 'Run command', color: 'text-amber-400' },
  search: { icon: Search, label: 'Search', color: 'text-indigo-400' },
};

// Simple code block component with copy button and file path
function CodeBlock({ code, language, filePath }: { code: string; language?: string; filePath?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split('\n');
  const lineCount = lines.length;

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-400 font-mono">
            {filePath || language || 'code'}
          </span>
          <span className="text-xs text-zinc-600">{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>
      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="p-3 text-sm">
          <code className="text-zinc-300 font-mono">{code}</code>
        </pre>
      </div>
    </div>
  );
}

// Simple inline code component
function InlineCode({ children }: { children: string }) {
  return (
    <code className="bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded text-sm font-mono">
      {children}
    </code>
  );
}

// Parse and render markdown-like content
function MessageContent({ content }: { content: string }) {
  const elements = useMemo(() => {
    const result: React.ReactNode[] = [];
    const lines = content.split('\n');
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block
      if (line.startsWith('```')) {
        const language = line.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        result.push(
          <CodeBlock key={key++} code={codeLines.join('\n')} language={language} />
        );
        i++;
        continue;
      }

      // Headers
      if (line.startsWith('### ')) {
        result.push(
          <h3 key={key++} className="text-base font-semibold mt-4 mb-2 text-zinc-200">
            {line.slice(4)}
          </h3>
        );
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        result.push(
          <h2 key={key++} className="text-lg font-semibold mt-4 mb-2 text-zinc-100">
            {line.slice(3)}
          </h2>
        );
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        result.push(
          <h1 key={key++} className="text-xl font-bold mt-4 mb-2 text-zinc-50">
            {line.slice(2)}
          </h1>
        );
        i++;
        continue;
      }

      // Bullet lists
      if (line.match(/^[\-\*]\s/)) {
        const listItems: string[] = [];
        while (i < lines.length && lines[i].match(/^[\-\*]\s/)) {
          listItems.push(lines[i].slice(2));
          i++;
        }
        result.push(
          <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-zinc-300">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-sm">
                <FormattedText text={item} />
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered lists
      if (line.match(/^\d+\.\s/)) {
        const listItems: string[] = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          listItems.push(lines[i].replace(/^\d+\.\s/, ''));
          i++;
        }
        result.push(
          <ol key={key++} className="list-decimal list-inside space-y-1 my-2 text-zinc-300">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-sm">
                <FormattedText text={item} />
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Empty line = paragraph break
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Regular paragraph - collect consecutive non-empty lines
      const paragraphLines: string[] = [];
      while (
        i < lines.length && 
        lines[i].trim() !== '' && 
        !lines[i].startsWith('```') &&
        !lines[i].startsWith('#') &&
        !lines[i].match(/^[\-\*]\s/) &&
        !lines[i].match(/^\d+\.\s/)
      ) {
        paragraphLines.push(lines[i]);
        i++;
      }
      if (paragraphLines.length > 0) {
        result.push(
          <p key={key++} className="text-sm leading-relaxed my-2 text-zinc-300">
            <FormattedText text={paragraphLines.join(' ')} />
          </p>
        );
      }
    }

    return result;
  }, [content]);

  return <div className="space-y-1">{elements}</div>;
}

// Format inline text (bold, italic, code, links)
function FormattedText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const result: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Inline code
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        result.push(<InlineCode key={key++}>{codeMatch[1]}</InlineCode>);
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Bold
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        result.push(<strong key={key++} className="font-semibold text-zinc-100">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic
      const italicMatch = remaining.match(/^\*([^*]+)\*/);
      if (italicMatch) {
        result.push(<em key={key++} className="text-zinc-200">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Link
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        result.push(
          <a key={key++} href={linkMatch[2]} className="text-blue-400 hover:text-blue-300 hover:underline" target="_blank" rel="noopener noreferrer">
            {linkMatch[1]}
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // Regular text - find next special character
      const nextSpecial = remaining.search(/[`*\[]/);
      if (nextSpecial === -1) {
        result.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        // Special char at start but didn't match patterns - treat as regular text
        result.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        result.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return result;
  }, [text]);

  return <>{parts}</>;
}

// Enhanced tool call display component
function ToolCallDisplay({ tool, isLast }: { tool: ToolCall; isLast?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = tool.payload?.toolName || tool.toolName || 'unknown';
  const args = tool.payload?.args || tool.args || {};
  
  const config = TOOL_CONFIG[toolName] || { icon: FileCode, label: toolName, color: 'text-zinc-400' };
  const Icon = config.icon;
  
  // Get file path and content info
  const filePath = (args.path as string) || '';
  const content = args.content as string | undefined;
  const oldText = args.oldText as string | undefined;
  const newText = args.newText as string | undefined;
  
  // Calculate diff stats for edits
  const getDiffStats = () => {
    if (toolName === 'writeFile' && content) {
      const lines = content.split('\n').length;
      return { added: lines, removed: 0 };
    }
    if (toolName === 'editFile' && oldText && newText) {
      const oldLines = oldText.split('\n').length;
      const newLines = newText.split('\n').length;
      return { added: newLines, removed: oldLines };
    }
    if (toolName === 'deleteFile') {
      return { added: 0, removed: 1 };
    }
    return null;
  };
  
  const diffStats = getDiffStats();
  const hasExpandableContent = content || (oldText && newText);

  return (
    <div className={cn("relative", !isLast && "pb-2")}>
      {/* Connection line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-zinc-800" />
      )}
      
      <button
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        className={cn(
          "flex items-start gap-2.5 w-full text-left group",
          hasExpandableContent && "cursor-pointer"
        )}
      >
        {/* Icon */}
        <div className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5",
          "bg-zinc-800 border border-zinc-700"
        )}>
          <Icon className={cn("h-3.5 w-3.5", config.color)} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-300">{config.label}</span>
            {filePath && (
              <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px]">
                {filePath}
              </span>
            )}
            {diffStats && (
              <span className="flex items-center gap-1 text-xs">
                {diffStats.added > 0 && (
                  <span className="text-green-400">+{diffStats.added}</span>
                )}
                {diffStats.removed > 0 && (
                  <span className="text-red-400">-{diffStats.removed}</span>
                )}
              </span>
            )}
            {hasExpandableContent && (
              <ChevronRight className={cn(
                "h-3 w-3 text-zinc-600 transition-transform",
                expanded && "rotate-90"
              )} />
            )}
          </div>
        </div>
      </button>
      
      {/* Expanded content */}
      {expanded && hasExpandableContent && (
        <div className="ml-8 mt-2 rounded-md overflow-hidden border border-zinc-800 bg-zinc-900/50">
          {toolName === 'editFile' && oldText && newText ? (
            <div className="text-xs font-mono">
              <div className="px-3 py-1.5 bg-red-500/10 border-b border-zinc-800">
                <div className="flex items-center gap-2 text-red-400 mb-1">
                  <Diff className="h-3 w-3" />
                  <span>Removed</span>
                </div>
                <pre className="text-red-300/80 whitespace-pre-wrap break-all">
                  {oldText.slice(0, 300)}{oldText.length > 300 && '...'}
                </pre>
              </div>
              <div className="px-3 py-1.5 bg-green-500/10">
                <div className="flex items-center gap-2 text-green-400 mb-1">
                  <Diff className="h-3 w-3" />
                  <span>Added</span>
                </div>
                <pre className="text-green-300/80 whitespace-pre-wrap break-all">
                  {newText.slice(0, 300)}{newText.length > 300 && '...'}
                </pre>
              </div>
            </div>
          ) : content ? (
            <div className="p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {content.slice(0, 500)}{content.length > 500 && '...'}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// Tool calls group component
function ToolCallsGroup({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [collapsed, setCollapsed] = useState(toolCalls.length > 3);
  const visibleTools = collapsed ? toolCalls.slice(0, 2) : toolCalls;
  const hiddenCount = toolCalls.length - 2;

  return (
    <div className="my-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400">Actions</span>
        </div>
        <Badge variant="secondary" className="h-5 text-[10px] bg-zinc-800 text-zinc-400">
          {toolCalls.length}
        </Badge>
      </div>
      
      <div className="space-y-1">
        {visibleTools.map((tool, i) => (
          <ToolCallDisplay 
            key={i} 
            tool={tool} 
            isLast={i === visibleTools.length - 1 && !collapsed} 
          />
        ))}
        
        {collapsed && hiddenCount > 0 && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 ml-8 mt-2"
          >
            <MoreHorizontal className="h-3 w-3" />
            Show {hiddenCount} more action{hiddenCount > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

// Thinking indicator component
function ThinkingIndicator({ startTime }: { startTime?: Date }) {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    if (!startTime) return;
    
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className="flex items-center gap-3 py-4 px-4">
      <div className="relative">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-zinc-900 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-300">Thinking</span>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
        {elapsed > 0 && (
          <span className="text-xs text-zinc-600">{elapsed}s</span>
        )}
      </div>
    </div>
  );
}

// Message component
function MessageBubble({ 
  message,
  isStreaming,
  streamStartTime,
}: { 
  message: Message;
  isStreaming?: boolean;
  streamStartTime?: Date;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const toolCalls = message.toolCalls || [];

  if (isStreaming && !message.content && toolCalls.length === 0) {
    return <ThinkingIndicator startTime={streamStartTime} />;
  }

  return (
    <div className={cn(
      "px-4 py-4",
      isUser && "bg-zinc-900/30"
    )}>
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3">
          {/* Avatar */}
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
            isUser 
              ? "bg-zinc-700 text-zinc-300" 
              : isSystem 
                ? "bg-red-500/20 text-red-400" 
                : "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
          )}>
            {isUser ? (
              <User className="h-4 w-4" />
            ) : isSystem ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Role label with time */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">
                {isUser ? 'You' : isSystem ? 'System' : 'wit'}
              </span>
              {message.thinkingTime && (
                <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {message.thinkingTime}s
                </span>
              )}
            </div>
            
            {/* Tool calls */}
            {!isUser && toolCalls.length > 0 && (
              <ToolCallsGroup toolCalls={toolCalls} />
            )}
            
            {/* Message content */}
            {message.content ? (
              <div className={cn(
                isSystem && "text-red-400"
              )}>
                <MessageContent content={message.content} />
              </div>
            ) : isStreaming ? (
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-4 bg-emerald-500 animate-pulse" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Enhanced chat input component
function ChatInput({ 
  onSend, 
  isLoading,
  disabled,
  mode,
}: { 
  onSend: (message: string) => void; 
  isLoading: boolean;
  disabled?: boolean;
  mode: AgentMode;
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showHints, setShowHints] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading || disabled) return;
    onSend(value.trim());
    setValue('');
    setShowHints(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    // Enter without shift to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [value]);

  // Show hints when input starts with @ or /
  useEffect(() => {
    setShowHints(value.startsWith('@') || value.startsWith('/'));
  }, [value]);

  const hints = useMemo(() => {
    if (value.startsWith('@')) {
      return [
        { label: '@file', description: 'Reference a file' },
        { label: '@codebase', description: 'Search entire codebase' },
      ];
    }
    if (value.startsWith('/')) {
      return mode === 'code' ? [
        { label: '/create', description: 'Create a new file' },
        { label: '/edit', description: 'Edit a file' },
        { label: '/fix', description: 'Fix an issue' },
      ] : [
        { label: '/issue', description: 'Create an issue' },
        { label: '/pr', description: 'Create a pull request' },
        { label: '/explain', description: 'Explain code' },
      ];
    }
    return [];
  }, [value, mode]);

  return (
    <div className="relative">
      {/* Hints dropdown */}
      {showHints && hints.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 p-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
          {hints.map((hint) => (
            <button
              key={hint.label}
              onClick={() => {
                setValue(hint.label + ' ');
                textareaRef.current?.focus();
              }}
              className="flex items-center gap-3 w-full px-3 py-2 text-left rounded-md hover:bg-zinc-800 transition-colors"
            >
              <span className="text-sm font-mono text-emerald-400">{hint.label}</span>
              <span className="text-xs text-zinc-500">{hint.description}</span>
            </button>
          ))}
        </div>
      )}
      
      {/* Input area */}
      <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/50 focus-within:border-zinc-700 transition-colors">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800/50">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                  onClick={() => setValue('@')}
                >
                  <AtSign className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Mention file or codebase</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                  onClick={() => setValue('/')}
                >
                  <Slash className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Commands</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <div className="flex-1" />
          
          <span className="text-[10px] text-zinc-600">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to send
          </span>
        </div>
        
        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'code' ? 'Ask wit to write or edit code...' : 'Ask wit anything...'}
          disabled={isLoading || disabled}
          className={cn(
            "min-h-[60px] max-h-[150px] resize-none border-0 bg-transparent",
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

// Session list dropdown
function SessionDropdown({ 
  sessions, 
  activeSessionId, 
  onSelect,
  onNew,
}: { 
  sessions: Array<{ id: string; title: string | null; createdAt: Date }>;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const activeSession = sessions.find(s => s.id === activeSessionId);
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs max-w-[180px]">
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">
            {activeSession?.title || 'New chat'}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={onNew} className="gap-2">
          <Plus className="h-4 w-4" />
          <span>New chat</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {sessions.map((session) => (
            <DropdownMenuItem
              key={session.id}
              onSelect={() => onSelect(session.id)}
              className={cn(
                "gap-2",
                session.id === activeSessionId && "bg-zinc-800"
              )}
            >
              <FileText className="h-4 w-4 flex-shrink-0 text-zinc-500" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">
                  {session.title || 'Untitled chat'}
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(session.createdAt).toLocaleDateString()}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Mode-specific suggestions
const MODE_SUGGESTIONS: Record<AgentMode, Array<{ label: string; prompt: string; icon: React.ElementType }>> = {
  pm: [
    { label: 'Explain codebase', prompt: 'Give me an overview of this codebase', icon: Search },
    { label: 'Create issue', prompt: 'Create an issue for ', icon: ClipboardList },
    { label: 'List issues', prompt: 'List all open issues', icon: FileText },
    { label: 'Create PR', prompt: 'Create a pull request for ', icon: GitBranch },
  ],
  code: [
    { label: 'Create file', prompt: 'Create a new file called ', icon: FileCode },
    { label: 'Edit file', prompt: 'Edit the file ', icon: Pencil },
    { label: 'Add feature', prompt: 'Add a feature that ', icon: Sparkles },
    { label: 'Fix bug', prompt: 'Fix the bug where ', icon: XCircle },
  ],
};

// Welcome screen
function WelcomeScreen({ mode, onPrompt }: { mode: AgentMode; onPrompt: (prompt: string) => void }) {
  const config = MODE_CONFIG[mode];
  const suggestions = MODE_SUGGESTIONS[mode];
  const Icon = config.icon;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20">
        <Icon className="h-8 w-8 text-white" />
      </div>
      <h2 className="text-xl font-semibold mb-1 text-zinc-100">
        {mode === 'code' ? 'Code with wit' : 'Ask wit'}
      </h2>
      <p className="text-sm text-zinc-500 mb-8 text-center max-w-xs">
        {config.description}
      </p>
      
      <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
        {suggestions.map((s, i) => {
          const SuggestionIcon = s.icon;
          return (
            <button
              key={i}
              onClick={() => onPrompt(s.prompt)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-3 rounded-lg text-left",
                "bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700",
                "transition-all duration-200"
              )}
            >
              <SuggestionIcon className="h-4 w-4 text-zinc-500 flex-shrink-0" />
              <span className="text-sm text-zinc-300">{s.label}</span>
            </button>
          );
        })}
      </div>
      
      <p className="text-xs text-zinc-600 mt-8">
        Type <InlineCode>@</InlineCode> to mention files or <InlineCode>/</InlineCode> for commands
      </p>
    </div>
  );
}

export function AgentPanel({ isOpen, onClose, repoId, repoName, owner, embedded = false }: AgentPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<AgentMode>(embedded ? 'code' : 'pm');
  const [streamStartTime, setStreamStartTime] = useState<Date | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const { setIDEMode } = useIDEStore();

  // Queries
  const { data: aiStatus } = trpc.agent.status.useQuery({ repoId });
  const { data: repoAiStatus } = trpc.repoAiKeys.hasKeys.useQuery(
    { repoId: repoId! },
    { enabled: !!repoId }
  );
  const isAiAvailable = aiStatus?.available || repoAiStatus?.hasKeys;

  const { data: sessions } = trpc.agent.listSessions.useQuery({ 
    limit: 50, 
    mode: selectedMode as string,
    repoId: repoId,
  } as Parameters<typeof trpc.agent.listSessions.useQuery>[0]);
  const { data: sessionMessages, isLoading: messagesLoading } = trpc.agent.getMessages.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId }
  );

  // Mutations
  const createSession = trpc.agent.createSession.useMutation({
    onSuccess: async (newSession) => {
      setActiveSessionId(newSession.id);
      utils.agent.listSessions.invalidate();
      
      // If there's a pending prompt, send it using streaming
      if (pendingPrompt) {
        const message = pendingPrompt;
        setPendingPrompt(null);
        
        const streamingId = `streaming-${Date.now()}`;
        setStreamingMessageId(streamingId);
        setStreamStartTime(new Date());
        
        // Keep the temp user message and add streaming assistant message
        setMessages((prev) => [
          ...prev.filter(m => m.id.startsWith('temp-')),
          {
            id: streamingId,
            role: 'assistant',
            content: '',
            createdAt: new Date(),
            isStreaming: true,
          },
        ]);

        try {
          const result = await streamChat(
            newSession.id,
            message,
            selectedProvider as 'anthropic' | 'openai' | undefined,
            (_chunk, fullContent) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, content: fullContent } : m
                )
              );
            }
          );

          const thinkingTime = streamStartTime ? Math.floor((Date.now() - streamStartTime.getTime()) / 1000) : undefined;

          if (result) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id.startsWith('temp-')) {
                  return { ...m, id: result.userMessageId };
                }
                if (m.id === streamingId) {
                  return {
                    ...m,
                    id: result.assistantMessageId,
                    content: result.content,
                    toolCalls: result.toolCalls as ToolCall[] | undefined,
                    isStreaming: false,
                    thinkingTime,
                  };
                }
                return m;
              })
            );

            if (embedded && result.toolCalls) {
              processToolCalls(result.toolCalls);
              const hasFileChanges = result.toolCalls.some((tc: ToolCall) => {
                const toolName = tc.payload?.toolName || tc.toolName;
                return ['writeFile', 'editFile', 'deleteFile'].includes(toolName || '');
              });
              if (hasFileChanges) {
                utils.repos.getTree.invalidate();
                utils.repos.getFile.invalidate();
              }
            }
          }
        } catch (error) {
          console.error('Pending prompt stream error:', error);
        } finally {
          setStreamStartTime(null);
        }
      } else {
        setMessages([]);
      }
    },
  });

  const { processToolCalls } = useAgentTools();
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Streaming chat hook
  const { streamChat, isStreaming } = useChatStream({
    onToolCalls: (toolCalls) => {
      if (embedded) {
        processToolCalls(toolCalls);
        
        const hasFileChanges = toolCalls.some((tc: ToolCall) => {
          const toolName = tc.payload?.toolName || tc.toolName;
          return ['writeFile', 'editFile', 'deleteFile'].includes(toolName || '');
        });
        if (hasFileChanges) {
          utils.repos.getTree.invalidate();
          utils.repos.getFile.invalidate();
        }
      }
    },
    onError: (errorMessage) => {
      setMessages((prev) => {
        const filtered = prev.filter(m => !m.id.startsWith('temp-') && !m.id.startsWith('streaming-'));
        return [
          ...filtered,
          {
            id: `error-${Date.now()}`,
            role: 'system',
            content: `Error: ${errorMessage}`,
            createdAt: new Date(),
          },
        ];
      });
      setStreamingMessageId(null);
      setStreamStartTime(null);
    },
    onComplete: (assistantMessageId) => {
      const thinkingTime = streamStartTime ? Math.floor((Date.now() - streamStartTime.getTime()) / 1000) : undefined;
      setMessages((prev) => 
        prev.map(m => 
          m.id === streamingMessageId 
            ? { ...m, id: assistantMessageId, isStreaming: false, thinkingTime }
            : m
        )
      );
      setStreamingMessageId(null);
      setStreamStartTime(null);
    },
  });

  // Legacy non-streaming chat (kept as fallback)
  const chat = trpc.agent.chat.useMutation({
    onSuccess: (result) => {
      setMessages((prev) => {
        const filtered = prev.filter(m => !m.id.startsWith('temp-'));
        return [
          ...filtered,
          {
            id: result.userMessage.id,
            role: 'user',
            content: result.userMessage.content,
            createdAt: new Date(result.userMessage.createdAt),
          },
          {
            id: result.assistantMessage.id,
            role: 'assistant',
            content: result.assistantMessage.content,
            createdAt: new Date(result.assistantMessage.createdAt),
            toolCalls: result.toolCalls as ToolCall[] | undefined,
          },
        ];
      });

      if (embedded && result.toolCalls) {
        processToolCalls(result.toolCalls);
        
        const hasFileChanges = result.toolCalls.some((tc: ToolCall) => {
          const toolName = tc.payload?.toolName || tc.toolName;
          return ['writeFile', 'editFile', 'deleteFile'].includes(toolName || '');
        });
        if (hasFileChanges) {
          utils.repos.getTree.invalidate();
          utils.repos.getFile.invalidate();
        }
      }
    },
    onError: (error) => {
      setMessages((prev) => {
        const filtered = prev.filter(m => !m.id.startsWith('temp-'));
        return [
          ...filtered,
          {
            id: `error-${Date.now()}`,
            role: 'system',
            content: `Error: ${error.message}`,
            createdAt: new Date(),
          },
        ];
      });
    },
  });

  // Load messages when session changes
  useEffect(() => {
    if (sessionMessages) {
      setMessages(
        sessionMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          createdAt: new Date(msg.createdAt),
          toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : undefined,
        }))
      );
    }
  }, [sessionMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Auto-select first session when sessions change (filtered by mode)
  useEffect(() => {
    if (sessions && isAiAvailable) {
      const activeInList = activeSessionId && sessions.some(s => s.id === activeSessionId);
      if (!activeInList && sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
        setMessages([]);
      } else if (!activeInList) {
        setActiveSessionId(null);
        setMessages([]);
      }
    }
  }, [sessions, activeSessionId, isAiAvailable]);

  // Set default provider
  useEffect(() => {
    if (aiStatus?.defaultProvider && !selectedProvider) {
      setSelectedProvider(aiStatus.defaultProvider);
    }
  }, [aiStatus?.defaultProvider, selectedProvider]);

  const handleSend = async (message: string) => {
    const provider = selectedProvider as 'anthropic' | 'openai' | undefined;
    
    if (!activeSessionId) {
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          role: 'user',
          content: message,
          createdAt: new Date(),
        },
      ]);
      setPendingPrompt(message);
      createSession.mutate({ repoId, mode: selectedMode });
      return;
    }
    
    const userTempId = `temp-user-${Date.now()}`;
    const streamingId = `streaming-${Date.now()}`;
    setStreamingMessageId(streamingId);
    setStreamStartTime(new Date());
    
    setMessages((prev) => [
      ...prev,
      {
        id: userTempId,
        role: 'user',
        content: message,
        createdAt: new Date(),
      },
      {
        id: streamingId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      const result = await streamChat(
        activeSessionId,
        message,
        provider,
        (_chunk, fullContent) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId ? { ...m, content: fullContent } : m
            )
          );
        }
      );

      const thinkingTime = streamStartTime ? Math.floor((Date.now() - streamStartTime.getTime()) / 1000) : undefined;

      if (result) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === userTempId) {
              return { ...m, id: result.userMessageId };
            }
            if (m.id === streamingId) {
              return {
                ...m,
                id: result.assistantMessageId,
                content: result.content,
                toolCalls: result.toolCalls as ToolCall[] | undefined,
                isStreaming: false,
                thinkingTime,
              };
            }
            return m;
          })
        );

        if (embedded && result.toolCalls) {
          processToolCalls(result.toolCalls);
          
          const hasFileChanges = result.toolCalls.some((tc: ToolCall) => {
            const toolName = tc.payload?.toolName || tc.toolName;
            return ['writeFile', 'editFile', 'deleteFile'].includes(toolName || '');
          });
          if (hasFileChanges) {
            utils.repos.getTree.invalidate();
            utils.repos.getFile.invalidate();
          }
        }
      }
    } catch (error) {
      console.error('Chat stream error:', error);
    }
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  const handleModeChange = (mode: AgentMode) => {
    setSelectedMode(mode);
    setActiveSessionId(null);
    setMessages([]);
  };

  const isLoading = isStreaming || createSession.isPending;

  if (!isOpen && !embedded) return null;

  // Not configured state
  if (!isAiAvailable) {
    return (
      <PanelWrapper embedded={embedded} isOpen={isOpen} onClose={onClose} owner={owner} repoName={repoName}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-xs">
            <div className="w-14 h-14 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-7 w-7 text-red-400" />
            </div>
            <h3 className="font-semibold mb-2 text-zinc-100">AI Not Configured</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Add your API key in repository settings to use the AI agent.
            </p>
            {repoId && owner && repoName && (
              <Button 
                size="sm"
                variant="outline"
                onClick={() => {
                  setIDEMode(false);
                  navigate(`/${owner}/${repoName}/settings/ai`);
                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure AI
              </Button>
            )}
          </div>
        </div>
      </PanelWrapper>
    );
  }

  return (
    <PanelWrapper embedded={embedded} isOpen={isOpen} onClose={onClose} owner={owner} repoName={repoName}>
      {/* Header */}
      <div className="flex items-center justify-between h-11 px-3 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Session selector */}
          {sessions && sessions.length > 0 && (
            <SessionDropdown
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={setActiveSessionId}
              onNew={handleNewSession}
            />
          )}
          {(!sessions || sessions.length === 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleNewSession}
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </Button>
          )}
        </div>
        
        {/* Mode selector */}
        {!embedded && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                {(() => {
                  const config = MODE_CONFIG[selectedMode];
                  const Icon = config.icon;
                  return (
                    <>
                      <Icon className={cn("h-3.5 w-3.5", config.color)} />
                      {config.label}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </>
                  );
                })()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {(Object.keys(MODE_CONFIG) as AgentMode[]).map((mode) => {
                const config = MODE_CONFIG[mode];
                const Icon = config.icon;
                return (
                  <DropdownMenuItem
                    key={mode}
                    onClick={() => handleModeChange(mode)}
                    className={cn(
                      "gap-2",
                      selectedMode === mode && "bg-zinc-800"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", config.color)} />
                    <div className="flex-1">
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-zinc-500">{config.description}</div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        
        {embedded && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Code mode</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-zinc-950">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        ) : messages.length === 0 ? (
          <WelcomeScreen mode={selectedMode} onPrompt={handleSend} />
        ) : (
          <div>
            {messages.map((msg) => (
              <MessageBubble 
                key={msg.id} 
                message={msg} 
                isStreaming={msg.isStreaming}
                streamStartTime={msg.isStreaming ? streamStartTime || undefined : undefined}
              />
            ))}
            {chat.isPending && (
              <ThinkingIndicator startTime={streamStartTime || undefined} />
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-3 bg-zinc-900/80 backdrop-blur-sm flex-shrink-0">
        <ChatInput onSend={handleSend} isLoading={isLoading} mode={selectedMode} />
        <p className="text-[10px] text-zinc-600 text-center mt-2">
          wit can make mistakes. Review important changes.
        </p>
      </div>
    </PanelWrapper>
  );
}

// Wrapper component for panel vs embedded mode
function PanelWrapper({ 
  children, 
  embedded, 
  isOpen, 
  onClose,
  owner,
  repoName 
}: { 
  children: React.ReactNode;
  embedded: boolean;
  isOpen: boolean;
  onClose: () => void;
  owner?: string;
  repoName?: string;
}) {
  if (embedded) {
    return (
      <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[60] flex flex-col",
          "w-full sm:w-[500px] md:w-[560px]",
          "bg-zinc-950 border-l border-zinc-800",
          "shadow-2xl shadow-black/50",
          "transform transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-800 flex-shrink-0 bg-zinc-900/50 m-0">
          <div className="flex items-center gap-2.5 m-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center m-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-zinc-100 m-0">wit AI</span>
            {repoName && (
              <span className="text-xs text-zinc-500 m-0">{owner}/{repoName}</span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-zinc-400 hover:text-zinc-200 m-0">
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
        
        {children}
      </div>
    </>
  );
}
