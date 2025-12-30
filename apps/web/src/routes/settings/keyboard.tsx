/**
 * Keyboard Shortcuts Settings Page
 *
 * Allows users to view, customize, and manage keyboard shortcuts.
 * Features preset selection, search/filter, import/export, and conflict detection.
 */

import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Search,
  Upload,
  Download,
  RotateCcw,
  AlertTriangle,
  Keyboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSession } from '@/lib/auth-client';
import { Loading } from '@/components/ui/loading';
import { ShortcutEditor } from '@/components/settings/ShortcutEditor';
import {
  useShortcutStore,
  PRESETS,
  SHORTCUT_CATEGORIES,
} from '@/lib/keyboard-shortcuts';

export function KeyboardShortcutsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    shortcuts,
    activePreset,
    getEffectiveKeys,
    detectConflicts,
    applyPreset,
    resetAllBindings,
    exportBindings,
    importBindings,
  } = useShortcutStore();

  // Detect conflicts
  const conflicts = useMemo(() => detectConflicts(), [detectConflicts]);
  const conflictIds = useMemo(
    () => new Set(conflicts.map((c) => c.shortcutId)),
    [conflicts]
  );

  // Filter shortcuts based on search and category
  const filteredShortcuts = useMemo(() => {
    return shortcuts.filter((s) => {
      // Category filter
      if (selectedCategory && s.category !== selectedCategory) return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.description.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          getEffectiveKeys(s.id).toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [shortcuts, selectedCategory, searchQuery, getEffectiveKeys]);

  // Group filtered shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups = new Map<string, typeof filteredShortcuts>();

    // Use SHORTCUT_CATEGORIES order
    for (const category of SHORTCUT_CATEGORIES) {
      const categoryShortcuts = filteredShortcuts.filter(
        (s) => s.category === category
      );
      if (categoryShortcuts.length > 0) {
        groups.set(category, categoryShortcuts);
      }
    }

    return groups;
  }, [filteredShortcuts]);

  // Export bindings as JSON file
  const handleExport = () => {
    const json = exportBindings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wit-keyboard-shortcuts.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import bindings from JSON file
  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const success = importBindings(text);
      if (!success) {
        alert('Invalid shortcuts file. Please check the format and try again.');
      }
    } catch {
      alert('Failed to read file.');
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Reset all bindings with confirmation
  const handleResetAll = () => {
    if (
      confirm(
        'Are you sure you want to reset all keyboard shortcuts to their defaults? This cannot be undone.'
      )
    ) {
      resetAllBindings();
    }
  };

  if (sessionPending) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Please sign in to access settings.
        </p>
      </div>
    );
  }

  return (
    <div className="container max-w-[900px] mx-auto py-8 space-y-6">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/settings"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>Keyboard Shortcuts</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 bg-muted rounded-lg">
          <Keyboard className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Keyboard Shortcuts</h1>
          <p className="text-muted-foreground mt-1">
            Customize keyboard shortcuts to match your workflow. Power users
            should never need the mouse.
          </p>
        </div>
      </div>

      {/* Conflict Warning */}
      {conflicts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {conflicts.length} shortcut conflict(s) detected. Some shortcuts may
            not work as expected. Look for the{' '}
            <AlertTriangle className="h-3 w-3 inline" /> icon to identify
            conflicts.
          </AlertDescription>
        </Alert>
      )}

      {/* Preset & Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Preset Schemes</CardTitle>
          <CardDescription>
            Choose a preset or customize individual shortcuts below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <Select
              value={activePreset || 'custom'}
              onValueChange={(v) => v !== 'custom' && applyPreset(v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">
                  <span className="flex items-center gap-2">
                    Custom
                    {!activePreset && (
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    )}
                  </span>
                </SelectItem>
                {PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <span className="flex items-center gap-2">
                      {preset.name}
                      {activePreset === preset.id && (
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={handleImport}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetAll}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset All
              </Button>
            </div>
          </div>

          {activePreset && (
            <p className="text-sm text-muted-foreground mt-3">
              Using{' '}
              <strong>
                {PRESETS.find((p) => p.id === activePreset)?.name}
              </strong>{' '}
              preset.{' '}
              {PRESETS.find((p) => p.id === activePreset)?.description}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Search & Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={selectedCategory || 'all'}
          onValueChange={(v) => setSelectedCategory(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {SHORTCUT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Shortcuts List */}
      {groupedShortcuts.size === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No shortcuts found matching your search.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(groupedShortcuts.entries()).map(
            ([category, categoryShortcuts]) => (
              <Card key={category}>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg">{category}</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {categoryShortcuts.map((shortcut) => (
                    <ShortcutEditor
                      key={shortcut.id}
                      shortcut={shortcut}
                      hasConflict={conflictIds.has(shortcut.id)}
                    />
                  ))}
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      {/* Help */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Modifier keys:</strong> Use{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Cmd</kbd> (Mac) or{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Ctrl</kbd> (Windows/Linux)
            with other keys for most shortcuts.
          </p>
          <p>
            <strong className="text-foreground">Conflicts:</strong> If two shortcuts
            use the same keys in the same context, only one will work. Disable or
            change one to resolve.
          </p>
          <p>
            <strong className="text-foreground">Contexts:</strong> Some shortcuts only
            work in specific contexts (e.g., IDE mode, repository pages). Check the
            context label for each shortcut.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
