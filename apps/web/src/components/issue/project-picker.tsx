import { Check, FolderKanban, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Project {
  id: string;
  name: string;
  icon: string | null;
}

interface ProjectPickerProps {
  availableProjects: Project[];
  selectedProject: Project | null;
  onProjectChange: (project: Project | null) => void;
  isLoading?: boolean;
}

export function ProjectPicker({
  availableProjects,
  selectedProject,
  onProjectChange,
  isLoading,
}: ProjectPickerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Project</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 gap-1" disabled={isLoading}>
              <FolderKanban className="h-3 w-3" />
              {isLoading ? 'Saving...' : 'Edit'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {/* Option to remove from project */}
            {selectedProject && (
              <DropdownMenuItem
                onClick={() => onProjectChange(null)}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <X className="h-3 w-3" />
                <span>Remove from project</span>
              </DropdownMenuItem>
            )}
            {availableProjects.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No projects available
              </div>
            ) : (
              availableProjects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => onProjectChange(isSelected ? null : project)}
                    className="flex items-center gap-2"
                  >
                    {project.icon && <span>{project.icon}</span>}
                    {!project.icon && <FolderKanban className="h-3 w-3" />}
                    <span className="flex-1">{project.name}</span>
                    {isSelected && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Selected project display */}
      {selectedProject ? (
        <div className="flex items-center gap-2 text-sm">
          {selectedProject.icon && <span>{selectedProject.icon}</span>}
          {!selectedProject.icon && <FolderKanban className="h-3 w-3 text-muted-foreground" />}
          <span>{selectedProject.name}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No project</p>
      )}
    </div>
  );
}
