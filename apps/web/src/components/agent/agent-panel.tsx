import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  AlertCircle,
  Settings,
  ChevronDown,
  GitBranch,
  GitCommit,
  GitPullRequest,
  CircleDot,
  Code,
  Sparkles,
  PanelRightClose,
  History,
  ChevronRight,
  HelpCircle,
  ClipboardList,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChatMessage } from './chat-message';
import { ChatInput, type ChatInputRef } from './chat-input';
import { trpc } from '@/lib/trpc';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useAgentTools } from '@/lib/use-agent-tools';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

type AgentMode = 'questions' | 'pm' | 'code';

const MODE_CONFIG: Record<AgentMode, { icon: React.ElementType; label: string; description: string }> = {
  questions: {
    icon: HelpCircle,
    label: 'Questions',
    description: 'Ask questions about the codebase',
  },
  pm: {
    icon: ClipboardList,
    label: 'PM',
    description: 'Create issues, PRs, and manage projects',
  },
  code: {
    icon: FileCode,
    label: 'Code',
    description: 'Write code and commit changes',
  },
};

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  repoId?: string;
  repoName?: string;
  owner?: string;
  /** When true, renders inline without fixed positioning (for IDE mode) */
  embedded?: boolean;
}

// Mode-specific quick actions
const QUICK_ACTIONS: Record<AgentMode, Array<{ id: string; icon: React.ElementType; label: string; prompt: string }>> = {
  questions: [
    { id: 'explain', icon: Code, label: 'Explain code', prompt: 'Explain this code: ' },
    { id: 'find', icon: HelpCircle, label: 'Find usage', prompt: 'Find all usages of ' },
    { id: 'architecture', icon: ClipboardList, label: 'Architecture', prompt: 'Explain the architecture of this project' },
    { id: 'debug', icon: AlertCircle, label: 'Debug help', prompt: 'Help me debug this issue: ' },
  ],
  pm: [
    { id: 'issue', icon: CircleDot, label: 'Create issue', prompt: 'Create an issue for ' },
    { id: 'pr', icon: GitPullRequest, label: 'Create PR', prompt: 'Create a pull request for the current branch' },
    { id: 'list-issues', icon: ClipboardList, label: 'List issues', prompt: 'List all open issues' },
    { id: 'list-prs', icon: GitPullRequest, label: 'List PRs', prompt: 'List all open pull requests' },
  ],
  code: [
    { id: 'branch', icon: GitBranch, label: 'Create branch', prompt: 'Create a new branch called ' },
    { id: 'commit', icon: GitCommit, label: 'Commit changes', prompt: 'Help me commit my current changes with a good message' },
    { id: 'edit', icon: FileCode, label: 'Edit file', prompt: 'Edit the file ' },
    { id: 'refactor', icon: Code, label: 'Refactor', prompt: 'Refactor this code to ' },
  ],
};

export function AgentPanel({ isOpen, onClose, repoId, repoName, owner, embedded = false }: AgentPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedMode, setSelectedMode] = useState<AgentMode>('questions');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputRef>(null);
  const utils = trpc.useUtils();

  // Check AI status from server
  const { data: aiStatus } = trpc.agent.status.useQuery({ repoId });

  // Check repo-level AI keys if we have a repoId
  const { data: repoAiStatus } = trpc.repoAiKeys.hasKeys.useQuery(
    { repoId: repoId! },
    { enabled: !!repoId }
  );

  const isAiAvailable = aiStatus?.available || repoAiStatus?.hasKeys;

  // List sessions
  const { data: sessions, isLoading: sessionsLoading } = trpc.agent.listSessions.useQuery({
    limit: 50,
  });

  // Get messages for active session
  const { data: sessionMessages, isLoading: messagesLoading } = trpc.agent.getMessages.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId }
  );

  // Create session mutation
  const createSession = trpc.agent.createSession.useMutation({
    onSuccess: (newSession) => {
      setActiveSessionId(newSession.id);
      setMessages([]);
      // Update selected mode based on session mode
      if (newSession.mode) {
        setSelectedMode(newSession.mode as AgentMode);
      }
      utils.agent.listSessions.invalidate();
    },
  });

  // Delete session mutation
  const deleteSession = trpc.agent.deleteSession.useMutation({
    onSuccess: () => {
      if (sessions && sessions.length > 1) {
        const remaining = sessions.filter((s) => s.id !== activeSessionId);
        setActiveSessionId(remaining[0]?.id || null);
      } else {
        setActiveSessionId(null);
      }
      utils.agent.listSessions.invalidate();
    },
  });

  // Hook for processing agent tool results
  const { processToolCalls } = useAgentTools();

  // Chat mutation
  const chat = trpc.agent.chat.useMutation({
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
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
        },
      ]);
      setStreamingMessage('');
      utils.agent.listSessions.invalidate();

      // Process tool calls for IDE integration
      if (embedded && result.toolCalls) {
        processToolCalls(result.toolCalls);
      }
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${error.message}`,
          createdAt: new Date(),
        },
      ]);
    },
  });

  // Update messages when session changes
  useEffect(() => {
    if (sessionMessages) {
      setMessages(
        sessionMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          createdAt: new Date(msg.createdAt),
        }))
      );
    }
  }, [sessionMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Auto-select first session or create new one
  useEffect(() => {
    if (!sessionsLoading && sessions && !activeSessionId) {
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
      }
    }
  }, [sessions, sessionsLoading, activeSessionId]);

  // Set default provider when aiStatus loads
  useEffect(() => {
    if (aiStatus?.defaultProvider && !selectedProvider) {
      setSelectedProvider(aiStatus.defaultProvider);
    }
  }, [aiStatus?.defaultProvider, selectedProvider]);

  // Close on escape key (only when not embedded)
  useEffect(() => {
    if (embedded) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, embedded]);

  const handleSend = async (message: string) => {
    const provider = selectedProvider as 'anthropic' | 'openai' | undefined;
    if (!activeSessionId) {
      const newSession = await createSession.mutateAsync({ repoId, mode: selectedMode });
      chat.mutate({ sessionId: newSession.id, message, provider });
    } else {
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          role: 'user',
          content: message,
          createdAt: new Date(),
        },
      ]);
      chat.mutate({ sessionId: activeSessionId, message, provider });
    }
  };

  const handleNewSession = () => {
    createSession.mutate({ repoId, mode: selectedMode });
    setShowHistory(false);
  };

  const handleModeChange = (mode: AgentMode) => {
    setSelectedMode(mode);
    // If we have an active session, start a new one with the new mode
    if (activeSessionId) {
      createSession.mutate({ repoId, mode });
    }
  };

  const handleQuickAction = (prompt: string) => {
    inputRef.current?.setValue(prompt);
    inputRef.current?.focus();
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteSessionId(sessionId);
  };

  const confirmDeleteSession = () => {
    if (deleteSessionId) {
      deleteSession.mutate({ sessionId: deleteSessionId });
      setDeleteSessionId(null);
    }
  };

  const isLoading = chat.isPending || createSession.isPending;

  if (!isOpen && !embedded) return null;

  // Embedded mode: render inline without fixed positioning
  if (embedded) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* AI not configured */}
        {!isAiAvailable ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-xs">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="text-base font-semibold mb-2">AI Not Configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your API key in repository settings to use the agent.
              </p>
              {repoId && owner && repoName && (
                <Button asChild size="sm" className="gap-2">
                  <Link to={`/${owner}/${repoName}/settings/ai`}>
                    <Settings className="h-4 w-4" />
                    Configure AI
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Compact header with session controls */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/10">
              <div className="flex items-center gap-1">
                {sessions && sessions.length > 0 && (
                  <DropdownMenu open={showHistory} onOpenChange={setShowHistory}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Sessions</div>
                      <DropdownMenuSeparator />
                      <div className="max-h-48 overflow-y-auto">
                        {sessions.slice(0, 10).map((session) => (
                          <DropdownMenuItem
                            key={session.id}
                            onClick={() => {
                              setActiveSessionId(session.id);
                              setShowHistory(false);
                            }}
                            className={cn('py-1.5', activeSessionId === session.id && 'bg-accent')}
                          >
                            <MessageSquare className="h-3 w-3 mr-2 text-muted-foreground" />
                            <span className="truncate text-xs">{session.title || 'New conversation'}</span>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={handleNewSession}
                  disabled={createSession.isPending}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {aiStatus && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="truncate max-w-24">{aiStatus.model?.split(':').pop() || 'AI'}</span>
                </div>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="min-h-full">
                {messagesLoading ? (
                  <div className="p-4 text-center text-muted-foreground text-xs">Loading...</div>
                ) : messages.length === 0 ? (
                  <div className="p-4 space-y-4">
                    <div className="text-center py-6">
                      <Bot className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-xs text-muted-foreground">Ask me to write code, create files, or modify the project</p>
                    </div>
                    <div className="space-y-1">
                      {[
                        'Create a new React component',
                        'Add a unit test for this file',
                        'Refactor this function',
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => handleSend(suggestion)}
                          className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          <ChevronRight className="h-3 w-3" />
                          <span>{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {messages.map((msg) => (
                      <ChatMessage key={msg.id} role={msg.role} content={msg.content} timestamp={msg.createdAt} compact />
                    ))}
                    {streamingMessage && <ChatMessage role="assistant" content={streamingMessage} isStreaming compact />}
                    {isLoading && !streamingMessage && <ChatMessage role="assistant" content="Thinking..." isStreaming compact />}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t p-2 bg-muted/10">
              <ChatInput ref={inputRef} onSend={handleSend} isLoading={isLoading} compact />
            </div>
          </>
        )}

        {/* Delete dialog */}
        <AlertDialog open={!!deleteSessionId} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently delete this conversation.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteSession} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'fixed inset-y-0 right-0 z-[60] flex flex-col',
        'w-full sm:w-[440px] md:w-[500px] lg:w-[560px]',
        'bg-background border-l border-border/50',
        'shadow-2xl shadow-black/20',
        'transform transition-transform duration-300 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-emerald-400/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm truncate">wit Agent</h2>
              {repoName && owner && (
                <span className="text-xs text-muted-foreground truncate">
                  {owner}/{repoName}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Session switcher dropdown */}
          {sessions && sessions.length > 0 && (
            <DropdownMenu open={showHistory} onOpenChange={setShowHistory}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
                  <History className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Recent conversations
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto">
                  {sessions.map((session) => {
                    const sessionMode = (session.mode as AgentMode) || 'questions';
                    const ModeIcon = MODE_CONFIG[sessionMode]?.icon || MessageSquare;
                    return (
                      <DropdownMenuItem
                        key={session.id}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setSelectedMode(sessionMode);
                          setShowHistory(false);
                        }}
                        className={cn(
                          'flex items-center justify-between gap-2 py-2',
                          activeSessionId === session.id && 'bg-accent'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <ModeIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm truncate">{session.title || 'New conversation'}</p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {MODE_CONFIG[sessionMode]?.label || sessionMode}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(session.createdAt)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleNewSession} className="gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  New conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* New chat button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleNewSession}
                  disabled={createSession.isPending}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Close button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted-foreground hover:text-foreground">
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close panel (Esc)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Mode selector tabs */}
      {isAiAvailable && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-muted/10">
          {(Object.keys(MODE_CONFIG) as AgentMode[]).map((mode) => {
            const config = MODE_CONFIG[mode];
            const Icon = config.icon;
            return (
              <TooltipProvider key={mode}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={selectedMode === mode ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => handleModeChange(mode)}
                      className={cn(
                        'h-8 px-3 gap-1.5 text-xs',
                        selectedMode === mode 
                          ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {config.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{config.description}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      )}

      {/* AI not configured */}
      {!isAiAvailable ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-xs">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-base font-semibold mb-2">AI Not Configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your API key in repository settings to use the agent.
            </p>
            {repoId && owner && repoName && (
              <Button asChild size="sm" className="gap-2">
                <Link to={`/${owner}/${repoName}/settings/ai`}>
                  <Settings className="h-4 w-4" />
                  Configure AI
                </Link>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Chat messages area */}
          <ScrollArea className="flex-1">
            <div className="min-h-full">
              {messagesLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Loading...
                </div>
              ) : messages.length === 0 ? (
                <div className="p-6 space-y-6">
                  {/* Welcome message */}
                  <div className="text-center pt-8 pb-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-emerald-400/20 mb-4">
                      {(() => {
                        const Icon = MODE_CONFIG[selectedMode].icon;
                        return <Icon className="h-7 w-7 text-primary" />;
                      })()}
                    </div>
                    <h3 className="text-lg font-semibold mb-1">
                      {selectedMode === 'questions' && 'Ask me anything'}
                      {selectedMode === 'pm' && 'Project Management'}
                      {selectedMode === 'code' && 'Ready to code'}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      {MODE_CONFIG[selectedMode].description}
                    </p>
                  </div>

                  {/* Quick actions */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground px-1">Quick actions</p>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_ACTIONS[selectedMode].map((action) => (
                        <button
                          key={action.id}
                          onClick={() => handleQuickAction(action.prompt)}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2.5 rounded-lg text-left',
                            'bg-muted/40 hover:bg-muted/60 border border-border/50',
                            'transition-colors text-sm'
                          )}
                        >
                          <action.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Suggestions */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground px-1">Try asking</p>
                    <div className="space-y-1.5">
                      {(selectedMode === 'questions' ? [
                        'What does this repository do?',
                        'Find all TODO comments in the codebase',
                        'How is authentication implemented?',
                      ] : selectedMode === 'pm' ? [
                        'List all open issues assigned to me',
                        'Create an issue for adding dark mode',
                        'What PRs need review?',
                      ] : [
                        'Create a new feature branch',
                        'Help me implement a login page',
                        'Fix the TypeScript errors in this file',
                      ]).map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => handleSend(suggestion)}
                          className={cn(
                            'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left',
                            'hover:bg-muted/40 border border-transparent hover:border-border/50',
                            'transition-all text-sm text-muted-foreground hover:text-foreground group'
                          )}
                        >
                          <ChevronRight className="h-3.5 w-3.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                          <span>{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      timestamp={msg.createdAt}
                      compact
                    />
                  ))}
                  {streamingMessage && (
                    <ChatMessage role="assistant" content={streamingMessage} isStreaming compact />
                  )}
                  {isLoading && !streamingMessage && (
                    <ChatMessage role="assistant" content="Thinking..." isStreaming compact />
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-border/50 p-3 bg-muted/10">
            <ChatInput ref={inputRef} onSend={handleSend} isLoading={isLoading} compact />

            {/* Model indicator */}
            {aiStatus && (
              <div className="flex items-center justify-between mt-2 px-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>
                    {(aiStatus as any).providers?.find((p: { id: string }) => p.id === selectedProvider)?.description ||
                      `${aiStatus.provider}: ${aiStatus.model}`}
                  </span>
                </div>
                {(aiStatus as any).providers && (aiStatus as any).providers.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                        Switch
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {(aiStatus as any).providers.map((provider: { id: string; description: string; source: string }) => (
                        <DropdownMenuItem
                          key={provider.id}
                          onClick={() => setSelectedProvider(provider.id)}
                          className={cn(selectedProvider === provider.id && 'bg-accent')}
                        >
                          <span>{provider.description}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSessionId} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
