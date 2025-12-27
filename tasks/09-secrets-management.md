# Task: Secrets Management

## Objective
Implement secure secrets storage and injection for CI workflows, allowing users to store sensitive values (API keys, tokens, passwords) that are injected into workflow runs.

## Context

### Current State
- No secrets management system
- Sensitive values must be hardcoded or passed via environment
- No encryption for stored secrets
- No audit trail for secret access

### Desired State
- Repository-level and organization-level secrets
- Encrypted storage with envelope encryption
- Secrets injected as environment variables
- `${{ secrets.* }}` expression support
- Audit logging for secret access
- Masked output in logs

## Technical Requirements

### 1. Database Schema (`src/db/schema.ts`)

```typescript
export const secrets = pgTable('secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Either repoId OR orgId, not both
  repoId: uuid('repo_id').references(() => repositories.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  encryptedValue: text('encrypted_value').notNull(), // AES-256-GCM encrypted
  keyId: varchar('key_id', { length: 64 }).notNull(), // ID of encryption key used
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

// Unique constraint: one secret name per repo/org
// CREATE UNIQUE INDEX idx_secrets_repo_name ON secrets(repo_id, name) WHERE repo_id IS NOT NULL;
// CREATE UNIQUE INDEX idx_secrets_org_name ON secrets(org_id, name) WHERE org_id IS NOT NULL;

export const secretAuditLogs = pgTable('secret_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  secretId: uuid('secret_id').notNull().references(() => secrets.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 50 }).notNull(), // 'created', 'updated', 'deleted', 'accessed'
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  workflowRunId: uuid('workflow_run_id').references(() => workflowRuns.id, { onDelete: 'set null' }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### 2. Encryption Service (`src/core/encryption.ts`)

```typescript
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEYS_DIR = process.env.KEYS_DIR || path.join(process.env.HOME!, '.wit', 'keys');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

interface EncryptedData {
  keyId: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

class EncryptionService {
  private currentKeyId: string;
  private keys: Map<string, Buffer> = new Map();

  constructor() {
    this.loadKeys();
    this.currentKeyId = this.getCurrentKeyId();
  }

  private loadKeys(): void {
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
    }

    const keyFiles = fs.readdirSync(KEYS_DIR).filter(f => f.endsWith('.key'));
    
    for (const file of keyFiles) {
      const keyId = file.replace('.key', '');
      const keyPath = path.join(KEYS_DIR, file);
      const key = fs.readFileSync(keyPath);
      this.keys.set(keyId, key);
    }

    // Generate initial key if none exist
    if (this.keys.size === 0) {
      this.rotateKey();
    }
  }

  private getCurrentKeyId(): string {
    // Use most recent key (highest timestamp in name)
    const keyIds = Array.from(this.keys.keys()).sort().reverse();
    return keyIds[0];
  }

  /**
   * Generate a new encryption key
   */
  rotateKey(): string {
    const keyId = `key-${Date.now()}`;
    const key = crypto.randomBytes(KEY_LENGTH);
    
    const keyPath = path.join(KEYS_DIR, `${keyId}.key`);
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    
    this.keys.set(keyId, key);
    this.currentKeyId = keyId;
    
    console.log(`[Encryption] Generated new key: ${keyId}`);
    return keyId;
  }

  /**
   * Encrypt a value
   */
  encrypt(plaintext: string): EncryptedData {
    const key = this.keys.get(this.currentKeyId);
    if (!key) throw new Error('No encryption key available');

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();

    return {
      keyId: this.currentKeyId,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext,
    };
  }

  /**
   * Decrypt a value
   */
  decrypt(data: EncryptedData): string {
    const key = this.keys.get(data.keyId);
    if (!key) throw new Error(`Encryption key not found: ${data.keyId}`);

    const iv = Buffer.from(data.iv, 'base64');
    const authTag = Buffer.from(data.authTag, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(data.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }

  /**
   * Serialize encrypted data for storage
   */
  serialize(data: EncryptedData): string {
    return JSON.stringify(data);
  }

  /**
   * Deserialize encrypted data from storage
   */
  deserialize(serialized: string): EncryptedData {
    return JSON.parse(serialized);
  }
}

export const encryptionService = new EncryptionService();
```

### 3. Secrets Model (`src/db/models/secrets.ts`)

```typescript
import { db } from '../db';
import { secrets, secretAuditLogs } from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { encryptionService } from '../../core/encryption';

export interface CreateSecretInput {
  repoId?: string;
  orgId?: string;
  name: string;
  value: string;
  createdById: string;
}

class SecretsModel {
  async create(input: CreateSecretInput): Promise<{ id: string; name: string }> {
    const { repoId, orgId, name, value, createdById } = input;

    if (!repoId && !orgId) {
      throw new Error('Either repoId or orgId must be provided');
    }

    // Check if secret already exists
    const existing = await this.findByName(name, repoId, orgId);
    if (existing) {
      throw new Error(`Secret "${name}" already exists`);
    }

    // Encrypt the value
    const encrypted = encryptionService.encrypt(value);
    const serialized = encryptionService.serialize(encrypted);

    const [secret] = await db.insert(secrets).values({
      repoId,
      orgId,
      name,
      encryptedValue: serialized,
      keyId: encrypted.keyId,
      createdById,
    }).returning({ id: secrets.id, name: secrets.name });

    // Audit log
    await this.logAudit(secret.id, 'created', createdById);

    return secret;
  }

  async update(id: string, value: string, updatedById: string): Promise<void> {
    const encrypted = encryptionService.encrypt(value);
    const serialized = encryptionService.serialize(encrypted);

    await db.update(secrets)
      .set({
        encryptedValue: serialized,
        keyId: encrypted.keyId,
        updatedAt: new Date(),
      })
      .where(eq(secrets.id, id));

    await this.logAudit(id, 'updated', updatedById);
  }

  async delete(id: string, deletedById: string): Promise<void> {
    await this.logAudit(id, 'deleted', deletedById);
    await db.delete(secrets).where(eq(secrets.id, id));
  }

  async listForRepo(repoId: string): Promise<Array<{ id: string; name: string; createdAt: Date; updatedAt: Date }>> {
    return db
      .select({
        id: secrets.id,
        name: secrets.name,
        createdAt: secrets.createdAt,
        updatedAt: secrets.updatedAt,
      })
      .from(secrets)
      .where(eq(secrets.repoId, repoId));
  }

  async listForOrg(orgId: string): Promise<Array<{ id: string; name: string; createdAt: Date; updatedAt: Date }>> {
    return db
      .select({
        id: secrets.id,
        name: secrets.name,
        createdAt: secrets.createdAt,
        updatedAt: secrets.updatedAt,
      })
      .from(secrets)
      .where(eq(secrets.orgId, orgId));
  }

  /**
   * Get decrypted secrets for a workflow run
   */
  async getSecretsForRun(repoId: string, orgId?: string, runId?: string, accessorId?: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    // Get repo secrets
    const repoSecrets = await db
      .select()
      .from(secrets)
      .where(eq(secrets.repoId, repoId));

    for (const secret of repoSecrets) {
      const encrypted = encryptionService.deserialize(secret.encryptedValue);
      result[secret.name] = encryptionService.decrypt(encrypted);
      
      // Log access and update last used
      if (runId) {
        await this.logAudit(secret.id, 'accessed', accessorId, runId);
        await db.update(secrets)
          .set({ lastUsedAt: new Date() })
          .where(eq(secrets.id, secret.id));
      }
    }

    // Get org secrets (if applicable, repo secrets override)
    if (orgId) {
      const orgSecrets = await db
        .select()
        .from(secrets)
        .where(eq(secrets.orgId, orgId));

      for (const secret of orgSecrets) {
        if (!(secret.name in result)) { // Repo secrets take precedence
          const encrypted = encryptionService.deserialize(secret.encryptedValue);
          result[secret.name] = encryptionService.decrypt(encrypted);
          
          if (runId) {
            await this.logAudit(secret.id, 'accessed', accessorId, runId);
            await db.update(secrets)
              .set({ lastUsedAt: new Date() })
              .where(eq(secrets.id, secret.id));
          }
        }
      }
    }

    return result;
  }

  private async findByName(name: string, repoId?: string, orgId?: string) {
    if (repoId) {
      const [secret] = await db
        .select()
        .from(secrets)
        .where(and(eq(secrets.repoId, repoId), eq(secrets.name, name)));
      return secret;
    }
    if (orgId) {
      const [secret] = await db
        .select()
        .from(secrets)
        .where(and(eq(secrets.orgId, orgId), eq(secrets.name, name)));
      return secret;
    }
    return null;
  }

  private async logAudit(secretId: string, action: string, actorId?: string, runId?: string) {
    await db.insert(secretAuditLogs).values({
      secretId,
      action,
      actorId,
      workflowRunId: runId,
    });
  }

  async getAuditLog(secretId: string, limit = 50) {
    return db
      .select()
      .from(secretAuditLogs)
      .where(eq(secretAuditLogs.secretId, secretId))
      .orderBy(secretAuditLogs.createdAt)
      .limit(limit);
  }
}

export const secretsModel = new SecretsModel();
```

### 4. Update Executor (`src/ci/executor.ts`)

Inject secrets into execution context:

```typescript
import { secretsModel } from '../db/models/secrets';

class WorkflowExecutor {
  async execute(runId: string): Promise<void> {
    // Load secrets for this run
    const secrets = await secretsModel.getSecretsForRun(
      this.context.repoId,
      this.context.orgId,
      runId,
      this.context.triggeredById
    );
    
    // Add to context
    this.context.secrets = secrets;
    
    // Continue with execution...
  }

  private evaluateExpression(expr: string, context: ExecutionContext): any {
    // Handle secrets context
    if (expr.startsWith('secrets.')) {
      const secretName = expr.slice(8);
      const value = context.secrets?.[secretName];
      if (value === undefined) {
        console.warn(`[Executor] Secret not found: ${secretName}`);
        return '';
      }
      return value;
    }
    
    // ... other expression handling
  }
}
```

### 5. Log Masking (`src/ci/log-writer.ts`)

Mask secret values in logs:

```typescript
class LogWriter {
  private secretValues: Set<string> = new Set();

  setSecrets(secrets: Record<string, string>): void {
    this.secretValues.clear();
    for (const value of Object.values(secrets)) {
      if (value && value.length > 3) {
        this.secretValues.add(value);
      }
    }
  }

  async write(runId: string, jobName: string, stepNumber: number, content: string): Promise<void> {
    // Mask secrets in output
    let maskedContent = content;
    for (const secret of this.secretValues) {
      maskedContent = maskedContent.replaceAll(secret, '***');
    }

    // Write masked content
    // ... existing write logic
  }
}
```

### 6. API Endpoints (`src/api/trpc/routers/secrets.ts`)

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { secretsModel } from '../../db/models/secrets';
import { TRPCError } from '@trpc/server';

export const secretsRouter = router({
  // Create a secret
  create: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid().optional(),
      orgId: z.string().uuid().optional(),
      name: z.string().min(1).max(255).regex(/^[A-Z_][A-Z0-9_]*$/),
      value: z.string().min(1).max(65536),
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate access
      if (input.repoId) {
        const hasAccess = await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'admin');
        if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (input.orgId) {
        const hasAccess = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'admin');
        if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN' });
      }

      return secretsModel.create({
        ...input,
        createdById: ctx.user.id,
      });
    }),

  // Update a secret
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      value: z.string().min(1).max(65536),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get secret and validate access
      const secret = await secretsModel.findById(input.id);
      if (!secret) throw new TRPCError({ code: 'NOT_FOUND' });

      // Validate access...

      await secretsModel.update(input.id, input.value, ctx.user.id);
      return { success: true };
    }),

  // Delete a secret
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await secretsModel.delete(input.id, ctx.user.id);
      return { success: true };
    }),

  // List secrets (names only, not values)
  listForRepo: protectedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return secretsModel.listForRepo(input.repoId);
    }),

  listForOrg: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return secretsModel.listForOrg(input.orgId);
    }),

  // Get audit log
  getAuditLog: protectedProcedure
    .input(z.object({ secretId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return secretsModel.getAuditLog(input.secretId);
    }),
});
```

### 7. Web UI: Secrets Management (`apps/web/src/routes/repo/settings/secrets.tsx`)

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Key, Plus, Trash2, Eye, EyeOff, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export function SecretsSettings() {
  const { repoId } = useParams();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const utils = trpc.useUtils();
  const { data: secrets } = trpc.secrets.listForRepo.useQuery({ repoId: repoId! });

  const createMutation = trpc.secrets.create.useMutation({
    onSuccess: () => {
      utils.secrets.listForRepo.invalidate();
      setShowDialog(false);
      setName('');
      setValue('');
      toastSuccess('Secret created');
    },
    onError: (err) => toastError(err.message),
  });

  const updateMutation = trpc.secrets.update.useMutation({
    onSuccess: () => {
      utils.secrets.listForRepo.invalidate();
      setShowDialog(false);
      setEditingId(null);
      setValue('');
      toastSuccess('Secret updated');
    },
    onError: (err) => toastError(err.message),
  });

  const deleteMutation = trpc.secrets.delete.useMutation({
    onSuccess: () => {
      utils.secrets.listForRepo.invalidate();
      toastSuccess('Secret deleted');
    },
    onError: (err) => toastError(err.message),
  });

  const handleSave = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, value });
    } else {
      createMutation.mutate({ repoId: repoId!, name, value });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Repository Secrets
              </CardTitle>
              <CardDescription>
                Encrypted secrets available to workflows in this repository
              </CardDescription>
            </div>
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Secret
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {secrets?.length === 0 ? (
            <p className="text-muted-foreground">No secrets configured</p>
          ) : (
            <div className="space-y-2">
              {secrets?.map((secret) => (
                <div
                  key={secret.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <p className="font-mono font-medium">{secret.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatRelativeTime(secret.updatedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(secret.id);
                        setName(secret.name);
                        setValue('');
                        setShowDialog(true);
                      }}
                    >
                      Update
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Delete this secret?')) {
                          deleteMutation.mutate({ id: secret.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Update Secret' : 'New Secret'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingId && (
              <div>
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="MY_SECRET_KEY"
                  pattern="^[A-Z_][A-Z0-9_]*$"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Uppercase letters, numbers, and underscores only
                </p>
              </div>
            )}
            <div>
              <Label>Value</Label>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter secret value..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!value || (!editingId && !name)}>
              {editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

## Example Workflow

```yaml
name: Deploy
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to production
        env:
          API_KEY: ${{ secrets.DEPLOY_API_KEY }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          echo "Deploying with API key..."
          ./deploy.sh
```

## Files to Create/Modify
- `src/db/schema.ts` - Add secrets and audit tables
- `src/core/encryption.ts` - New file (encryption service)
- `src/db/models/secrets.ts` - New file (secrets model)
- `src/ci/executor.ts` - Inject secrets, evaluate expressions
- `src/ci/log-writer.ts` - Mask secrets in logs
- `src/api/trpc/routers/secrets.ts` - New file (secrets API)
- `src/api/trpc/routers/index.ts` - Register secrets router
- `apps/web/src/routes/repo/settings/secrets.tsx` - New file (secrets UI)

## Security Considerations
- Encryption keys stored with restricted permissions (0600)
- Secrets never returned in API responses (only names)
- Audit log tracks all access
- Log masking prevents accidental exposure
- Key rotation supported (old keys kept for decryption)

## Testing
1. Create a secret via UI
2. Verify encrypted in database
3. Create workflow using `${{ secrets.* }}`
4. Run workflow, verify secret injected
5. Check logs, verify secret masked
6. Update secret, verify old value gone
7. Delete secret, verify removal
8. Check audit log entries

## Success Criteria
- [ ] Secrets encrypted at rest with AES-256-GCM
- [ ] `${{ secrets.* }}` expressions resolve correctly
- [ ] Secrets injected as environment variables
- [ ] Secret values masked in logs
- [ ] Audit trail for all secret operations
- [ ] Organization secrets available to all repos
- [ ] Repo secrets override org secrets
- [ ] Only admins can manage secrets
- [ ] Key rotation works without breaking decryption
