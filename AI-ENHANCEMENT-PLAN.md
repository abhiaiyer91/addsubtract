# wit AI Enhancement Plan: Doubling Down with Mastra

## Executive Summary

We're going all-in on AI. This document outlines our plan to leverage Mastra's full capabilities to make wit the most intelligent code collaboration platform.

**Current State:**
- 1 main agent with 28 tools
- 3 specialized agents (code, PM, triage)
- 3 workflows (PR review, issue triage, code generation)
- Basic memory and storage
- Semantic search with embeddings

**Target State:**
- Multi-agent orchestration with specialized AI personas
- RAG-powered knowledge base that truly understands your codebase
- Intelligent syncs from external tools (GitHub, Linear, Slack)
- Evals for quality assurance and improvement
- Human-in-the-loop for critical decisions
- Real-time streaming for all AI interactions

---

## Phase 1: Knowledge & RAG (Week 1-2)

### 1.1 Codebase Knowledge Base

The current semantic search is file-based. We'll upgrade to a true knowledge base that understands:

- **Architecture patterns** - How the codebase is structured
- **Conventions** - Coding style, naming, patterns used
- **Dependencies** - What libraries are used and how
- **History** - Why decisions were made (from commits, PRs, issues)
- **Domain knowledge** - Business logic and terminology

**Implementation:**

```typescript
// src/ai/knowledge/codebase-knowledge.ts
import { MastraRAG } from '@mastra/rag';
import { PostgresVector } from '@mastra/pg';

export const createCodebaseKnowledge = (repoId: string) => {
  return new MastraRAG({
    vectorStore: new PostgresVector({
      connectionString: process.env.DATABASE_URL,
      tableName: `knowledge_${repoId}`,
    }),
    chunker: {
      strategy: 'semantic',
      maxChunkSize: 1000,
      overlap: 100,
    },
    embedder: {
      model: 'text-embedding-3-large',
      dimensions: 3072,
    },
  });
};
```

**Knowledge Sources:**
1. **Code** - Functions, classes, modules with semantic chunking
2. **Documentation** - README, docs, inline comments
3. **Git History** - Commit messages, PR descriptions, reviews
4. **Issues** - Bug reports, feature requests, discussions
5. **Architecture** - Inferred from imports, file structure

### 1.2 Smart Context Builder

Before any AI interaction, we build rich context:

```typescript
// src/ai/context/context-builder.ts
export async function buildContext(query: string, repoId: string): Promise<AIContext> {
  const knowledge = getCodebaseKnowledge(repoId);
  
  // Parallel retrieval
  const [
    relevantCode,
    relevantDocs,
    relevantHistory,
    relevantIssues,
  ] = await Promise.all([
    knowledge.query(query, { type: 'code', limit: 5 }),
    knowledge.query(query, { type: 'documentation', limit: 3 }),
    knowledge.query(query, { type: 'git-history', limit: 5 }),
    knowledge.query(query, { type: 'issues', limit: 3 }),
  ]);

  return {
    query,
    relevantCode,
    relevantDocs,
    relevantHistory,
    relevantIssues,
    repoStructure: await getRepoStructure(repoId),
    conventions: await getConventions(repoId),
  };
}
```

### 1.3 Incremental Indexing

Keep the knowledge base fresh with real-time updates:

```typescript
// src/ai/knowledge/incremental-indexer.ts
export class IncrementalIndexer {
  async onCommit(commit: Commit) {
    // Index new/modified files
    for (const file of commit.changedFiles) {
      await this.indexFile(file.path, file.content);
    }
    
    // Index commit message as history
    await this.indexCommitMessage(commit);
  }

  async onPRMerge(pr: PullRequest) {
    // Index PR description and review comments
    await this.indexPRKnowledge(pr);
  }

  async onIssueClosed(issue: Issue) {
    // Index resolution for future reference
    await this.indexIssueResolution(issue);
  }
}
```

---

## Phase 2: Multi-Agent Orchestration (Week 2-3)

### 2.1 Agent Network Architecture

Instead of one monolithic agent, we'll have specialized agents that collaborate:

```
                    ┌─────────────────┐
                    │   Orchestrator  │
                    │     Agent       │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
    │  Code   │        │   PM    │        │ Review  │
    │  Agent  │        │  Agent  │        │  Agent  │
    └────┬────┘        └────┬────┘        └────┬────┘
         │                   │                   │
    ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
    │ Search  │        │ Triage  │        │Security │
    │  Agent  │        │  Agent  │        │  Agent  │
    └─────────┘        └─────────┘        └─────────┘
```

### 2.2 Orchestrator Agent

The orchestrator delegates to specialized agents:

```typescript
// src/ai/agents/orchestrator.ts
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';

export const ORCHESTRATOR_INSTRUCTIONS = `You are the wit AI Orchestrator. Your job is to understand user requests and delegate to specialized agents.

## Available Agents

1. **Code Agent** - Writing, editing, and understanding code
   - Use for: implementing features, fixing bugs, refactoring
   
2. **PM Agent** - Project management
   - Use for: creating issues, managing PRs, project planning
   
3. **Review Agent** - Code review and quality
   - Use for: reviewing PRs, suggesting improvements, security audits
   
4. **Search Agent** - Finding and understanding code
   - Use for: answering questions about the codebase, finding examples
   
5. **Triage Agent** - Issue categorization
   - Use for: labeling, prioritizing, assigning new issues

## Workflow

1. Understand the user's intent
2. Break complex tasks into subtasks
3. Delegate to appropriate agents
4. Synthesize results
5. Present unified response

For complex tasks, you may need to chain multiple agents.
Example: "Implement feature X" might require:
1. Search Agent to understand existing patterns
2. Code Agent to write the implementation
3. Review Agent to check quality
4. PM Agent to create a PR`;

function createDelegateToAgentTool(agentType: string, agent: Agent) {
  return createTool({
    id: `delegate-to-${agentType}`,
    description: `Delegate a task to the ${agentType} agent`,
    inputSchema: z.object({
      task: z.string().describe('The task to delegate'),
      context: z.string().optional().describe('Additional context'),
    }),
    outputSchema: z.object({
      result: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ task, context }) => {
      const response = await agent.generate(
        context ? `${task}\n\nContext: ${context}` : task
      );
      return { result: response.text, success: true };
    },
  });
}

export function createOrchestratorAgent(context: AgentContext) {
  const codeAgent = createCodeAgent(context);
  const pmAgent = createPMAgent(context);
  const reviewAgent = createReviewAgent(context);
  const searchAgent = createSearchAgent(context);
  
  return new Agent({
    id: 'wit-orchestrator',
    name: 'wit Orchestrator',
    instructions: ORCHESTRATOR_INSTRUCTIONS,
    model: 'anthropic/claude-opus-4-5',
    tools: {
      delegateToCode: createDelegateToAgentTool('code', codeAgent),
      delegateToPM: createDelegateToAgentTool('pm', pmAgent),
      delegateToReview: createDelegateToAgentTool('review', reviewAgent),
      delegateToSearch: createDelegateToAgentTool('search', searchAgent),
    },
  });
}
```

### 2.3 New Specialized Agents

**Review Agent** - Dedicated to code quality:

```typescript
// src/ai/agents/review-agent.ts
export const REVIEW_AGENT_INSTRUCTIONS = `You are wit AI's Code Review specialist. You provide thorough, constructive code reviews.

## Your Review Process

1. **Understand Intent**: What is this code trying to accomplish?
2. **Check Correctness**: Does it work correctly? Are there edge cases?
3. **Security Scan**: Are there security vulnerabilities?
4. **Performance Review**: Are there performance concerns?
5. **Maintainability**: Is the code clear and maintainable?
6. **Style**: Does it follow project conventions?

## Review Style

- Be specific with line numbers and code references
- Explain WHY something is an issue
- Provide concrete suggestions, not just criticism
- Acknowledge good patterns when you see them
- Prioritize: Critical > Important > Suggestion > Nitpick`;
```

**Search Agent** - Dedicated to understanding code:

```typescript
// src/ai/agents/search-agent.ts
export const SEARCH_AGENT_INSTRUCTIONS = `You are wit AI's Code Search specialist. You help users find and understand code.

## Your Capabilities

1. **Semantic Search**: Find code by meaning, not just keywords
2. **Pattern Recognition**: Find similar code patterns
3. **Dependency Analysis**: Understand what uses what
4. **History Search**: Find when/why something was changed

## Search Strategy

1. First, understand what the user is really looking for
2. Use semantic search for concept-level queries
3. Use grep/text search for specific strings
4. Combine results to give comprehensive answers
5. Provide context, not just code snippets`;
```

### 2.4 Agent Communication Protocol

Agents can request help from other agents:

```typescript
// src/ai/agents/agent-network.ts
export class AgentNetwork {
  private agents: Map<string, Agent> = new Map();
  private messageQueue: AgentMessage[] = [];

  async process(request: UserRequest): Promise<AgentResponse> {
    // Start with orchestrator
    const orchestrator = this.agents.get('orchestrator');
    
    // Enable agent-to-agent communication
    const networkTools = {
      requestHelp: createTool({
        id: 'request-help',
        description: 'Request help from another agent',
        inputSchema: z.object({
          agentId: z.enum(['code', 'pm', 'review', 'search', 'triage']),
          request: z.string(),
        }),
        execute: async ({ agentId, request }) => {
          const agent = this.agents.get(agentId);
          return agent.generate(request);
        },
      }),
    };
    
    return orchestrator.generate(request.message, { tools: networkTools });
  }
}
```

---

## Phase 3: Advanced Workflows (Week 3-4)

### 3.1 Streaming Workflows

All workflows should stream progress:

```typescript
// src/ai/workflows/streaming-pr-review.workflow.ts
export const streamingPRReviewWorkflow = createWorkflow({
  id: 'streaming-pr-review',
  inputSchema: PRReviewInputSchema,
  outputSchema: PRReviewOutputSchema,
})
  .then(parseDiffStep)
  .then(categorizeFilesStep)
  // Stream progress to the client
  .parallel([
    securityAnalysisStep.withStreaming(),
    codeQualityStep.withStreaming(),
    performanceAnalysisStep.withStreaming(),
  ])
  .then(aggregateResultsStep)
  .commit();

// Usage in API
router.post('/review-pr', async (c) => {
  const input = await c.req.json();
  const workflow = getTsgitMastra().getWorkflow('streamingPRReview');
  const run = await workflow.createRun();
  
  // Stream to client
  return streamSSE(c, async (stream) => {
    for await (const event of run.stream({ inputData: input })) {
      await stream.write({
        event: event.type,
        data: JSON.stringify(event.data),
      });
    }
  });
});
```

### 3.2 Human-in-the-Loop Workflows

For critical decisions, pause and ask the user:

```typescript
// src/ai/workflows/assisted-merge.workflow.ts
export const assistedMergeWorkflow = createWorkflow({
  id: 'assisted-merge',
  inputSchema: MergeInputSchema,
  outputSchema: MergeOutputSchema,
})
  .then(analyzePRStep)
  .then(runTestsStep)
  .then(securityScanStep)
  // Pause for human approval if there are concerns
  .then(createStep({
    id: 'approval-gate',
    execute: async ({ inputData, suspend }) => {
      if (inputData.securityConcerns.length > 0 || inputData.testFailures.length > 0) {
        // Suspend workflow and wait for human
        const decision = await suspend({
          reason: 'Manual approval required',
          concerns: inputData.securityConcerns,
          failures: inputData.testFailures,
        });
        
        if (!decision.approved) {
          throw new Error('Merge rejected by reviewer');
        }
      }
      return inputData;
    },
  }))
  .then(performMergeStep)
  .commit();
```

### 3.3 New Workflows

**Feature Implementation Workflow:**

```typescript
// src/ai/workflows/implement-feature.workflow.ts
export const implementFeatureWorkflow = createWorkflow({
  id: 'implement-feature',
  inputSchema: z.object({
    description: z.string(),
    repoId: z.string(),
    issueNumber: z.number().optional(),
  }),
  outputSchema: z.object({
    branchName: z.string(),
    files: z.array(z.object({
      path: z.string(),
      action: z.enum(['create', 'modify', 'delete']),
    })),
    prNumber: z.number().optional(),
  }),
})
  // Step 1: Understand the codebase
  .then(analyzeCodebaseStep)
  // Step 2: Plan the implementation
  .then(planImplementationStep)
  // Step 3: Human review of plan (optional)
  .then(reviewPlanStep)
  // Step 4: Write the code
  .then(writeCodeStep)
  // Step 5: Run tests
  .then(runTestsStep)
  // Step 6: Create PR
  .then(createPRStep)
  .commit();
```

**Bug Investigation Workflow:**

```typescript
// src/ai/workflows/investigate-bug.workflow.ts
export const investigateBugWorkflow = createWorkflow({
  id: 'investigate-bug',
  inputSchema: z.object({
    description: z.string(),
    repoId: z.string(),
    errorMessage: z.string().optional(),
    stackTrace: z.string().optional(),
  }),
  outputSchema: z.object({
    rootCause: z.string(),
    affectedFiles: z.array(z.string()),
    suggestedFix: z.string(),
    confidence: z.number(),
  }),
})
  .then(parseErrorStep)
  .then(searchRelatedCodeStep)
  .then(analyzeGitHistoryStep)
  .then(findSimilarIssuesStep)
  .then(synthesizeFindingsStep)
  .commit();
```

---

## Phase 4: External Syncs (Week 4-5)

### 4.1 GitHub Sync

Keep wit in sync with GitHub:

```typescript
// src/ai/syncs/github-sync.ts
import { MastraSync } from '@mastra/core/syncs';

export const githubSync = new MastraSync({
  id: 'github',
  schedule: '*/5 * * * *', // Every 5 minutes
  
  async sync(context) {
    const { repoId, githubToken } = context;
    
    // Sync issues
    const issues = await github.listIssues(repoId);
    for (const issue of issues) {
      await this.upsertIssue(issue);
      await this.indexForKnowledge(issue);
    }
    
    // Sync PRs
    const prs = await github.listPRs(repoId);
    for (const pr of prs) {
      await this.upsertPR(pr);
      await this.indexPRForKnowledge(pr);
    }
    
    // Sync discussions
    const discussions = await github.listDiscussions(repoId);
    for (const discussion of discussions) {
      await this.indexForKnowledge(discussion);
    }
  },
});
```

### 4.2 Linear Sync

Import from Linear for project management:

```typescript
// src/ai/syncs/linear-sync.ts
export const linearSync = new MastraSync({
  id: 'linear',
  schedule: '*/10 * * * *',
  
  async sync(context) {
    const { teamId, linearApiKey } = context;
    
    // Sync issues from Linear
    const issues = await linear.listIssues(teamId);
    for (const issue of issues) {
      // Create corresponding wit issue
      await this.createOrUpdateIssue({
        externalId: `linear:${issue.id}`,
        title: issue.title,
        body: issue.description,
        priority: mapLinearPriority(issue.priority),
        labels: issue.labels.map(l => l.name),
      });
    }
    
    // Sync cycles
    const cycles = await linear.listCycles(teamId);
    for (const cycle of cycles) {
      await this.createOrUpdateCycle(cycle);
    }
  },
});
```

### 4.3 Slack Sync

Capture knowledge from Slack:

```typescript
// src/ai/syncs/slack-sync.ts
export const slackSync = new MastraSync({
  id: 'slack',
  schedule: '0 * * * *', // Every hour
  
  async sync(context) {
    const { channelIds, slackToken } = context;
    
    for (const channelId of channelIds) {
      const messages = await slack.getMessages(channelId, {
        since: this.lastSyncTime,
      });
      
      // Filter for development-related discussions
      const devMessages = messages.filter(m => 
        this.isDevRelated(m.text)
      );
      
      // Index for knowledge base
      for (const message of devMessages) {
        await this.indexForKnowledge({
          type: 'slack-discussion',
          content: message.text,
          timestamp: message.ts,
          channel: channelId,
          participants: message.replies?.map(r => r.user),
        });
      }
    }
  },
});
```

---

## Phase 5: Evals & Quality (Week 5-6)

### 5.1 AI Evaluation Framework

Automatically evaluate AI outputs:

```typescript
// src/ai/evals/eval-framework.ts
import { createEval, EvalResult } from '@mastra/evals';

export const commitMessageEval = createEval({
  id: 'commit-message-quality',
  description: 'Evaluate quality of AI-generated commit messages',
  
  async run(input: { diff: string; generatedMessage: string }): Promise<EvalResult> {
    const criteria = [
      this.checkConventionalFormat(input.generatedMessage),
      this.checkDescriptiveness(input.diff, input.generatedMessage),
      this.checkLength(input.generatedMessage),
      this.checkAccuracy(input.diff, input.generatedMessage),
    ];
    
    return {
      score: criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length,
      details: criteria,
    };
  },
  
  async checkDescriptiveness(diff: string, message: string) {
    // Use AI to check if message describes the changes
    const judge = getTsgitAgent();
    const result = await judge.generate(`
      Evaluate if this commit message accurately describes the changes.
      
      Diff:
      ${diff.slice(0, 2000)}
      
      Message:
      ${message}
      
      Score 1-10 and explain.
    `);
    
    return parseJudgment(result.text);
  },
});
```

### 5.2 Eval Suites

Run evals automatically:

```typescript
// src/ai/evals/suites.ts
export const evalSuites = {
  commitMessages: [
    commitMessageEval,
    conventionalCommitEval,
    messageLengthEval,
  ],
  
  codeReview: [
    reviewCompletenessEval,
    securityCoverageEval,
    suggestionQualityEval,
  ],
  
  issueTriagest: [
    labelAccuracyEval,
    priorityAccuracyEval,
    assigneeRelevanceEval,
  ],
};

// Run evals on a sample of recent AI outputs
export async function runDailyEvals() {
  const results = {};
  
  for (const [suiteName, evals] of Object.entries(evalSuites)) {
    const samples = await getSampleOutputs(suiteName, 20);
    results[suiteName] = await runEvalSuite(evals, samples);
  }
  
  // Log and alert on quality drops
  await reportEvalResults(results);
}
```

### 5.3 Continuous Improvement

Use eval results to improve:

```typescript
// src/ai/evals/improvement-loop.ts
export async function improveFromEvals() {
  const recentEvals = await getRecentEvalResults();
  
  // Find patterns in failures
  const failurePatterns = analyzeFailures(recentEvals);
  
  // Update prompts based on patterns
  for (const pattern of failurePatterns) {
    if (pattern.type === 'commit-message-vague') {
      // Add example to system prompt
      await updateSystemPrompt('commit-message', {
        addExample: pattern.failedExample,
        addInstruction: 'Be specific about what changed and why',
      });
    }
  }
}
```

---

## Phase 6: Advanced Features (Week 6+)

### 6.1 Chat with Codebase

Natural conversation about code:

```typescript
// src/ai/chat/codebase-chat.ts
export class CodebaseChat {
  private agent: Agent;
  private memory: Memory;
  private knowledge: MastraRAG;

  async chat(message: string, sessionId: string): Promise<string> {
    // Get conversation history
    const history = await this.memory.getHistory(sessionId);
    
    // Build context from knowledge base
    const context = await buildContext(message, this.repoId);
    
    // Generate response with full context
    const response = await this.agent.generate(message, {
      history,
      context,
      tools: {
        searchCode: this.searchCodeTool,
        readFile: this.readFileTool,
        explainCode: this.explainCodeTool,
        findUsages: this.findUsagesTool,
      },
    });
    
    // Save to memory
    await this.memory.save(sessionId, { role: 'user', content: message });
    await this.memory.save(sessionId, { role: 'assistant', content: response.text });
    
    return response.text;
  }
}
```

### 6.2 Proactive AI

AI that notices things without being asked:

```typescript
// src/ai/proactive/monitors.ts
export const proactiveMonitors = {
  // Monitor for code smells in new commits
  async onCommit(commit: Commit) {
    const analysis = await analyzeCommit(commit);
    
    if (analysis.potentialIssues.length > 0) {
      await createSuggestionComment(commit, analysis);
    }
  },
  
  // Monitor for stale PRs
  async onPRStale(pr: PullRequest) {
    const summary = await generatePRStatusSummary(pr);
    await addPRComment(pr, `
      This PR has been open for ${pr.daysOpen} days.
      
      **Status Summary:**
      ${summary}
      
      **Suggested Actions:**
      ${await suggestNextSteps(pr)}
    `);
  },
  
  // Monitor for blocking issues
  async onSprintBlocked(sprint: Sprint) {
    const blockers = await identifyBlockers(sprint);
    await notifyTeam(blockers);
  },
};
```

### 6.3 Code Generation with Tests

Generate code with matching tests:

```typescript
// src/ai/generation/with-tests.ts
export async function generateWithTests(spec: FeatureSpec): Promise<GeneratedCode> {
  const codeAgent = createCodeAgent(spec.context);
  
  // Step 1: Generate the implementation
  const implementation = await codeAgent.generate(`
    Implement the following feature:
    ${spec.description}
    
    Follow the patterns in this codebase.
    Return only the code, no explanation.
  `);
  
  // Step 2: Generate tests for the implementation
  const tests = await codeAgent.generate(`
    Write comprehensive tests for this code:
    ${implementation}
    
    Include:
    - Unit tests for each function
    - Edge cases
    - Error handling tests
    
    Use the testing framework already in this project.
  `);
  
  // Step 3: Verify tests pass
  const testResults = await runTests(tests);
  
  if (!testResults.allPassed) {
    // Iterate until tests pass
    return await fixAndRetry(implementation, tests, testResults);
  }
  
  return { implementation, tests };
}
```

---

## Implementation Priority

### Week 1-2: Knowledge Foundation
1. ✅ Implement RAG-powered knowledge base
2. ✅ Create incremental indexer
3. ✅ Build smart context builder
4. ✅ Index existing codebases

### Week 3-4: Multi-Agent
1. ✅ Create orchestrator agent
2. ✅ Implement review agent
3. ✅ Implement search agent
4. ✅ Build agent network

### Week 5-6: Workflows & Quality
1. ✅ Add streaming to all workflows
2. ✅ Implement human-in-the-loop
3. ✅ Create eval framework
4. ✅ Build improvement loop

### Week 7+: Advanced
1. ✅ External syncs (GitHub, Linear)
2. ✅ Proactive AI monitors
3. ✅ Chat with codebase
4. ✅ Code generation with tests

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Commit message accuracy | ~70% | 95% |
| PR review coverage | Basic | Comprehensive |
| Search relevance | 60% | 90% |
| Issue triage accuracy | 75% | 95% |
| User satisfaction | N/A | 4.5/5 |
| AI response time | 3-5s | <2s streaming |

---

## Technical Requirements

### Dependencies to Add

```json
{
  "@mastra/rag": "^0.1.0",
  "@mastra/evals": "^0.1.0",
  "@mastra/syncs": "^0.1.0",
  "pgvector": "^0.1.8"
}
```

### Database Changes

```sql
-- Vector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge vectors table
CREATE TABLE knowledge_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES repositories(id),
  content TEXT NOT NULL,
  embedding vector(3072),
  metadata JSONB,
  source_type VARCHAR(50),
  source_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Eval results table
CREATE TABLE eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_type VARCHAR(100) NOT NULL,
  input JSONB NOT NULL,
  output JSONB NOT NULL,
  score DECIMAL(3,2),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent sessions for memory
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  repo_id UUID REFERENCES repositories(id),
  messages JSONB[] DEFAULT '{}',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

*This plan represents our commitment to making wit the most intelligent code collaboration platform. We're not adding AI as a feature—we're building AI as the foundation.*
