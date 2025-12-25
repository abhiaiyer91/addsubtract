/**
 * Tests for the tag command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createLightweightTag,
  createAnnotatedTag,
  deleteTag,
  listTags,
  getTagInfo,
} from '../commands/tag';
import {
  createRepoWithCommit,
  createRepoWithMultipleCommits,
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('tag command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('createLightweightTag', () => {
    it('should create a lightweight tag pointing to HEAD', () => {
      const hash = createLightweightTag(repo, 'v1.0.0');

      expect(hash).toBeDefined();
      expect(repo.refs.tagExists('v1.0.0')).toBe(true);

      // Should point directly to the commit
      const resolvedHash = repo.refs.resolve('v1.0.0');
      expect(resolvedHash).toBe(hash);
    });

    it('should create a tag pointing to a specific commit', () => {
      const headHash = repo.refs.resolve('HEAD')!;

      const hash = createLightweightTag(repo, 'v1.0.0', headHash);

      expect(hash).toBe(headHash);
    });

    it('should throw error if tag already exists', () => {
      createLightweightTag(repo, 'v1.0.0');

      expect(() => createLightweightTag(repo, 'v1.0.0')).toThrow(
        "Tag 'v1.0.0' already exists"
      );
    });

    it('should overwrite tag with force option', () => {
      createLightweightTag(repo, 'v1.0.0');

      // This should not throw
      const hash = createLightweightTag(repo, 'v1.0.0', undefined, true);

      expect(hash).toBeDefined();
    });

    it('should throw error for invalid ref', () => {
      expect(() => createLightweightTag(repo, 'v1.0.0', 'nonexistent')).toThrow(
        "Cannot resolve 'nonexistent'"
      );
    });
  });

  describe('createAnnotatedTag', () => {
    it('should create an annotated tag with message', () => {
      const hash = createAnnotatedTag(repo, 'v1.0.0', 'Release version 1.0.0');

      expect(hash).toBeDefined();
      expect(repo.refs.tagExists('v1.0.0')).toBe(true);

      // Should create a tag object
      const obj = repo.objects.readObject(hash);
      expect(obj.type).toBe('tag');
    });

    it('should include tagger information', () => {
      const hash = createAnnotatedTag(repo, 'v1.0.0', 'Release version 1.0.0');

      const info = getTagInfo(repo, 'v1.0.0');

      expect(info.isAnnotated).toBe(true);
      expect(info.tagger).toBeDefined();
      expect(info.tagger?.name).toBeDefined();
      expect(info.tagger?.email).toBeDefined();
    });

    it('should store the tag message', () => {
      createAnnotatedTag(repo, 'v1.0.0', 'This is my release message');

      const info = getTagInfo(repo, 'v1.0.0');

      expect(info.message).toBe('This is my release message');
    });

    it('should throw error if tag already exists', () => {
      createAnnotatedTag(repo, 'v1.0.0', 'First');

      expect(() => createAnnotatedTag(repo, 'v1.0.0', 'Second')).toThrow(
        "Tag 'v1.0.0' already exists"
      );
    });

    it('should overwrite tag with force option', () => {
      createAnnotatedTag(repo, 'v1.0.0', 'First');

      const hash = createAnnotatedTag(repo, 'v1.0.0', 'Second', undefined, true);

      expect(hash).toBeDefined();
      const info = getTagInfo(repo, 'v1.0.0');
      expect(info.message).toBe('Second');
    });

    it('should record creation date', () => {
      const before = Date.now();
      createAnnotatedTag(repo, 'v1.0.0', 'Release');
      const after = Date.now();

      const info = getTagInfo(repo, 'v1.0.0');

      expect(info.date).toBeDefined();
      expect(info.date!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(info.date!.getTime()).toBeLessThanOrEqual(after + 1000);
    });
  });

  describe('deleteTag', () => {
    it('should delete an existing tag', () => {
      createLightweightTag(repo, 'v1.0.0');
      expect(repo.refs.tagExists('v1.0.0')).toBe(true);

      deleteTag(repo, 'v1.0.0');

      expect(repo.refs.tagExists('v1.0.0')).toBe(false);
    });

    it('should delete annotated tags', () => {
      createAnnotatedTag(repo, 'v1.0.0', 'Release');

      deleteTag(repo, 'v1.0.0');

      expect(repo.refs.tagExists('v1.0.0')).toBe(false);
    });

    it('should throw error for non-existent tag', () => {
      expect(() => deleteTag(repo, 'nonexistent')).toThrow(
        "Tag 'nonexistent' not found"
      );
    });
  });

  describe('listTags', () => {
    it('should return empty array when no tags exist', () => {
      const tags = listTags(repo);

      expect(tags).toHaveLength(0);
    });

    it('should list all tags sorted alphabetically', () => {
      createLightweightTag(repo, 'v2.0.0');
      createLightweightTag(repo, 'v1.0.0');
      createLightweightTag(repo, 'v1.5.0');

      const tags = listTags(repo);

      expect(tags).toEqual(['v1.0.0', 'v1.5.0', 'v2.0.0']);
    });

    it('should filter tags by pattern', () => {
      createLightweightTag(repo, 'v1.0.0');
      createLightweightTag(repo, 'v1.5.0');
      createLightweightTag(repo, 'v2.0.0');
      createLightweightTag(repo, 'release-1');

      const v1Tags = listTags(repo, 'v1.*');

      expect(v1Tags).toEqual(['v1.0.0', 'v1.5.0']);
    });

    it('should support ? wildcard in pattern', () => {
      createLightweightTag(repo, 'v1.0.0');
      createLightweightTag(repo, 'v1.0.1');
      createLightweightTag(repo, 'v1.0.10');

      const tags = listTags(repo, 'v1.0.?');

      expect(tags).toEqual(['v1.0.0', 'v1.0.1']);
    });

    it('should list both lightweight and annotated tags', () => {
      createLightweightTag(repo, 'light-tag');
      createAnnotatedTag(repo, 'annotated-tag', 'Message');

      const tags = listTags(repo);

      expect(tags).toContain('light-tag');
      expect(tags).toContain('annotated-tag');
    });
  });

  describe('getTagInfo', () => {
    it('should return info for lightweight tag', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      createLightweightTag(repo, 'v1.0.0');

      const info = getTagInfo(repo, 'v1.0.0');

      expect(info.name).toBe('v1.0.0');
      expect(info.isAnnotated).toBe(false);
      expect(info.targetHash).toBe(commitHash);
      expect(info.message).toBeUndefined();
      expect(info.tagger).toBeUndefined();
    });

    it('should return info for annotated tag', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      createAnnotatedTag(repo, 'v1.0.0', 'Release notes here');

      const info = getTagInfo(repo, 'v1.0.0');

      expect(info.name).toBe('v1.0.0');
      expect(info.isAnnotated).toBe(true);
      expect(info.targetHash).toBe(commitHash);
      expect(info.message).toBe('Release notes here');
      expect(info.tagger).toBeDefined();
      expect(info.date).toBeDefined();
    });

    it('should throw error for non-existent tag', () => {
      expect(() => getTagInfo(repo, 'nonexistent')).toThrow(
        "Tag 'nonexistent' not found"
      );
    });
  });

  describe('tagging specific commits', () => {
    let commits: string[];

    beforeEach(() => {
      consoleSuppressor.restore();
      restoreCwd();
      cleanupTempDir(testDir);
      
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
      commits = result.commits;
    });

    it('should tag a specific commit by hash', () => {
      const targetCommit = commits[0]; // First commit

      const hash = createLightweightTag(repo, 'v0.1.0', targetCommit);

      expect(hash).toBe(targetCommit);
      expect(repo.refs.resolve('v0.1.0')).toBe(targetCommit);
    });

    it('should tag different commits with different tags', () => {
      createLightweightTag(repo, 'v1.0.0', commits[0]);
      createLightweightTag(repo, 'v2.0.0', commits[1]);
      createLightweightTag(repo, 'v3.0.0', commits[2]);

      expect(repo.refs.resolve('v1.0.0')).toBe(commits[0]);
      expect(repo.refs.resolve('v2.0.0')).toBe(commits[1]);
      expect(repo.refs.resolve('v3.0.0')).toBe(commits[2]);
    });
  });

  describe('tag naming', () => {
    it('should allow semantic version tags', () => {
      createLightweightTag(repo, 'v1.0.0');
      createLightweightTag(repo, 'v1.0.0-beta.1');
      createLightweightTag(repo, 'v2.0.0-rc.1');

      const tags = listTags(repo);

      expect(tags).toContain('v1.0.0');
      expect(tags).toContain('v1.0.0-beta.1');
      expect(tags).toContain('v2.0.0-rc.1');
    });

    it('should allow release tags', () => {
      createLightweightTag(repo, 'release-2024-01-15');
      createLightweightTag(repo, 'production-v1');

      const tags = listTags(repo);

      expect(tags).toContain('release-2024-01-15');
      expect(tags).toContain('production-v1');
    });
  });

  describe('tag persistence', () => {
    it('should persist tags across repository instances', () => {
      createLightweightTag(repo, 'v1.0.0');
      createAnnotatedTag(repo, 'v2.0.0', 'Annotated release');

      // Create new repository instance
      const newRepo = Repository.find(testDir);

      expect(newRepo.refs.tagExists('v1.0.0')).toBe(true);
      expect(newRepo.refs.tagExists('v2.0.0')).toBe(true);

      const info = getTagInfo(newRepo, 'v2.0.0');
      expect(info.isAnnotated).toBe(true);
      expect(info.message).toBe('Annotated release');
    });
  });
});

