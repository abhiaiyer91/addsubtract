import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Plus, Trash2, Loader2, Check, X, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

interface BranchRule {
  id: string;
  pattern: string;
  requirePullRequest: boolean;
  requiredReviewers: number;
  requireStatusChecks: boolean;
  requiredStatusChecks: string[];
  allowForcePush: boolean;
  allowDeletion: boolean;
}

const DEFAULT_RULE: Omit<BranchRule, 'id'> = {
  pattern: '',
  requirePullRequest: true,
  requiredReviewers: 1,
  requireStatusChecks: false,
  requiredStatusChecks: [],
  allowForcePush: false,
  allowDeletion: false,
};

export function BranchProtectionPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BranchRule | null>(null);
  const [formData, setFormData] = useState(DEFAULT_RULE);
  const [statusCheckInput, setStatusCheckInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const { data: rules, isLoading: rulesLoading } = trpc.branchProtection.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  const createRule = trpc.branchProtection.create.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.branchProtection.list.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const updateRule = trpc.branchProtection.update.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.branchProtection.list.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteRule = trpc.branchProtection.delete.useMutation({
    onSuccess: () => {
      utils.branchProtection.list.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
    setFormData(DEFAULT_RULE);
    setStatusCheckInput('');
    setError(null);
  };

  const openCreateDialog = () => {
    setEditingRule(null);
    setFormData(DEFAULT_RULE);
    setIsDialogOpen(true);
  };

  const openEditDialog = (rule: BranchRule) => {
    setEditingRule(rule);
    setFormData({
      pattern: rule.pattern,
      requirePullRequest: rule.requirePullRequest,
      requiredReviewers: rule.requiredReviewers,
      requireStatusChecks: rule.requireStatusChecks,
      requiredStatusChecks: rule.requiredStatusChecks || [],
      allowForcePush: rule.allowForcePush,
      allowDeletion: rule.allowDeletion,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.pattern.trim()) {
      setError('Branch pattern is required');
      return;
    }

    if (!repoData?.repo.id) return;

    const payload = {
      repoId: repoData.repo.id,
      pattern: formData.pattern.trim(),
      requirePullRequest: formData.requirePullRequest,
      requiredReviewers: formData.requirePullRequest ? formData.requiredReviewers : 0,
      requireStatusChecks: formData.requireStatusChecks,
      requiredStatusChecks: formData.requireStatusChecks ? formData.requiredStatusChecks : [],
      allowForcePush: formData.allowForcePush,
      allowDeletion: formData.allowDeletion,
    };

    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, ...payload });
    } else {
      createRule.mutate(payload);
    }
  };

  const handleAddStatusCheck = () => {
    if (statusCheckInput.trim() && !formData.requiredStatusChecks.includes(statusCheckInput.trim())) {
      setFormData({
        ...formData,
        requiredStatusChecks: [...formData.requiredStatusChecks, statusCheckInput.trim()],
      });
      setStatusCheckInput('');
    }
  };

  const handleRemoveStatusCheck = (check: string) => {
    setFormData({
      ...formData,
      requiredStatusChecks: formData.requiredStatusChecks.filter((c) => c !== check),
    });
  };

  const handleDeleteRule = (ruleId: string, pattern: string) => {
    if (!repoData?.repo.id) return;

    if (confirm(`Delete protection rule for "${pattern}"?`)) {
      deleteRule.mutate({ id: ruleId, repoId: repoData.repo.id });
    }
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </RepoLayout>
    );
  }

  const isLoading = repoLoading || rulesLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading branch protection rules..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  const isMutating = createRule.isPending || updateRule.isPending;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Branch Protection Rules</h2>
            <p className="text-muted-foreground mt-1">
              Protect branches by requiring reviews, status checks, and more.
            </p>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Protection Rules</CardTitle>
                <CardDescription>
                  Define rules for branches that match a pattern.
                </CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2" onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" />
                    Add Rule
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                  <form onSubmit={handleSubmit}>
                    <DialogHeader>
                      <DialogTitle>
                        {editingRule ? 'Edit Protection Rule' : 'Add Protection Rule'}
                      </DialogTitle>
                      <DialogDescription>
                        {editingRule
                          ? 'Update the branch protection settings.'
                          : 'Create a new branch protection rule.'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      {/* Branch pattern */}
                      <div className="space-y-2">
                        <Label htmlFor="pattern">Branch name pattern</Label>
                        <Input
                          id="pattern"
                          placeholder="main"
                          value={formData.pattern}
                          onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use * for wildcards (e.g., release/* matches release/v1, release/v2)
                        </p>
                      </div>

                      {/* Require PR */}
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="requirePR"
                            checked={formData.requirePullRequest}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, requirePullRequest: !!checked })
                            }
                          />
                          <div>
                            <Label htmlFor="requirePR" className="cursor-pointer">
                              Require a pull request before merging
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Changes must be made via pull request.
                            </p>
                          </div>
                        </div>

                        {formData.requirePullRequest && (
                          <div className="ml-7 space-y-2">
                            <Label>Required approving reviews</Label>
                            <Select
                              value={formData.requiredReviewers.toString()}
                              onValueChange={(v) =>
                                setFormData({ ...formData, requiredReviewers: parseInt(v) })
                              }
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[0, 1, 2, 3, 4, 5].map((n) => (
                                  <SelectItem key={n} value={n.toString()}>
                                    {n}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {/* Status checks */}
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="requireStatusChecks"
                            checked={formData.requireStatusChecks}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, requireStatusChecks: !!checked })
                            }
                          />
                          <div>
                            <Label htmlFor="requireStatusChecks" className="cursor-pointer">
                              Require status checks to pass before merging
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Choose which status checks must pass.
                            </p>
                          </div>
                        </div>

                        {formData.requireStatusChecks && (
                          <div className="ml-7 space-y-3">
                            <div className="flex gap-2">
                              <Input
                                placeholder="ci/build"
                                value={statusCheckInput}
                                onChange={(e) => setStatusCheckInput(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddStatusCheck();
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleAddStatusCheck}
                              >
                                Add
                              </Button>
                            </div>
                            {formData.requiredStatusChecks.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {formData.requiredStatusChecks.map((check) => (
                                  <Badge
                                    key={check}
                                    variant="secondary"
                                    className="gap-1 pr-1"
                                  >
                                    {check}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStatusCheck(check)}
                                      className="ml-1 hover:bg-muted rounded-sm p-0.5"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Force push */}
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="allowForcePush"
                          checked={formData.allowForcePush}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, allowForcePush: !!checked })
                          }
                        />
                        <div>
                          <Label htmlFor="allowForcePush" className="cursor-pointer">
                            Allow force pushes
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Permit force pushes to matching branches.
                          </p>
                        </div>
                      </div>

                      {/* Deletion */}
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="allowDeletion"
                          checked={formData.allowDeletion}
                          onCheckedChange={(checked) =>
                            setFormData({ ...formData, allowDeletion: !!checked })
                          }
                        />
                        <div>
                          <Label htmlFor="allowDeletion" className="cursor-pointer">
                            Allow deletions
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Permit deleting matching branches.
                          </p>
                        </div>
                      </div>

                      {error && (
                        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                          {error}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={closeDialog}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isMutating}>
                        {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingRule ? 'Save Changes' : 'Create Rule'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!rules || rules.length === 0 ? (
                <EmptyState
                  icon={Shield}
                  title="No protection rules"
                  description="Add a rule to protect your branches."
                />
              ) : (
                <div className="divide-y">
                  {rules.map((rule: any) => (
                    <BranchRuleRow
                      key={rule.id}
                      rule={rule}
                      onEdit={() => openEditDialog(rule)}
                      onDelete={() => handleDeleteRule(rule.id, rule.pattern)}
                      isDeleting={deleteRule.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}

interface BranchRuleRowProps {
  rule: BranchRule;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function BranchRuleRow({ rule, onEdit, onDelete, isDeleting }: BranchRuleRowProps) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-md">
            <Shield className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="font-mono font-medium">{rule.pattern}</div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <RuleItem
                enabled={rule.requirePullRequest}
                text={`Require pull request${rule.requiredReviewers > 0 ? ` (${rule.requiredReviewers} review${rule.requiredReviewers !== 1 ? 's' : ''})` : ''}`}
              />
              <RuleItem
                enabled={rule.requireStatusChecks}
                text={`Require status checks${rule.requiredStatusChecks?.length ? `: ${rule.requiredStatusChecks.join(', ')}` : ''}`}
              />
              <RuleItem enabled={!rule.allowForcePush} text="Block force pushes" />
              <RuleItem enabled={!rule.allowDeletion} text="Block deletions" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RuleItem({ enabled, text }: { enabled: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <X className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
      <span className={enabled ? 'text-foreground' : 'text-muted-foreground/50'}>{text}</span>
    </div>
  );
}
