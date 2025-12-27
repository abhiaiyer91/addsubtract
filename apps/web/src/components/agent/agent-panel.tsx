import { useState, useEffect, useRef } from 'react';
import {
  Bot,
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

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  repoId?: string;
  repoName?: string;
  owner?: string;
}

const quickActions = [
  { id: 'branch', icon: GitBranch, label: 'Create branch', prompt: 'Create a new branch called ' },
  { id: 'commit', icon: GitCommit, label: 'Commit changes', prompt: 'Help me commit my current changes with a good message' },
  { id: 'pr', icon: GitPullRequest, label: 'Create PR', prompt: 'Create a pull request for the current branch' },
  { id: 'issue', icon: CircleDot, label: 'Create issue', prompt: 'Create an issue for ' },
  { id: 'explain', icon: Code, label: 'Explain code', prompt: 'Explain this code: ' },
];

export function AgentPanel({ isOpen, onClose, repoId, repoName, owner }: AgentPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
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

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSend = async (message: string) => {
    const provider = selectedProvider as 'anthropic' | 'openai' | undefined;
    if (!activeSessionId) {
      const newSession = await createSession.mutateAsync({ repoId });
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
    createSession.mutate({ repoId });
    setShowHistory(false);
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

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-y-0 right-0 z-40 flex flex-col',
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
                  {sessions.map((session) => (
                    <DropdownMenuItem
                      key={session.id}
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setShowHistory(false);
                      }}
                      className={cn(
                        'flex items-center justify-between gap-2 py-2',
                        activeSessionId === session.id && 'bg-accent'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{session.title || 'New conversation'}</p>
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
                  ))}
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
            {repoId && (
              <Button asChild size="sm" className="gap-2">
                <Link to="settings/ai">
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
                      <Bot className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">How can I help?</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      I can help you write code, create branches, commit changes, open PRs, and more.
                    </p>
                  </div>

                  {/* Quick actions */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground px-1">Quick actions</p>
                    <div className="grid grid-cols-2 gap-2">
                      {quickActions.slice(0, 4).map((action) => (
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
                      {[
                        'What does this repository do?',
                        'Find all TODO comments in the codebase',
                        'How is authentication implemented?',
                      ].map((suggestion) => (
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
