import { EnabledField } from '../models/collections-data/content-transfer-setup';

export class EnabledFieldsService {
  static parseFromDatabase(enabledFields: string): EnabledField[] {
    try {
      return JSON.parse(enabledFields);
    } catch (e) {
      return [];
    }
  }

  static prepareForDatabase(enabledFields: EnabledField[]): string {
    if (Array.isArray(enabledFields) === false) {
      return JSON.stringify([]);
    }
    return JSON.stringify(enabledFields);
  }

  /**
   * Groups enabled fields by their projectId. Fields without a projectId are grouped under the defaultProjectId.
   */
  static groupByProject(enabledFields: EnabledField[], defaultProjectId: string): Map<string, EnabledField[]> {
    const map = new Map<string, EnabledField[]>();
    for (const field of enabledFields) {
      const pid = field.projectId || defaultProjectId;
      if (!map.has(pid)) {
        map.set(pid, []);
      }
      map.get(pid)!.push(field);
    }
    return map;
  }

  /**
   * Builds a list of { collection, itemIds? } from enabled fields, merging duplicates per collection.
   */
  static buildTranslatableCollections(enabledFields: EnabledField[]): { collection: string; itemIds?: string[] }[] {
    const collectionMap = new Map<string, string[] | undefined>();
    for (const field of enabledFields) {
      const existing = collectionMap.get(field.collection);
      if (existing === undefined && !collectionMap.has(field.collection)) {
        // First time seeing this collection
        collectionMap.set(field.collection, field.itemIds ? [...field.itemIds] : undefined);
      } else if (field.itemIds && existing) {
        // Merge itemIds, dedup
        const merged = [...new Set([...existing, ...field.itemIds])];
        collectionMap.set(field.collection, merged);
      } else if (!field.itemIds) {
        // If any entry has no itemIds filter, it means "all items"
        collectionMap.set(field.collection, undefined);
      }
    }
    return Array.from(collectionMap.entries()).map(([collection, itemIds]) => ({
      collection,
      ...(itemIds ? { itemIds } : {}),
    }));
  }
}
