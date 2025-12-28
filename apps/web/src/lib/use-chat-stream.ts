import { useState, useCallback, useRef } from 'react';

// Stream message type used for chat responses
export interface StreamMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  toolCalls?: unknown[];
  isStreaming?: boolean;
}

interface UseChatStreamOptions {
  onToolCalls?: (toolCalls: any[]) => void;
  onError?: (error: string) => void;
  onComplete?: (assistantMessageId: string, provider: string) => void;
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const streamChat = useCallback(async (
    sessionId: string,
    message: string,
    provider?: string,
    onChunk?: (chunk: string, fullContent: string) => void
  ): Promise<{ userMessageId: string; assistantMessageId: string; content: string; toolCalls?: any[] } | null> => {
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/agent/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ sessionId, message, provider }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let userMessageId = '';
      let assistantMessageId = '';
      let fullContent = '';
      let toolCalls: any[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // Event type is noted but not currently used
            continue;
          }
          
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              
              // Handle different event types based on data structure
              if (data.id && !data.content && !data.toolCalls) {
                // user_message event
                userMessageId = data.id;
              } else if (data.content !== undefined) {
                // text event
                fullContent += data.content;
                onChunk?.(data.content, fullContent);
              } else if (data.toolCalls) {
                // tool_calls event
                toolCalls = data.toolCalls;
                options.onToolCalls?.(data.toolCalls);
              } else if (data.assistantMessageId) {
                // done event
                assistantMessageId = data.assistantMessageId;
                options.onComplete?.(data.assistantMessageId, data.provider);
              } else if (data.message) {
                // error event
                options.onError?.(data.message);
                throw new Error(data.message);
              }
            } catch (e) {
              // Ignore parse errors for incomplete data
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }

      return {
        userMessageId,
        assistantMessageId,
        content: fullContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null;
      }
      const errorMessage = error instanceof Error ? error.message : 'Stream error';
      options.onError?.(errorMessage);
      throw error;
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [options]);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    streamChat,
    cancelStream,
    isStreaming,
  };
}
