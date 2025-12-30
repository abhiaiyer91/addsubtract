// Agent components for wit IDE
export { AgentPanel } from './agent-panel';
export { AgentPlanVisualization, useAgentPlan, type AgentPlan, type PlanStep } from './agent-plan';
export { SmartChatInput } from './smart-chat-input';
export { ToolDiffViewer, DiffBadge } from './tool-diff-viewer';
export { 
  AgenticModeToggle, 
  AgentStatusIndicator, 
  PermissionRequest, 
  useAgenticMode,
  type AgenticModeConfig,
  type AutonomyLevel,
} from './agentic-mode';

// Advanced AI features
export { 
  MultiFileRefactor, 
  useMultiFileRefactor,
  type FileChange,
  type RefactorPlan,
  type DiffHunk,
} from './multi-file-refactor';
export { 
  TestGenerator, 
  useTestGenerator,
  type GeneratedTests,
  type TestCase,
  type TestGeneratorConfig,
  type TestFramework,
  type TestType,
} from './test-generator';
export { 
  AISuggestionsPanel, 
  useAISuggestions,
  type Suggestion,
  type SuggestionSeverity,
  type SuggestionCategory,
} from './ai-suggestions-panel';
