import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Loader2, 
  Check, 
  AlertCircle, 
  HardDrive, 
  Cloud, 
  Server,
  RefreshCw,
  TestTube,
  ArrowRightLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loading } from '@/components/ui/loading';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';

// Storage backend types
type StorageBackend = 'local' | 's3' | 'r2' | 'gcs' | 'minio' | 'azure';

interface StorageConfig {
  backend: StorageBackend;
  config: {
    bucket?: string;
    region?: string;
    endpoint?: string;
    prefix?: string;
    forcePathStyle?: boolean;
    credentialsId?: string;
  };
  stats?: {
    objectCount: number;
    totalSizeBytes: number;
  };
  health?: {
    healthy: boolean;
    latencyMs: number;
    error?: string;
  };
}

interface StorageCredential {
  id: string;
  name: string;
  backendType: StorageBackend;
  metadata?: {
    bucket?: string;
    region?: string;
    endpoint?: string;
  };
  createdAt: string;
}

const STORAGE_BACKENDS: { value: StorageBackend; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'local', label: 'Local Storage', description: 'Store objects on the server filesystem', icon: HardDrive },
  { value: 's3', label: 'Amazon S3', description: 'AWS S3 object storage', icon: Cloud },
  { value: 'r2', label: 'Cloudflare R2', description: 'S3-compatible with no egress fees', icon: Cloud },
  { value: 'minio', label: 'MinIO', description: 'Self-hosted S3-compatible storage', icon: Server },
  { value: 'gcs', label: 'Google Cloud Storage', description: 'Google Cloud object storage', icon: Cloud },
  { value: 'azure', label: 'Azure Blob Storage', description: 'Microsoft Azure storage', icon: Cloud },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function StorageSettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [storageConfig, setStorageConfig] = useState<StorageConfig | null>(null);
  const [credentials, setCredentials] = useState<StorageCredential[]>([]);
  
  // Form state
  const [selectedBackend, setSelectedBackend] = useState<StorageBackend>('local');
  const [formConfig, setFormConfig] = useState({
    bucket: '',
    region: 'us-east-1',
    endpoint: '',
    prefix: '',
    forcePathStyle: false,
    credentialsId: '',
  });
  const [migrateData, setMigrateData] = useState(false);
  const [deleteSourceAfterMigrate, setDeleteSourceAfterMigrate] = useState(false);
  const [showMigrateDialog, setShowMigrateDialog] = useState(false);

  // Test result
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);

  // Fetch storage config
  useEffect(() => {
    if (!owner || !repo) return;

    const fetchConfig = async () => {
      try {
        const token = session?.session?.token;
        const res = await fetch(`/api/storage/${owner}/${repo}/storage`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (res.ok) {
          const data = await res.json();
          setStorageConfig(data);
          setSelectedBackend(data.backend || 'local');
          if (data.config) {
            setFormConfig({
              bucket: data.config.bucket || '',
              region: data.config.region || 'us-east-1',
              endpoint: data.config.endpoint || '',
              prefix: data.config.prefix || '',
              forcePathStyle: data.config.forcePathStyle || false,
              credentialsId: data.config.credentialsId || '',
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch storage config:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchCredentials = async () => {
      try {
        const token = session?.session?.token;
        const res = await fetch('/api/storage/credentials', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (res.ok) {
          const data = await res.json();
          setCredentials(data.credentials || []);
        }
      } catch (err) {
        console.error('Failed to fetch credentials:', err);
      }
    };

    fetchConfig();
    fetchCredentials();
  }, [owner, repo, session]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const token = session?.session?.token;
      const res = await fetch('/api/storage/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          backend: selectedBackend,
          config: selectedBackend === 'local' ? {} : formConfig,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (migrate: boolean = false) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = session?.session?.token;
      const res = await fetch(`/api/storage/${owner}/${repo}/storage`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          backend: selectedBackend,
          config: selectedBackend === 'local' ? {} : formConfig,
          migrate,
          deleteSource: deleteSourceAfterMigrate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update storage configuration');
      }

      setSuccess(migrate ? 'Storage migrated successfully!' : 'Storage configuration updated!');
      setTimeout(() => setSuccess(null), 5000);

      // Refresh config
      setStorageConfig(prev => prev ? { ...prev, backend: selectedBackend } : null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
      setShowMigrateDialog(false);
    }
  };

  const handleSyncStats = async () => {
    setSyncing(true);
    setError(null);

    try {
      const token = session?.session?.token;
      const res = await fetch(`/api/storage/${owner}/${repo}/storage/sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setStorageConfig(prev => prev ? {
          ...prev,
          stats: data.stats,
        } : null);
        setSuccess('Storage stats synced!');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
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

  if (loading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading storage settings..." />
      </RepoLayout>
    );
  }

  const currentBackendInfo = STORAGE_BACKENDS.find(b => b.value === storageConfig?.backend);
  const selectedBackendInfo = STORAGE_BACKENDS.find(b => b.value === selectedBackend);
  const isChangingBackend = storageConfig?.backend !== selectedBackend;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Storage</h2>
            <p className="text-muted-foreground mt-1">
              Configure where Git objects are stored for this repository.
            </p>
          </div>

          {/* Current Storage Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Current Storage
              </CardTitle>
              <CardDescription>
                View your current storage backend and usage statistics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {currentBackendInfo && <currentBackendInfo.icon className="h-8 w-8 text-muted-foreground" />}
                  <div>
                    <div className="font-medium">{currentBackendInfo?.label || 'Local Storage'}</div>
                    <div className="text-sm text-muted-foreground">
                      {currentBackendInfo?.description}
                    </div>
                  </div>
                </div>
                <Badge variant={storageConfig?.health?.healthy ? 'default' : 'destructive'}>
                  {storageConfig?.health?.healthy ? 'Healthy' : 'Unhealthy'}
                </Badge>
              </div>

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Objects</div>
                  <div className="text-2xl font-bold">
                    {storageConfig?.stats?.objectCount?.toLocaleString() || 0}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Size</div>
                  <div className="text-2xl font-bold">
                    {formatBytes(storageConfig?.stats?.totalSizeBytes || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Latency</div>
                  <div className="text-2xl font-bold">
                    {storageConfig?.health?.latencyMs ? `${storageConfig.health.latencyMs}ms` : '-'}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" size="sm" onClick={handleSyncStats} disabled={syncing}>
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ml-2">Sync Stats</span>
                  </Button>
                </div>
              </div>

              {storageConfig?.health?.error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {storageConfig.health.error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Change Storage Backend */}
          <Card>
            <CardHeader>
              <CardTitle>Storage Backend</CardTitle>
              <CardDescription>
                Choose where to store Git objects. Changing backends will require migrating existing objects.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup
                value={selectedBackend}
                onValueChange={(value) => setSelectedBackend(value as StorageBackend)}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {STORAGE_BACKENDS.map((backend) => {
                  const Icon = backend.icon;
                  return (
                    <label
                      key={backend.value}
                      className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedBackend === backend.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <RadioGroupItem value={backend.value} className="mt-1" />
                      <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium">{backend.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {backend.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>

              {/* Configuration for cloud backends */}
              {selectedBackend !== 'local' && (
                <>
                  <Separator />
                  
                  <div className="space-y-4">
                    <h4 className="font-medium">Configuration</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bucket">Bucket Name *</Label>
                        <Input
                          id="bucket"
                          value={formConfig.bucket}
                          onChange={(e) => setFormConfig({ ...formConfig, bucket: e.target.value })}
                          placeholder="my-git-objects"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="region">Region</Label>
                        <Select
                          value={formConfig.region}
                          onValueChange={(value) => setFormConfig({ ...formConfig, region: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                            <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                            <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                            <SelectItem value="eu-central-1">EU (Frankfurt)</SelectItem>
                            <SelectItem value="ap-northeast-1">Asia Pacific (Tokyo)</SelectItem>
                            <SelectItem value="auto">Auto (for R2)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(selectedBackend === 'r2' || selectedBackend === 'minio') && (
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="endpoint">Custom Endpoint</Label>
                          <Input
                            id="endpoint"
                            value={formConfig.endpoint}
                            onChange={(e) => setFormConfig({ ...formConfig, endpoint: e.target.value })}
                            placeholder={selectedBackend === 'r2' 
                              ? 'https://ACCOUNT_ID.r2.cloudflarestorage.com'
                              : 'http://localhost:9000'
                            }
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="prefix">Object Prefix</Label>
                        <Input
                          id="prefix"
                          value={formConfig.prefix}
                          onChange={(e) => setFormConfig({ ...formConfig, prefix: e.target.value })}
                          placeholder={`repos/${owner}/${repo}`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional prefix for all objects in this repository.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="credentials">Credentials</Label>
                        <Select
                          value={formConfig.credentialsId || 'env'}
                          onValueChange={(value) => setFormConfig({ 
                            ...formConfig, 
                            credentialsId: value === 'env' ? '' : value 
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Use environment variables" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="env">Use environment variables</SelectItem>
                            {credentials
                              .filter(c => c.backendType === selectedBackend || 
                                         (c.backendType === 's3' && ['s3', 'r2', 'minio'].includes(selectedBackend)))
                              .map(cred => (
                                <SelectItem key={cred.id} value={cred.id}>
                                  {cred.name}
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(selectedBackend === 'minio' || selectedBackend === 'r2') && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id="forcePathStyle"
                          checked={formConfig.forcePathStyle}
                          onCheckedChange={(checked) => setFormConfig({ ...formConfig, forcePathStyle: checked })}
                        />
                        <Label htmlFor="forcePathStyle" className="cursor-pointer">
                          Force path-style URLs
                        </Label>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Test Connection */}
              {selectedBackend !== 'local' && (
                <>
                  <Separator />
                  
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testing || !formConfig.bucket}
                    >
                      {testing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>

                    {testResult && (
                      <div className={`flex items-center gap-2 text-sm ${
                        testResult.success ? 'text-green-600' : 'text-destructive'
                      }`}>
                        {testResult.success ? (
                          <>
                            <Check className="h-4 w-4" />
                            Connected ({testResult.latencyMs}ms)
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-4 w-4" />
                            {testResult.error}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              {/* Save / Migrate */}
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-3 rounded-md bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {success}
                </div>
              )}

              <div className="flex items-center gap-4">
                {isChangingBackend ? (
                  <Button
                    onClick={() => setShowMigrateDialog(true)}
                    disabled={saving || (selectedBackend !== 'local' && !formConfig.bucket)}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Change Storage Backend
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSave(false)}
                    disabled={saving || (selectedBackend !== 'local' && !formConfig.bucket)}
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Configuration
                  </Button>
                )}

                {isChangingBackend && (
                  <p className="text-sm text-muted-foreground">
                    Changing from {currentBackendInfo?.label} to {selectedBackendInfo?.label}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Migration Dialog */}
          <AlertDialog open={showMigrateDialog} onOpenChange={setShowMigrateDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Change Storage Backend</AlertDialogTitle>
                <AlertDialogDescription>
                  You are changing from <strong>{currentBackendInfo?.label}</strong> to{' '}
                  <strong>{selectedBackendInfo?.label}</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="migrate"
                    checked={migrateData}
                    onCheckedChange={setMigrateData}
                  />
                  <Label htmlFor="migrate" className="cursor-pointer">
                    Migrate existing objects to new backend
                  </Label>
                </div>
                
                {migrateData && (
                  <div className="flex items-center gap-2 ml-6">
                    <Switch
                      id="deleteSource"
                      checked={deleteSourceAfterMigrate}
                      onCheckedChange={setDeleteSourceAfterMigrate}
                    />
                    <Label htmlFor="deleteSource" className="cursor-pointer text-sm">
                      Delete objects from old backend after migration
                    </Label>
                  </div>
                )}

                {!migrateData && (
                  <div className="p-3 rounded-md bg-yellow-500/10 text-yellow-600 text-sm">
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                    Without migration, existing objects will not be accessible from the new backend.
                  </div>
                )}
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleSave(migrateData)}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {migrateData ? 'Migrate & Save' : 'Save Without Migration'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}
