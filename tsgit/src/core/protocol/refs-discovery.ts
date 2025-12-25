import {
  RefAdvertisement,
  RefInfo,
  Capabilities,
  parsePktLines,
} from './types';

/**
 * Parse capabilities string into Capabilities object
 */
export function parseCapabilities(capStr: string): Capabilities {
  const caps: Capabilities = {};
  const parts = capStr.split(' ');

  for (const part of parts) {
    if (!part) continue;

    const eqIndex = part.indexOf('=');
    if (eqIndex !== -1) {
      // Capability with value
      const key = part.slice(0, eqIndex);
      const value = part.slice(eqIndex + 1);
      caps[key] = value;
    } else {
      // Boolean capability
      caps[part] = true;
    }
  }

  return caps;
}

/**
 * Serialize capabilities to string
 */
export function serializeCapabilities(caps: Capabilities): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(caps)) {
    if (value === undefined) continue;
    
    if (typeof value === 'boolean') {
      if (value) {
        parts.push(key);
      }
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.join(' ');
}

/**
 * Parse smart HTTP ref advertisement response
 * Format: Each line is "{hash} {refname}\0{capabilities}" or "{hash} {refname}"
 */
export function parseRefAdvertisement(data: Buffer, service?: string): RefAdvertisement {
  const { lines } = parsePktLines(data);
  const refs: RefInfo[] = [];
  let capabilities: Capabilities = {};
  let head: string | undefined;
  let version = 1;
  let firstRef = true;

  for (const line of lines) {
    // Skip empty lines (flush packets)
    if (line.length === 0) {
      continue;
    }

    const lineStr = line.toString('utf8').trim();

    // Skip comment lines
    if (lineStr.startsWith('#')) {
      // Check for service announcement
      if (lineStr.startsWith('# service=')) {
        // Service line, skip
        continue;
      }
      continue;
    }

    // Check for version line
    if (lineStr.startsWith('version ')) {
      version = parseInt(lineStr.slice(8), 10);
      continue;
    }

    // Parse ref line
    // Format: {hash} {refname}\0{capabilities} or {hash} {refname}
    const nullIndex = lineStr.indexOf('\0');
    let hashAndRef: string;
    let capStr = '';

    if (nullIndex !== -1) {
      hashAndRef = lineStr.slice(0, nullIndex);
      capStr = lineStr.slice(nullIndex + 1);
    } else {
      hashAndRef = lineStr;
    }

    const spaceIndex = hashAndRef.indexOf(' ');
    if (spaceIndex === -1) {
      continue;
    }

    const hash = hashAndRef.slice(0, spaceIndex);
    const refName = hashAndRef.slice(spaceIndex + 1);

    // Validate hash format (40 or 64 hex chars)
    if (!/^[0-9a-f]{40,64}$/.test(hash)) {
      continue;
    }

    // Parse capabilities from first ref line
    if (firstRef && capStr) {
      capabilities = parseCapabilities(capStr);
      firstRef = false;
    }

    // Check for peeled refs (annotated tag dereferencing)
    if (refName.endsWith('^{}')) {
      const actualRefName = refName.slice(0, -3);
      // Find the existing ref and add peeled hash
      const existingRef = refs.find(r => r.name === actualRefName);
      if (existingRef) {
        existingRef.peeled = hash;
      }
      continue;
    }

    refs.push({ hash, name: refName });

    // Track HEAD
    if (refName === 'HEAD') {
      head = hash;
    }
  }

  // Try to determine what HEAD points to from symref capability
  const symref = capabilities['symref'];
  if (typeof symref === 'string' && symref.startsWith('HEAD:')) {
    // Format: "HEAD:refs/heads/main"
    // This tells us what branch HEAD points to
  }

  return { refs, capabilities, head, version };
}

/**
 * Find the ref that HEAD points to based on capabilities and refs
 */
export function resolveHead(advertisement: RefAdvertisement): string | null {
  const symref = advertisement.capabilities['symref'];
  
  if (typeof symref === 'string' && symref.startsWith('HEAD:')) {
    return symref.slice(5); // Return the target ref name
  }

  // If no symref, try to find HEAD in refs
  const headRef = advertisement.refs.find(r => r.name === 'HEAD');
  if (headRef) {
    // Find a branch with the same hash
    const matchingBranch = advertisement.refs.find(
      r => r.hash === headRef.hash && r.name !== 'HEAD' && r.name.startsWith('refs/heads/')
    );
    return matchingBranch?.name || null;
  }

  return null;
}

/**
 * Filter refs based on refspec patterns
 */
export function filterRefsByPattern(refs: RefInfo[], patterns: string[]): RefInfo[] {
  if (patterns.length === 0) {
    return refs;
  }

  return refs.filter(ref => {
    return patterns.some(pattern => {
      // Convert glob pattern to regex
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(ref.name);
      }
      return ref.name === pattern || ref.name.startsWith(pattern + '/');
    });
  });
}

/**
 * Parse a refspec and determine source/destination refs
 */
export interface ParsedRefspec {
  force: boolean;
  source: string;
  destination: string;
  isGlob: boolean;
}

export function parseRefspec(refspec: string): ParsedRefspec {
  let force = false;
  let spec = refspec;

  if (spec.startsWith('+')) {
    force = true;
    spec = spec.slice(1);
  }

  const colonIndex = spec.indexOf(':');
  if (colonIndex === -1) {
    return {
      force,
      source: spec,
      destination: spec,
      isGlob: spec.includes('*'),
    };
  }

  const source = spec.slice(0, colonIndex);
  const destination = spec.slice(colonIndex + 1);

  return {
    force,
    source,
    destination,
    isGlob: source.includes('*') || destination.includes('*'),
  };
}

/**
 * Apply a refspec to transform ref names for fetch
 * Returns the local ref name for a given remote ref
 */
export function applyFetchRefspec(remoteRef: string, refspec: ParsedRefspec): string | null {
  const { source, destination, isGlob } = refspec;

  if (isGlob) {
    // Pattern matching
    const sourcePattern = source.replace(/\*/g, '(.+)');
    const regex = new RegExp(`^${sourcePattern}$`);
    const match = remoteRef.match(regex);

    if (!match) {
      return null;
    }

    // Replace * in destination with captured group
    return destination.replace(/\*/g, match[1]);
  }

  // Exact match
  if (remoteRef === source) {
    return destination;
  }

  return null;
}

/**
 * Get all branches from ref advertisement
 */
export function getBranches(advertisement: RefAdvertisement): RefInfo[] {
  return advertisement.refs.filter(ref => ref.name.startsWith('refs/heads/'));
}

/**
 * Get all tags from ref advertisement
 */
export function getTags(advertisement: RefAdvertisement): RefInfo[] {
  return advertisement.refs.filter(ref => ref.name.startsWith('refs/tags/'));
}

/**
 * Check if server supports a capability
 */
export function hasCapability(advertisement: RefAdvertisement, cap: string): boolean {
  return advertisement.capabilities[cap] !== undefined;
}

/**
 * Get the object format (hash algorithm) from capabilities
 */
export function getObjectFormat(advertisement: RefAdvertisement): 'sha1' | 'sha256' {
  const format = advertisement.capabilities['object-format'];
  if (typeof format === 'string' && format === 'sha256') {
    return 'sha256';
  }
  return 'sha1';
}
