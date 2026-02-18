import { describe, it, expect } from 'vitest';
import { EnabledFieldsService } from '../../utilities/enabled-fields-service';

describe('EnabledFieldsService', () => {
  describe('parseFromDatabase', () => {
    it('should parse valid JSON array', () => {
      const input = JSON.stringify([
        { collection: 'articles', fields: ['title', 'content'] },
        { collection: 'pages', fields: ['name'] },
      ]);

      const result = EnabledFieldsService.parseFromDatabase(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ collection: 'articles', fields: ['title', 'content'] });
      expect(result[1]).toEqual({ collection: 'pages', fields: ['name'] });
    });

    it('should return empty array for empty JSON array', () => {
      const result = EnabledFieldsService.parseFromDatabase('[]');
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const result = EnabledFieldsService.parseFromDatabase('not valid json');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      const result = EnabledFieldsService.parseFromDatabase('');
      expect(result).toEqual([]);
    });

    it('should return empty array for malformed JSON', () => {
      const result = EnabledFieldsService.parseFromDatabase('[{invalid}]');
      expect(result).toEqual([]);
    });

    it('should handle nested objects', () => {
      const input = JSON.stringify([
        {
          collection: 'articles',
          fields: ['title'],
          nested: { key: 'value' },
        },
      ]);

      const result = EnabledFieldsService.parseFromDatabase(input);

      expect(result[0]).toHaveProperty('nested');
    });
  });

  describe('prepareForDatabase', () => {
    it('should stringify valid array', () => {
      const input = [
        { collection: 'articles', fields: ['title', 'content'] },
        { collection: 'pages', fields: ['name'] },
      ];

      const result = EnabledFieldsService.prepareForDatabase(input);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual(input[0]);
    });

    it('should return empty array string for empty array', () => {
      const result = EnabledFieldsService.prepareForDatabase([]);
      expect(result).toBe('[]');
    });

    it('should return empty array string for non-array input', () => {
      const result = EnabledFieldsService.prepareForDatabase('not an array' as any);
      expect(result).toBe('[]');
    });

    it('should return empty array string for null', () => {
      const result = EnabledFieldsService.prepareForDatabase(null as any);
      expect(result).toBe('[]');
    });

    it('should return empty array string for undefined', () => {
      const result = EnabledFieldsService.prepareForDatabase(undefined as any);
      expect(result).toBe('[]');
    });

    it('should return empty array string for object', () => {
      const result = EnabledFieldsService.prepareForDatabase({ key: 'value' } as any);
      expect(result).toBe('[]');
    });

    it('should preserve field structure', () => {
      const input = [{ collection: 'test', fields: ['a', 'b', 'c'] }];
      const result = EnabledFieldsService.prepareForDatabase(input);
      const parsed = JSON.parse(result);

      expect(parsed[0].fields).toEqual(['a', 'b', 'c']);
    });
  });

  describe('roundtrip', () => {
    it('should maintain data integrity through parse and prepare cycle', () => {
      const original = [
        { collection: 'articles', fields: ['title', 'content', 'slug'] },
        { collection: 'pages', fields: ['name', 'body'] },
      ];

      const stringified = EnabledFieldsService.prepareForDatabase(original);
      const parsed = EnabledFieldsService.parseFromDatabase(stringified);

      expect(parsed).toEqual(original);
    });

    it('should preserve projectId and itemIds through round-trip', () => {
      const original = [
        { collection: 'articles', fields: ['title'], projectId: 'proj-1', itemIds: ['10', '20'] },
        { collection: 'pages', fields: ['name'], projectId: 'proj-2' },
        { collection: 'posts', fields: ['body'] },
      ];

      const stringified = EnabledFieldsService.prepareForDatabase(original);
      const parsed = EnabledFieldsService.parseFromDatabase(stringified);

      expect(parsed).toEqual(original);
      expect(parsed[0].projectId).toBe('proj-1');
      expect(parsed[0].itemIds).toEqual(['10', '20']);
      expect(parsed[1].projectId).toBe('proj-2');
      expect(parsed[1].itemIds).toBeUndefined();
      expect(parsed[2].projectId).toBeUndefined();
      expect(parsed[2].itemIds).toBeUndefined();
    });

    it('should handle legacy data without projectId or itemIds', () => {
      const legacyJson = JSON.stringify([
        { collection: 'articles', fields: ['title', 'content'] },
      ]);
      const parsed = EnabledFieldsService.parseFromDatabase(legacyJson);

      expect(parsed[0].projectId).toBeUndefined();
      expect(parsed[0].itemIds).toBeUndefined();
      expect(parsed[0].collection).toBe('articles');
      expect(parsed[0].fields).toEqual(['title', 'content']);
    });
  });

  describe('groupByProject', () => {
    it('should group fields by their projectId', () => {
      const fields = [
        { collection: 'articles', fields: ['title'], projectId: 'proj-1' },
        { collection: 'pages', fields: ['name'], projectId: 'proj-2' },
        { collection: 'posts', fields: ['body'], projectId: 'proj-1' },
      ];

      const result = EnabledFieldsService.groupByProject(fields, 'default-proj');

      expect(result.size).toBe(2);
      expect(result.get('proj-1')).toHaveLength(2);
      expect(result.get('proj-2')).toHaveLength(1);
      expect(result.get('proj-1')![0].collection).toBe('articles');
      expect(result.get('proj-1')![1].collection).toBe('posts');
    });

    it('should use defaultProjectId for fields without projectId', () => {
      const fields = [
        { collection: 'articles', fields: ['title'] },
        { collection: 'pages', fields: ['name'], projectId: 'proj-2' },
        { collection: 'posts', fields: ['body'] },
      ];

      const result = EnabledFieldsService.groupByProject(fields, 'default-proj');

      expect(result.size).toBe(2);
      expect(result.get('default-proj')).toHaveLength(2);
      expect(result.get('proj-2')).toHaveLength(1);
    });

    it('should group all fields under default when none have projectId', () => {
      const fields = [
        { collection: 'articles', fields: ['title'] },
        { collection: 'pages', fields: ['name'] },
      ];

      const result = EnabledFieldsService.groupByProject(fields, 'default-proj');

      expect(result.size).toBe(1);
      expect(result.get('default-proj')).toHaveLength(2);
    });

    it('should return empty map for empty fields', () => {
      const result = EnabledFieldsService.groupByProject([], 'default-proj');

      expect(result.size).toBe(0);
    });

    it('should handle mixed undefined and explicit projectId matching default', () => {
      const fields = [
        { collection: 'articles', fields: ['title'] },
        { collection: 'pages', fields: ['name'], projectId: 'default-proj' },
      ];

      const result = EnabledFieldsService.groupByProject(fields, 'default-proj');

      expect(result.size).toBe(1);
      expect(result.get('default-proj')).toHaveLength(2);
    });
  });

  describe('buildTranslatableCollections', () => {
    it('should extract unique collections from enabled fields', () => {
      const fields = [
        { collection: 'articles', fields: ['title'] },
        { collection: 'pages', fields: ['name'] },
      ];

      const result = EnabledFieldsService.buildTranslatableCollections(fields);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ collection: 'articles' });
      expect(result[1]).toEqual({ collection: 'pages' });
    });

    it('should include itemIds when present', () => {
      const fields = [
        { collection: 'articles', fields: ['title'], itemIds: ['1', '2', '3'] },
      ];

      const result = EnabledFieldsService.buildTranslatableCollections(fields);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ collection: 'articles', itemIds: ['1', '2', '3'] });
    });

    it('should merge itemIds for duplicate collections', () => {
      const fields = [
        { collection: 'articles', fields: ['title'], itemIds: ['1', '2'] },
        { collection: 'articles', fields: ['content'], itemIds: ['2', '3'] },
      ];

      const result = EnabledFieldsService.buildTranslatableCollections(fields);

      expect(result).toHaveLength(1);
      expect(result[0].collection).toBe('articles');
      expect(result[0].itemIds).toEqual(['1', '2', '3']);
    });

    it('should use "all items" when any entry lacks itemIds', () => {
      const fields = [
        { collection: 'articles', fields: ['title'], itemIds: ['1', '2'] },
        { collection: 'articles', fields: ['content'] },
      ];

      const result = EnabledFieldsService.buildTranslatableCollections(fields);

      expect(result).toHaveLength(1);
      expect(result[0].collection).toBe('articles');
      expect(result[0].itemIds).toBeUndefined();
    });

    it('should handle empty input', () => {
      const result = EnabledFieldsService.buildTranslatableCollections([]);
      expect(result).toEqual([]);
    });

    it('should deduplicate itemIds', () => {
      const fields = [
        { collection: 'articles', fields: ['title'], itemIds: ['1', '1', '2'] },
        { collection: 'articles', fields: ['body'], itemIds: ['2', '3', '3'] },
      ];

      const result = EnabledFieldsService.buildTranslatableCollections(fields);

      expect(result[0].itemIds).toEqual(['1', '2', '3']);
    });

    it('should handle multiple collections with mixed itemIds', () => {
      const fields = [
        { collection: 'articles', fields: ['title'], itemIds: ['1'] },
        { collection: 'pages', fields: ['name'] },
        { collection: 'articles', fields: ['body'], itemIds: ['2'] },
      ];

      const result = EnabledFieldsService.buildTranslatableCollections(fields);

      expect(result).toHaveLength(2);
      const articles = result.find((r) => r.collection === 'articles');
      const pages = result.find((r) => r.collection === 'pages');
      expect(articles?.itemIds).toEqual(['1', '2']);
      expect(pages?.itemIds).toBeUndefined();
    });
  });
});
