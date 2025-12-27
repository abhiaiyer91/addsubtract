# wit AI Examples

This guide shows how to use wit's AI-powered features using `@mastra/core`.

## Setup

First, set up your API key:

```bash
# For OpenAI (GPT-4o, etc.)
export OPENAI_API_KEY=sk-your-key-here

# OR for Anthropic (Claude)
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional: Use a different model
export WIT_AI_MODEL=anthropic/claude-opus-4-5
```

Check your configuration:

```bash
wit ai status
```

---

## 1. Natural Language Commands

Ask questions or give commands in plain English:

```bash
# Check status
wit ai "what files have I changed?"
wit ai "show me unstaged changes"

# View history
wit ai "show me the last 5 commits"
wit ai "what did I commit yesterday?"

# Branch operations
wit ai "what branch am I on?"
wit ai "list all branches"
wit ai "switch to the main branch"

# Search
wit ai "find commits mentioning 'login'"
wit ai "search for files containing 'TODO'"
```

---

## 2. AI Commit Messages

Generate meaningful commit messages based on your changes:

```bash
# First, stage your changes
wit add .

# Generate a commit message
wit ai commit

# Output:
# 📝 Suggested commit message:
# ────────────────────────────────────────────────────────────────
# feat: add user authentication middleware
# 
# - Implement JWT token validation
# - Add role-based access control
# - Create auth error handling
# ────────────────────────────────────────────────────────────────
```

### Options

```bash
# Stage all tracked files AND generate message
wit ai commit -a

# Generate AND execute the commit
wit ai commit -x

# Stage all, generate, and commit in one command
wit ai commit -a -x
```

---

## 3. AI Code Review

Get AI feedback on your changes:

```bash
# Review all changes (staged + unstaged)
wit ai review

# Review only staged changes
wit ai review --staged
```

Example output:

```
🔍 Reviewing changes...

## Code Review Summary

### Issues Found

1. **Warning** - `src/auth.ts:42`
   Missing null check before accessing `user.email`
   Suggestion: Add optional chaining: `user?.email`

2. **Info** - `src/utils.ts:15`
   Consider using const instead of let for `config`

### Security Concerns
- API key is being logged in debug mode (line 78)

### Suggestions
- Add input validation for the email field
- Consider adding rate limiting to the auth endpoint
```

---

## 4. Explain Commits

Understand what a commit does:

```bash
# Explain the latest commit
wit ai explain

# Explain a specific commit
wit ai explain HEAD~3
wit ai explain abc1234
```

Example output:

```
📖 Explaining commit...

## Commit abc1234: "refactor: extract validation logic"

This commit reorganizes the validation code by:

1. **What it does**: Extracts inline validation logic from the 
   UserController into a dedicated ValidationService class.

2. **Why it was made**: This separation of concerns makes the code
   more testable and follows the Single Responsibility Principle.

3. **What it affects**: 
   - `src/controllers/UserController.ts` (simplified)
   - `src/services/ValidationService.ts` (new file)
   - `src/tests/validation.test.ts` (new tests)
```

---

## 5. AI Conflict Resolution

Get help resolving merge conflicts:

```bash
# Start a merge
wit merge feature-branch

# If there are conflicts, ask for help
wit ai resolve

# Or resolve a specific file
wit ai resolve src/config.ts
```

Example output:

```
🔧 Resolving: src/config.ts

## Conflict Analysis

**Our version (main):**
- Sets `maxRetries` to 3
- Uses synchronous file loading

**Their version (feature-branch):**
- Sets `maxRetries` to 5
- Uses async file loading with error handling

## Recommended Resolution

I recommend keeping their version because:
1. Higher retry count improves reliability
2. Async loading prevents blocking the main thread
3. Their error handling is more robust

```typescript
// RESOLVED
export const config = {
  maxRetries: 5,
  async loadConfig() {
    try {
      return await fs.readFile('./config.json', 'utf8');
    } catch (error) {
      console.error('Config load failed:', error);
      return defaultConfig;
    }
  }
};
```

Would you like me to apply this resolution?
```

---

## 6. Undo with AI Help

Use wit's undo feature with AI guidance:

```bash
# See what can be undone
wit ai "what operations can I undo?"

# Preview undo
wit ai "show me what undo would do"

# Actually undo
wit undo
```

---

## Programmatic Usage

You can also use the AI features programmatically:

```typescript
import { getTsgitAgent, createTsgitMastra } from 'wit/ai';

// Create a Mastra instance
const mastra = createTsgitMastra({
  model: 'openai/gpt-4o',
  verbose: true,
});

// Get the agent
const agent = getTsgitAgent();

// Generate a response
const result = await agent.generate('What files have changed?');
console.log(result.text);

// Stream a response
const stream = await agent.stream('Review my staged changes');
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

### Using Individual Tools

```typescript
import { witTools } from 'wit/ai';

// Get repository status
const status = await witTools.getStatus.execute({ path: '.' });
console.log('Modified files:', status.modified);

// Get diff
const diff = await witTools.getDiff.execute({ 
  staged: true,
  contextLines: 5 
});
console.log(diff.summary);

// Create a commit
const commit = await witTools.createCommit.execute({
  message: 'feat: add new feature',
  all: true,
});
console.log('Committed:', commit.shortHash);
```

---

## Tips

1. **Be specific**: "Show commits from last week that modified auth files" works better than "show commits"

2. **Use context**: The AI understands git concepts, so you can ask things like:
   - "What's the difference between my branch and main?"
   - "Have I already committed the login changes?"

3. **Iterate**: If the AI's first response isn't quite right, follow up with more details

4. **Commit messages**: The AI follows conventional commits format. For best results:
   - Stage related changes together
   - Don't mix unrelated changes in one commit

5. **Code review**: Run `wit ai review` before pushing to catch issues early

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for GPT models | - |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models | - |
| `WIT_AI_MODEL` | Model to use | `openai/gpt-4o` |

---

## Supported Models

The AI integration uses `@mastra/core` which supports:

- **OpenAI**: `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/gpt-4-turbo`
- **Anthropic**: `anthropic/claude-opus-4-5`, `anthropic/claude-3-haiku`
- **And more** via the Mastra model router

Example:

```bash
# Use Claude
export WIT_AI_MODEL=anthropic/claude-opus-4-5
export ANTHROPIC_API_KEY=sk-ant-...

# Use GPT-4o-mini (faster, cheaper)
export WIT_AI_MODEL=openai/gpt-4o-mini
export OPENAI_API_KEY=sk-...
```
