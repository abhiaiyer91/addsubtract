import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Radar,
  Play,
  Loader2,
  Check,
  AlertCircle,
  ShieldAlert,
  Shield,
  Bug,
  Package,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  History,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { Progress } from '@/components/ui/progress';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { formatDistanceToNow } from 'date-fns';

// Types for Sentinel
interface SentinelConfig {
  enabled: boolean;
  scanSchedule: string | null;
  branchPatterns: string[];
  autoCreateIssues: boolean;
  autoCreateIssueSeverity: string;
  useCodeRabbit: boolean;
  useSecurityAnalysis: boolean;
  useCodeQualityAnalysis: boolean;
  useDependencyCheck: boolean;
}

interface SentinelScan {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
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
  filesScanned: number | null;
  isScheduled: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface SentinelStatus {
  enabled: boolean;
  config: SentinelConfig | null;
  latestScan: SentinelScan | null;
  totalScans: number;
  activeFindings: number;
}

const SCHEDULE_OPTIONS = [
  { value: '', label: 'Manual only' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'twice-daily', label: 'Twice daily (6am & 6pm)' },
  { value: 'daily', label: 'Daily (midnight)' },
  { value: 'weekly', label: 'Weekly (Sunday)' },
];

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical only' },
  { value: 'high', label: 'High and above' },
  { value: 'medium', label: 'Medium and above' },
  { value: 'low', label: 'Low and above' },
];


function getHealthScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-500';
  return 'text-red-600';
}

function getHealthScoreLabel(score: number): string {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs Attention';
  return 'Critical';
}

export function SentinelSettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // State
  const [status, setStatus] = useState<SentinelStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [scans, setScans] = useState<SentinelScan[]>([]);
  const [scansLoading, setScansLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Config state
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [branchPatterns, setBranchPatterns] = useState('main');
  const [autoCreateIssues, setAutoCreateIssues] = useState(true);
  const [autoCreateSeverity, setAutoCreateSeverity] = useState('high');
  const [useCodeRabbit, setUseCodeRabbit] = useState(true);
  const [useSecurity, setUseSecurity] = useState(true);
  const [useCodeQuality, setUseCodeQuality] = useState(true);
  const [useDependency, setUseDependency] = useState(true);

  // Fetch status
  useEffect(() => {
    async function fetchStatus() {
      if (!owner || !repo) return;
      
      try {
        const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/status`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          
          // Initialize form from config
          if (data.config) {
            setEnabled(data.enabled);
            setSchedule(data.config.scanSchedule || '');
            setBranchPatterns(data.config.branchPatterns?.join(', ') || 'main');
            setAutoCreateIssues(data.config.autoCreateIssues ?? true);
            setAutoCreateSeverity(data.config.autoCreateIssueSeverity || 'high');
            setUseCodeRabbit(data.config.useCodeRabbit ?? true);
            setUseSecurity(data.config.useSecurityAnalysis ?? true);
            setUseCodeQuality(data.config.useCodeQualityAnalysis ?? true);
            setUseDependency(data.config.useDependencyCheck ?? true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch sentinel status:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchStatus();
  }, [owner, repo]);

  // Fetch scan history
  useEffect(() => {
    async function fetchScans() {
      if (!owner || !repo || !showHistory) return;
      
      setScansLoading(true);
      try {
        const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/scans?limit=10`);
        if (res.ok) {
          const data = await res.json();
          setScans(data.scans || []);
        }
      } catch (error) {
        console.error('Failed to fetch scans:', error);
      } finally {
        setScansLoading(false);
      }
    }
    
    fetchScans();
  }, [owner, repo, showHistory]);

  // Save config
  const handleSave = async () => {
    if (!owner || !repo) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          scanSchedule: schedule || null,
          branchPatterns: branchPatterns.split(',').map(s => s.trim()).filter(Boolean),
          autoCreateIssues,
          autoCreateIssueSeverity: autoCreateSeverity,
          useCodeRabbit,
          useSecurityAnalysis: useSecurity,
          useCodeQualityAnalysis: useCodeQuality,
          useDependencyCheck: useDependency,
        }),
      });
      
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        // Refresh status
        const statusRes = await fetch(`/api/repos/${owner}/${repo}/sentinel/status`);
        if (statusRes.ok) {
          setStatus(await statusRes.json());
        }
      }
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle enabled
  const handleToggleEnabled = async (newEnabled: boolean) => {
    if (!owner || !repo) return;
    
    setEnabled(newEnabled);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      
      if (res.ok) {
        // Refresh status
        const statusRes = await fetch(`/api/repos/${owner}/${repo}/sentinel/status`);
        if (statusRes.ok) {
          setStatus(await statusRes.json());
        }
      }
    } catch (error) {
      console.error('Failed to toggle enabled:', error);
      setEnabled(!newEnabled); // Revert
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger scan
  const handleTriggerScan = async () => {
    if (!owner || !repo) return;
    
    setIsScanning(true);
    try {
      const res = await fetch(`/api/repos/${owner}/${repo}/sentinel/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: branchPatterns.split(',')[0]?.trim() || 'main' }),
      });
      
      if (res.ok) {
        // Refresh status
        const statusRes = await fetch(`/api/repos/${owner}/${repo}/sentinel/status`);
        if (statusRes.ok) {
          setStatus(await statusRes.json());
        }
        // Refresh scans if history is open
        if (showHistory) {
          const scansRes = await fetch(`/api/repos/${owner}/${repo}/sentinel/scans?limit=10`);
          if (scansRes.ok) {
            const data = await scansRes.json();
            setScans(data.scans || []);
          }
        }
      }
    } catch (error) {
      console.error('Failed to trigger scan:', error);
    } finally {
      setIsScanning(false);
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

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading Sentinel settings..." />
      </RepoLayout>
    );
  }

  const latestScan = status?.latestScan;
  const hasFindings = latestScan && (
    latestScan.findings.critical > 0 ||
    latestScan.findings.high > 0 ||
    latestScan.findings.medium > 0 ||
    latestScan.findings.low > 0
  );

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold">Sentinel</h2>
            <p className="text-muted-foreground mt-1">
              Proactive code scanning for vulnerabilities and improvements.
            </p>
          </div>

          {/* Status Overview Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Radar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Code Scanning</CardTitle>
                    <CardDescription>
                      Automatically scan for security issues, code quality, and vulnerabilities
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={handleToggleEnabled}
                  disabled={isSaving}
                />
              </div>
            </CardHeader>
            {enabled && (
              <CardContent className="space-y-4">
                {/* Health Score */}
                {latestScan?.healthScore != null && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Code Health Score</span>
                      <span className={`text-2xl font-bold ${getHealthScoreColor(latestScan.healthScore)}`}>
                        {latestScan.healthScore}/100
                      </span>
                    </div>
                    <Progress value={latestScan.healthScore} className="h-2" />
                    <div className="flex items-center justify-between mt-2">
                      <Badge 
                        variant="secondary"
                        className={latestScan.healthScore >= 60 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}
                      >
                        {getHealthScoreLabel(latestScan.healthScore)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Last scan: {formatDistanceToNow(new Date(latestScan.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Findings Summary */}
                {hasFindings && (
                  <div className="grid grid-cols-5 gap-2">
                    <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                      <div className="text-lg font-bold text-red-600">{latestScan.findings.critical}</div>
                      <div className="text-xs text-red-600/80">Critical</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                      <div className="text-lg font-bold text-orange-600">{latestScan.findings.high}</div>
                      <div className="text-xs text-orange-600/80">High</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                      <div className="text-lg font-bold text-yellow-600">{latestScan.findings.medium}</div>
                      <div className="text-xs text-yellow-600/80">Medium</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                      <div className="text-lg font-bold text-green-600">{latestScan.findings.low}</div>
                      <div className="text-xs text-green-600/80">Low</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <div className="text-lg font-bold text-blue-600">{latestScan.findings.info}</div>
                      <div className="text-xs text-blue-600/80">Info</div>
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {latestScan?.recommendations && latestScan.recommendations.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Recommendations
                    </div>
                    <div className="space-y-1">
                      {latestScan.recommendations.map((rec, i) => (
                        <div key={i} className="text-sm text-muted-foreground pl-6">
                          {rec}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button onClick={handleTriggerScan} disabled={isScanning}>
                    {isScanning ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    {isScanning ? 'Scanning...' : 'Run Scan Now'}
                  </Button>
                  {hasFindings && (
                    <Button variant="outline" asChild>
                      <Link to={`/${owner}/${repo}/sentinel`}>
                        View Findings
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  )}
                </div>

                {!latestScan && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      No scans yet. Click "Run Scan Now" to start your first scan.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            )}
          </Card>

          {/* Configuration */}
          {enabled && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Configuration</CardTitle>
                    <CardDescription>Customize how Sentinel scans your code</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Schedule */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Scan Schedule
                  </Label>
                  <Select value={schedule} onValueChange={setSchedule}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value || 'manual'}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {schedule ? 'Scans will run automatically on the selected schedule.' : 'Only manual scans will be performed.'}
                  </p>
                </div>

                {/* Branch patterns */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Branches to Scan
                  </Label>
                  <Input
                    value={branchPatterns}
                    onChange={(e) => setBranchPatterns(e.target.value)}
                    placeholder="main, develop, release/*"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of branch names or patterns.
                  </p>
                </div>

                <Separator />

                {/* Auto-create issues */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <Bug className="h-4 w-4 text-muted-foreground" />
                        Auto-create Issues
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically create issues for findings
                      </p>
                    </div>
                    <Switch checked={autoCreateIssues} onCheckedChange={setAutoCreateIssues} />
                  </div>

                  {autoCreateIssues && (
                    <div className="pl-6 space-y-2">
                      <Label className="text-sm">Minimum Severity</Label>
                      <Select value={autoCreateSeverity} onValueChange={setAutoCreateSeverity}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITY_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Analyzers */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium">Analyzers</Label>

                  <div className="grid gap-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <ShieldAlert className="h-5 w-5 text-red-500" />
                        <div>
                          <div className="text-sm font-medium">Security Analysis</div>
                          <div className="text-xs text-muted-foreground">
                            Detect hardcoded secrets, SQL injection, XSS, and more
                          </div>
                        </div>
                      </div>
                      <Switch checked={useSecurity} onCheckedChange={setUseSecurity} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-blue-500" />
                        <div>
                          <div className="text-sm font-medium">Code Quality</div>
                          <div className="text-xs text-muted-foreground">
                            Find code smells, complexity issues, and best practices
                          </div>
                        </div>
                      </div>
                      <Switch checked={useCodeQuality} onCheckedChange={setUseCodeQuality} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Package className="h-5 w-5 text-orange-500" />
                        <div>
                          <div className="text-sm font-medium">Dependency Check</div>
                          <div className="text-xs text-muted-foreground">
                            Scan npm dependencies for known vulnerabilities
                          </div>
                        </div>
                      </div>
                      <Switch checked={useDependency} onCheckedChange={setUseDependency} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-purple-500" />
                        <div>
                          <div className="text-sm font-medium">CodeRabbit AI</div>
                          <div className="text-xs text-muted-foreground">
                            AI-powered comprehensive code review
                          </div>
                        </div>
                      </div>
                      <Switch checked={useCodeRabbit} onCheckedChange={setUseCodeRabbit} />
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : saveSuccess ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : null}
                    {saveSuccess ? 'Saved!' : 'Save Configuration'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scan History */}
          {enabled && (
            <Card>
              <CardHeader 
                className="cursor-pointer"
                onClick={() => setShowHistory(!showHistory)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">Scan History</CardTitle>
                      <CardDescription>
                        {status?.totalScans || 0} total scans
                      </CardDescription>
                    </div>
                  </div>
                  {showHistory ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </CardHeader>
              {showHistory && (
                <CardContent>
                  {scansLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : scans.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No scans yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {scans.map((scan) => (
                        <div 
                          key={scan.id} 
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            {scan.status === 'completed' ? (
                              scan.healthScore != null && scan.healthScore >= 60 ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <AlertTriangle className="h-5 w-5 text-orange-500" />
                              )
                            ) : scan.status === 'running' ? (
                              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                            ) : scan.status === 'failed' ? (
                              <AlertCircle className="h-5 w-5 text-red-500" />
                            ) : (
                              <Clock className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <div className="text-sm font-medium">
                                {scan.branch} @ {scan.commitSha.slice(0, 7)}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                {scan.isScheduled && <Badge variant="outline" className="text-xs">Scheduled</Badge>}
                                {scan.status === 'completed' && scan.healthScore != null && (
                                  <span className={getHealthScoreColor(scan.healthScore)}>
                                    Score: {scan.healthScore}
                                  </span>
                                )}
                                {scan.status === 'completed' && (
                                  <span>
                                    {scan.findings.critical + scan.findings.high + scan.findings.medium + scan.findings.low} findings
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(scan.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}
