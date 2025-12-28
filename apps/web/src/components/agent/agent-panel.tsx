import { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useAgentTools } from '@/lib/use-agent-tools';

type AgentMode = 'pm' | 'code';

const MODE_CONFIG: Record<AgentMode, { icon: React.ElementType; label: string; description: string }> = {
  pm: {
    icon: ClipboardList,
    label: 'PM',
    description: 'Ask questions, create issues & PRs',
  },
  code: {
    icon: FileCode,
    label: 'Code',
    description: 'Write and edit code (auto-commits)',
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
}

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  repoId?: string;
  repoName?: string;
  owner?: string;
  embedded?: boolean;
}

// Simple code block component with copy button
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 bg-background/80"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 overflow-x-auto">
        <code className="text-sm text-zinc-300 font-mono">{code}</code>
      </pre>
    </div>
  );
}

// Simple inline code component
function InlineCode({ children }: { children: string }) {
  return (
    <code className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-sm font-mono">
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
          <h3 key={key++} className="text-base font-semibold mt-4 mb-2">
            {line.slice(4)}
          </h3>
        );
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        result.push(
          <h2 key={key++} className="text-lg font-semibold mt-4 mb-2">
            {line.slice(3)}
          </h2>
        );
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        result.push(
          <h1 key={key++} className="text-xl font-bold mt-4 mb-2">
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
          <ul key={key++} className="list-disc list-inside space-y-1 my-2">
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
          <ol key={key++} className="list-decimal list-inside space-y-1 my-2">
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
          <p key={key++} className="text-sm leading-relaxed my-2">
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
        result.push(<strong key={key++} className="font-semibold">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic
      const italicMatch = remaining.match(/^\*([^*]+)\*/);
      if (italicMatch) {
        result.push(<em key={key++}>{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Link
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        result.push(
          <a key={key++} href={linkMatch[2]} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
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

// Tool icon mapping
function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'writeFile':
      return FileCode;
    case 'readFile':
      return Eye;
    case 'editFile':
      return Pencil;
    case 'deleteFile':
      return Trash2;
    case 'listDirectory':
      return FolderOpen;
    case 'createBranch':
    case 'getHistory':
      return GitCommit;
    default:
      return FileCode;
  }
}

// Tool call display component
function ToolCallBadge({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = tool.payload?.toolName || tool.toolName || 'unknown';
  const args = tool.payload?.args || tool.args || {};
  const Icon = getToolIcon(toolName);
  
  // Get a summary of the args
  const getSummary = () => {
    if (toolName === 'writeFile' || toolName === 'editFile' || toolName === 'readFile' || toolName === 'deleteFile') {
      return args.path as string || '';
    }
    if (toolName === 'listDirectory') {
      return (args.path as string) || '/';
    }
    if (toolName === 'createBranch') {
      return args.name as string || '';
    }
    return '';
  };

  const summary = getSummary();
  const hasDetails = toolName === 'writeFile' || toolName === 'editFile';

  return (
    <div className="group">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs rounded-md px-2 py-1.5 w-full text-left transition-colors",
          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
          hasDetails && "hover:bg-emerald-500/20 cursor-pointer"
        )}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-medium">{toolName}</span>
        {summary && (
          <span className="text-emerald-300/70 truncate flex-1 font-mono text-[11px]">
            {summary}
          </span>
        )}
        {hasDetails && (
          expanded ? 
            <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-50" /> : 
            <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-50" />
        )}
      </button>
      
      {expanded && hasDetails && args.content && (
        <div className="mt-1 ml-6 p-2 bg-muted/30 rounded text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto">
          <pre className="text-muted-foreground whitespace-pre-wrap break-all">
            {String(args.content).slice(0, 500)}
            {String(args.content).length > 500 && '...'}
          </pre>
        </div>
      )}
    </div>
  );
}

// Message component
function MessageBubble({ 
  message,
  isStreaming 
}: { 
  message: Message;
  isStreaming?: boolean;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const toolCalls = message.toolCalls || [];

  return (
    <div className={cn(
      "px-4 py-4",
      isUser ? "bg-muted/30" : "bg-transparent"
    )}>
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3">
          {/* Avatar */}
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
            isUser 
              ? "bg-primary text-primary-foreground" 
              : isSystem 
                ? "bg-destructive/20 text-destructive" 
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
          <div className="flex-1 min-w-0 space-y-2">
            {/* Role label */}
            <div className="text-xs font-medium text-muted-foreground">
              {isUser ? 'You' : isSystem ? 'System' : 'wit AI'}
            </div>
            
            {/* Tool calls (show before content for assistant) */}
            {!isUser && toolCalls.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {toolCalls.map((tool, i) => (
                  <ToolCallBadge key={i} tool={tool} />
                ))}
              </div>
            )}
            
            {/* Message content */}
            {isStreaming ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            ) : message.content ? (
              <div className={cn(
                "text-foreground",
                isSystem && "text-destructive"
              )}>
                <MessageContent content={message.content} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Chat input component
function ChatInput({ 
  onSend, 
  isLoading,
  disabled 
}: { 
  onSend: (message: string) => void; 
  isLoading: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!value.trim() || isLoading || disabled) return;
    onSend(value.trim());
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask wit AI..."
        disabled={isLoading || disabled}
        className={cn(
          "min-h-[44px] max-h-[150px] resize-none pr-12",
          "bg-muted/50 border-muted-foreground/20",
          "focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
          "placeholder:text-muted-foreground/50"
        )}
        rows={1}
      />
      <Button
        size="icon"
        variant="ghost"
        onClick={handleSubmit}
        disabled={!value.trim() || isLoading || disabled}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8",
          "hover:bg-primary/20 hover:text-primary",
          value.trim() && !isLoading && "text-primary"
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

// Mode-specific suggestions
const MODE_SUGGESTIONS: Record<AgentMode, Array<{ label: string; prompt: string }>> = {
  pm: [
    { label: 'Explain this codebase', prompt: 'Give me an overview of this codebase' },
    { label: 'Create an issue', prompt: 'Create an issue for ' },
    { label: 'List open issues', prompt: 'List all open issues' },
    { label: 'Create a PR', prompt: 'Create a pull request for ' },
  ],
  code: [
    { label: 'Create a new file', prompt: 'Create a new file called ' },
    { label: 'Edit a file', prompt: 'Edit the file ' },
    { label: 'Add a feature', prompt: 'Add a feature that ' },
    { label: 'Fix a bug', prompt: 'Fix the bug where ' },
  ],
};

// Welcome screen
function WelcomeScreen({ mode, onPrompt }: { mode: AgentMode; onPrompt: (prompt: string) => void }) {
  const config = MODE_CONFIG[mode];
  const suggestions = MODE_SUGGESTIONS[mode];
  const Icon = config.icon;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-white" />
      </div>
      <h2 className="text-lg font-semibold mb-1">{config.label} Mode</h2>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
        {config.description}
      </p>
      
      <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onPrompt(s.prompt)}
            className={cn(
              "px-3 py-2.5 rounded-lg text-left text-sm",
              "bg-muted/50 hover:bg-muted border border-transparent hover:border-border/50",
              "transition-colors"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AgentPanel({ isOpen, onClose, repoId, repoName, owner, embedded = false }: AgentPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<AgentMode>(embedded ? 'code' : 'pm');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Queries
  const { data: aiStatus } = trpc.agent.status.useQuery({ repoId });
  const { data: repoAiStatus } = trpc.repoAiKeys.hasKeys.useQuery(
    { repoId: repoId! },
    { enabled: !!repoId }
  );
  const isAiAvailable = aiStatus?.available || repoAiStatus?.hasKeys;

  // @ts-expect-error - mode parameter exists on backend but types not regenerated
  const { data: sessions } = trpc.agent.listSessions.useQuery({ 
    limit: 50, 
    mode: selectedMode,
    repoId: repoId,
  });
  const { data: sessionMessages, isLoading: messagesLoading } = trpc.agent.getMessages.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId }
  );

  // Mutations
  const createSession = trpc.agent.createSession.useMutation({
    onSuccess: (newSession) => {
      setActiveSessionId(newSession.id);
      setMessages([]);
      utils.agent.listSessions.invalidate();
      
      // If there's a pending prompt, send it
      if (pendingPrompt) {
        setTimeout(() => {
          chat.mutate({ 
            sessionId: newSession.id, 
            message: pendingPrompt,
            provider: selectedProvider as 'anthropic' | 'openai' | undefined
          });
          setPendingPrompt(null);
        }, 100);
      }
    },
  });

  const { processToolCalls } = useAgentTools();

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

      // Process tool calls for IDE integration
      if (embedded && result.toolCalls) {
        processToolCalls(result.toolCalls);
        
        // Invalidate file tree cache if agent modified files
        const hasFileChanges = result.toolCalls.some((tc: any) => {
          const toolName = tc.payload?.toolName || tc.toolName;
          return ['writeFile', 'editFile', 'deleteFile'].includes(toolName);
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
  }, [messages, chat.isPending]);

  // Auto-select first session when sessions change (filtered by mode)
  useEffect(() => {
    if (sessions && isAiAvailable) {
      // If no active session, or active session is not in the filtered list, select first
      const activeInList = activeSessionId && sessions.some(s => s.id === activeSessionId);
      if (!activeInList && sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
        setMessages([]); // Clear messages when switching sessions
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
    
    // Add temp user message
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        createdAt: new Date(),
      },
    ]);
    
    if (!activeSessionId) {
      // Create session first, then send message
      setPendingPrompt(message);
      createSession.mutate({ repoId, mode: selectedMode });
    } else {
      chat.mutate({ sessionId: activeSessionId, message, provider });
    }
  };

  const handleNewSession = () => {
    createSession.mutate({ repoId, mode: selectedMode });
  };

  const handleModeChange = (mode: AgentMode) => {
    setSelectedMode(mode);
    // Clear active session - the useEffect will auto-select from the new mode's sessions
    setActiveSessionId(null);
    setMessages([]);
  };

  const isLoading = chat.isPending || createSession.isPending;

  if (!isOpen && !embedded) return null;

  // Not configured state
  if (!isAiAvailable) {
    return (
      <PanelWrapper embedded={embedded} isOpen={isOpen} onClose={onClose} owner={owner} repoName={repoName}>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-xs">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="font-semibold mb-2">AI Not Configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your API key in repository settings to use the AI agent.
            </p>
            {repoId && owner && repoName && (
              <Button asChild size="sm">
                <Link to={`/${owner}/${repoName}/settings/ai`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configure AI
                </Link>
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
      <div className="flex items-center justify-between h-11 px-3 border-b bg-muted/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewSession}
            disabled={createSession.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {sessions?.length || 0} chats
          </span>
        </div>
        
        {/* Mode selector - only show when not embedded */}
        {embedded ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Code mode</span>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                {(() => {
                  const config = MODE_CONFIG[selectedMode];
                  const Icon = config.icon;
                  return (
                    <>
                      <Icon className="h-3.5 w-3.5" />
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
                      selectedMode === mode && "bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <div className="flex-1">
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-muted-foreground">{config.description}</div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <WelcomeScreen mode={selectedMode} onPrompt={handleSend} />
        ) : (
          <div className="divide-y divide-border/30">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {chat.isPending && (
              <MessageBubble 
                message={{ 
                  id: 'loading', 
                  role: 'assistant', 
                  content: '', 
                  createdAt: new Date() 
                }} 
                isStreaming 
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3 bg-background/80 backdrop-blur-sm flex-shrink-0">
        <ChatInput onSend={handleSend} isLoading={isLoading} />
        <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
          wit AI can make mistakes. Review important changes.
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
      <div className="flex flex-col h-full bg-background overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-[55] transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[60] flex flex-col",
          "w-full sm:w-[480px] md:w-[540px]",
          "bg-background border-l",
          "shadow-2xl",
          "transform transition-transform duration-200",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between h-12 px-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">wit AI</span>
            {repoName && (
              <span className="text-xs text-muted-foreground">
                · {owner}/{repoName}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
        
        {children}
      </div>
    </>
  );
}
