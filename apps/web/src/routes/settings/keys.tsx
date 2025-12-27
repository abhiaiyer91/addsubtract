import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Key, Plus, Trash2, Loader2, ChevronLeft, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

export function SSHKeysPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: keys, isLoading: keysLoading } = trpc.sshKeys.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  const addKey = trpc.sshKeys.add.useMutation({
    onSuccess: () => {
      setIsAddDialogOpen(false);
      setTitle('');
      setPublicKey('');
      setError(null);
      utils.sshKeys.list.invalidate();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteKey = trpc.sshKeys.delete.useMutation({
    onSuccess: () => {
      utils.sshKeys.list.invalidate();
    },
  });

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!publicKey.trim()) {
      setError('Public key is required');
      return;
    }

    addKey.mutate({
      title: title.trim(),
      publicKey: publicKey.trim(),
    });
  };

  const handleDeleteKey = (id: string) => {
    if (confirm('Are you sure you want to delete this SSH key?')) {
      deleteKey.mutate({ id });
    }
  };

  if (sessionPending) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  const isLoading = keysLoading;

  return (
    <div className="container max-w-6xl mx-auto py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Settings
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>SSH Keys</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">SSH Keys</h1>
        <p className="text-muted-foreground mt-1">
          Manage SSH keys for secure authentication when pushing and pulling from repositories.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your SSH Keys</CardTitle>
            <CardDescription>
              Add SSH keys to your account to enable secure Git operations.
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add SSH Key
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <form onSubmit={handleAddKey}>
                <DialogHeader>
                  <DialogTitle>Add SSH Key</DialogTitle>
                  <DialogDescription>
                    Add a new SSH key to your account. Paste your public key (usually found in ~/.ssh/id_rsa.pub or ~/.ssh/id_ed25519.pub).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="MacBook Pro"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      A descriptive name for this key.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="publicKey">Public Key</Label>
                    <Textarea
                      id="publicKey"
                      placeholder="ssh-ed25519 AAAA..."
                      value={publicKey}
                      onChange={(e) => setPublicKey(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Begins with ssh-rsa, ssh-ed25519, or ecdsa-sha2-nistp*.
                    </p>
                  </div>
                  {error && (
                    <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                      {error}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addKey.isPending}>
                    {addKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add SSH Key
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8">
              <Loading text="Loading SSH keys..." />
            </div>
          ) : !keys || keys.length === 0 ? (
            <EmptyState
              icon={Key}
              title="No SSH keys"
              description="Add an SSH key to enable secure Git operations over SSH."
            />
          ) : (
            <div className="divide-y">
              {keys.map((key) => (
                <SSHKeyRow
                  key={key.id}
                  keyData={key}
                  onDelete={() => handleDeleteKey(key.id)}
                  isDeleting={deleteKey.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">About SSH Keys</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            SSH keys allow you to authenticate to wit without using a password.
            When you push or pull via SSH, Git uses your private key to sign the request.
          </p>
          <p>
            <strong className="text-foreground">Generate a new SSH key:</strong>
          </p>
          <pre className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
            ssh-keygen -t ed25519 -C "your_email@example.com"
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

interface SSHKeyRowProps {
  keyData: {
    id: string;
    title: string;
    fingerprint: string;
    publicKeyPreview?: string | null;
    createdAt: Date | string;
  };
  onDelete: () => void;
  isDeleting: boolean;
}

function SSHKeyRow({ keyData, onDelete, isDeleting }: SSHKeyRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyFingerprint = async () => {
    await navigator.clipboard.writeText(keyData.fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-1 p-2 bg-muted rounded-md">
          <Key className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="font-medium">{keyData.title}</div>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-muted-foreground font-mono">
              {keyData.fingerprint.substring(0, 24)}...
            </code>
            <button
              onClick={handleCopyFingerprint}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Added {formatDate(keyData.createdAt)}
          </div>
        </div>
      </div>
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
  );
}
