import { useState } from 'react';
import {
  Users,
  Tag,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Loader2,
  ExternalLink,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Reviewer {
  id: string;
  username: string;
  avatarUrl?: string | null;
  status: 'pending' | 'approved' | 'changes_requested' | 'commented';
}

interface Check {
  id: string;
  name: string;
  status: 'success' | 'failure' | 'pending' | 'queued';
  description?: string;
  detailsUrl?: string;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface PrSidebarProps {
  // Reviewers
  reviewers: Reviewer[];
  availableReviewers?: Array<{ id: string; username: string; avatarUrl?: string | null }>;
  onRequestReview?: (userId: string) => Promise<void>;
  onRemoveReviewer?: (userId: string) => Promise<void>;
  canManageReviewers?: boolean;

  // Checks
  checks: Check[];
  checksExpanded?: boolean;

  // Labels
  labels: Label[];
  availableLabels?: Label[];
  onAddLabel?: (labelId: string) => Promise<void>;
  onRemoveLabel?: (labelId: string) => Promise<void>;
  canManageLabels?: boolean;

  // Assignees (optional, for future)
  assignees?: Array<{ id: string; username: string; avatarUrl?: string | null }>;
  onAddAssignee?: (userId: string) => Promise<void>;
  onRemoveAssignee?: (userId: string) => Promise<void>;
}

function ReviewerStatusIcon({ status }: { status: Reviewer['status'] }) {
  switch (status) {
    case 'approved':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'changes_requested':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'commented':
      return <Circle className="h-4 w-4 text-blue-500 fill-blue-500" />;
    case 'pending':
    default:
      return <Clock className="h-4 w-4 text-yellow-500" />;
  }
}

function CheckStatusIcon({ status }: { status: Check['status'] }) {
  switch (status) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failure':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'pending':
      return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
    case 'queued':
      return <Clock className="h-4 w-4 text-gray-500" />;
    default:
      return <Circle className="h-4 w-4 text-gray-400" />;
  }
}

export function PrSidebar({
  reviewers,
  availableReviewers = [],
  onRequestReview,
  onRemoveReviewer,
  canManageReviewers = false,
  checks,
  checksExpanded = false,
  labels,
  availableLabels = [],
  onAddLabel,
  onRemoveLabel,
  canManageLabels = false,
}: PrSidebarProps) {
  const [isChecksOpen, setIsChecksOpen] = useState(checksExpanded);
  const [loadingReviewer, setLoadingReviewer] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);

  const checksPassCount = checks.filter((c) => c.status === 'success').length;
  const checksFailCount = checks.filter((c) => c.status === 'failure').length;
  const checksPendingCount = checks.filter(
    (c) => c.status === 'pending' || c.status === 'queued'
  ).length;

  const handleRequestReview = async (userId: string) => {
    if (!onRequestReview) return;
    setLoadingReviewer(userId);
    try {
      await onRequestReview(userId);
    } finally {
      setLoadingReviewer(null);
    }
  };

  const handleRemoveReviewer = async (userId: string) => {
    if (!onRemoveReviewer) return;
    setLoadingReviewer(userId);
    try {
      await onRemoveReviewer(userId);
    } finally {
      setLoadingReviewer(null);
    }
  };

  const handleAddLabel = async (labelId: string) => {
    if (!onAddLabel) return;
    setLoadingLabel(labelId);
    try {
      await onAddLabel(labelId);
    } finally {
      setLoadingLabel(null);
    }
  };

  const handleRemoveLabel = async (labelId: string) => {
    if (!onRemoveLabel) return;
    setLoadingLabel(labelId);
    try {
      await onRemoveLabel(labelId);
    } finally {
      setLoadingLabel(null);
    }
  };

  const unassignedReviewers = availableReviewers.filter(
    (r) => !reviewers.some((assigned) => assigned.id === r.id)
  );

  const unaddedLabels = availableLabels.filter(
    (l) => !labels.some((added) => added.id === l.id)
  );

  return (
    <div className="space-y-6 text-sm">
      {/* Reviewers Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="font-medium">Reviewers</span>
          </div>
          {canManageReviewers && unassignedReviewers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {unassignedReviewers.map((reviewer) => (
                  <DropdownMenuItem
                    key={reviewer.id}
                    onClick={() => handleRequestReview(reviewer.id)}
                    disabled={loadingReviewer === reviewer.id}
                  >
                    <div className="flex items-center gap-2">
                      {loadingReviewer === reviewer.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={reviewer.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {(reviewer.username || 'UN').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span>{reviewer.username}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {reviewers.length === 0 ? (
          <p className="text-muted-foreground text-xs">No reviewers yet</p>
        ) : (
          <div className="space-y-2">
            {reviewers.map((reviewer) => (
              <div
                key={reviewer.id}
                className="flex items-center gap-2 group"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={reviewer.avatarUrl || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {(reviewer.username || 'UN').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1">{reviewer.username}</span>
                <ReviewerStatusIcon status={reviewer.status} />
                {canManageReviewers && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveReviewer(reviewer.id)}
                    disabled={loadingReviewer === reviewer.id}
                  >
                    {loadingReviewer === reviewer.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Checks Section */}
      {checks.length > 0 && (
        <Collapsible open={isChecksOpen} onOpenChange={setIsChecksOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-muted-foreground hover:text-foreground transition-colors">
              <div className="flex items-center gap-2">
                {checksFailCount > 0 ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : checksPendingCount > 0 ? (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                <span className="font-medium">Checks</span>
                <span className="text-xs text-muted-foreground">
                  {checksPassCount}/{checks.length}
                </span>
              </div>
              {isChecksOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-2">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-start gap-2 text-xs"
                >
                  <CheckStatusIcon status={check.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{check.name}</span>
                      {check.detailsUrl && (
                        <a
                          href={check.detailsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 shrink-0"
                        >
                          Details
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {check.description && (
                      <p className="text-muted-foreground truncate">
                        {check.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Labels Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Tag className="h-4 w-4" />
            <span className="font-medium">Labels</span>
          </div>
          {canManageLabels && unaddedLabels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {unaddedLabels.map((label) => (
                  <DropdownMenuItem
                    key={label.id}
                    onClick={() => handleAddLabel(label.id)}
                    disabled={loadingLabel === label.id}
                  >
                    <div className="flex items-center gap-2">
                      {loadingLabel === label.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: `#${label.color}` }}
                        />
                      )}
                      <span>{label.name}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {labels.length === 0 ? (
          <p className="text-muted-foreground text-xs">No labels yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <Badge
                key={label.id}
                variant="outline"
                className="group gap-1 pr-1"
                style={{
                  backgroundColor: `#${label.color}20`,
                  borderColor: `#${label.color}`,
                  color: `#${label.color}`,
                }}
              >
                {label.name}
                {canManageLabels && (
                  <button
                    onClick={() => handleRemoveLabel(label.id)}
                    disabled={loadingLabel === label.id}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10 rounded"
                  >
                    {loadingLabel === label.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
