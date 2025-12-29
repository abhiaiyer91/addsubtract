/**
 * Commit Message Evaluator
 * 
 * Evaluates the quality of AI-generated commit messages.
 */

import { Evaluator } from './evaluator.js';
import type { EvalCriterion, CommitMessageEvalInput } from './types.js';

/**
 * Conventional commit prefixes
 */
const CONVENTIONAL_PREFIXES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 
  'perf', 'test', 'build', 'ci', 'chore', 'revert'
];

/**
 * Words that indicate a vague commit message
 */
const VAGUE_WORDS = [
  'update', 'fix', 'change', 'modify', 'stuff',
  'things', 'misc', 'various', 'minor', 'wip'
];

/**
 * Evaluator for commit message quality
 */
export class CommitMessageEvaluator extends Evaluator<CommitMessageEvalInput> {
  constructor() {
    super('commit-message', {
      passThreshold: 0.7,
    });
  }

  protected async evaluateCriteria(input: CommitMessageEvalInput): Promise<EvalCriterion[]> {
    const { message, diff, files } = input;
    const criteria: EvalCriterion[] = [];

    // 1. Format: Check conventional commit format
    criteria.push(this.checkConventionalFormat(message));

    // 2. Length: Check message length
    criteria.push(this.checkLength(message));

    // 3. Descriptiveness: Check if message is descriptive
    criteria.push(this.checkDescriptiveness(message));

    // 4. Accuracy: Check if message matches the diff
    criteria.push(await this.checkAccuracy(message, diff, files));

    // 5. Grammar: Basic grammar checks
    criteria.push(this.checkGrammar(message));

    // 6. No vague words
    criteria.push(this.checkNoVagueWords(message));

    return criteria;
  }

  /**
   * Check conventional commit format
   */
  private checkConventionalFormat(message: string): EvalCriterion {
    const firstLine = message.split('\n')[0];
    const hasPrefix = CONVENTIONAL_PREFIXES.some(p => 
      firstLine.toLowerCase().startsWith(`${p}:`) ||
      firstLine.toLowerCase().startsWith(`${p}(`)
    );

    return {
      name: 'Conventional Format',
      description: 'Uses conventional commit format (feat:, fix:, etc.)',
      score: hasPrefix ? 1 : 0,
      passed: hasPrefix,
      feedback: hasPrefix 
        ? undefined 
        : 'Use conventional commit format: feat:, fix:, docs:, etc.',
    };
  }

  /**
   * Check message length
   */
  private checkLength(message: string): EvalCriterion {
    const firstLine = message.split('\n')[0];
    const length = firstLine.length;
    
    // Ideal: 50-72 characters for subject
    let score = 1;
    let feedback: string | undefined;
    
    if (length < 10) {
      score = 0;
      feedback = 'Message is too short. Be more descriptive.';
    } else if (length < 20) {
      score = 0.5;
      feedback = 'Message could be more descriptive.';
    } else if (length > 72) {
      score = 0.7;
      feedback = 'Subject line should be under 72 characters.';
    } else if (length > 100) {
      score = 0.3;
      feedback = 'Subject line is too long. Keep under 72 characters.';
    }

    return {
      name: 'Appropriate Length',
      description: 'Subject line is between 20-72 characters',
      score,
      passed: score >= 0.7,
      feedback,
    };
  }

  /**
   * Check if message is descriptive
   */
  private checkDescriptiveness(message: string): EvalCriterion {
    const firstLine = message.split('\n')[0].toLowerCase();
    
    // Remove prefix for analysis
    const content = firstLine.replace(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)[:(].*?[):]?\s*/i, '');
    
    // Check for specific indicators of good description
    const hasAction = /\b(add|remove|update|fix|implement|refactor|improve|optimize|handle|support)\b/i.test(content);
    const hasWhat = content.split(' ').length >= 3;
    const isNotGeneric = !VAGUE_WORDS.some(w => content === w);
    
    const score = (hasAction ? 0.4 : 0) + (hasWhat ? 0.4 : 0) + (isNotGeneric ? 0.2 : 0);

    return {
      name: 'Descriptive Content',
      description: 'Message describes what was done specifically',
      score,
      passed: score >= 0.7,
      feedback: score < 0.7 
        ? 'Be more specific about what was changed and why.'
        : undefined,
    };
  }

  /**
   * Check if message accurately describes the diff
   */
  private async checkAccuracy(
    message: string,
    diff: string,
    files?: string[]
  ): Promise<EvalCriterion> {
    // Simple heuristic: check if changed files are mentioned
    let score = 0.5; // Default to neutral
    
    if (files && files.length > 0) {
      const messageWords = message.toLowerCase().split(/\W+/);
      
      // Check if any file names or directories are mentioned
      const mentionsFiles = files.some(file => {
        const parts = file.toLowerCase().split('/');
        return parts.some(part => 
          messageWords.some(word => 
            part.includes(word) || word.includes(part.replace(/\.\w+$/, ''))
          )
        );
      });
      
      if (mentionsFiles) {
        score = 0.8;
      }
    }
    
    // Check if action words match diff patterns
    if (diff) {
      const hasAdditions = diff.includes('+');
      const hasDeletions = diff.includes('-');
      
      const mentionsAdd = /\b(add|create|implement|introduce)\b/i.test(message);
      const mentionsRemove = /\b(remove|delete|drop)\b/i.test(message);
      const mentionsUpdate = /\b(update|change|modify|fix|refactor)\b/i.test(message);
      
      if ((hasAdditions && !hasDeletions && mentionsAdd) ||
          (hasDeletions && !hasAdditions && mentionsRemove) ||
          (hasAdditions && hasDeletions && (mentionsUpdate || mentionsAdd))) {
        score += 0.2;
      }
    }
    
    score = Math.min(1, score);

    return {
      name: 'Accuracy',
      description: 'Message accurately describes the changes',
      score,
      passed: score >= 0.6,
      feedback: score < 0.6 
        ? 'Message should better reflect the actual changes made.'
        : undefined,
    };
  }

  /**
   * Basic grammar check
   */
  private checkGrammar(message: string): EvalCriterion {
    const firstLine = message.split('\n')[0];
    let score = 1;
    let feedback: string | undefined;
    
    // Check for imperative mood (shouldn't start with -ed, -ing)
    const afterPrefix = firstLine.replace(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)[:(].*?[):]?\s*/i, '');
    
    if (/^(added|fixed|updated|changed|modified)/i.test(afterPrefix)) {
      score -= 0.3;
      feedback = 'Use imperative mood: "Add feature" not "Added feature"';
    }
    
    // Check for proper capitalization after prefix
    const firstWord = afterPrefix.split(' ')[0];
    if (firstWord && firstWord[0] !== firstWord[0].toLowerCase()) {
      // Starts with capital after prefix - might be intentional
    }
    
    // Check for periods at end of subject
    if (firstLine.endsWith('.')) {
      score -= 0.2;
      feedback = (feedback ? feedback + ' ' : '') + 'No period at end of subject line.';
    }

    return {
      name: 'Grammar & Style',
      description: 'Follows commit message style guidelines',
      score,
      passed: score >= 0.7,
      feedback,
    };
  }

  /**
   * Check for vague words
   */
  private checkNoVagueWords(message: string): EvalCriterion {
    const firstLine = message.split('\n')[0].toLowerCase();
    const afterPrefix = firstLine.replace(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)[:(].*?[):]?\s*/i, '');
    
    // Check if the entire message is just a vague word
    const isOnlyVague = VAGUE_WORDS.includes(afterPrefix.trim());
    
    // Check if message contains mainly vague words
    const words = afterPrefix.split(/\s+/);
    const vagueCount = words.filter(w => VAGUE_WORDS.includes(w)).length;
    const vagueRatio = words.length > 0 ? vagueCount / words.length : 0;

    let score = 1;
    let feedback: string | undefined;
    
    if (isOnlyVague) {
      score = 0;
      feedback = 'Message is too vague. Describe what was actually changed.';
    } else if (vagueRatio > 0.5) {
      score = 0.3;
      feedback = 'Message contains too many vague words. Be more specific.';
    } else if (vagueRatio > 0.25) {
      score = 0.7;
      feedback = 'Consider using more specific language.';
    }

    return {
      name: 'Specificity',
      description: 'Message is specific, not vague',
      score,
      passed: score >= 0.7,
      feedback,
    };
  }
}

/**
 * Create a commit message evaluator
 */
export function createCommitMessageEvaluator(): CommitMessageEvaluator {
  return new CommitMessageEvaluator();
}
