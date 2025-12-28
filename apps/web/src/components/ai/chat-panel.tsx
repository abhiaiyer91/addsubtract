import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Sparkles,
  Send,
  Loader2,
  FileCode,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/markdown/renderer';
import { trpc } from '@/lib/trpc';
import { Link } from 'react-router-dom';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fileReferences?: Array<{ path: string; line?: number }>;
  timestamp: Date;
}

interface ChatPanelProps {
  repoId: string;
  repoName: string;
  owner: string;
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTED_QUESTIONS = [
  'Where is authentication handled?',
  'How do the tests work?',
  'Explain the folder structure',
  'What are the main API endpoints?',
  'How is state management done?',
];

export function ChatPanel({ repoId, repoName, owner, isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // AI chat mutation
  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message,
        fileReferences: data.fileReferences,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setConversationId(data.conversationId);
    },
  });

  // Check AI status
  const { data: aiStatus } = trpc.ai.status.useQuery();
  const aiAvailable = aiStatus?.available ?? false;

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || chatMutation.isPending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    chatMutation.mutate({
      repoId,
      message: trimmedInput,
      conversationId,
    });
  }, [input, repoId, conversationId, chatMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-background border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-medium">Agent</span>
          <Badge variant="secondary" className="text-xs">
            {repoName}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState 
            aiAvailable={aiAvailable}
            onSuggestedClick={handleSuggestedQuestion}
          />
        ) : (
          messages.map((message) => (
            <ChatMessage 
              key={message.id} 
              message={message}
              owner={owner}
              repoName={repoName}
            />
          ))
        )}
        
        {chatMutation.isPending && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}
        
        {chatMutation.isError && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            Failed to get response. Please try again.
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        {!aiAvailable ? (
          <div className="text-sm text-muted-foreground text-center py-2">
            AI features require configuration.
          </div>
        ) : (
          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the code..."
              className="min-h-[80px] resize-none"
              disabled={chatMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              className="self-end"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  aiAvailable: boolean;
  onSuggestedClick: (question: string) => void;
}

function EmptyState({ aiAvailable, onSuggestedClick }: EmptyStateProps) {
  if (!aiAvailable) {
    return (
      <div className="text-center py-8">
        <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
        <h3 className="font-medium mb-2">AI Not Configured</h3>
        <p className="text-sm text-muted-foreground">
          Set up an AI provider to enable repository chat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <Sparkles className="h-10 w-10 mx-auto mb-3 text-primary/60" />
        <h3 className="font-medium mb-1">Ask about the code</h3>
        <p className="text-sm text-muted-foreground">
          I can help you understand the codebase, find files, and answer questions.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Try asking:
        </p>
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            onClick={() => onSuggestedClick(question)}
            className="w-full text-left text-sm p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors flex items-center gap-2 group"
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            <span>{question}</span>
            <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface ChatMessageProps {
  message: Message;
  owner: string;
  repoName: string;
}

function ChatMessage({ message, owner, repoName }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn(
      'flex gap-3',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'max-w-[85%] rounded-lg p-3',
        isUser 
          ? 'bg-primary text-primary-foreground' 
          : 'bg-muted'
      )}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="space-y-3">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown content={message.content} />
            </div>
            
            {/* File references */}
            {message.fileReferences && message.fileReferences.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Referenced files:
                </p>
                <div className="flex flex-wrap gap-1">
                  {message.fileReferences.map((ref, idx) => (
                    <Link
                      key={idx}
                      to={`/${owner}/${repoName}/blob/main/${ref.path}${ref.line ? `#L${ref.line}` : ''}`}
                      className="inline-flex items-center gap-1 text-xs bg-background px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                    >
                      <FileCode className="h-3 w-3" />
                      {ref.path.split('/').pop()}
                      {ref.line && `:${ref.line}`}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Button to open the chat panel
 */
interface AskAIButtonProps {
  onClick: () => void;
  className?: string;
}

export function AskAIButton({ onClick, className }: AskAIButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn('gap-2', className)}
    >
      <Sparkles className="h-4 w-4" />
      Agent
    </Button>
  );
}
