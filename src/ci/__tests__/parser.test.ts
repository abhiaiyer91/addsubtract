/**
 * CI/CD Workflow Parser Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseWorkflow,
  parseYAML,
  validateWorkflow,
  loadWorkflows,
  loadWorkflowFile,
  validateWorkflowFile,
  validateExpression,
  WorkflowValidationError,
  WorkflowLoadError,
  CIEngine,
  createCIEngine,
} from '../index';
import { createTempDir, cleanupTempDir } from '../../__tests__/test-utils';

describe('CI/CD Workflow Parser', () => {
  describe('parseYAML', () => {
    it('should parse simple key-value pairs', () => {
      const yaml = `
name: Test Workflow
version: 1
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.name).toBe('Test Workflow');
      expect(result.version).toBe(1);
    });

    it('should parse nested objects', () => {
      const yaml = `
name: Test
on:
  push:
    branches:
      - main
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.name).toBe('Test');
      expect(result.on).toBeDefined();
    });

    it('should parse arrays', () => {
      const yaml = `
items:
  - first
  - second
  - third
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.items).toEqual(['first', 'second', 'third']);
    });

    it('should parse booleans', () => {
      const yaml = `
enabled: true
disabled: false
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.enabled).toBe(true);
      expect(result.disabled).toBe(false);
    });

    it('should parse numbers', () => {
      const yaml = `
count: 42
ratio: 3.14
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.count).toBe(42);
      expect(result.ratio).toBe(3.14);
    });

    it('should parse quoted strings', () => {
      const yaml = `
single: 'hello world'
double: "goodbye world"
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.single).toBe('hello world');
      expect(result.double).toBe('goodbye world');
    });

    it('should skip comments', () => {
      const yaml = `
# This is a comment
name: Test
# Another comment
version: 1
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.name).toBe('Test');
      expect(result.version).toBe(1);
    });

    it('should parse inline arrays', () => {
      const yaml = `
tags: [tag1, tag2, tag3]
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse null values', () => {
      const yaml = `
empty: null
tilde: ~
`;
      const result = parseYAML(yaml) as Record<string, unknown>;
      expect(result.empty).toBe(null);
      expect(result.tilde).toBe(null);
    });
  });

  describe('parseWorkflow', () => {
    it('should parse a valid minimal workflow', () => {
      const yaml = `
name: Test CI
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Hello"
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.name).toBe('Test CI');
      expect(workflow.jobs.build).toBeDefined();
      expect(workflow.jobs.build.steps).toHaveLength(1);
    });

    it('should parse workflow with multiple triggers', () => {
      const yaml = `
name: Multi-trigger
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;
      const workflow = parseWorkflow(yaml);
      const trigger = workflow.on as Record<string, unknown>;
      expect(trigger.push).toBeDefined();
      expect(trigger.pull_request).toBeDefined();
    });

    it('should parse workflow with job dependencies', () => {
      const yaml = `
name: With Dependencies
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm build
  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - run: npm test
  deploy:
    runs-on: ubuntu-latest
    needs:
      - build
      - test
    steps:
      - run: npm deploy
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.jobs.build.needs).toBeUndefined();
      expect(workflow.jobs.test.needs).toEqual(['build']);
      expect(workflow.jobs.deploy.needs).toContain('build');
      expect(workflow.jobs.deploy.needs).toContain('test');
    });

    it('should parse workflow with environment variables', () => {
      const yaml = `
name: With Env
on:
  push:
env:
  NODE_VERSION: 20
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      CI: true
    steps:
      - run: echo $NODE_VERSION
        env:
          DEBUG: true
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.env).toBeDefined();
      expect(workflow.env!.NODE_VERSION).toBe(20);
      expect(workflow.jobs.build.env!.CI).toBe(true);
    });

    it('should parse workflow with step conditions', () => {
      const yaml = `
name: Conditional
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Only on main
        run: echo "Main branch"
        if: github.ref == 'refs/heads/main'
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.jobs.build.steps[0].if).toBe("github.ref == 'refs/heads/main'");
    });

    it('should parse workflow with uses action', () => {
      const yaml = `
name: With Actions
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.jobs.build.steps[0].uses).toBe('actions/checkout@v4');
      expect(workflow.jobs.build.steps[1].with).toBeDefined();
    });

    it('should parse workflow with step timeout and continue-on-error', () => {
      const yaml = `
name: Step Options
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
        timeout-minutes: 10
        continue-on-error: true
`;
      const workflow = parseWorkflow(yaml);
      expect(workflow.jobs.build.steps[0]['timeout-minutes']).toBe(10);
      expect(workflow.jobs.build.steps[0]['continue-on-error']).toBe(true);
    });
  });

  describe('validateWorkflow', () => {
    it('should throw error for missing name', () => {
      const raw = {
        on: { push: {} },
        jobs: { build: { 'runs-on': 'ubuntu-latest', steps: [{ run: 'echo hi' }] } },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for missing on trigger', () => {
      const raw = {
        name: 'Test',
        jobs: { build: { 'runs-on': 'ubuntu-latest', steps: [{ run: 'echo hi' }] } },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for missing jobs', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for empty jobs', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {},
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for missing runs-on', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          build: { steps: [{ run: 'echo hi' }] },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for missing steps', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          build: { 'runs-on': 'ubuntu-latest' },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for step without uses or run', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            steps: [{ name: 'Empty step' }],
          },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for step with both uses and run', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            steps: [{ uses: 'actions/checkout@v4', run: 'echo hi' }],
          },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for invalid trigger event', () => {
      const raw = {
        name: 'Test',
        on: { invalid_event: {} },
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            steps: [{ run: 'echo hi' }],
          },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for nonexistent job dependency', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            needs: 'nonexistent',
            steps: [{ run: 'echo hi' }],
          },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for self-referencing job dependency', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            needs: 'build',
            steps: [{ run: 'echo hi' }],
          },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should throw error for duplicate step ids', () => {
      const raw = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            steps: [
              { id: 'step1', run: 'echo 1' },
              { id: 'step1', run: 'echo 2' },
            ],
          },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });
  });

  describe('circular dependency detection', () => {
    it('should detect simple circular dependency', () => {
      const raw = {
        name: 'Circular',
        on: { push: {} },
        jobs: {
          a: { 'runs-on': 'ubuntu-latest', needs: 'b', steps: [{ run: 'echo a' }] },
          b: { 'runs-on': 'ubuntu-latest', needs: 'a', steps: [{ run: 'echo b' }] },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
      try {
        validateWorkflow(raw);
      } catch (e) {
        expect(e).toBeInstanceOf(WorkflowValidationError);
        const error = e as WorkflowValidationError;
        expect(error.errors.some(err => err.message.includes('Circular dependency'))).toBe(true);
      }
    });

    it('should detect multi-node circular dependency', () => {
      const raw = {
        name: 'Circular',
        on: { push: {} },
        jobs: {
          a: { 'runs-on': 'ubuntu-latest', needs: 'c', steps: [{ run: 'echo a' }] },
          b: { 'runs-on': 'ubuntu-latest', needs: 'a', steps: [{ run: 'echo b' }] },
          c: { 'runs-on': 'ubuntu-latest', needs: 'b', steps: [{ run: 'echo c' }] },
        },
      };
      
      expect(() => validateWorkflow(raw)).toThrow(WorkflowValidationError);
    });

    it('should allow valid dependency chains', () => {
      const raw = {
        name: 'Valid Chain',
        on: { push: {} },
        jobs: {
          a: { 'runs-on': 'ubuntu-latest', steps: [{ run: 'echo a' }] },
          b: { 'runs-on': 'ubuntu-latest', needs: 'a', steps: [{ run: 'echo b' }] },
          c: { 'runs-on': 'ubuntu-latest', needs: 'b', steps: [{ run: 'echo c' }] },
          d: { 'runs-on': 'ubuntu-latest', needs: ['a', 'b', 'c'], steps: [{ run: 'echo d' }] },
        },
      };
      
      expect(() => validateWorkflow(raw)).not.toThrow();
    });
  });

  describe('validateWorkflowFile', () => {
    it('should return valid result for valid workflow', () => {
      const yaml = `
name: Valid
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
      const result = validateWorkflowFile(yaml);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid workflow', () => {
      const yaml = `
name: Invalid
on:
  push:
jobs:
`;
      const result = validateWorkflowFile(yaml);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateExpression', () => {
    it('should validate balanced parentheses', () => {
      const expr = "${{ github.ref == 'refs/heads/main' }}";
      const errors = validateExpression(expr);
      expect(errors).toHaveLength(0);
    });

    it('should detect unbalanced parentheses', () => {
      const expr = "${{ contains(github.ref, 'main' }}";
      const errors = validateExpression(expr);
      expect(errors.some(e => e.message.includes('parenthes'))).toBe(true);
    });

    it('should warn about empty expressions', () => {
      const expr = '${{  }}';
      const errors = validateExpression(expr);
      expect(errors.some(e => e.message.includes('Empty'))).toBe(true);
    });
  });

  describe('loadWorkflows', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should return empty array if workflows directory does not exist', () => {
      const workflows = loadWorkflows(tempDir);
      expect(workflows).toHaveLength(0);
    });

    it('should load workflows from .wit/workflows directory', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(workflowsDir, 'ci.yml'),
        `
name: CI
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`
      );
      
      const workflows = loadWorkflows(tempDir);
      expect(workflows).toHaveLength(1);
      expect(workflows[0].workflow.name).toBe('CI');
    });

    it('should load multiple workflow files', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(workflowsDir, 'ci.yml'),
        `
name: CI
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`
      );
      
      fs.writeFileSync(
        path.join(workflowsDir, 'deploy.yaml'),
        `
name: Deploy
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: echo deploy
`
      );
      
      const workflows = loadWorkflows(tempDir);
      expect(workflows).toHaveLength(2);
      expect(workflows.map(w => w.workflow.name).sort()).toEqual(['CI', 'Deploy']);
    });

    it('should ignore non-yaml files', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(workflowsDir, 'ci.yml'),
        `
name: CI
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`
      );
      
      fs.writeFileSync(path.join(workflowsDir, 'readme.txt'), 'Not a workflow');
      
      const workflows = loadWorkflows(tempDir);
      expect(workflows).toHaveLength(1);
    });

    it('should throw WorkflowLoadError for invalid workflow file', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(workflowsDir, 'invalid.yml'),
        `
name: Invalid
# Missing on and jobs
`
      );
      
      expect(() => loadWorkflows(tempDir)).toThrow(WorkflowLoadError);
    });
  });

  describe('loadWorkflowFile', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should load a single workflow file', () => {
      const filePath = path.join(tempDir, 'workflow.yml');
      fs.writeFileSync(
        filePath,
        `
name: Single
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`
      );
      
      const parsed = loadWorkflowFile(filePath);
      expect(parsed.workflow.name).toBe('Single');
      expect(parsed.filePath).toBe(filePath);
    });

    it('should throw WorkflowLoadError for non-existent file', () => {
      expect(() => loadWorkflowFile('/nonexistent/file.yml')).toThrow(WorkflowLoadError);
    });
  });

  describe('CIEngine', () => {
    let tempDir: string;
    let engine: CIEngine;

    beforeEach(() => {
      tempDir = createTempDir();
      engine = createCIEngine(tempDir);
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should create engine with createCIEngine', () => {
      expect(engine).toBeInstanceOf(CIEngine);
    });

    it('should initialize workflows directory', () => {
      engine.init();
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      expect(fs.existsSync(workflowsDir)).toBe(true);
    });

    it('should create sample workflow on init', () => {
      engine.init();
      const samplePath = path.join(tempDir, '.wit', 'workflows', 'ci.yml.sample');
      expect(fs.existsSync(samplePath)).toBe(true);
    });

    it('should load workflows', () => {
      engine.init();
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'test.yml'),
        `
name: Test
on:
  push:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`
      );
      
      const workflows = engine.load();
      expect(workflows).toHaveLength(1);
    });

    it('should get workflow by name', () => {
      engine.init();
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'test.yml'),
        `
name: Test Workflow
on:
  push:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`
      );
      
      engine.load();
      const workflow = engine.getWorkflow('Test Workflow');
      expect(workflow).toBeDefined();
      expect(workflow!.workflow.name).toBe('Test Workflow');
    });

    it('should find matching workflows for push trigger', () => {
      engine.init();
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'push.yml'),
        `
name: Push CI
on:
  push:
    branches:
      - main
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`
      );
      
      engine.load();
      
      const matches = engine.findMatchingWorkflows({
        event: 'push',
        branch: 'main',
      });
      expect(matches).toHaveLength(1);
      
      const noMatches = engine.findMatchingWorkflows({
        event: 'push',
        branch: 'develop',
      });
      expect(noMatches).toHaveLength(0);
    });

    it('should find matching workflows for pull_request trigger', () => {
      engine.init();
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'pr.yml'),
        `
name: PR CI
on:
  pull_request:
    branches:
      - main
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`
      );
      
      engine.load();
      
      const matches = engine.findMatchingWorkflows({
        event: 'pull_request',
        branch: 'main',
      });
      expect(matches).toHaveLength(1);
    });

    it('should match workflow_dispatch trigger', () => {
      engine.init();
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'manual.yml'),
        `
name: Manual
on:
  workflow_dispatch:
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: echo manual
`
      );
      
      engine.load();
      
      const matches = engine.findMatchingWorkflows({
        event: 'workflow_dispatch',
      });
      expect(matches).toHaveLength(1);
    });

    it('should get job order based on dependencies', () => {
      const yaml = `
name: Ordered
on:
  push:
jobs:
  deploy:
    runs-on: ubuntu-latest
    needs:
      - build
      - test
    steps:
      - run: echo deploy
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - run: echo test
`;
      const workflow = parseWorkflow(yaml);
      const order = engine.getJobOrder(workflow);
      
      // build should come before test and deploy
      expect(order.indexOf('build')).toBeLessThan(order.indexOf('test'));
      expect(order.indexOf('build')).toBeLessThan(order.indexOf('deploy'));
      // test should come before deploy
      expect(order.indexOf('test')).toBeLessThan(order.indexOf('deploy'));
    });

    it('should get parallel jobs', () => {
      const yaml = `
name: Parallel
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: echo lint
  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - run: echo test
  deploy:
    runs-on: ubuntu-latest
    needs:
      - build
      - test
    steps:
      - run: echo deploy
`;
      const workflow = parseWorkflow(yaml);
      
      // Initially, build and lint can run in parallel
      const initial = engine.getParallelJobs(workflow, new Set());
      expect(initial).toContain('build');
      expect(initial).toContain('lint');
      expect(initial).not.toContain('test');
      expect(initial).not.toContain('deploy');
      
      // After build completes, test can run
      const afterBuild = engine.getParallelJobs(workflow, new Set(['build']));
      expect(afterBuild).toContain('lint');
      expect(afterBuild).toContain('test');
      expect(afterBuild).not.toContain('deploy');
      
      // After build and test complete, deploy can run
      const afterBuildAndTest = engine.getParallelJobs(workflow, new Set(['build', 'test']));
      expect(afterBuildAndTest).toContain('lint');
      expect(afterBuildAndTest).toContain('deploy');
    });

    it('should validate workflow content', () => {
      const valid = engine.validate(`
name: Valid
on:
  push:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`);
      expect(valid.valid).toBe(true);
      
      const invalid = engine.validate(`
name: Invalid
# missing on and jobs
`);
      expect(invalid.valid).toBe(false);
    });
  });

  describe('trigger matching', () => {
    let tempDir: string;
    let engine: CIEngine;

    beforeEach(() => {
      tempDir = createTempDir();
      engine = createCIEngine(tempDir);
      engine.init();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should match glob patterns in branches', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'glob.yml'),
        `
name: Glob Test
on:
  push:
    branches:
      - 'feature/*'
      - 'release/**'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`
      );
      
      engine.load();
      
      expect(engine.findMatchingWorkflows({ event: 'push', branch: 'feature/foo' })).toHaveLength(1);
      expect(engine.findMatchingWorkflows({ event: 'push', branch: 'feature/bar/baz' })).toHaveLength(0);
      expect(engine.findMatchingWorkflows({ event: 'push', branch: 'release/v1' })).toHaveLength(1);
      expect(engine.findMatchingWorkflows({ event: 'push', branch: 'release/v1/patch' })).toHaveLength(1);
      expect(engine.findMatchingWorkflows({ event: 'push', branch: 'main' })).toHaveLength(0);
    });

    it('should respect branches-ignore', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'ignore.yml'),
        `
name: Ignore Test
on:
  push:
    branches-ignore:
      - 'wip/*'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`
      );
      
      engine.load();
      
      expect(engine.findMatchingWorkflows({ event: 'push', branch: 'main' })).toHaveLength(1);
      expect(engine.findMatchingWorkflows({ event: 'push', branch: 'wip/foo' })).toHaveLength(0);
    });

    it('should match path patterns', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'paths.yml'),
        `
name: Paths Test
on:
  push:
    paths:
      - 'src/**'
      - '*.js'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`
      );
      
      engine.load();
      
      expect(engine.findMatchingWorkflows({ 
        event: 'push', 
        branch: 'main',
        paths: ['src/index.ts'] 
      })).toHaveLength(1);
      
      expect(engine.findMatchingWorkflows({ 
        event: 'push', 
        branch: 'main',
        paths: ['package.json'] 
      })).toHaveLength(0);
    });

    it('should match PR types', () => {
      const workflowsDir = path.join(tempDir, '.wit', 'workflows');
      fs.writeFileSync(
        path.join(workflowsDir, 'pr-types.yml'),
        `
name: PR Types Test
on:
  pull_request:
    types:
      - opened
      - synchronize
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`
      );
      
      engine.load();
      
      expect(engine.findMatchingWorkflows({ 
        event: 'pull_request', 
        branch: 'main',
        prType: 'opened' 
      })).toHaveLength(1);
      
      expect(engine.findMatchingWorkflows({ 
        event: 'pull_request', 
        branch: 'main',
        prType: 'closed' 
      })).toHaveLength(0);
    });
  });
});
