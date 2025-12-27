interface JobGraphNode {
  id: string;
  name: string;
  status: string;
  level: number;
  duration?: number;
  dependencies: string[];
}

interface JobGraph {
  nodes: JobGraphNode[];
  edges: Array<{ from: string; to: string }>;
  criticalPath: string[];
  levels: number;
}

export function buildJobGraph(jobs: any[]): JobGraph {
  if (!jobs || jobs.length === 0) {
    return { nodes: [], edges: [], criticalPath: [], levels: 0 };
  }

  const nodes: JobGraphNode[] = [];
  const edges: Array<{ from: string; to: string }> = [];
  const levelMap = new Map<string, number>();
  
  // Build dependency map from job names
  const jobMap = new Map(jobs.map(j => [j.jobName, j]));
  const dependencyMap = new Map<string, string[]>();
  
  // Parse dependencies (assuming jobs have a needs field or we infer from execution order)
  for (const job of jobs) {
    // For now, we'll use a simple heuristic: jobs are sequential unless they start at similar times
    dependencyMap.set(job.jobName, []);
  }
  
  // Calculate levels based on dependencies
  function calculateLevel(jobName: string, visited = new Set<string>()): number {
    if (visited.has(jobName)) return 0; // Circular dependency protection
    visited.add(jobName);
    
    if (levelMap.has(jobName)) {
      return levelMap.get(jobName)!;
    }
    
    const deps = dependencyMap.get(jobName) || [];
    if (deps.length === 0) {
      levelMap.set(jobName, 0);
      return 0;
    }
    
    const maxDepLevel = Math.max(...deps.map(dep => calculateLevel(dep, visited)));
    const level = maxDepLevel + 1;
    levelMap.set(jobName, level);
    return level;
  }
  
  // Calculate levels for all jobs
  for (const job of jobs) {
    calculateLevel(job.jobName);
  }
  
  // Build nodes
  for (const job of jobs) {
    const duration = job.startedAt && job.completedAt
      ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
      : undefined;
    
    nodes.push({
      id: job.jobName,
      name: job.jobName,
      status: job.state,
      level: levelMap.get(job.jobName) || 0,
      duration,
      dependencies: dependencyMap.get(job.jobName) || [],
    });
  }
  
  // Build edges
  for (const [jobName, deps] of dependencyMap) {
    for (const dep of deps) {
      edges.push({ from: dep, to: jobName });
    }
  }
  
  // Calculate critical path (longest duration path)
  const criticalPath = findCriticalPath(nodes, edges);
  const maxLevel = Math.max(...nodes.map(n => n.level), 0);
  
  return {
    nodes,
    edges,
    criticalPath,
    levels: maxLevel + 1,
  };
}

function findCriticalPath(nodes: JobGraphNode[], edges: Array<{ from: string; to: string }>): string[] {
  if (nodes.length === 0) return [];
  
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const distance = new Map<string, number>();
  const parent = new Map<string, string | null>();
  
  // Topological sort
  const sorted: string[] = [];
  const visited = new Set<string>();
  
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodeMap.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        visit(dep);
      }
    }
    sorted.push(id);
  }
  
  nodes.forEach(n => visit(n.id));
  
  // Find longest path by duration
  for (const id of sorted) {
    const node = nodeMap.get(id)!;
    const duration = node.duration || 1000; // Default 1s if no duration
    
    let maxDist = 0;
    let maxParent: string | null = null;
    
    for (const dep of node.dependencies) {
      const depDist = distance.get(dep) || 0;
      if (depDist > maxDist) {
        maxDist = depDist;
        maxParent = dep;
      }
    }
    
    distance.set(id, maxDist + duration);
    parent.set(id, maxParent);
  }
  
  // Backtrack from node with max distance
  let maxNode = sorted[0];
  let maxDist = 0;
  for (const [id, dist] of distance) {
    if (dist > maxDist) {
      maxDist = dist;
      maxNode = id;
    }
  }
  
  const path: string[] = [];
  let current: string | null = maxNode;
  while (current) {
    path.unshift(current);
    current = parent.get(current) || null;
  }
  
  return path;
}
