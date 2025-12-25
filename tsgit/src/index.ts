// tsgit - A Git implementation in TypeScript
// Export core functionality for programmatic use

export * from './core/types';
export * from './core/object';
export * from './core/object-store';
export { Index, buildTreeFromIndex } from './core/index';
export * from './core/refs';
export * from './core/repository';
export * from './core/diff';

// Export utilities
export * from './utils/hash';
export * from './utils/compression';
