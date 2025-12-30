import { useState, useEffect } from 'react';
import {
  HardDrive,
  Cloud,
  Server,
  Key,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  TestTube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';

type StorageBackend = 's3' | 'r2' | 'minio' | 'gcs' | 'azure';

interface StorageCredential {
  id: string;
  name: string;
  backendType: StorageBackend;
  metadata?: {
    bucket?: string;
    region?: string;
    endpoint?: string;
  };
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
}

const STORAGE_PROVIDERS = [
  { 
    value: 's3' as StorageBackend, 
    label: 'Amazon S3', 
    description: 'AWS S3 object storage',
    icon: Cloud,
    docsUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
    accessKeyPlaceholder: 'AKIA...',
    secretKeyPlaceholder: 'Your AWS secret access key',
    hasEndpoint: false,
  },
  { 
    value: 'r2' as StorageBackend, 
    label: 'Cloudflare R2', 
    description: 'S3-compatible with no egress fees',
    icon: Cloud,
    docsUrl: 'https://developers.cloudflare.com/r2/api/s3/tokens/',
    accessKeyPlaceholder: 'Your R2 access key ID',
    secretKeyPlaceholder: 'Your R2 secret access key',
    hasEndpoint: true,
    endpointPlaceholder: 'https://ACCOUNT_ID.r2.cloudflarestorage.com',
  },
  { 
    value: 'minio' as StorageBackend, 
    label: 'MinIO', 
    description: 'Self-hosted S3-compatible storage',
    icon: Server,
    docsUrl: 'https://min.io/docs/minio/linux/administration/identity-access-management/minio-user-management.html',
    accessKeyPlaceholder: 'minioadmin',
    secretKeyPlaceholder: 'Your MinIO secret key',
    hasEndpoint: true,
    endpointPlaceholder: 'http://localhost:9000',
  },
  { 
    value: 'gcs' as StorageBackend, 
    label: 'Google Cloud Storage', 
    description: 'Google Cloud object storage (coming soon)',
    icon: Cloud,
    docsUrl: 'https://cloud.google.com/storage/docs/authentication',
    disabled: true,
  },
  { 
    value: 'azure' as StorageBackend, 
    label: 'Azure Blob Storage', 
    description: 'Microsoft Azure storage (coming soon)',
    icon: Cloud,
    docsUrl: 'https://learn.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage',
    disabled: true,
  },
];

export function StorageCredentialsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const authenticated = !!session?.user;

  const [credentials, setCredentials] = useState<StorageCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<StorageBackend>('s3');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    bucket: '',
    region: 'us-east-1',
    endpoint: '',
    accessKeyId: '',
    secretAccessKey: '',
  });
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Fetch credentials
  useEffect(() => {
    if (!authenticated) return;

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
      } finally {
        setLoading(false);
      }
    };

    fetchCredentials();
  }, [authenticated, session]);

  const resetForm = () => {
    setFormData({
      name: '',
      bucket: '',
      region: 'us-east-1',
      endpoint: '',
      accessKeyId: '',
      secretAccessKey: '',
    });
    setShowSecretKey(false);
    setError(null);
    setTestResult(null);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const openDialog = (provider?: StorageBackend) => {
    if (provider) {
      setSelectedProvider(provider);
    }
    resetForm();
    setIsDialogOpen(true);
  };

  const handleTest = async () => {
    setIsTesting(true);
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
          backend: selectedProvider,
          config: {
            bucket: formData.bucket,
            region: formData.region,
            endpoint: formData.endpoint || undefined,
          },
          credentials: {
            accessKeyId: formData.accessKeyId,
            secretAccessKey: formData.secretAccessKey,
          },
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: (err as Error).message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      if (!formData.name.trim()) {
        throw new Error('Name is required');
      }
      if (!formData.accessKeyId.trim()) {
        throw new Error('Access Key ID is required');
      }
      if (!formData.secretAccessKey.trim()) {
        throw new Error('Secret Access Key is required');
      }

      const providerConfig = STORAGE_PROVIDERS.find(p => p.value === selectedProvider);
      if (providerConfig?.hasEndpoint && !formData.endpoint.trim()) {
        throw new Error('Endpoint is required for this provider');
      }

      const token = session?.session?.token;
      const res = await fetch('/api/storage/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          backendType: selectedProvider,
          credentials: {
            accessKeyId: formData.accessKeyId,
            secretAccessKey: formData.secretAccessKey,
          },
          metadata: {
            bucket: formData.bucket || undefined,
            region: formData.region || undefined,
            endpoint: formData.endpoint || undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save credentials');
      }

      const data = await res.json();
      setCredentials(prev => [...prev, data.credential]);
      closeDialog();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const cred = credentials.find(c => c.id === id);
    if (!cred) return;

    if (!confirm(`Delete credentials "${cred.name}"? Repositories using these credentials will fail to access storage.`)) {
      return;
    }

    setIsDeleting(id);

    try {
      const token = session?.session?.token;
      const res = await fetch(`/api/storage/credentials/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        setCredentials(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete credentials:', err);
    } finally {
      setIsDeleting(null);
    }
  };

  if (sessionPending) {
    return <Loading text="Loading..." />;
  }

  if (!authenticated) {
    return (
      <div className="container max-w-[800px] mx-auto py-8">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container max-w-[800px] mx-auto py-8">
        <Loading text="Loading storage credentials..." />
      </div>
    );
  }

  const currentProvider = STORAGE_PROVIDERS.find(p => p.value === selectedProvider);

  return (
    <div className="container max-w-[800px] mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Storage Credentials</h1>
        <p className="text-muted-foreground mt-1">
          Manage cloud storage credentials for your repositories. Credentials are encrypted and 
          stored securely.
        </p>
      </div>

      {/* Info Alert */}
      <Alert>
        <HardDrive className="h-4 w-4" />
        <AlertDescription>
          Store your Git objects in cloud storage for better scalability. Each repository can 
          use different credentials or storage backends.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Credentials</CardTitle>
            <CardDescription>
              Your storage credentials can be used across any repository you own.
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" onClick={() => openDialog()}>
                <Plus className="h-4 w-4" />
                Add Credentials
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Add Storage Credentials</DialogTitle>
                  <DialogDescription>
                    Add credentials for a cloud storage provider.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                  {/* Provider Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select 
                      value={selectedProvider} 
                      onValueChange={(v) => setSelectedProvider(v as StorageBackend)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {STORAGE_PROVIDERS.map((provider) => (
                          <SelectItem 
                            key={provider.value} 
                            value={provider.value}
                            disabled={provider.disabled}
                          >
                            <div className="flex items-center gap-2">
                              <span>{provider.label}</span>
                              {provider.disabled && (
                                <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {currentProvider?.description}
                    </p>
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      placeholder="Production S3 Credentials"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      A friendly name to identify these credentials.
                    </p>
                  </div>

                  {/* Endpoint (for R2/MinIO) */}
                  {currentProvider?.hasEndpoint && (
                    <div className="space-y-2">
                      <Label htmlFor="endpoint">Endpoint *</Label>
                      <Input
                        id="endpoint"
                        placeholder={currentProvider.endpointPlaceholder}
                        value={formData.endpoint}
                        onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Default bucket (optional) */}
                  <div className="space-y-2">
                    <Label htmlFor="bucket">Default Bucket</Label>
                    <Input
                      id="bucket"
                      placeholder="my-git-storage"
                      value={formData.bucket}
                      onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional default bucket. Can be overridden per repository.
                    </p>
                  </div>

                  {/* Region */}
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
                    <Select
                      value={formData.region}
                      onValueChange={(value) => setFormData({ ...formData, region: value })}
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

                  {/* Access Key ID */}
                  <div className="space-y-2">
                    <Label htmlFor="accessKeyId">Access Key ID *</Label>
                    <Input
                      id="accessKeyId"
                      placeholder={currentProvider?.accessKeyPlaceholder}
                      value={formData.accessKeyId}
                      onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                    />
                  </div>

                  {/* Secret Access Key */}
                  <div className="space-y-2">
                    <Label htmlFor="secretAccessKey">Secret Access Key *</Label>
                    <div className="relative">
                      <Input
                        id="secretAccessKey"
                        type={showSecretKey ? 'text' : 'password'}
                        placeholder={currentProvider?.secretKeyPlaceholder}
                        value={formData.secretAccessKey}
                        onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get your credentials from the{' '}
                      <a 
                        href={currentProvider?.docsUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {currentProvider?.label} documentation
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>

                  {/* Test Connection */}
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTest}
                      disabled={isTesting || !formData.accessKeyId || !formData.secretAccessKey}
                      className="gap-2"
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                      Test Connection
                    </Button>

                    {testResult && (
                      <div className={`mt-2 flex items-center gap-2 text-sm ${
                        testResult.success ? 'text-green-600' : 'text-destructive'
                      }`}>
                        {testResult.success ? (
                          <>
                            <Check className="h-4 w-4" />
                            Connected successfully ({testResult.latencyMs}ms)
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
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Credentials
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {credentials.length === 0 ? (
            <EmptyState
              icon={Key}
              title="No storage credentials"
              description="Add cloud storage credentials to enable remote object storage for your repositories."
            />
          ) : (
            <div className="divide-y">
              {credentials.map((cred) => {
                const provider = STORAGE_PROVIDERS.find(p => p.value === cred.backendType);
                const Icon = provider?.icon || Cloud;
                return (
                  <div key={cred.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-md">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{cred.name}</span>
                            <Badge variant="secondary">{provider?.label || cred.backendType}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {cred.metadata?.bucket && `Bucket: ${cred.metadata.bucket} • `}
                            {cred.metadata?.region && `Region: ${cred.metadata.region} • `}
                            Used {cred.usageCount} {cred.usageCount === 1 ? 'time' : 'times'}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(cred.id)}
                        disabled={isDeleting === cred.id}
                      >
                        {isDeleting === cred.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supported Providers</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Store Git objects in <strong>Amazon S3</strong>, <strong>Cloudflare R2</strong>, 
              or <strong>MinIO</strong>. All use the S3-compatible API.
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Credentials are encrypted at rest using AES-256. Access keys are never 
              exposed in the UI after creation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
