import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { Label } from '@/lib/api-types';

interface LabelPickerProps {
  availableLabels: Label[];
  selectedLabels: Label[];
  onLabelsChange: (labels: Label[]) => void;
}

export function LabelPicker({
  availableLabels,
  selectedLabels,
  onLabelsChange,
}: LabelPickerProps) {
  const toggleLabel = (label: Label) => {
    const isSelected = selectedLabels.some((l) => l.id === label.id);
    if (isSelected) {
      onLabelsChange(selectedLabels.filter((l) => l.id !== label.id));
    } else {
      onLabelsChange([...selectedLabels, label]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Labels</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 gap-1">
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {availableLabels.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No labels available
              </div>
            ) : (
              availableLabels.map((label) => {
                const isSelected = selectedLabels.some((l) => l.id === label.id);
                return (
                  <DropdownMenuItem
                    key={label.id}
                    onClick={() => toggleLabel(label)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: `#${label.color}` }}
                    />
                    <span className="flex-1">{label.name}</span>
                    {isSelected && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Selected labels */}
      {selectedLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((label) => (
            <Badge
              key={label.id}
              variant="outline"
              style={{
                backgroundColor: `#${label.color}20`,
                borderColor: `#${label.color}`,
                color: `#${label.color}`,
              }}
              className="cursor-pointer"
              onClick={() => toggleLabel(label)}
            >
              {label.name}
              <span className="ml-1">×</span>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">None yet</p>
      )}
    </div>
  );
}
