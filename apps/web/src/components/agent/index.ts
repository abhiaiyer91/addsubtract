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
