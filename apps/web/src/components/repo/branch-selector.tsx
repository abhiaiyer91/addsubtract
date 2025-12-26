import { useNavigate } from 'react-router-dom';
import { GitBranch } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Branch {
  name: string;
  sha: string;
  isDefault?: boolean;
}

interface BranchSelectorProps {
  branches: Branch[];
  currentRef: string;
  owner: string;
  repo: string;
  basePath?: string; // 'tree' | 'blob' | ''
  filePath?: string;
}

export function BranchSelector({
  branches,
  currentRef,
  owner,
  repo,
  basePath = '',
  filePath = '',
}: BranchSelectorProps) {
  const navigate = useNavigate();

  const handleBranchChange = (branch: string) => {
    let path = `/${owner}/${repo}`;
    if (basePath) {
      path += `/${basePath}/${branch}`;
      if (filePath) {
        path += `/${filePath}`;
      }
    }
    navigate(path);
  };

  return (
    <Select value={currentRef} onValueChange={handleBranchChange}>
      <SelectTrigger className="w-[180px]">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <SelectValue placeholder="Select branch" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Branches</SelectLabel>
          {branches.map((branch) => (
            <SelectItem key={branch.name} value={branch.name}>
              <div className="flex items-center gap-2">
                {branch.name}
                {branch.isDefault && (
                  <span className="text-xs text-muted-foreground">(default)</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// Simple version for repo home
export function SimpleBranchSelector({
  defaultBranch,
  owner,
  repo,
}: {
  defaultBranch: string;
  owner: string;
  repo: string;
}) {
  // Mock branches - would come from tRPC
  const branches = [
    { name: defaultBranch, sha: 'abc123', isDefault: true },
    { name: 'develop', sha: 'def456' },
    { name: 'feature/new-ui', sha: 'ghi789' },
  ];

  return (
    <BranchSelector
      branches={branches}
      currentRef={defaultBranch}
      owner={owner}
      repo={repo}
    />
  );
}
