import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Markdown } from '@/components/markdown/renderer';
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
    icon: <FileText className="h-3 w-3" />,
  },
  {
    label: 'Find potential issues',
    query: 'Are there any potential issues or bugs in the code changes?',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  {
    label: 'Explain the code',
    query: 'Can you explain the main logic of the changes?',
    icon: <Code className="h-3 w-3" />,
  },
  {
    label: 'How to test',
    query: 'How should I test these changes?',
    icon: <Sparkles className="h-3 w-3" />,
  },
];

export function AiChat({
  prNumber,
  onSendMessage,
  initialMessages = [],
  suggestedQuestions = defaultSuggestions,
  className,
}: AiChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1 bg-primary/10 rounded">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            Agent
          </CardTitle>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearChat();
                }}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="flex-1 flex flex-col gap-3 pt-0">
          {/* Messages area */}
          {messages.length > 0 ? (
            <div className="flex-1 overflow-y-auto max-h-[400px] space-y-3 p-2 bg-muted/30 rounded-lg">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-2',
                    message.role === 'user' && 'justify-end'
                  )}
                >
                  {message.role === 'assistant' && (
                    <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        <Bot className="h-3 w-3" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-3 py-2 text-sm group relative',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Markdown content={message.content} />
                        </div>
                        <button
                          onClick={() => handleCopy(message.content, message.id)}
                          className="absolute -right-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                          title="Copy"
                        >
                          {copiedId === message.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
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
                <div className="flex gap-2">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      <Bot className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-background border rounded-lg px-3 py-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            /* Suggested questions */
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Suggested questions:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((suggestion, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleSend(suggestion.query)}
                    disabled={!onSendMessage || isSending}
                  >
                    {suggestion.icon}
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              placeholder={`Ask about PR #${prNumber}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="resize-none text-sm min-h-[36px] max-h-[100px]"
              disabled={!onSendMessage || isSending}
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || !onSendMessage || isSending}
              className="shrink-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {!onSendMessage && (
            <p className="text-xs text-muted-foreground text-center">
              Sign in to ask AI questions about this PR
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
