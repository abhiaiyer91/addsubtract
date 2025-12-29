/**
 * Issue Triage Workflow
 * 
 * A multi-step workflow that automatically analyzes and categorizes new issues.
 * The workflow:
 * 
 * 1. Extracts issue metadata (type, severity indicators, keywords)
 * 2. Searches codebase for related files and context
 * 3. Finds similar past issues for reference
 * 4. Uses AI to determine labels, priority, and assignee
 * 5. Applies triage decisions and creates a summary comment
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const IssueTriageInputSchema = z.object({
  issueId: z.string().describe('Issue ID'),
  issueNumber: z.number().describe('Issue number'),
  repoId: z.string().describe('Repository ID'),
  repoPath: z.string().describe('Path to repository on disk'),
  title: z.string().describe('Issue title'),
  body: z.string().optional().describe('Issue body/description'),
  authorId: z.string().describe('Issue author user ID'),
  authorUsername: z.string().describe('Issue author username'),
  // Configuration options
  autoAssignLabels: z.boolean().default(true),
  autoAssignUser: z.boolean().default(false),
  autoSetPriority: z.boolean().default(true),
  addTriageComment: z.boolean().default(true),
  customPrompt: z.string().optional().describe('Custom triage instructions'),
});

export type IssueTriageInput = z.infer<typeof IssueTriageInputSchema>;

export const IssueTriageOutputSchema = z.object({
  success: z.boolean(),
  issueType: z.enum(['bug', 'feature', 'documentation', 'question', 'enhancement', 'chore', 'other']),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
  suggestedLabels: z.array(z.string()),
  appliedLabels: z.array(z.string()).optional(),
  suggestedAssignee: z.object({
    userId: z.string(),
    username: z.string(),
    reason: z.string(),
  }).optional(),
  assignedTo: z.string().optional(),
  relatedFiles: z.array(z.string()),
  similarIssues: z.array(z.object({
    number: z.number(),
    title: z.string(),
    state: z.string(),
    similarity: z.number(),
  })),
  reasoning: z.string(),
  triageCommentId: z.string().optional(),
  error: z.string().optional(),
});

export type IssueTriageOutput = z.infer<typeof IssueTriageOutputSchema>;

// =============================================================================
// Step 1: Extract Issue Metadata
// =============================================================================

const extractMetadataStep = createStep({
  id: 'extract-metadata',
  inputSchema: IssueTriageInputSchema,
  outputSchema: z.object({
    // Pass through input data
    issueId: z.string(),
    issueNumber: z.number(),
    repoId: z.string(),
    repoPath: z.string(),
    title: z.string(),
    body: z.string().optional(),
    authorId: z.string(),
    authorUsername: z.string(),
    autoAssignLabels: z.boolean(),
    autoAssignUser: z.boolean(),
    autoSetPriority: z.boolean(),
    addTriageComment: z.boolean(),
    customPrompt: z.string().optional(),
    // Extracted metadata
    detectedType: z.enum(['bug', 'feature', 'documentation', 'question', 'enhancement', 'chore', 'other']),
    urgencyIndicators: z.array(z.string()),
    keywords: z.array(z.string()),
    mentionedFiles: z.array(z.string()),
    hasStackTrace: z.boolean(),
    hasCodeBlock: z.boolean(),
    hasReproSteps: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const text = `${inputData.title}\n${inputData.body || ''}`.toLowerCase();
    
    // Detect issue type
    let detectedType: 'bug' | 'feature' | 'documentation' | 'question' | 'enhancement' | 'chore' | 'other' = 'other';
    
    if (/\b(bug|error|crash|broken|fail|fix|issue|problem|doesn't work|not working)\b/.test(text)) {
      detectedType = 'bug';
    } else if (/\b(feature|add|implement|new|request|would be nice|should have)\b/.test(text)) {
      detectedType = 'feature';
    } else if (/\b(doc|documentation|readme|example|tutorial|guide)\b/.test(text)) {
      detectedType = 'documentation';
    } else if (/\b(question|how to|how do|what is|why does|help|confused)\b/.test(text) || text.includes('?')) {
      detectedType = 'question';
    } else if (/\b(enhance|improve|better|optimize|refactor|update)\b/.test(text)) {
      detectedType = 'enhancement';
    } else if (/\b(chore|maintenance|cleanup|dependency|deps|bump|upgrade)\b/.test(text)) {
      detectedType = 'chore';
    }
    
    // Detect urgency indicators
    const urgencyIndicators: string[] = [];
    if (/\b(urgent|critical|asap|immediately|production|outage|down|security|vulnerability)\b/.test(text)) {
      if (/\burgent\b/.test(text)) urgencyIndicators.push('urgent');
      if (/\bcritical\b/.test(text)) urgencyIndicators.push('critical');
      if (/\bproduction\b/.test(text)) urgencyIndicators.push('production');
      if (/\boutage\b/.test(text)) urgencyIndicators.push('outage');
      if (/\bsecurity\b/.test(text)) urgencyIndicators.push('security');
      if (/\bvulnerability\b/.test(text)) urgencyIndicators.push('vulnerability');
    }
    
    // Extract keywords
    const keywords = new Set<string>();
    const keywordPatterns = [
      /\b(api|database|auth|ui|frontend|backend|server|client|cli|test|performance|memory|cache)\b/gi,
    ];
    for (const pattern of keywordPatterns) {
      const matches = text.match(pattern) || [];
      matches.forEach(m => keywords.add(m.toLowerCase()));
    }
    
    // Extract mentioned files
    const mentionedFiles: string[] = [];
    const filePatterns = [
      /`([^`]+\.[a-z]{2,4})`/g,  // Backtick-wrapped files
      /(?:in|at|file|from)\s+[`"]?([a-zA-Z0-9_/.-]+\.[a-z]{2,4})[`"]?/gi,  // "in file.ts" patterns
    ];
    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(inputData.body || '')) !== null) {
        mentionedFiles.push(match[1]);
      }
    }
    
    // Check for stack trace
    const hasStackTrace = /at\s+\w+\s+\([^)]+:\d+:\d+\)/.test(inputData.body || '') ||
                          /Error:.*\n\s+at/.test(inputData.body || '') ||
                          /Traceback/.test(inputData.body || '');
    
    // Check for code block
    const hasCodeBlock = /```[\s\S]*?```/.test(inputData.body || '');
    
    // Check for reproduction steps
    const hasReproSteps = /\b(steps to reproduce|reproduction|repro|how to reproduce)\b/i.test(inputData.body || '') ||
                          /\b(1\.|step 1|first,)\b/i.test(inputData.body || '');
    
    return {
      ...inputData,
      detectedType,
      urgencyIndicators,
      keywords: Array.from(keywords),
      mentionedFiles: [...new Set(mentionedFiles)],
      hasStackTrace,
      hasCodeBlock,
      hasReproSteps,
    };
  },
});

// =============================================================================
// Step 2: Search Codebase for Related Files
// =============================================================================

const searchCodebaseStep = createStep({
  id: 'search-codebase',
  inputSchema: z.object({
    issueId: z.string(),
    repoId: z.string(),
    repoPath: z.string(),
    title: z.string(),
    body: z.string().optional(),
    keywords: z.array(z.string()),
    mentionedFiles: z.array(z.string()),
  }),
  outputSchema: z.object({
    relatedFiles: z.array(z.object({
      path: z.string(),
      relevance: z.enum(['high', 'medium', 'low']),
      reason: z.string(),
    })),
  }),
  execute: async ({ inputData }) => {
    const { findFilesInRepo, searchInRepo, readRepoFile } = await import('./utils.js');
    const { exists } = await import('../../utils/fs.js');
    const path = await import('path');
    
    const relatedFiles: Array<{ path: string; relevance: 'high' | 'medium' | 'low'; reason: string }> = [];
    
    // Check if repo path exists and is accessible
    if (!inputData.repoPath || !exists(inputData.repoPath)) {
      console.log(`[Issue Triage] Repo path not accessible: ${inputData.repoPath}, skipping codebase search`);
      return { relatedFiles };
    }
    
    // Get all files in the repo
    let allFiles: string[] = [];
    try {
      allFiles = await findFilesInRepo(inputData.repoPath);
    } catch (error) {
      console.log(`[Issue Triage] Could not list repo files: ${error}, skipping codebase search`);
      return { relatedFiles };
    }
    
    // Add mentioned files with high relevance
    for (const file of inputData.mentionedFiles) {
      const fullPath = path.join(inputData.repoPath, file);
      
      if (exists(fullPath)) {
        relatedFiles.push({
          path: file,
          relevance: 'high',
          reason: 'Mentioned in issue',
        });
      } else {
        // Try partial match on filename
        const filename = file.split('/').pop() || '';
        const matches = allFiles
          .filter(f => f.includes(filename))
          .slice(0, 3);
        
        for (const match of matches) {
          relatedFiles.push({
            path: match,
            relevance: 'medium',
            reason: `Similar to mentioned file: ${file}`,
          });
        }
      }
    }
    
    // Search for keyword matches in file names
    for (const keyword of inputData.keywords.slice(0, 5)) {
      const matches = allFiles
        .filter(f => f.toLowerCase().includes(keyword.toLowerCase()))
        .slice(0, 5);
      
      for (const match of matches) {
        if (!relatedFiles.some(f => f.path === match)) {
          relatedFiles.push({
            path: match,
            relevance: 'low',
            reason: `Contains keyword: ${keyword}`,
          });
        }
      }
    }
    
    // Search for keyword matches in file content (limited)
    for (const keyword of inputData.keywords.slice(0, 3)) {
      try {
        const searchResults = (await searchInRepo(
          inputData.repoPath,
          new RegExp(keyword, 'i'),
          /\.(ts|tsx|js|jsx)$/
        )).slice(0, 3);
        
        for (const result of searchResults) {
          if (!relatedFiles.some(f => f.path === result.path)) {
            relatedFiles.push({
              path: result.path,
              relevance: 'low',
              reason: `Contains keyword: ${keyword}`,
            });
          }
        }
      } catch {
        // No matches or error
      }
    }
    
    return {
      relatedFiles: relatedFiles.slice(0, 10),
    };
  },
});

// =============================================================================
// Step 3: Find Similar Issues
// =============================================================================

const findSimilarIssuesStep = createStep({
  id: 'find-similar-issues',
  inputSchema: z.object({
    issueId: z.string(),
    issueNumber: z.number(),
    repoId: z.string(),
    title: z.string(),
    detectedType: z.enum(['bug', 'feature', 'documentation', 'question', 'enhancement', 'chore', 'other']),
    keywords: z.array(z.string()),
  }),
  outputSchema: z.object({
    similarIssues: z.array(z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      state: z.string(),
      similarity: z.number(),
      labels: z.array(z.string()),
    })),
  }),
  execute: async ({ inputData }) => {
    const similarIssues: Array<{
      id: string;
      number: number;
      title: string;
      state: string;
      similarity: number;
      labels: string[];
    }> = [];
    
    try {
      const { issueModel, issueLabelModel, labelModel } = await import('../../db/models/index.js');
      
      // Get recent issues from the same repo (get both open and closed)
      const [openIssues, closedIssues] = await Promise.all([
        issueModel.listByRepo(inputData.repoId, { limit: 25, state: 'open' }),
        issueModel.listByRepo(inputData.repoId, { limit: 25, state: 'closed' }),
      ]);
      const recentIssues = [...openIssues, ...closedIssues];
      
      // Calculate similarity based on title words and keywords
      const titleWords = new Set(inputData.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      
      for (const issue of recentIssues) {
        // Skip the current issue
        if (issue.id === inputData.issueId) continue;
        
        const issueWords = new Set(issue.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        
        // Calculate Jaccard similarity
        const intersection = new Set([...titleWords].filter(w => issueWords.has(w)));
        const union = new Set([...titleWords, ...issueWords]);
        const similarity = union.size > 0 ? intersection.size / union.size : 0;
        
        // Check keyword overlap
        let keywordBonus = 0;
        for (const keyword of inputData.keywords) {
          if (issue.title.toLowerCase().includes(keyword) || 
              (issue.body && issue.body.toLowerCase().includes(keyword))) {
            keywordBonus += 0.1;
          }
        }
        
        const totalSimilarity = Math.min(1, similarity + keywordBonus);
        
        if (totalSimilarity > 0.2) {
          // Get labels for this issue (listByIssue returns Label[] directly)
          const issueLabelsResult = await issueLabelModel.listByIssue(issue.id);
          const labelNames = issueLabelsResult.map(label => label.name);
          
          similarIssues.push({
            id: issue.id,
            number: issue.number,
            title: issue.title,
            state: issue.state,
            similarity: Math.round(totalSimilarity * 100) / 100,
            labels: labelNames.filter(Boolean),
          });
        }
      }
      
      // Sort by similarity and take top 5
      similarIssues.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error('[Issue Triage] Failed to find similar issues:', error);
    }
    
    return {
      similarIssues: similarIssues.slice(0, 5),
    };
  },
});

// =============================================================================
// Step 4: AI Analysis (Determine Labels, Priority, Assignee)
// =============================================================================

const aiAnalysisStep = createStep({
  id: 'ai-analysis',
  inputSchema: z.object({
    issueId: z.string(),
    issueNumber: z.number(),
    repoId: z.string(),
    title: z.string(),
    body: z.string().optional(),
    authorUsername: z.string(),
    detectedType: z.enum(['bug', 'feature', 'documentation', 'question', 'enhancement', 'chore', 'other']),
    urgencyIndicators: z.array(z.string()),
    keywords: z.array(z.string()),
    hasStackTrace: z.boolean(),
    hasCodeBlock: z.boolean(),
    hasReproSteps: z.boolean(),
    relatedFiles: z.array(z.object({
      path: z.string(),
      relevance: z.enum(['high', 'medium', 'low']),
      reason: z.string(),
    })),
    similarIssues: z.array(z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      state: z.string(),
      similarity: z.number(),
      labels: z.array(z.string()),
    })),
    autoAssignUser: z.boolean(),
    customPrompt: z.string().optional(),
  }),
  outputSchema: z.object({
    issueType: z.enum(['bug', 'feature', 'documentation', 'question', 'enhancement', 'chore', 'other']),
    priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
    suggestedLabels: z.array(z.string()),
    suggestedAssignee: z.object({
      userId: z.string(),
      username: z.string(),
      reason: z.string(),
    }).optional(),
    reasoning: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    // Start with rule-based analysis
    const issueType = inputData.detectedType;
    let priority: 'none' | 'low' | 'medium' | 'high' | 'urgent' = 'medium';
    const suggestedLabels: string[] = [];
    let reasoning = '';
    
    // Determine priority based on indicators
    if (inputData.urgencyIndicators.includes('security') || 
        inputData.urgencyIndicators.includes('vulnerability')) {
      priority = 'urgent';
      suggestedLabels.push('security');
      reasoning += 'Marked urgent due to security concerns. ';
    } else if (inputData.urgencyIndicators.includes('production') || 
               inputData.urgencyIndicators.includes('outage')) {
      priority = 'urgent';
      reasoning += 'Marked urgent due to production impact. ';
    } else if (inputData.urgencyIndicators.includes('critical') || 
               inputData.urgencyIndicators.includes('urgent')) {
      priority = 'high';
      reasoning += 'Marked high priority based on urgency keywords. ';
    } else if (issueType === 'bug' && inputData.hasStackTrace) {
      priority = 'high';
      reasoning += 'Bug with stack trace, prioritized for investigation. ';
    } else if (issueType === 'question') {
      priority = 'low';
      reasoning += 'Question type issue, lower priority. ';
    }
    
    // Add type-based labels
    suggestedLabels.push(issueType);
    
    // Add labels based on similar issues
    const labelCounts = new Map<string, number>();
    for (const similar of inputData.similarIssues) {
      for (const label of similar.labels) {
        labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
      }
    }
    
    // Add labels that appear in multiple similar issues
    for (const [label, count] of labelCounts) {
      if (count >= 2 && !suggestedLabels.includes(label)) {
        suggestedLabels.push(label);
        reasoning += `Label "${label}" suggested based on similar issues. `;
      }
    }
    
    // Add quality indicators
    if (inputData.hasReproSteps && inputData.hasStackTrace) {
      suggestedLabels.push('good-first-issue');
      reasoning += 'Well-documented issue with reproduction steps. ';
    }
    
    if (!inputData.body || inputData.body.length < 50) {
      suggestedLabels.push('needs-info');
      reasoning += 'Issue description is minimal, may need more information. ';
    }
    
    // Try AI-powered analysis if available
    let suggestedAssignee: { userId: string; username: string; reason: string } | undefined;
    
    if (mastra && inputData.autoAssignUser) {
      try {
        // Get collaborators for potential assignment
        const { collaboratorModel } = await import('../../db/models/index.js');
        const collaborators = await collaboratorModel.listByRepo(inputData.repoId);
        
        if (collaborators.length > 0) {
          // Use agent for intelligent assignment
          const agent = mastra.getAgent('wit');
          if (agent) {
            const prompt = `Based on this issue, suggest the best assignee from the team:

Issue #${inputData.issueNumber}: ${inputData.title}
${inputData.body || '(No description)'}

Type: ${issueType}
Keywords: ${inputData.keywords.join(', ')}
Related files: ${inputData.relatedFiles.map(f => f.path).join(', ')}

Team members:
${collaborators.map(c => `- ${c.user.username} (${c.permission})`).join('\n')}

${inputData.customPrompt ? `\nCustom instructions: ${inputData.customPrompt}` : ''}

Respond with just the username of the best assignee and a brief reason.`;
            
            const response = await agent.generate(prompt);
            
            // Parse response to extract username
            const usernameMatch = response.text.match(/\b([a-zA-Z0-9_-]+)\b/);
            if (usernameMatch) {
              const username = usernameMatch[1];
              const collaborator = collaborators.find(
                c => c.user.username?.toLowerCase() === username.toLowerCase()
              );
              if (collaborator) {
                suggestedAssignee = {
                  userId: collaborator.userId,
                  username: collaborator.user.username || username,
                  reason: response.text,
                };
              }
            }
          }
        }
      } catch (error) {
        console.error('[Issue Triage] AI analysis failed:', error);
      }
    }
    
    // Generate final reasoning
    if (!reasoning) {
      reasoning = `Automatically triaged as ${issueType} with ${priority} priority based on content analysis.`;
    }
    
    return {
      issueType,
      priority,
      suggestedLabels: [...new Set(suggestedLabels)],
      suggestedAssignee,
      reasoning: reasoning.trim(),
    };
  },
});

// =============================================================================
// Step 5: Apply Triage Decisions
// =============================================================================

const applyTriageStep = createStep({
  id: 'apply-triage',
  inputSchema: z.object({
    issueId: z.string(),
    issueNumber: z.number(),
    repoId: z.string(),
    authorId: z.string(),
    autoAssignLabels: z.boolean(),
    autoAssignUser: z.boolean(),
    autoSetPriority: z.boolean(),
    addTriageComment: z.boolean(),
    issueType: z.enum(['bug', 'feature', 'documentation', 'question', 'enhancement', 'chore', 'other']),
    priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
    suggestedLabels: z.array(z.string()),
    suggestedAssignee: z.object({
      userId: z.string(),
      username: z.string(),
      reason: z.string(),
    }).optional(),
    reasoning: z.string(),
    relatedFiles: z.array(z.object({
      path: z.string(),
      relevance: z.enum(['high', 'medium', 'low']),
      reason: z.string(),
    })),
    similarIssues: z.array(z.object({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      state: z.string(),
      similarity: z.number(),
      labels: z.array(z.string()),
    })),
  }),
  outputSchema: IssueTriageOutputSchema,
  execute: async ({ inputData }) => {
    const appliedLabels: string[] = [];
    let assignedTo: string | undefined;
    let triageCommentId: string | undefined;
    
    try {
      const { issueModel, issueLabelModel, labelModel, issueCommentModel, userModel } = 
        await import('../../db/models/index.js');
      
      // Always add the ai-triage label to mark this issue as triaged
      const AI_TRIAGE_LABEL = 'ai-triage';
      let triageLabel = await labelModel.findByName(inputData.repoId, AI_TRIAGE_LABEL);
      if (!triageLabel) {
        triageLabel = await labelModel.create({
          repoId: inputData.repoId,
          name: AI_TRIAGE_LABEL,
          color: '#7c3aed', // Purple color for AI triage
          description: 'Issue has been analyzed by AI triage',
        });
      }
      await issueLabelModel.add(inputData.issueId, triageLabel.id);
      appliedLabels.push(AI_TRIAGE_LABEL);
      
      // Apply suggested labels
      if (inputData.autoAssignLabels) {
        for (const labelName of inputData.suggestedLabels) {
          let label = await labelModel.findByName(inputData.repoId, labelName);
          
          // Create label if it doesn't exist
          if (!label) {
            label = await labelModel.create({
              repoId: inputData.repoId,
              name: labelName,
              color: getLabelColor(labelName),
              description: `Auto-created by triage workflow`,
            });
          }
          
          await issueLabelModel.add(inputData.issueId, label.id);
          appliedLabels.push(labelName);
        }
      }
      
      // Set priority
      if (inputData.autoSetPriority) {
        await issueModel.updatePriority(inputData.issueId, inputData.priority);
      }
      
      // Assign user
      if (inputData.autoAssignUser && inputData.suggestedAssignee) {
        await issueModel.assign(inputData.issueId, inputData.suggestedAssignee.userId);
        assignedTo = inputData.suggestedAssignee.username;
      }
      
      // Add triage comment
      if (inputData.addTriageComment) {
        const botUser = await userModel.findByUsername('wit-bot');
        const commentBody = formatTriageComment(inputData);
        
        const comment = await issueCommentModel.create({
          issueId: inputData.issueId,
          userId: botUser?.id || inputData.authorId,
          body: commentBody,
        });
        triageCommentId = comment.id;
      }
    } catch (error) {
      console.error('[Issue Triage] Failed to apply triage:', error);
      return {
        success: false,
        issueType: inputData.issueType,
        priority: inputData.priority,
        suggestedLabels: inputData.suggestedLabels,
        appliedLabels,
        suggestedAssignee: inputData.suggestedAssignee,
        assignedTo,
        relatedFiles: inputData.relatedFiles.map(f => f.path),
        similarIssues: inputData.similarIssues.map(i => ({
          number: i.number,
          title: i.title,
          state: i.state,
          similarity: i.similarity,
        })),
        reasoning: inputData.reasoning,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
    
    return {
      success: true,
      issueType: inputData.issueType,
      priority: inputData.priority,
      suggestedLabels: inputData.suggestedLabels,
      appliedLabels: appliedLabels.length > 0 ? appliedLabels : undefined,
      suggestedAssignee: inputData.suggestedAssignee,
      assignedTo,
      relatedFiles: inputData.relatedFiles.map(f => f.path),
      similarIssues: inputData.similarIssues.map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        similarity: i.similarity,
      })),
      reasoning: inputData.reasoning,
      triageCommentId,
    };
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

function getLabelColor(labelName: string): string {
  const colorMap: Record<string, string> = {
    bug: '#d73a4a',
    feature: '#a2eeef',
    documentation: '#0075ca',
    question: '#d876e3',
    enhancement: '#84b6eb',
    chore: '#fef2c0',
    security: '#ff0000',
    'good-first-issue': '#7057ff',
    'needs-info': '#fbca04',
    'high-priority': '#b60205',
    urgent: '#ff0000',
  };
  
  return colorMap[labelName.toLowerCase()] || '#ededed';
}

function formatTriageComment(data: {
  issueNumber: number;
  issueType: string;
  priority: string;
  suggestedLabels: string[];
  suggestedAssignee?: { username: string; reason: string };
  reasoning: string;
  relatedFiles: Array<{ path: string; relevance: string; reason: string }>;
  similarIssues: Array<{ number: number; title: string; state: string; similarity: number }>;
}): string {
  const lines: string[] = [];
  
  lines.push('## Triage Analysis');
  lines.push('');
  lines.push(`**Type:** ${data.issueType}`);
  lines.push(`**Priority:** ${data.priority}`);
  lines.push('');
  
  lines.push('### Analysis');
  lines.push(data.reasoning);
  lines.push('');
  
  if (data.relatedFiles.length > 0) {
    lines.push('### Related Files');
    for (const file of data.relatedFiles.slice(0, 5)) {
      lines.push(`- \`${file.path}\` (${file.relevance}) - ${file.reason}`);
    }
    lines.push('');
  }
  
  if (data.similarIssues.length > 0) {
    lines.push('### Similar Issues');
    for (const issue of data.similarIssues) {
      const status = issue.state === 'closed' ? 'Closed' : 'Open';
      lines.push(`- #${issue.number}: ${issue.title} (${status}, ${Math.round(issue.similarity * 100)}% similar)`);
    }
    lines.push('');
  }
  
  if (data.suggestedAssignee) {
    lines.push('### Suggested Assignee');
    lines.push(`@${data.suggestedAssignee.username}`);
    lines.push('');
  }
  
  lines.push('---');
  lines.push('*This analysis was generated by wit AI Triage Workflow.*');
  
  return lines.join('\n');
}

// =============================================================================
// Workflow Definition
// =============================================================================

export const issueTriageWorkflow = createWorkflow({
  id: 'issue-triage',
  inputSchema: IssueTriageInputSchema,
  outputSchema: IssueTriageOutputSchema,
})
  // Step 1: Extract metadata
  .then(extractMetadataStep)
  // Step 2 & 3: Search codebase and find similar issues in parallel
  .map(async ({ inputData }) => ({
    // For searchCodebaseStep
    issueId: inputData.issueId,
    issueNumber: inputData.issueNumber,
    repoId: inputData.repoId,
    repoPath: inputData.repoPath,
    title: inputData.title,
    body: inputData.body,
    keywords: inputData.keywords,
    mentionedFiles: inputData.mentionedFiles,
    // For findSimilarIssuesStep
    detectedType: inputData.detectedType,
    // Preserve for later steps
    authorId: inputData.authorId,
    authorUsername: inputData.authorUsername,
    autoAssignLabels: inputData.autoAssignLabels,
    autoAssignUser: inputData.autoAssignUser,
    autoSetPriority: inputData.autoSetPriority,
    addTriageComment: inputData.addTriageComment,
    customPrompt: inputData.customPrompt,
    urgencyIndicators: inputData.urgencyIndicators,
    hasStackTrace: inputData.hasStackTrace,
    hasCodeBlock: inputData.hasCodeBlock,
    hasReproSteps: inputData.hasReproSteps,
  }))
  .parallel([searchCodebaseStep, findSimilarIssuesStep])
  // Step 4: AI analysis
  .map(async ({ inputData, getStepResult }) => {
    const metadata = getStepResult('extract-metadata') as {
      issueId: string;
      issueNumber: number;
      repoId: string;
      title: string;
      body?: string;
      authorUsername: string;
      autoAssignUser: boolean;
      customPrompt?: string;
      detectedType: 'bug' | 'feature' | 'documentation' | 'question' | 'enhancement' | 'chore' | 'other';
      urgencyIndicators: string[];
      keywords: string[];
      hasStackTrace: boolean;
      hasCodeBlock: boolean;
      hasReproSteps: boolean;
    };
    const searchResult = inputData['search-codebase'];
    const similarResult = inputData['find-similar-issues'];
    
    return {
      issueId: metadata.issueId,
      issueNumber: metadata.issueNumber,
      repoId: metadata.repoId,
      title: metadata.title,
      body: metadata.body,
      authorUsername: metadata.authorUsername,
      detectedType: metadata.detectedType,
      urgencyIndicators: metadata.urgencyIndicators,
      keywords: metadata.keywords,
      hasStackTrace: metadata.hasStackTrace,
      hasCodeBlock: metadata.hasCodeBlock,
      hasReproSteps: metadata.hasReproSteps,
      relatedFiles: searchResult.relatedFiles,
      similarIssues: similarResult.similarIssues,
      autoAssignUser: metadata.autoAssignUser,
      customPrompt: metadata.customPrompt,
    };
  })
  .then(aiAnalysisStep)
  // Step 5: Apply triage
  .map(async ({ inputData, getStepResult }) => {
    const metadata = getStepResult('extract-metadata') as {
      issueId: string;
      issueNumber: number;
      repoId: string;
      authorId: string;
      autoAssignLabels: boolean;
      autoAssignUser: boolean;
      autoSetPriority: boolean;
      addTriageComment: boolean;
    };
    const searchResult = getStepResult('search-codebase') as {
      relatedFiles: Array<{ path: string; relevance: 'high' | 'medium' | 'low'; reason: string }>;
    };
    const similarResult = getStepResult('find-similar-issues') as {
      similarIssues: Array<{ id: string; number: number; title: string; state: string; similarity: number; labels: string[] }>;
    };
    
    return {
      issueId: metadata.issueId,
      issueNumber: metadata.issueNumber,
      repoId: metadata.repoId,
      authorId: metadata.authorId,
      autoAssignLabels: metadata.autoAssignLabels,
      autoAssignUser: metadata.autoAssignUser,
      autoSetPriority: metadata.autoSetPriority,
      addTriageComment: metadata.addTriageComment,
      ...inputData,
      relatedFiles: searchResult.relatedFiles,
      similarIssues: similarResult.similarIssues,
    };
  })
  .then(applyTriageStep)
  .commit();
