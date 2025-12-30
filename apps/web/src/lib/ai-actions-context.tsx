/**
 * Unified AI Actions Context
 * 
 * Provides a central place to trigger AI actions from anywhere in the IDE.
 * This enables keyboard shortcuts, context menus, and the command palette
 * to all use the same actions.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type AIActionType = 
  | 'explain'
  | 'fix'
  | 'refactor'
  | 'test'
  | 'docs'
  | 'simplify'
  | 'optimize'
  | 'review'
  | 'custom';

export interface AIActionRequest {
  type: AIActionType;
  target: {
    filePath?: string;
    selectedText?: string;
    lineStart?: number;
    lineEnd?: number;
    context?: string;
  };
  customPrompt?: string;
  options?: {
    autoApply?: boolean;
    showPreview?: boolean;
    createNewFile?: boolean;
  };
}

export interface AIActionResult {
  success: boolean;
  content?: string;
  filePath?: string;
  diff?: {
    before: string;
    after: string;
  };
  error?: string;
}

export interface AIActionsContextValue {
  // Current action state
  isExecuting: boolean;
  currentAction: AIActionRequest | null;
  lastResult: AIActionResult | null;
  
  // Action methods
  executeAction: (action: AIActionRequest) => Promise<AIActionResult>;
  cancelAction: () => void;
  
  // Quick actions
  explain: (text: string, context?: string) => Promise<AIActionResult>;
  fix: (text: string, context?: string) => Promise<AIActionResult>;
  refactor: (text: string, context?: string) => Promise<AIActionResult>;
  generateTests: (text: string, context?: string) => Promise<AIActionResult>;
  addDocs: (text: string, context?: string) => Promise<AIActionResult>;
  
  // Inline edit
  openInlineEdit: (options: { text: string; line: number; filePath: string }) => void;
  closeInlineEdit: () => void;
  isInlineEditOpen: boolean;
  inlineEditTarget: { text: string; line: number; filePath: string } | null;
  
  // Chat integration
  sendToChat: (message: string, context?: string) => void;
  focusChat: () => void;
}

const AIActionsContext = createContext<AIActionsContextValue | null>(null);

// Action prompts
const ACTION_PROMPTS: Record<AIActionType, (text: string, context?: string) => string> = {
  explain: (text, context) => 
    `Explain what this code does in simple terms:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  fix: (text, context) => 
    `Fix any bugs, issues, or potential problems in this code:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  refactor: (text, context) => 
    `Refactor this code to be cleaner, more readable, and more maintainable:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  test: (text, context) => 
    `Write comprehensive unit tests for this code:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  docs: (text, context) => 
    `Add clear and helpful documentation comments to this code:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  simplify: (text, context) => 
    `Simplify this code while maintaining the same functionality:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  optimize: (text, context) => 
    `Optimize this code for better performance:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  review: (text, context) => 
    `Review this code and provide feedback on potential issues, improvements, and best practices:\n\n${context ? `Context: ${context}\n\n` : ''}Code:\n\`\`\`\n${text}\n\`\`\``,
  custom: (text, context) => text,
};

interface AIActionsProviderProps {
  children: ReactNode;
  onSendToChat?: (message: string, context?: string) => void;
  onFocusChat?: () => void;
}

export function AIActionsProvider({ 
  children, 
  onSendToChat,
  onFocusChat,
}: AIActionsProviderProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentAction, setCurrentAction] = useState<AIActionRequest | null>(null);
  const [lastResult, setLastResult] = useState<AIActionResult | null>(null);
  const [isInlineEditOpen, setIsInlineEditOpen] = useState(false);
  const [inlineEditTarget, setInlineEditTarget] = useState<{ text: string; line: number; filePath: string } | null>(null);

  const executeAction = useCallback(async (action: AIActionRequest): Promise<AIActionResult> => {
    setIsExecuting(true);
    setCurrentAction(action);
    
    try {
      const prompt = action.type === 'custom' 
        ? action.customPrompt || ''
        : ACTION_PROMPTS[action.type](action.target.selectedText || '', action.target.context);
      
      // In a real implementation, this would call the AI API
      // For now, we'll simulate the action
      console.log('[AIActions] Executing:', action.type, prompt);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const result: AIActionResult = {
        success: true,
        content: `// AI ${action.type} result would appear here`,
        filePath: action.target.filePath,
      };
      
      setLastResult(result);
      return result;
    } catch (error) {
      const result: AIActionResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      setLastResult(result);
      return result;
    } finally {
      setIsExecuting(false);
      setCurrentAction(null);
    }
  }, []);

  const cancelAction = useCallback(() => {
    setIsExecuting(false);
    setCurrentAction(null);
  }, []);

  // Quick action helpers
  const createQuickAction = (type: AIActionType) => {
    return async (text: string, context?: string): Promise<AIActionResult> => {
      return executeAction({
        type,
        target: { selectedText: text, context },
      });
    };
  };

  const explain = useCallback(createQuickAction('explain'), [executeAction]);
  const fix = useCallback(createQuickAction('fix'), [executeAction]);
  const refactor = useCallback(createQuickAction('refactor'), [executeAction]);
  const generateTests = useCallback(createQuickAction('test'), [executeAction]);
  const addDocs = useCallback(createQuickAction('docs'), [executeAction]);

  // Inline edit
  const openInlineEdit = useCallback((options: { text: string; line: number; filePath: string }) => {
    setInlineEditTarget(options);
    setIsInlineEditOpen(true);
  }, []);

  const closeInlineEdit = useCallback(() => {
    setIsInlineEditOpen(false);
    setInlineEditTarget(null);
  }, []);

  // Chat integration
  const sendToChat = useCallback((message: string, context?: string) => {
    if (onSendToChat) {
      onSendToChat(message, context);
    }
  }, [onSendToChat]);

  const focusChat = useCallback(() => {
    if (onFocusChat) {
      onFocusChat();
    }
  }, [onFocusChat]);

  const value: AIActionsContextValue = {
    isExecuting,
    currentAction,
    lastResult,
    executeAction,
    cancelAction,
    explain,
    fix,
    refactor,
    generateTests,
    addDocs,
    openInlineEdit,
    closeInlineEdit,
    isInlineEditOpen,
    inlineEditTarget,
    sendToChat,
    focusChat,
  };

  return (
    <AIActionsContext.Provider value={value}>
      {children}
    </AIActionsContext.Provider>
  );
}

export function useAIActions() {
  const context = useContext(AIActionsContext);
  if (!context) {
    throw new Error('useAIActions must be used within an AIActionsProvider');
  }
  return context;
}

/**
 * Optional hook that returns null if not in an AI actions context
 */
export function useAIActionsOptional() {
  return useContext(AIActionsContext);
}

/**
 * Get the prompt for a specific action type
 */
export function getActionPrompt(type: AIActionType, text: string, context?: string): string {
  return ACTION_PROMPTS[type](text, context);
}
