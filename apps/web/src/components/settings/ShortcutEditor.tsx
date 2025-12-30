/**
 * ShortcutEditor Component
 *
 * Allows users to view and customize individual keyboard shortcuts.
 * Includes a key recorder dialog for capturing new key combinations.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Edit2, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useShortcutStore,
  formatShortcutDisplay,
  parseKeyboardEvent,
  getContextDescription,
  type ShortcutDefinition,
} from '@/lib/keyboard-shortcuts';

interface ShortcutEditorProps {
  shortcut: ShortcutDefinition;
  hasConflict?: boolean;
}

export function ShortcutEditor({ shortcut, hasConflict }: ShortcutEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string | null>(null);
  const recorderRef = useRef<HTMLDivElement>(null);

  const {
    getEffectiveKeys,
    isShortcutDisabled,
    isShortcutCustomized,
    setCustomBinding,
    resetBinding,
    toggleShortcut,
  } = useShortcutStore();

  const effectiveKeys = getEffectiveKeys(shortcut.id);
  const isCustomized = isShortcutCustomized(shortcut.id);
  const isDisabled = isShortcutDisabled(shortcut.id);

  // Focus the recorder when the dialog opens
  useEffect(() => {
    if (isEditing && recorderRef.current) {
      recorderRef.current.focus();
    }
  }, [isEditing]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const keys = parseKeyboardEvent(e);
    if (keys) {
      setRecordedKeys(keys);
    }
  }, []);

  const handleSave = useCallback(() => {
    if (recordedKeys) {
      setCustomBinding(shortcut.id, recordedKeys);
    }
    setIsEditing(false);
    setRecordedKeys(null);
  }, [recordedKeys, shortcut.id, setCustomBinding]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setRecordedKeys(null);
  }, []);

  const handleReset = useCallback(() => {
    resetBinding(shortcut.id);
  }, [shortcut.id, resetBinding]);

  const handleClear = useCallback(() => {
    setCustomBinding(shortcut.id, '');
    setIsEditing(false);
    setRecordedKeys(null);
  }, [shortcut.id, setCustomBinding]);

  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Switch
          checked={!isDisabled}
          onCheckedChange={(checked) => toggleShortcut(shortcut.id, checked)}
        />
        <div className={isDisabled ? 'opacity-50' : ''}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{shortcut.description}</span>
            {hasConflict && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            {isCustomized && (
              <Badge variant="secondary" className="text-xs">
                Modified
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground font-mono">
              {shortcut.id}
            </span>
            <span className="text-xs text-muted-foreground">
              · {getContextDescription(shortcut.context)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {effectiveKeys ? (
          <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border">
            {formatShortcutDisplay(effectiveKeys)}
          </kbd>
        ) : (
          <span className="text-xs text-muted-foreground italic">None</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsEditing(true)}
          disabled={isDisabled}
        >
          <Edit2 className="h-4 w-4" />
        </Button>
        {isCustomized && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleReset}
            title="Reset to default"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Shortcut</DialogTitle>
            <DialogDescription>{shortcut.description}</DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <div
              ref={recorderRef}
              className="border-2 border-dashed rounded-lg p-8 text-center focus:border-primary focus:outline-none transition-colors cursor-pointer"
              tabIndex={0}
              onKeyDown={(e) => handleKeyDown(e.nativeEvent)}
            >
              {recordedKeys ? (
                <kbd className="px-4 py-2 text-lg font-mono bg-muted rounded border">
                  {formatShortcutDisplay(recordedKeys)}
                </kbd>
              ) : (
                <p className="text-muted-foreground">
                  Press your desired key combination...
                </p>
              )}
            </div>
            <div className="text-center mt-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Current:{' '}
                {effectiveKeys ? (
                  <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">
                    {formatShortcutDisplay(effectiveKeys)}
                  </kbd>
                ) : (
                  <span className="italic">None</span>
                )}
              </p>
              {isCustomized && (
                <p className="text-xs text-muted-foreground">
                  Default:{' '}
                  <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">
                    {formatShortcutDisplay(shortcut.keys)}
                  </kbd>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleClear}
              className="sm:mr-auto"
            >
              Clear Shortcut
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!recordedKeys}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
