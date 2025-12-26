/**
 * CI/CD Workflow Parser
 * 
 * Parses and validates workflow YAML files from .wit/workflows/*.yml
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Workflow,
  Job,
  Step,
  WorkflowTrigger,
  ParsedWorkflow,
  ValidationError,
  ValidationResult,
  TRIGGER_EVENTS,
  SHELL_TYPES,
  EXPRESSION_PATTERN,
  ACTION_REFERENCE_PATTERN,
  CRON_PATTERN,
  TriggerEvent,
} from './types';

/**
 * Token types for YAML parsing
 */
interface YAMLLine {
  indent: number;
  content: string;
  isArrayItem: boolean;
  arrayItemContent: string;
  lineNumber: number;
}

/**
 * Simple YAML parser for workflow files
 * 
 * This is a lightweight YAML parser that handles the subset of YAML
 * syntax used in workflow files. For production, consider using
 * a full YAML library like 'yaml' or 'js-yaml'.
 */
export function parseYAML(content: string): unknown {
  const lines = content.split('\n');
  const parsedLines: YAMLLine[] = [];
  
  // Pre-process lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    const indent = line.search(/\S/);
    const isArrayItem = trimmed.startsWith('- ');
    const arrayItemContent = isArrayItem ? trimmed.slice(2) : '';
    
    parsedLines.push({
      indent,
      content: trimmed,
      isArrayItem,
      arrayItemContent,
      lineNumber: i,
    });
  }
  
  return parseYAMLLines(parsedLines, 0, parsedLines.length, -1);
}

/**
 * Parse a range of YAML lines into an object or array
 */
function parseYAMLLines(
  lines: YAMLLine[],
  start: number,
  end: number,
  parentIndent: number
): unknown {
  if (start >= end) return {};
  
  const result: Record<string, unknown> = {};
  let i = start;
  
  while (i < end) {
    const line = lines[i];
    
    // Skip lines with less or equal indent than parent (shouldn't happen in normal flow)
    if (line.indent <= parentIndent && parentIndent >= 0) {
      break;
    }
    
    if (line.isArrayItem) {
      // We're at the start of an array - this shouldn't happen at top level
      // but handle it gracefully
      i++;
      continue;
    }
    
    // Parse key-value pair
    const colonIndex = line.content.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }
    
    const key = line.content.slice(0, colonIndex).trim();
    const valueStr = line.content.slice(colonIndex + 1).trim();
    const currentIndent = line.indent;
    
    // Find the extent of this key's value
    let valueEnd = i + 1;
    while (valueEnd < end && lines[valueEnd].indent > currentIndent) {
      valueEnd++;
    }
    
    if (valueStr === '' || valueStr === '|' || valueStr === '>') {
      // Check if next line is an array or nested object
      if (i + 1 < end && lines[i + 1].indent > currentIndent) {
        if (lines[i + 1].isArrayItem) {
          // Parse array
          result[key] = parseYAMLArray(lines, i + 1, valueEnd, currentIndent);
        } else if (valueStr === '|' || valueStr === '>') {
          // Multiline string
          result[key] = parseMultilineString(lines, i + 1, valueEnd, currentIndent);
        } else {
          // Nested object
          result[key] = parseYAMLLines(lines, i + 1, valueEnd, currentIndent);
        }
      } else {
        // Empty value
        result[key] = valueStr === '' ? {} : '';
      }
    } else {
      // Simple value on same line
      result[key] = parseValue(valueStr);
    }
    
    i = valueEnd;
  }
  
  return result;
}

/**
 * Parse an array from YAML lines
 */
function parseYAMLArray(
  lines: YAMLLine[],
  start: number,
  end: number,
  parentIndent: number
): unknown[] {
  const result: unknown[] = [];
  let i = start;
  
  while (i < end) {
    const line = lines[i];
    
    if (line.indent <= parentIndent) {
      break;
    }
    
    if (!line.isArrayItem) {
      i++;
      continue;
    }
    
    const arrayItemIndent = line.indent;
    const content = line.arrayItemContent;
    
    // Find the extent of this array item
    let itemEnd = i + 1;
    while (itemEnd < end && 
           (lines[itemEnd].indent > arrayItemIndent || 
            (lines[itemEnd].indent === arrayItemIndent && !lines[itemEnd].isArrayItem))) {
      itemEnd++;
    }
    
    if (content === '') {
      // Empty array item - check if it's a nested structure
      if (i + 1 < end && lines[i + 1].indent > arrayItemIndent) {
        result.push(parseYAMLLines(lines, i + 1, itemEnd, arrayItemIndent));
      } else {
        result.push(null);
      }
    } else if (content.includes(':')) {
      // Object in array item
      const colonIndex = content.indexOf(':');
      const key = content.slice(0, colonIndex).trim();
      const valueStr = content.slice(colonIndex + 1).trim();
      
      const obj: Record<string, unknown> = {};
      
      if (valueStr === '') {
        // Nested value for this key
        if (i + 1 < end && lines[i + 1].indent > arrayItemIndent) {
          // Check if next indented content is for this key or sibling keys
          const nextLine = lines[i + 1];
          if (nextLine.isArrayItem) {
            obj[key] = parseYAMLArray(lines, i + 1, itemEnd, arrayItemIndent);
          } else {
            // Could be nested object for this key or sibling keys
            // Parse all as siblings of the first key
            const nested = parseYAMLLines(lines, i + 1, itemEnd, arrayItemIndent);
            if (typeof nested === 'object' && nested !== null) {
              Object.assign(obj, { [key]: {} }, nested);
            } else {
              obj[key] = nested;
            }
          }
        } else {
          obj[key] = {};
        }
      } else {
        obj[key] = parseValue(valueStr);
        
        // Check for additional properties in the array item
        if (i + 1 < end && lines[i + 1].indent > arrayItemIndent && !lines[i + 1].isArrayItem) {
          const additional = parseYAMLLines(lines, i + 1, itemEnd, arrayItemIndent);
          if (typeof additional === 'object' && additional !== null) {
            Object.assign(obj, additional);
          }
        }
      }
      
      result.push(obj);
    } else {
      // Simple value in array
      result.push(parseValue(content));
    }
    
    i = itemEnd;
  }
  
  return result;
}

/**
 * Parse a multiline string from YAML lines
 */
function parseMultilineString(
  lines: YAMLLine[],
  start: number,
  end: number,
  parentIndent: number
): string {
  const parts: string[] = [];
  
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (line.indent <= parentIndent) {
      break;
    }
    parts.push(line.content);
  }
  
  return parts.join('\n');
}

/**
 * Parse a YAML value string
 */
function parseValue(value: string): unknown {
  // Handle quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  
  // Handle booleans
  if (value === 'true' || value === 'True' || value === 'TRUE') {
    return true;
  }
  if (value === 'false' || value === 'False' || value === 'FALSE') {
    return false;
  }
  
  // Handle null
  if (value === 'null' || value === 'Null' || value === 'NULL' || value === '~') {
    return null;
  }
  
  // Handle numbers
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }
  
  // Handle inline arrays
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(v => parseValue(v.trim()));
  }
  
  // Handle inline objects
  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return {};
    const obj: Record<string, unknown> = {};
    const pairs = inner.split(',');
    for (const pair of pairs) {
      const [k, v] = pair.split(':').map(s => s.trim());
      if (k && v !== undefined) {
        obj[k] = parseValue(v);
      }
    }
    return obj;
  }
  
  // Default to string
  return value;
}

/**
 * Parse workflow YAML content into a Workflow object
 */
export function parseWorkflow(content: string): Workflow {
  const raw = parseYAML(content);
  return validateWorkflow(raw);
}

/**
 * Validate and type-check a raw parsed workflow
 */
export function validateWorkflow(raw: unknown): Workflow {
  const errors: ValidationError[] = [];
  
  if (!raw || typeof raw !== 'object') {
    throw new WorkflowValidationError('Workflow must be an object', [
      { message: 'Workflow must be an object', path: '', severity: 'error' },
    ]);
  }
  
  const obj = raw as Record<string, unknown>;
  
  // Validate name (required)
  if (!obj.name || typeof obj.name !== 'string') {
    errors.push({
      message: 'Workflow must have a "name" field',
      path: 'name',
      severity: 'error',
    });
  }
  
  // Validate 'on' trigger (required)
  if (!obj.on) {
    errors.push({
      message: 'Workflow must have an "on" trigger field',
      path: 'on',
      severity: 'error',
    });
  } else {
    const triggerErrors = validateTrigger(obj.on);
    errors.push(...triggerErrors);
  }
  
  // Validate jobs (required)
  if (!obj.jobs || typeof obj.jobs !== 'object') {
    errors.push({
      message: 'Workflow must have a "jobs" field',
      path: 'jobs',
      severity: 'error',
    });
  } else {
    const jobsObj = obj.jobs as Record<string, unknown>;
    const jobNames = Object.keys(jobsObj);
    
    if (jobNames.length === 0) {
      errors.push({
        message: 'Workflow must have at least one job',
        path: 'jobs',
        severity: 'error',
      });
    }
    
    // Validate each job
    for (const jobName of jobNames) {
      const jobErrors = validateJob(jobsObj[jobName], jobName, jobNames);
      errors.push(...jobErrors);
    }
    
    // Check for circular dependencies
    const cycleErrors = detectJobCycles(jobsObj);
    errors.push(...cycleErrors);
  }
  
  // Validate env if present
  if (obj.env !== undefined && typeof obj.env !== 'object') {
    errors.push({
      message: 'env must be an object',
      path: 'env',
      severity: 'error',
    });
  }
  
  if (errors.filter(e => e.severity === 'error').length > 0) {
    throw new WorkflowValidationError(
      'Workflow validation failed',
      errors
    );
  }
  
  // Normalize the trigger
  const normalizedTrigger = normalizeTrigger(obj.on);
  
  return {
    name: obj.name as string,
    on: normalizedTrigger,
    env: obj.env as Record<string, string> | undefined,
    jobs: normalizeJobs(obj.jobs as Record<string, unknown>),
    defaults: obj.defaults as Workflow['defaults'],
    concurrency: obj.concurrency as Workflow['concurrency'],
    permissions: obj.permissions as Workflow['permissions'],
  };
}

/**
 * Validate trigger configuration
 */
function validateTrigger(trigger: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Handle string trigger (e.g., "push")
  if (typeof trigger === 'string') {
    if (!TRIGGER_EVENTS.includes(trigger as TriggerEvent)) {
      errors.push({
        message: `Invalid trigger event: "${trigger}"`,
        path: 'on',
        severity: 'error',
      });
    }
    return errors;
  }
  
  // Handle array trigger (e.g., ["push", "pull_request"])
  if (Array.isArray(trigger)) {
    for (let i = 0; i < trigger.length; i++) {
      if (typeof trigger[i] !== 'string') {
        errors.push({
          message: `Trigger event at index ${i} must be a string`,
          path: `on[${i}]`,
          severity: 'error',
        });
      } else if (!TRIGGER_EVENTS.includes(trigger[i] as TriggerEvent)) {
        errors.push({
          message: `Invalid trigger event: "${trigger[i]}"`,
          path: `on[${i}]`,
          severity: 'error',
        });
      }
    }
    return errors;
  }
  
  // Handle object trigger
  if (typeof trigger === 'object' && trigger !== null) {
    const triggerObj = trigger as Record<string, unknown>;
    
    for (const eventName of Object.keys(triggerObj)) {
      if (!TRIGGER_EVENTS.includes(eventName as TriggerEvent)) {
        errors.push({
          message: `Invalid trigger event: "${eventName}"`,
          path: `on.${eventName}`,
          severity: 'error',
        });
      }
      
      // Validate schedule cron expressions
      if (eventName === 'schedule') {
        const schedules = triggerObj.schedule;
        if (Array.isArray(schedules)) {
          for (let i = 0; i < schedules.length; i++) {
            const schedule = schedules[i] as Record<string, unknown>;
            if (!schedule.cron || typeof schedule.cron !== 'string') {
              errors.push({
                message: 'Schedule entry must have a "cron" field',
                path: `on.schedule[${i}]`,
                severity: 'error',
              });
            } else if (!CRON_PATTERN.test(schedule.cron)) {
              errors.push({
                message: `Invalid cron expression: "${schedule.cron}"`,
                path: `on.schedule[${i}].cron`,
                severity: 'warning',
              });
            }
          }
        }
      }
    }
    
    return errors;
  }
  
  errors.push({
    message: 'Invalid trigger format',
    path: 'on',
    severity: 'error',
  });
  
  return errors;
}

/**
 * Validate a job definition
 */
function validateJob(job: unknown, jobName: string, allJobNames: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const basePath = `jobs.${jobName}`;
  
  if (!job || typeof job !== 'object') {
    errors.push({
      message: 'Job must be an object',
      path: basePath,
      severity: 'error',
    });
    return errors;
  }
  
  const jobObj = job as Record<string, unknown>;
  
  // Validate runs-on (required)
  if (!jobObj['runs-on']) {
    errors.push({
      message: 'Job must have a "runs-on" field',
      path: `${basePath}.runs-on`,
      severity: 'error',
    });
  }
  
  // Validate steps (required)
  if (!jobObj.steps) {
    errors.push({
      message: 'Job must have a "steps" field',
      path: `${basePath}.steps`,
      severity: 'error',
    });
  } else if (!Array.isArray(jobObj.steps)) {
    errors.push({
      message: 'steps must be an array',
      path: `${basePath}.steps`,
      severity: 'error',
    });
  } else if (jobObj.steps.length === 0) {
    errors.push({
      message: 'Job must have at least one step',
      path: `${basePath}.steps`,
      severity: 'error',
    });
  } else {
    // Validate each step
    const stepIds = new Set<string>();
    for (let i = 0; i < jobObj.steps.length; i++) {
      const stepErrors = validateStep(jobObj.steps[i], i, basePath, stepIds);
      errors.push(...stepErrors);
    }
  }
  
  // Validate needs (job dependencies)
  if (jobObj.needs !== undefined) {
    const needs = Array.isArray(jobObj.needs) ? jobObj.needs : [jobObj.needs];
    for (const need of needs) {
      if (typeof need !== 'string') {
        errors.push({
          message: 'Job dependency must be a string',
          path: `${basePath}.needs`,
          severity: 'error',
        });
      } else if (!allJobNames.includes(need)) {
        errors.push({
          message: `Job dependency "${need}" does not exist`,
          path: `${basePath}.needs`,
          severity: 'error',
        });
      } else if (need === jobName) {
        errors.push({
          message: 'Job cannot depend on itself',
          path: `${basePath}.needs`,
          severity: 'error',
        });
      }
    }
  }
  
  // Validate if condition expression
  if (jobObj.if !== undefined && typeof jobObj.if !== 'string') {
    errors.push({
      message: 'if condition must be a string',
      path: `${basePath}.if`,
      severity: 'error',
    });
  }
  
  // Validate env
  if (jobObj.env !== undefined && typeof jobObj.env !== 'object') {
    errors.push({
      message: 'env must be an object',
      path: `${basePath}.env`,
      severity: 'error',
    });
  }
  
  // Validate timeout-minutes
  if (jobObj['timeout-minutes'] !== undefined) {
    if (typeof jobObj['timeout-minutes'] !== 'number' || jobObj['timeout-minutes'] <= 0) {
      errors.push({
        message: 'timeout-minutes must be a positive number',
        path: `${basePath}.timeout-minutes`,
        severity: 'error',
      });
    }
  }
  
  return errors;
}

/**
 * Validate a step definition
 */
function validateStep(
  step: unknown,
  index: number,
  jobPath: string,
  stepIds: Set<string>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const basePath = `${jobPath}.steps[${index}]`;
  
  if (!step || typeof step !== 'object') {
    errors.push({
      message: 'Step must be an object',
      path: basePath,
      severity: 'error',
    });
    return errors;
  }
  
  const stepObj = step as Record<string, unknown>;
  
  // Step must have either 'uses' or 'run'
  if (!stepObj.uses && !stepObj.run) {
    errors.push({
      message: 'Step must have either "uses" or "run"',
      path: basePath,
      severity: 'error',
    });
  }
  
  // Cannot have both 'uses' and 'run'
  if (stepObj.uses && stepObj.run) {
    errors.push({
      message: 'Step cannot have both "uses" and "run"',
      path: basePath,
      severity: 'error',
    });
  }
  
  // Validate id uniqueness
  if (stepObj.id !== undefined) {
    if (typeof stepObj.id !== 'string') {
      errors.push({
        message: 'Step id must be a string',
        path: `${basePath}.id`,
        severity: 'error',
      });
    } else if (stepIds.has(stepObj.id)) {
      errors.push({
        message: `Duplicate step id: "${stepObj.id}"`,
        path: `${basePath}.id`,
        severity: 'error',
      });
    } else {
      stepIds.add(stepObj.id);
    }
  }
  
  // Validate uses (action reference)
  if (stepObj.uses !== undefined) {
    if (typeof stepObj.uses !== 'string') {
      errors.push({
        message: 'uses must be a string',
        path: `${basePath}.uses`,
        severity: 'error',
      });
    } else if (!ACTION_REFERENCE_PATTERN.test(stepObj.uses)) {
      // Allow docker:// references as well
      if (!stepObj.uses.startsWith('docker://')) {
        errors.push({
          message: `Invalid action reference: "${stepObj.uses}"`,
          path: `${basePath}.uses`,
          severity: 'warning',
        });
      }
    }
  }
  
  // Validate run
  if (stepObj.run !== undefined && typeof stepObj.run !== 'string') {
    errors.push({
      message: 'run must be a string',
      path: `${basePath}.run`,
      severity: 'error',
    });
  }
  
  // Validate shell
  if (stepObj.shell !== undefined) {
    if (typeof stepObj.shell !== 'string') {
      errors.push({
        message: 'shell must be a string',
        path: `${basePath}.shell`,
        severity: 'error',
      });
    } else if (!SHELL_TYPES.includes(stepObj.shell as typeof SHELL_TYPES[number])) {
      errors.push({
        message: `Invalid shell type: "${stepObj.shell}"`,
        path: `${basePath}.shell`,
        severity: 'warning',
      });
    }
  }
  
  // Validate if condition
  if (stepObj.if !== undefined && typeof stepObj.if !== 'string') {
    errors.push({
      message: 'if condition must be a string',
      path: `${basePath}.if`,
      severity: 'error',
    });
  }
  
  // Validate timeout-minutes
  if (stepObj['timeout-minutes'] !== undefined) {
    if (typeof stepObj['timeout-minutes'] !== 'number' || stepObj['timeout-minutes'] <= 0) {
      errors.push({
        message: 'timeout-minutes must be a positive number',
        path: `${basePath}.timeout-minutes`,
        severity: 'error',
      });
    }
  }
  
  // Validate continue-on-error
  if (stepObj['continue-on-error'] !== undefined && typeof stepObj['continue-on-error'] !== 'boolean') {
    errors.push({
      message: 'continue-on-error must be a boolean',
      path: `${basePath}.continue-on-error`,
      severity: 'error',
    });
  }
  
  return errors;
}

/**
 * Detect circular dependencies in job definitions
 */
function detectJobCycles(jobs: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function hasCycle(jobName: string, path: string[]): string[] | null {
    if (recursionStack.has(jobName)) {
      return [...path, jobName];
    }
    
    if (visited.has(jobName)) {
      return null;
    }
    
    visited.add(jobName);
    recursionStack.add(jobName);
    
    const job = jobs[jobName] as Record<string, unknown> | undefined;
    if (job && job.needs) {
      const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
      for (const dep of needs) {
        if (typeof dep === 'string') {
          const cycle = hasCycle(dep, [...path, jobName]);
          if (cycle) {
            return cycle;
          }
        }
      }
    }
    
    recursionStack.delete(jobName);
    return null;
  }
  
  for (const jobName of Object.keys(jobs)) {
    visited.clear();
    recursionStack.clear();
    const cycle = hasCycle(jobName, []);
    if (cycle) {
      errors.push({
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        path: 'jobs',
        severity: 'error',
      });
      break; // Only report one cycle
    }
  }
  
  return errors;
}

/**
 * Normalize trigger to WorkflowTrigger object
 */
function normalizeTrigger(trigger: unknown): WorkflowTrigger {
  if (typeof trigger === 'string') {
    return { [trigger]: {} } as WorkflowTrigger;
  }
  
  if (Array.isArray(trigger)) {
    const result: WorkflowTrigger = {};
    for (const event of trigger) {
      if (typeof event === 'string') {
        (result as Record<string, unknown>)[event] = {};
      }
    }
    return result;
  }
  
  return trigger as WorkflowTrigger;
}

/**
 * Normalize jobs to proper Job objects
 */
function normalizeJobs(jobs: Record<string, unknown>): Record<string, Job> {
  const result: Record<string, Job> = {};
  
  for (const [name, job] of Object.entries(jobs)) {
    const jobObj = job as Record<string, unknown>;
    
    result[name] = {
      name: jobObj.name as string | undefined,
      'runs-on': jobObj['runs-on'] as string | string[],
      needs: normalizeNeeds(jobObj.needs),
      if: jobObj.if as string | undefined,
      env: jobObj.env as Record<string, string> | undefined,
      steps: normalizeSteps(jobObj.steps as unknown[]),
      services: jobObj.services as Record<string, Job['services']>[string] | undefined,
      container: jobObj.container as Job['container'],
      outputs: jobObj.outputs as Record<string, string> | undefined,
      strategy: jobObj.strategy as Job['strategy'],
      'continue-on-error': jobObj['continue-on-error'] as boolean | undefined,
      'timeout-minutes': jobObj['timeout-minutes'] as number | undefined,
      concurrency: jobObj.concurrency as Job['concurrency'],
      permissions: jobObj.permissions as Job['permissions'],
      environment: jobObj.environment as Job['environment'],
      defaults: jobObj.defaults as Job['defaults'],
    };
  }
  
  return result;
}

/**
 * Normalize needs to string array or undefined
 */
function normalizeNeeds(needs: unknown): string[] | undefined {
  if (needs === undefined) {
    return undefined;
  }
  if (typeof needs === 'string') {
    return [needs];
  }
  if (Array.isArray(needs)) {
    return needs.filter(n => typeof n === 'string');
  }
  return undefined;
}

/**
 * Normalize steps to proper Step objects
 */
function normalizeSteps(steps: unknown[]): Step[] {
  return steps.map(step => {
    const stepObj = step as Record<string, unknown>;
    return {
      name: stepObj.name as string | undefined,
      id: stepObj.id as string | undefined,
      uses: stepObj.uses as string | undefined,
      run: stepObj.run as string | undefined,
      with: stepObj.with as Record<string, string | number | boolean> | undefined,
      env: stepObj.env as Record<string, string> | undefined,
      if: stepObj.if as string | undefined,
      'working-directory': stepObj['working-directory'] as string | undefined,
      shell: stepObj.shell as string | undefined,
      'continue-on-error': stepObj['continue-on-error'] as boolean | undefined,
      'timeout-minutes': stepObj['timeout-minutes'] as number | undefined,
    };
  });
}

/**
 * Load all workflow files from a repository
 */
export function loadWorkflows(repoPath: string): ParsedWorkflow[] {
  const workflowDir = path.join(repoPath, '.wit', 'workflows');
  const workflows: ParsedWorkflow[] = [];
  
  if (!fs.existsSync(workflowDir)) {
    return workflows;
  }
  
  const files = fs.readdirSync(workflowDir);
  
  for (const file of files) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) {
      continue;
    }
    
    const filePath = path.join(workflowDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    try {
      const workflow = parseWorkflow(content);
      workflows.push({
        workflow,
        filePath,
        rawContent: content,
      });
    } catch (error) {
      if (error instanceof WorkflowValidationError) {
        throw new WorkflowLoadError(
          `Failed to load workflow "${file}": ${error.message}`,
          filePath,
          error.errors
        );
      }
      throw error;
    }
  }
  
  return workflows;
}

/**
 * Load a single workflow file
 */
export function loadWorkflowFile(filePath: string): ParsedWorkflow {
  if (!fs.existsSync(filePath)) {
    throw new WorkflowLoadError(`Workflow file not found: ${filePath}`, filePath, []);
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  try {
    const workflow = parseWorkflow(content);
    return {
      workflow,
      filePath,
      rawContent: content,
    };
  } catch (error) {
    if (error instanceof WorkflowValidationError) {
      throw new WorkflowLoadError(
        `Failed to load workflow "${path.basename(filePath)}": ${error.message}`,
        filePath,
        error.errors
      );
    }
    throw error;
  }
}

/**
 * Validate a workflow and return validation result
 */
export function validateWorkflowFile(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  try {
    parseWorkflow(content);
    return { valid: true, errors: [], warnings: [] };
  } catch (error) {
    if (error instanceof WorkflowValidationError) {
      for (const err of error.errors) {
        if (err.severity === 'error') {
          errors.push(err);
        } else {
          warnings.push(err);
        }
      }
      return { valid: false, errors, warnings };
    }
    
    errors.push({
      message: error instanceof Error ? error.message : 'Unknown error',
      path: '',
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }
}

/**
 * Check if an expression contains valid syntax
 */
export function validateExpression(expression: string): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Check for balanced braces
  const matches = expression.match(EXPRESSION_PATTERN);
  if (!matches) {
    return errors;
  }
  
  for (const match of matches) {
    const inner = match.slice(3, -2).trim();
    
    // Check for empty expression
    if (!inner) {
      errors.push({
        message: 'Empty expression',
        path: '',
        severity: 'warning',
      });
      continue;
    }
    
    // Basic syntax checks (more could be added)
    // Check for unbalanced parentheses
    let parenCount = 0;
    for (const char of inner) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) {
        errors.push({
          message: 'Unbalanced parentheses in expression',
          path: '',
          severity: 'error',
        });
        break;
      }
    }
    
    if (parenCount > 0) {
      errors.push({
        message: 'Unclosed parentheses in expression',
        path: '',
        severity: 'error',
      });
    }
  }
  
  return errors;
}

/**
 * Custom error for workflow validation failures
 */
export class WorkflowValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ValidationError[]
  ) {
    super(message);
    this.name = 'WorkflowValidationError';
  }
}

/**
 * Custom error for workflow loading failures
 */
export class WorkflowLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly errors: ValidationError[]
  ) {
    super(message);
    this.name = 'WorkflowLoadError';
  }
}
