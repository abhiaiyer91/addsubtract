import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Code,
  FileText,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Markdown } from '@/components/markdown/renderer';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SuggestedQuestion {
  label: string;
  query: string;
  icon?: React.ReactNode;
}

interface AiChatProps {
  prNumber: number;
  onSendMessage?: (message: string) => Promise<string>;
  initialMessages?: ChatMessage[];
  suggestedQuestions?: SuggestedQuestion[];
  className?: string;
}

const defaultSuggestions: SuggestedQuestion[] = [
  {
    label: 'Summarize changes',
    query: 'Can you summarize the key changes in this PR?',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    label: 'Find potential issues',
    query: 'Are there any potential issues or bugs in the code changes?',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  {
    label: 'Explain the code',
    query: 'Can you explain the main logic of the changes?',
    icon: <Code className="h-4 w-4" />,
  },
  {
    label: 'How to test',
    query: 'How should I test these changes?',
    icon: <Sparkles className="h-4 w-4" />,
  },
];

export function AiChat({
  prNumber,
  onSendMessage,
  initialMessages = [],
  suggestedQuestions = defaultSuggestions,
  className,
}: AiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || !onSendMessage) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      const response = await onSendMessage(text);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center justify-between gap-3 p-3 rounded-lg",
            "bg-muted/50 hover:bg-muted border border-border/50 hover:border-border",
            "transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            className
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">AI Agent</p>
              <p className="text-xs text-muted-foreground">Ask questions about this PR</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              AI Agent
            </SheetTitle>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={handleClearChat}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Ask questions about PR #{prNumber}
          </p>
        </SheetHeader>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length > 0 ? (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' && 'justify-end'
                  )}
                >
                  {message.role === 'assistant' && (
                    <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-4 py-3 text-sm group relative',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Markdown content={message.content} />
                        </div>
                        <button
                          onClick={() => handleCopy(message.content, message.id)}
                          className="absolute -right-10 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-muted"
                          title="Copy"
                        >
                          {copiedId === message.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            /* Suggested questions */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground font-medium">Suggested questions</p>
              <div className="space-y-2">
                {suggestedQuestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(suggestion.query)}
                    disabled={!onSendMessage || isSending}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg text-left",
                      "bg-muted/50 hover:bg-muted border border-transparent hover:border-border",
                      "transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    )}
                  >
                    <span className="shrink-0 p-2 rounded-lg bg-primary/10 text-primary">
                      {suggestion.icon}
                    </span>
                    <span className="text-sm font-medium">{suggestion.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t p-4 space-y-3">
          {!onSendMessage && (
            <p className="text-xs text-muted-foreground text-center">
              Sign in to ask AI questions about this PR
            </p>
          )}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              placeholder={`Ask about PR #${prNumber}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="resize-none text-sm min-h-[44px] max-h-[120px]"
              disabled={!onSendMessage || isSending}
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || !onSendMessage || isSending}
              className="shrink-0 h-[44px] w-[44px]"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
