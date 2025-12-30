import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Radar,
  AlertCircle,
  AlertTriangle,
  FileWarning,
  Info,
  CheckCircle2,
  Loader2,
  Filter,
  X,
  ExternalLink,
  Eye,
  EyeOff,
  Bug,
  ChevronRight,
  Lightbulb,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { formatDistanceToNow } from 'date-fns';

interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  analyzer: string;
  ruleId: string | null;
  filePath: string;
  line: number | null;
  endLine: number | null;
  title: string;
  message: string;
  suggestion: string | null;
  codeSnippet: string | null;
  suggestedFix: string | null;
  isDismissed: boolean;
  dismissedReason: string | null;
  linkedIssueNumber: number | null;
  firstSeenAt: string;
}

interface ScanSummary {
  id: string;
  status: string;
  branch: string;
  commitSha: string;
  healthScore: number | null;
  summary: string | null;
  recommendations: string[] | null;
  findings: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  completedAt: string | null;
  createdAt: string;
}

const SEVERITY_CONFIG: Record<string, {
  icon: typeof AlertCircle;
  color: string;
  bg: string;
  badge: string;
}> = {
  critical: { 
    icon: AlertCircle, 
    color: 'text-red-600', 
    bg: 'bg-red-50 dark:bg-red-900/20',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  high: { 
    icon: AlertTriangle, 
    color: 'text-orange-500', 
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  medium: { 
    icon: FileWarning, 
    color: 'text-yellow-500', 
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  low: { 
    icon: Info, 
    color: 'text-green-500', 
    bg: 'bg-green-50 dark:bg-green-900/20',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  info: { 
    icon: Info, 
    color: 'text-blue-500', 
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  security: 'Security',
  code_quality: 'Code Quality',
  performance: 'Performance',
  maintainability: 'Maintainability',
  dependency: 'Dependency',
  best_practice: 'Best Practice',
  documentation: 'Documentation',
  testing: 'Testing',
  accessibility: 'Accessibility',
  other: 'Other',
};

function getHealthScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-500';
  return 'text-red-600';
}

export function SentinelPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  useSession(); // Just to ensure auth context is available

  const [isLoading, setIsLoading] = useState(true);
  const [latestScan, setLatestScan] = useState<ScanSummary | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [totalFindings, setTotalFindings] = useState(0);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDismissing, setIsDismissing] = useState<string | null>(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);

  // Filters
  const severityFilter = searchParams.get('severity') || '';
  const categoryFilter = searchParams.get('category') || '';
  const showDismissed = searchParams.get('dismissed') === 'true';

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      if (!owner || !repo) return;

      try {
        // Fetch latest scan
        const scanRes = await fetch(`/api/repos/${owner}/${repo}/sentinel/scans?limit=1`);
        if (scanRes.ok) {
          const data = await scanRes.json();
          if (data.scans && data.scans.length > 0) {
            setLatestScan(data.scans[0]);
          }
        }

        // Fetch findings
        const params = new URLSearchParams();
        if (severityFilter) params.set('severity', severityFilter);
        if (categoryFilter) params.set('category', categoryFilter);
        params.set('includeDismissed', showDismissed.toString());
        params.set('limit', '50');

        const findingsRes = await fetch(`/api/repos/${owner}/${repo}/sentinel/findings?${params}`);
        if (findingsRes.ok) {
          const data = await findingsRes.json();
          setFindings(data.findings || []);
          setTotalFindings(data.total || 0);
        }
      } catch (error) {
        console.error('Failed to fetch sentinel data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [owner, repo, severityFilter, categoryFilter, showDismissed]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Trigger a new scan
      await fetch(`/api/repos/${owner}/${repo}/sentinel/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'main' }),
      });

      // Wait a bit and refresh
      await new Promise(resolve => setTimeout(resolve, 2000));
      window.location.reload();
    } catch (error) {
      console.error('Failed to trigger scan:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDismiss = async (findingId: string, reason: string) => {
    setIsDismissing(findingId);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/findings/${findingId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (res.ok) {
        setFindings(prev => prev.map(f => 
          f.id === findingId ? { ...f, isDismissed: true, dismissedReason: reason } : f
        ));
      }
    } catch (error) {
      console.error('Failed to dismiss finding:', error);
    } finally {
      setIsDismissing(null);
    }
  };

  const handleUndismiss = async (findingId: string) => {
    setIsDismissing(findingId);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/findings/${findingId}/undismiss`, {
        method: 'POST',
      });

      if (res.ok) {
        setFindings(prev => prev.map(f => 
          f.id === findingId ? { ...f, isDismissed: false, dismissedReason: null } : f
        ));
      }
    } catch (error) {
      console.error('Failed to undismiss finding:', error);
    } finally {
      setIsDismissing(null);
    }
  };

  const handleCreateIssue = async (findingId: string) => {
    setIsCreatingIssue(findingId);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/findings/${findingId}/create-issue`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setFindings(prev => prev.map(f => 
          f.id === findingId ? { ...f, linkedIssueNumber: data.issueNumber } : f
        ));
      }
    } catch (error) {
      console.error('Failed to create issue:', error);
    } finally {
      setIsCreatingIssue(null);
    }
  };

  const setFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const hasFilters = severityFilter || categoryFilter || showDismissed;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading Sentinel findings..." />
      </RepoLayout>
    );
  }

  if (!latestScan) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <EmptyState
          icon={Radar}
          title="No scans yet"
          description="Run your first Sentinel scan to find security issues and code improvements."
          action={
            <Button onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Radar className="h-4 w-4 mr-2" />
              )}
              Run First Scan
            </Button>
          }
        />
      </RepoLayout>
    );
  }

  const activeFindings = findings.filter(f => !f.isDismissed);

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radar className="h-6 w-6" />
              Sentinel
            </h1>
            <p className="text-muted-foreground mt-1">
              Code scanning results and security findings
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Rescan
          </Button>
        </div>

        {/* Summary Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Health Score */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Code Health</span>
                  {latestScan.healthScore != null && (
                    <span className={`text-3xl font-bold ${getHealthScoreColor(latestScan.healthScore)}`}>
                      {latestScan.healthScore}
                    </span>
                  )}
                </div>
                {latestScan.healthScore != null && (
                  <Progress value={latestScan.healthScore} className="h-3" />
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Last scan: {formatDistanceToNow(new Date(latestScan.createdAt), { addSuffix: true })}
                  {' on '}{latestScan.branch}@{latestScan.commitSha.slice(0, 7)}
                </p>
              </div>

              {/* Severity Breakdown */}
              <div className="grid grid-cols-5 gap-2">
                {(['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => {
                  const config = SEVERITY_CONFIG[sev];
                  const Icon = config.icon;
                  const count = latestScan.findings[sev];
                  return (
                    <button
                      key={sev}
                      onClick={() => setFilter('severity', sev)}
                      className={`text-center p-3 rounded-lg transition-colors ${config.bg} ${severityFilter === sev ? 'ring-2 ring-primary' : 'hover:opacity-80'}`}
                    >
                      <Icon className={`h-5 w-5 mx-auto mb-1 ${config.color}`} />
                      <div className={`text-xl font-bold ${config.color}`}>{count}</div>
                      <div className="text-xs capitalize">{sev}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recommendations */}
            {latestScan.recommendations && latestScan.recommendations.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Recommendations</span>
                </div>
                <div className="space-y-2">
                  {latestScan.recommendations.map((rec, i) => (
                    <div key={i} className="text-sm text-muted-foreground pl-6">
                      {rec}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <Select value={severityFilter} onValueChange={(v) => setFilter('severity', v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All severities</SelectItem>
              {Object.keys(SEVERITY_CONFIG).map((sev) => (
                <SelectItem key={sev} value={sev} className="capitalize">{sev}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={(v) => setFilter('category', v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showDismissed ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setFilter('dismissed', showDismissed ? '' : 'true')}
          >
            {showDismissed ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {showDismissed ? 'Showing dismissed' : 'Show dismissed'}
          </Button>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}

          <div className="ml-auto text-sm text-muted-foreground">
            {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Findings List */}
        <div className="space-y-3">
          {activeFindings.length === 0 && !showDismissed ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium">No active findings</h3>
                <p className="text-muted-foreground mt-1">
                  {hasFilters 
                    ? 'No findings match your current filters.'
                    : 'Great job! Your code is looking healthy.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {(showDismissed ? findings : activeFindings).map((finding) => {
                const config = SEVERITY_CONFIG[finding.severity];
                const Icon = config.icon;
                const isExpanded = expandedFinding === finding.id;

                return (
                  <Card 
                    key={finding.id}
                    className={`transition-all ${finding.isDismissed ? 'opacity-60' : ''}`}
                  >
                    <CardHeader 
                      className="cursor-pointer py-4"
                      onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-sm font-medium">
                              {finding.title}
                            </CardTitle>
                            <Badge variant="outline" className={config.badge}>
                              {finding.severity}
                            </Badge>
                            <Badge variant="outline">
                              {CATEGORY_LABELS[finding.category] || finding.category}
                            </Badge>
                            {finding.linkedIssueNumber && (
                              <Badge variant="secondary">
                                <Bug className="h-3 w-3 mr-1" />
                                #{finding.linkedIssueNumber}
                              </Badge>
                            )}
                            {finding.isDismissed && (
                              <Badge variant="secondary">Dismissed</Badge>
                            )}
                          </div>
                          <CardDescription className="mt-1 text-xs">
                            {finding.filePath}
                            {finding.line && `:${finding.line}`}
                            {finding.endLine && finding.endLine !== finding.line && `-${finding.endLine}`}
                            <span className="mx-2">•</span>
                            {finding.analyzer}
                            {finding.ruleId && ` (${finding.ruleId})`}
                          </CardDescription>
                        </div>
                        <ChevronRight className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="pt-0">
                        <Separator className="mb-4" />
                        
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-1">Description</h4>
                            <p className="text-sm text-muted-foreground">{finding.message}</p>
                          </div>

                          {finding.codeSnippet && (
                            <div>
                              <h4 className="text-sm font-medium mb-1">Code</h4>
                              <pre className="p-3 rounded-lg bg-muted text-xs overflow-x-auto">
                                <code>{finding.codeSnippet}</code>
                              </pre>
                            </div>
                          )}

                          {finding.suggestion && (
                            <div>
                              <h4 className="text-sm font-medium mb-1 flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-yellow-500" />
                                Suggestion
                              </h4>
                              <p className="text-sm text-muted-foreground">{finding.suggestion}</p>
                            </div>
                          )}

                          {finding.suggestedFix && (
                            <div>
                              <h4 className="text-sm font-medium mb-1">Suggested Fix</h4>
                              <pre className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-xs overflow-x-auto">
                                <code>{finding.suggestedFix}</code>
                              </pre>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            {finding.isDismissed ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUndismiss(finding.id);
                                }}
                                disabled={isDismissing === finding.id}
                              >
                                {isDismissing === finding.id && (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Restore Finding
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const reason = prompt('Reason for dismissing (optional):');
                                    if (reason !== null) {
                                      handleDismiss(finding.id, reason || 'Dismissed by user');
                                    }
                                  }}
                                  disabled={isDismissing === finding.id}
                                >
                                  {isDismissing === finding.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <EyeOff className="h-4 w-4 mr-2" />
                                  )}
                                  Dismiss
                                </Button>
                                {!finding.linkedIssueNumber && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCreateIssue(finding.id);
                                    }}
                                    disabled={isCreatingIssue === finding.id}
                                  >
                                    {isCreatingIssue === finding.id ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Bug className="h-4 w-4 mr-2" />
                                    )}
                                    Create Issue
                                  </Button>
                                )}
                                {finding.linkedIssueNumber && (
                                  <Button size="sm" variant="ghost" asChild>
                                    <a href={`/${owner}/${repo}/issues/${finding.linkedIssueNumber}`}>
                                      View Issue #{finding.linkedIssueNumber}
                                      <ExternalLink className="h-4 w-4 ml-2" />
                                    </a>
                                  </Button>
                                )}
                              </>
                            )}
                          </div>

                          {finding.dismissedReason && (
                            <p className="text-xs text-muted-foreground italic">
                              Dismissed: {finding.dismissedReason}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </div>
    </RepoLayout>
  );
}
