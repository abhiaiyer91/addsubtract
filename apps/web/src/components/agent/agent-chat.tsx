import { useState, useEffect, useRef } from 'react';
import { Plus, MessageSquare, Trash2, Bot, AlertCircle, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { trpc } from '@/lib/trpc';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

interface AgentChatProps {
  repoId?: string;
}

export function AgentChat({ repoId }: AgentChatProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Check AI status from server - pass repoId to get repo-level keys too
  const { data: aiStatus } = trpc.agent.status.useQuery({ repoId });
  
  // Check repo-level AI keys if we have a repoId
  const { data: repoAiStatus } = trpc.repoAiKeys.hasKeys.useQuery(
    { repoId: repoId! },
    { enabled: !!repoId }
  );
  
  // AI is available if either server has keys OR repo has keys
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
      utils.agent.listSessions.invalidate(); // Refresh to get updated title
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

  const handleSend = async (message: string) => {
    const provider = selectedProvider as 'anthropic' | 'openai' | undefined;
    if (!activeSessionId) {
      // Create a new session first, passing repoId so AI keys can be found
      const newSession = await createSession.mutateAsync({ repoId });
      chat.mutate({ sessionId: newSession.id, message, provider });
    } else {
      // Add optimistic user message
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

  // AI not available - check both server and repo keys
  if (!isAiAvailable) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">AI Not Configured</h2>
          <p className="text-muted-foreground mb-4">
            The wit agent requires an AI provider to be configured. You can add your API key in the repository settings.
          </p>
          {repoId && (
            <Button asChild className="gap-2">
              <Link to="settings/ai">
                <Settings className="h-4 w-4" />
                Configure AI Keys
              </Link>
            </Button>
          )}
          {!repoId && (
            <div className="bg-muted rounded-lg p-4 text-left font-mono text-sm">
              <p>ANTHROPIC_API_KEY=sk-ant-...</p>
              <p className="text-muted-foreground">or</p>
              <p>OPENAI_API_KEY=sk-...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="w-72 border-r flex flex-col bg-muted/20">
        <div className="p-4 border-b">
          <Button onClick={handleNewSession} className="w-full gap-2" disabled={createSession.isPending}>
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessionsLoading ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Loading sessions...</div>
            ) : sessions && sessions.length > 0 ? (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group',
                    activeSessionId === session.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {session.title || 'New conversation'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(session.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No conversations yet
              </div>
            )}
          </div>
        </ScrollArea>

        {/* AI Status footer with model switcher */}
        {aiStatus && (
          <div className="p-3 border-t bg-muted/30">
            {(aiStatus as any).providers && (aiStatus as any).providers.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>
                        {(aiStatus as any).providers.find((p: { id: string }) => p.id === selectedProvider)?.description || 
                         (aiStatus as any).providers[0]?.description || 
                         `${aiStatus.provider}: ${aiStatus.model}`}
                      </span>
                    </div>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {(aiStatus as any).providers.map((provider: { id: string; name: string; description: string; source: string }) => (
                    <DropdownMenuItem
                      key={provider.id}
                      onClick={() => setSelectedProvider(provider.id)}
                      className={cn(
                        'flex items-center justify-between',
                        selectedProvider === provider.id && 'bg-accent'
                      )}
                    >
                      <span>{provider.description}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {provider.source}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>{aiStatus.provider}: {aiStatus.model}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {activeSessionId || messages.length > 0 ? (
          <>
            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="max-w-4xl mx-auto">
                {messagesLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                      <Bot className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      Ask the wit agent to help you with coding tasks, explore your codebase, or
                      create branches and pull requests.
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <ChatMessage
                        key={msg.id}
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.createdAt}
                      />
                    ))}
                    {streamingMessage && (
                      <ChatMessage role="assistant" content={streamingMessage} isStreaming />
                    )}
                    {isLoading && !streamingMessage && (
                      <ChatMessage role="assistant" content="Thinking..." isStreaming />
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t p-4 bg-background/80 backdrop-blur-sm">
              <div className="max-w-4xl mx-auto">
                <ChatInput onSend={handleSend} isLoading={isLoading} />
              </div>
            </div>
          </>
        ) : (
          /* Empty state - no session selected */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-emerald-400/20 mb-6">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">wit Agent</h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Your AI coding assistant. Ask questions about your codebase, get help with coding
                tasks, create branches, and open pull requests.
              </p>
              <Button onClick={handleNewSession} size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Start a new conversation
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSessionId} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages. This action cannot be undone.
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
