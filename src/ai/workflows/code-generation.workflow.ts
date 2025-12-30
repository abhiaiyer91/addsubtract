/**
 * Code Generation Workflow
 * 
 * A multi-step workflow that handles end-to-end code generation tasks.
 * The workflow:
 * 
 * 1. Analyzes the task requirements and gathers context
 * 2. Searches codebase for patterns and conventions
 * 3. Generates code following discovered patterns
 * 4. Validates the generated code (lint, type-check)
 * 5. Creates a branch, commits, and optionally opens a PR
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const CodeGenerationInputSchema = z.object({
  repoId: z.string().describe('Repository ID'),
  repoPath: z.string().describe('Path to repository on disk'),
  owner: z.string().describe('Repository owner'),
  repoName: z.string().describe('Repository name'),
  userId: z.string().describe('User requesting the generation'),
  
  // Task description
  task: z.string().describe('Description of what to generate'),
  targetFiles: z.array(z.string()).optional().describe('Specific files to create or modify'),
  
  // Options
  branchName: z.string().optional().describe('Branch name for changes'),
  commitMessage: z.string().optional().describe('Custom commit message'),
  createPR: z.boolean().default(false).describe('Whether to create a PR'),
  prTitle: z.string().optional().describe('PR title if creating PR'),
  runTests: z.boolean().default(true).describe('Whether to run tests after generation'),
  runLint: z.boolean().default(true).describe('Whether to run linter'),
  dryRun: z.boolean().default(false).describe('Preview changes without applying'),
});

export type CodeGenerationInput = z.infer<typeof CodeGenerationInputSchema>;

export const CodeGenerationOutputSchema = z.object({
  success: z.boolean(),
  generatedFiles: z.array(z.object({
    path: z.string(),
    action: z.enum(['created', 'modified', 'deleted']),
    linesAdded: z.number(),
    linesRemoved: z.number(),
  })),
  validation: z.object({
    lintPassed: z.boolean().optional(),
    lintErrors: z.array(z.string()).optional(),
    typeCheckPassed: z.boolean().optional(),
    typeCheckErrors: z.array(z.string()).optional(),
    testsPassed: z.boolean().optional(),
    testOutput: z.string().optional(),
  }),
  branchName: z.string().optional(),
  commitSha: z.string().optional(),
  prNumber: z.number().optional(),
  prUrl: z.string().optional(),
  summary: z.string(),
  error: z.string().optional(),
});

export type CodeGenerationOutput = z.infer<typeof CodeGenerationOutputSchema>;

// =============================================================================
// Step 1: Analyze Task and Gather Context
// =============================================================================

const analyzeTaskStep = createStep({
  id: 'analyze-task',
  inputSchema: CodeGenerationInputSchema,
  outputSchema: z.object({
    // Pass through
    repoId: z.string(),
    repoPath: z.string(),
    owner: z.string(),
    repoName: z.string(),
    userId: z.string(),
    task: z.string(),
    targetFiles: z.array(z.string()).optional(),
    branchName: z.string().optional(),
    commitMessage: z.string().optional(),
    createPR: z.boolean(),
    prTitle: z.string().optional(),
    runTests: z.boolean(),
    runLint: z.boolean(),
    dryRun: z.boolean(),
    // Analysis results
    taskType: z.enum(['create', 'modify', 'refactor', 'fix', 'test', 'docs']),
    keywords: z.array(z.string()),
    estimatedComplexity: z.enum(['low', 'medium', 'high']),
    projectType: z.string(),
    relevantPatterns: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { readRepoFile, findFilesInRepo } = await import('./utils.js');
    
    const taskLower = inputData.task.toLowerCase();
    
    // Determine task type
    let taskType: 'create' | 'modify' | 'refactor' | 'fix' | 'test' | 'docs' = 'create';
    if (/\b(create|add|implement|new)\b/.test(taskLower)) {
      taskType = 'create';
    } else if (/\b(modify|change|update|edit)\b/.test(taskLower)) {
      taskType = 'modify';
    } else if (/\b(refactor|restructure|reorganize|clean)\b/.test(taskLower)) {
      taskType = 'refactor';
    } else if (/\b(fix|bug|error|issue|repair)\b/.test(taskLower)) {
      taskType = 'fix';
    } else if (/\b(test|spec|coverage)\b/.test(taskLower)) {
      taskType = 'test';
    } else if (/\b(doc|documentation|readme|comment)\b/.test(taskLower)) {
      taskType = 'docs';
    }
    
    // Extract keywords
    const keywords = new Set<string>();
    const keywordPatterns = [
      /\b(component|hook|service|util|helper|api|route|model|schema|type|interface|class|function|module)\b/gi,
      /\b(react|vue|angular|express|next|node|typescript|javascript)\b/gi,
      /\b(database|auth|api|crud|rest|graphql)\b/gi,
    ];
    for (const pattern of keywordPatterns) {
      const matches = taskLower.match(pattern) || [];
      matches.forEach(m => keywords.add(m.toLowerCase()));
    }
    
    // Estimate complexity
    let estimatedComplexity: 'low' | 'medium' | 'high' = 'medium';
    if (inputData.targetFiles && inputData.targetFiles.length > 5) {
      estimatedComplexity = 'high';
    } else if (inputData.targetFiles && inputData.targetFiles.length <= 2) {
      estimatedComplexity = 'low';
    }
    if (/\b(complex|comprehensive|full|complete|entire)\b/.test(taskLower)) {
      estimatedComplexity = 'high';
    } else if (/\b(simple|basic|quick|small)\b/.test(taskLower)) {
      estimatedComplexity = 'low';
    }
    
    // Detect project type using wit's file reading
    let projectType = 'unknown';
    try {
      const packageJsonContent = readRepoFile(inputData.repoPath, 'package.json');
      if (packageJsonContent) {
        const pkg = JSON.parse(packageJsonContent);
      
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          projectType = 'react';
        } else if (pkg.dependencies?.vue || pkg.devDependencies?.vue) {
          projectType = 'vue';
        } else if (pkg.dependencies?.express || pkg.devDependencies?.express) {
          projectType = 'express';
        } else if (pkg.dependencies?.next || pkg.devDependencies?.next) {
          projectType = 'nextjs';
        } else if (pkg.dependencies?.hono || pkg.devDependencies?.hono) {
          projectType = 'hono';
        }
      
        if (pkg.devDependencies?.typescript) {
          projectType += '-typescript';
        }
      }
    } catch {
      // Could not read package.json
    }
    
    // Find relevant patterns in the codebase using wit APIs
    const relevantPatterns: string[] = [];
    try {
      // Look for common patterns using wit's file listing
      const allFiles = await findFilesInRepo(inputData.repoPath, /\.(ts|tsx)$/);
      const srcFiles = allFiles.filter((f: string) => f.startsWith('src/')).slice(0, 20);
      
      if (srcFiles.some((f: string) => f.includes('/components/'))) {
        relevantPatterns.push('component-based');
      }
      if (srcFiles.some((f: string) => f.includes('/hooks/'))) {
        relevantPatterns.push('custom-hooks');
      }
      if (srcFiles.some((f: string) => f.includes('/api/') || f.includes('/routes/'))) {
        relevantPatterns.push('api-routes');
      }
      if (srcFiles.some((f: string) => f.includes('/models/') || f.includes('/db/'))) {
        relevantPatterns.push('data-models');
      }
      if (srcFiles.some((f: string) => f.includes('/utils/') || f.includes('/lib/'))) {
        relevantPatterns.push('utilities');
      }
    } catch {
      // Could not analyze patterns
    }
    
    return {
      ...inputData,
      taskType,
      keywords: Array.from(keywords),
      estimatedComplexity,
      projectType,
      relevantPatterns,
    };
  },
});

// =============================================================================
// Step 2: Search Codebase for Conventions
// =============================================================================

const searchConventionsStep = createStep({
  id: 'search-conventions',
  inputSchema: z.object({
    repoPath: z.string(),
    taskType: z.enum(['create', 'modify', 'refactor', 'fix', 'test', 'docs']),
    keywords: z.array(z.string()),
    targetFiles: z.array(z.string()).optional(),
    projectType: z.string(),
  }),
  outputSchema: z.object({
    conventions: z.object({
      fileNaming: z.string().optional(),
      exportStyle: z.enum(['named', 'default', 'mixed']),
      importStyle: z.string().optional(),
      typeDefinitions: z.enum(['inline', 'separate', 'mixed']),
      testPattern: z.string().optional(),
    }),
    exampleFiles: z.array(z.object({
      path: z.string(),
      purpose: z.string(),
      snippet: z.string(),
    })),
    existingImports: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { findFilesInRepo, readRepoFile } = await import('./utils.js');
    const path = await import('path');
    
    const conventions = {
      fileNaming: undefined as string | undefined,
      exportStyle: 'named' as 'named' | 'default' | 'mixed',
      importStyle: undefined as string | undefined,
      typeDefinitions: 'inline' as 'inline' | 'separate' | 'mixed',
      testPattern: undefined as string | undefined,
    };
    
    const exampleFiles: Array<{ path: string; purpose: string; snippet: string }> = [];
    const existingImports = new Set<string>();
    
    try {
      // Analyze file naming conventions using wit APIs
      const allFiles = await findFilesInRepo(inputData.repoPath, /\.(ts|tsx)$/);
      const files = allFiles.slice(0, 30);
      
      const kebabCase = files.filter((f: string) => /[a-z]+-[a-z]+/.test(path.basename(f)));
      const camelCase = files.filter((f: string) => /[a-z]+[A-Z][a-z]+/.test(path.basename(f)));
      const pascalCase = files.filter((f: string) => /^[A-Z][a-z]+[A-Z]/.test(path.basename(f)));
      
      if (kebabCase.length > camelCase.length && kebabCase.length > pascalCase.length) {
        conventions.fileNaming = 'kebab-case';
      } else if (camelCase.length > pascalCase.length) {
        conventions.fileNaming = 'camelCase';
      } else if (pascalCase.length > 0) {
        conventions.fileNaming = 'PascalCase';
      }
      
      // Analyze export styles
      let namedExports = 0;
      let defaultExports = 0;
      
      for (const file of files.slice(0, 10)) {
        try {
          const content = readRepoFile(inputData.repoPath, file);
          if (!content) continue;
          
          if (/^export\s+(?:const|function|class|type|interface)\s+/m.test(content)) {
            namedExports++;
          }
          if (/^export\s+default\s+/m.test(content)) {
            defaultExports++;
          }
          
          // Collect imports
          const importMatches = content.match(/^import\s+.*from\s+['"]([^'"]+)['"]/gm) || [];
          importMatches.forEach(imp => {
            const match = imp.match(/from\s+['"]([^'"]+)['"]/);
            if (match && !match[1].startsWith('.')) {
              existingImports.add(match[1]);
            }
          });
        } catch {
          // Skip unreadable files
        }
      }
      
      if (namedExports > defaultExports * 2) {
        conventions.exportStyle = 'named';
      } else if (defaultExports > namedExports * 2) {
        conventions.exportStyle = 'default';
      } else {
        conventions.exportStyle = 'mixed';
      }
      
      // Check for test patterns using wit file listing
      const testFiles = allFiles.filter((f: string) => 
        f.includes('test') || f.includes('spec')
      ).slice(0, 5);
      
      if (testFiles.length > 0) {
        if (testFiles.some((f: string) => f.includes('.test.'))) {
          conventions.testPattern = '.test.ts';
        } else if (testFiles.some((f: string) => f.includes('.spec.'))) {
          conventions.testPattern = '.spec.ts';
        } else if (testFiles.some((f: string) => f.includes('__tests__'))) {
          conventions.testPattern = '__tests__/';
        }
      }
      
      // Find example files for the task using wit file listing
      for (const keyword of inputData.keywords.slice(0, 3)) {
        const matches = allFiles
          .filter((f: string) => f.toLowerCase().includes(keyword.toLowerCase()))
          .slice(0, 2);
        
        for (const match of matches) {
          try {
            const content = readRepoFile(inputData.repoPath, match);
            if (!content) continue;
            
            const lines = content.split('\n').slice(0, 50);
            
            exampleFiles.push({
              path: match,
              purpose: `Example containing "${keyword}"`,
              snippet: lines.join('\n'),
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch (error) {
      console.error('[Code Generation] Failed to analyze conventions:', error);
    }
    
    return {
      conventions,
      exampleFiles: exampleFiles.slice(0, 5),
      existingImports: Array.from(existingImports),
    };
  },
});

// =============================================================================
// Step 3: Generate Code with AI
// =============================================================================

const generateCodeStep = createStep({
  id: 'generate-code',
  inputSchema: z.object({
    repoPath: z.string(),
    task: z.string(),
    targetFiles: z.array(z.string()).optional(),
    taskType: z.enum(['create', 'modify', 'refactor', 'fix', 'test', 'docs']),
    projectType: z.string(),
    conventions: z.object({
      fileNaming: z.string().optional(),
      exportStyle: z.enum(['named', 'default', 'mixed']),
      importStyle: z.string().optional(),
      typeDefinitions: z.enum(['inline', 'separate', 'mixed']),
      testPattern: z.string().optional(),
    }),
    exampleFiles: z.array(z.object({
      path: z.string(),
      purpose: z.string(),
      snippet: z.string(),
    })),
    existingImports: z.array(z.string()),
    dryRun: z.boolean(),
  }),
  outputSchema: z.object({
    generatedFiles: z.array(z.object({
      path: z.string(),
      content: z.string(),
      action: z.enum(['created', 'modified', 'deleted']),
    })),
    explanation: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const generatedFiles: Array<{
      path: string;
      content: string;
      action: 'created' | 'modified' | 'deleted';
    }> = [];
    let explanation = '';
    
    // Build context for AI
    const context = `
Project type: ${inputData.projectType}
Task type: ${inputData.taskType}
Conventions:
- File naming: ${inputData.conventions.fileNaming || 'not determined'}
- Export style: ${inputData.conventions.exportStyle}
- Type definitions: ${inputData.conventions.typeDefinitions}
- Test pattern: ${inputData.conventions.testPattern || 'not determined'}

Example files for reference:
${inputData.exampleFiles.map(f => `
### ${f.path}
Purpose: ${f.purpose}
\`\`\`typescript
${f.snippet.slice(0, 1000)}
\`\`\`
`).join('\n')}

Available imports: ${inputData.existingImports.slice(0, 20).join(', ')}
`;
    
    // Use AI agent if available
    if (mastra) {
      try {
        const agent = mastra.getAgent('wit');
        if (agent) {
          const prompt = `You are a code generation assistant. Generate code for the following task.

TASK: ${inputData.task}

${inputData.targetFiles?.length ? `Target files: ${inputData.targetFiles.join(', ')}` : 'Determine the appropriate file paths.'}

PROJECT CONTEXT:
${context}

IMPORTANT INSTRUCTIONS:
1. Follow the existing conventions exactly
2. Use TypeScript with proper types
3. Include necessary imports
4. Add JSDoc comments for public functions
5. Handle errors appropriately

OUTPUT FORMAT:
For each file you generate, output in this exact format:

---FILE: path/to/file.ts---
\`\`\`typescript
// file content here
\`\`\`
---END FILE---

After all files, provide a brief explanation of what was generated.`;

          const response = await agent.generate(prompt);
          
          // Parse the response to extract files
          const filePattern = /---FILE:\s*(.+?)---\s*```(?:typescript|javascript|tsx|jsx)?\s*([\s\S]*?)```\s*---END FILE---/g;
          let match;
          
          while ((match = filePattern.exec(response.text)) !== null) {
            const filePath = match[1].trim();
            const content = match[2].trim();
            
            // Determine if this is a new file or modification
            const fs = await import('fs/promises');
            const path = await import('path');
            let action: 'created' | 'modified' = 'created';
            
            try {
              await fs.access(path.join(inputData.repoPath, filePath));
              action = 'modified';
            } catch {
              // File doesn't exist, will be created
            }
            
            generatedFiles.push({
              path: filePath,
              content,
              action,
            });
          }
          
          // Extract explanation
          const explanationMatch = response.text.match(/---END FILE---\s*([\s\S]+)$/);
          explanation = explanationMatch?.[1]?.trim() || 'Code generated successfully.';
        }
      } catch (error) {
        console.error('[Code Generation] AI generation failed:', error);
        explanation = 'AI generation failed, using fallback template.';
      }
    }
    
    // Fallback: Generate a basic template if no files were generated
    if (generatedFiles.length === 0 && inputData.targetFiles?.length) {
      for (const targetFile of inputData.targetFiles) {
        const ext = targetFile.split('.').pop() || 'ts';
        let template = '';
        
        if (ext === 'ts' || ext === 'tsx') {
          template = `/**
 * ${targetFile.split('/').pop()?.replace(/\.[^.]+$/, '')}
 * 
 * Generated by wit AI Code Generation Workflow
 * Task: ${inputData.task}
 */

// TODO: Implement based on task requirements

export {};
`;
        }
        
        generatedFiles.push({
          path: targetFile,
          content: template,
          action: 'created',
        });
      }
      
      explanation = 'Generated basic file templates. Please implement the specific functionality.';
    }
    
    return {
      generatedFiles,
      explanation,
    };
  },
});

// =============================================================================
// Step 4: Apply and Validate Changes
// =============================================================================

const applyAndValidateStep = createStep({
  id: 'apply-and-validate',
  inputSchema: z.object({
    repoPath: z.string(),
    generatedFiles: z.array(z.object({
      path: z.string(),
      content: z.string(),
      action: z.enum(['created', 'modified', 'deleted']),
    })),
    runTests: z.boolean(),
    runLint: z.boolean(),
    dryRun: z.boolean(),
  }),
  outputSchema: z.object({
    appliedFiles: z.array(z.object({
      path: z.string(),
      action: z.enum(['created', 'modified', 'deleted']),
      linesAdded: z.number(),
      linesRemoved: z.number(),
    })),
    validation: z.object({
      lintPassed: z.boolean().optional(),
      lintErrors: z.array(z.string()).optional(),
      typeCheckPassed: z.boolean().optional(),
      typeCheckErrors: z.array(z.string()).optional(),
      testsPassed: z.boolean().optional(),
      testOutput: z.string().optional(),
    }),
  }),
  execute: async ({ inputData }) => {
    const { writeRepoFile, readRepoFile } = await import('./utils.js');
    const { spawn } = await import('child_process');
    
    const appliedFiles: Array<{
      path: string;
      action: 'created' | 'modified' | 'deleted';
      linesAdded: number;
      linesRemoved: number;
    }> = [];
    
    const validation: {
      lintPassed?: boolean;
      lintErrors?: string[];
      typeCheckPassed?: boolean;
      typeCheckErrors?: string[];
      testsPassed?: boolean;
      testOutput?: string;
    } = {};
    
    // Apply files using wit APIs (unless dry run)
    if (!inputData.dryRun) {
      for (const file of inputData.generatedFiles) {
        // Get existing line count
        let linesRemoved = 0;
        const existing = readRepoFile(inputData.repoPath, file.path);
        if (existing) {
          linesRemoved = existing.split('\n').length;
        }
        
        // Write file using wit API
        const result = writeRepoFile(inputData.repoPath, file.path, file.content);
        
        if (result.success) {
          appliedFiles.push({
            path: file.path,
            action: file.action,
            linesAdded: file.content.split('\n').length,
            linesRemoved,
          });
        }
      }
    } else {
      // Dry run - just calculate what would happen
      for (const file of inputData.generatedFiles) {
        appliedFiles.push({
          path: file.path,
          action: file.action,
          linesAdded: file.content.split('\n').length,
          linesRemoved: 0,
        });
      }
    }
    
    // Run validation commands (only if not dry run)
    // Note: These are npm commands, not git commands, so they're acceptable
    if (!inputData.dryRun) {
      const runCommand = (cmd: string, args: string[]): Promise<{ success: boolean; output: string }> => {
        return new Promise((resolve) => {
          const proc = spawn(cmd, args, { cwd: inputData.repoPath, shell: true });
          let output = '';
          proc.stdout?.on('data', (data) => { output += data.toString(); });
          proc.stderr?.on('data', (data) => { output += data.toString(); });
          proc.on('close', (code) => {
            resolve({ success: code === 0, output });
          });
          proc.on('error', () => {
            resolve({ success: false, output: 'Command failed to execute' });
          });
        });
      };
      
      // Lint
      if (inputData.runLint) {
        const lintResult = await runCommand('npm', ['run', 'lint']);
        validation.lintPassed = lintResult.success;
        if (!lintResult.success) {
          validation.lintErrors = lintResult.output.split('\n').filter(Boolean).slice(0, 10);
        }
      }
      
      // Type check
      const typeResult = await runCommand('npx', ['tsc', '--noEmit']);
      validation.typeCheckPassed = typeResult.success;
      if (!typeResult.success) {
        validation.typeCheckErrors = typeResult.output.split('\n').filter(Boolean).slice(0, 10);
      }
      
      // Tests
      if (inputData.runTests) {
        const testResult = await runCommand('npm', ['test', '--', '--run']);
        validation.testsPassed = testResult.success;
        validation.testOutput = testResult.output.slice(-500);
      }
    }
    
    return {
      appliedFiles,
      validation,
    };
  },
});

// =============================================================================
// Step 5: Create Branch and Commit
// =============================================================================

const createBranchAndCommitStep = createStep({
  id: 'create-branch-commit',
  inputSchema: z.object({
    repoPath: z.string(),
    repoId: z.string(),
    owner: z.string(),
    repoName: z.string(),
    userId: z.string(),
    task: z.string(),
    branchName: z.string().optional(),
    commitMessage: z.string().optional(),
    createPR: z.boolean(),
    prTitle: z.string().optional(),
    dryRun: z.boolean(),
    appliedFiles: z.array(z.object({
      path: z.string(),
      action: z.enum(['created', 'modified', 'deleted']),
      linesAdded: z.number(),
      linesRemoved: z.number(),
    })),
    validation: z.object({
      lintPassed: z.boolean().optional(),
      lintErrors: z.array(z.string()).optional(),
      typeCheckPassed: z.boolean().optional(),
      typeCheckErrors: z.array(z.string()).optional(),
      testsPassed: z.boolean().optional(),
      testOutput: z.string().optional(),
    }),
    explanation: z.string(),
  }),
  outputSchema: CodeGenerationOutputSchema,
  execute: async ({ inputData }) => {
    const { 
      createBranch, 
      stageFiles, 
      createCommit, 
      getDefaultBranch, 
      resolveRef 
    } = await import('./utils.js');
    
    let branchName: string | undefined;
    let commitSha: string | undefined;
    let prNumber: number | undefined;
    let prUrl: string | undefined;
    
    // Generate summary
    const totalAdded = inputData.appliedFiles.reduce((sum, f) => sum + f.linesAdded, 0);
    const totalRemoved = inputData.appliedFiles.reduce((sum, f) => sum + f.linesRemoved, 0);
    
    let summary = inputData.dryRun 
      ? `[DRY RUN] Would generate ${inputData.appliedFiles.length} file(s) (+${totalAdded}/-${totalRemoved} lines)`
      : `Generated ${inputData.appliedFiles.length} file(s) (+${totalAdded}/-${totalRemoved} lines)`;
    
    if (inputData.validation.lintPassed === false) {
      summary += '. Lint errors found.';
    }
    if (inputData.validation.typeCheckPassed === false) {
      summary += '. Type errors found.';
    }
    if (inputData.validation.testsPassed === false) {
      summary += '. Some tests failed.';
    }
    
    summary += '\n\n' + inputData.explanation;
    
    if (inputData.dryRun || inputData.appliedFiles.length === 0) {
      return {
        success: inputData.appliedFiles.length > 0,
        generatedFiles: inputData.appliedFiles,
        validation: inputData.validation,
        summary,
      };
    }
    
    try {
      // Generate branch name if not provided
      branchName = inputData.branchName || 
        `ai-gen/${inputData.task.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${Date.now().toString(36)}`;
      
      // Create branch using wit API
      const branchResult = createBranch(inputData.repoPath, branchName, true);
      if (!branchResult.success) {
        throw new Error(branchResult.error || 'Failed to create branch');
      }
      
      // Stage files using wit API
      const filePaths = inputData.appliedFiles.map(f => f.path);
      const stageResult = stageFiles(inputData.repoPath, filePaths);
      if (!stageResult.success) {
        throw new Error(stageResult.error || 'Failed to stage files');
      }
      
      // Create commit using wit API
      const commitMsg = inputData.commitMessage || 
        `feat: ${inputData.task.slice(0, 50)}${inputData.task.length > 50 ? '...' : ''}\n\nGenerated by wit AI Code Generation Workflow`;
      
      const commitResult = createCommit(inputData.repoPath, commitMsg);
      if (!commitResult.success) {
        throw new Error(commitResult.error || 'Failed to create commit');
      }
      commitSha = commitResult.commitHash;
      
      // Create PR if requested
      if (inputData.createPR && commitSha) {
        try {
          const { prModel } = await import('../../db/models/index.js');
          
          // Get the default branch using wit API
          const targetBranchName = getDefaultBranch(inputData.repoPath) || 'main';
          const baseSha = resolveRef(inputData.repoPath, targetBranchName);
          
          if (baseSha) {
            const pr = await prModel.create({
              repoId: inputData.repoId,
              title: inputData.prTitle || inputData.task.slice(0, 100),
              body: `## Generated by wit AI\n\n${inputData.explanation}\n\n### Changes\n${inputData.appliedFiles.map(f => `- ${f.action}: \`${f.path}\``).join('\n')}`,
              authorId: inputData.userId,
              targetBranch: targetBranchName,
              sourceBranch: branchName,
              baseSha,
              headSha: commitSha,
            });
            
            prNumber = pr.number;
            prUrl = `/${inputData.owner}/${inputData.repoName}/pull/${pr.number}`;
          }
        } catch (error) {
          console.error('[Code Generation] Failed to create PR:', error);
        }
      }
      
      summary = `Successfully generated code. ${summary}`;
    } catch (error) {
      console.error('[Code Generation] wit operations failed:', error);
      return {
        success: false,
        generatedFiles: inputData.appliedFiles,
        validation: inputData.validation,
        summary,
        error: error instanceof Error ? error.message : 'Git operations failed',
      };
    }
    
    return {
      success: true,
      generatedFiles: inputData.appliedFiles,
      validation: inputData.validation,
      branchName,
      commitSha,
      prNumber,
      prUrl,
      summary,
    };
  },
});

// =============================================================================
// Workflow Definition
// =============================================================================

export const codeGenerationWorkflow = createWorkflow({
  id: 'code-generation',
  inputSchema: CodeGenerationInputSchema,
  outputSchema: CodeGenerationOutputSchema,
})
  // Step 1: Analyze task
  .then(analyzeTaskStep)
  // Step 2: Search for conventions
  .map(async ({ inputData }) => ({
    repoPath: inputData.repoPath,
    taskType: inputData.taskType,
    keywords: inputData.keywords,
    targetFiles: inputData.targetFiles,
    projectType: inputData.projectType,
  }))
  .then(searchConventionsStep)
  // Step 3: Generate code
  .map(async ({ inputData, getStepResult }) => {
    const analysis = getStepResult('analyze-task') as {
      repoPath: string;
      task: string;
      targetFiles?: string[];
      taskType: 'create' | 'modify' | 'refactor' | 'fix' | 'test' | 'docs';
      projectType: string;
      dryRun: boolean;
    };
    
    return {
      repoPath: analysis.repoPath,
      task: analysis.task,
      targetFiles: analysis.targetFiles,
      taskType: analysis.taskType,
      projectType: analysis.projectType,
      conventions: inputData.conventions,
      exampleFiles: inputData.exampleFiles,
      existingImports: inputData.existingImports,
      dryRun: analysis.dryRun,
    };
  })
  .then(generateCodeStep)
  // Step 4: Apply and validate
  .map(async ({ inputData, getStepResult }) => {
    const analysis = getStepResult('analyze-task') as {
      repoPath: string;
      runTests: boolean;
      runLint: boolean;
      dryRun: boolean;
    };
    
    return {
      repoPath: analysis.repoPath,
      generatedFiles: inputData.generatedFiles,
      runTests: analysis.runTests,
      runLint: analysis.runLint,
      dryRun: analysis.dryRun,
    };
  })
  .then(applyAndValidateStep)
  // Step 5: Create branch and commit
  .map(async ({ inputData, getStepResult }) => {
    const analysis = getStepResult('analyze-task') as {
      repoPath: string;
      repoId: string;
      owner: string;
      repoName: string;
      userId: string;
      task: string;
      branchName?: string;
      commitMessage?: string;
      createPR: boolean;
      prTitle?: string;
      dryRun: boolean;
    };
    const generation = getStepResult('generate-code') as {
      explanation: string;
    };
    
    return {
      repoPath: analysis.repoPath,
      repoId: analysis.repoId,
      owner: analysis.owner,
      repoName: analysis.repoName,
      userId: analysis.userId,
      task: analysis.task,
      branchName: analysis.branchName,
      commitMessage: analysis.commitMessage,
      createPR: analysis.createPR,
      prTitle: analysis.prTitle,
      dryRun: analysis.dryRun,
      appliedFiles: inputData.appliedFiles,
      validation: inputData.validation,
      explanation: generation.explanation,
    };
  })
  .then(createBranchAndCommitStep)
  .commit();
