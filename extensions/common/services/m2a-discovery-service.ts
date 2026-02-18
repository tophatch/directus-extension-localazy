import { Field, Relation } from '@directus/types';
import { FieldsUtilsService } from '../utilities/fields-utils-service';

export type M2ARelationInfo = {
  fieldName: string;
  junctionCollection: string;
  junctionParentField: string;
  junctionItemField: string;
  junctionCollectionField: string;
  allowedCollections: string[];
};

export type DiscoveredChildContent = {
  collection: string;
  itemIds: string[];
  fields: string[];
};

type GetFieldsForCollection = (collection: string) => Field[];
type GetRelationsForField = (collection: string, field: string) => Relation[];
type FetchDirectusItems = <T>(collection: string, query?: Record<string, any>) => Promise<T[]>;

export class M2ADiscoveryService {
  /**
   * Finds all M2A (Many-to-Any) fields on a collection by inspecting field metadata and relations.
   */
  static findM2AFields(
    collection: string,
    getFieldsForCollection: GetFieldsForCollection,
    getRelationsForField: GetRelationsForField,
  ): M2ARelationInfo[] {
    const fields = getFieldsForCollection(collection);
    const m2aFields = fields.filter(
      (f) => f.meta?.interface === 'list-m2a' || f.meta?.special?.includes('m2a'),
    );

    const results: M2ARelationInfo[] = [];

    for (const field of m2aFields) {
      const relations = getRelationsForField(collection, field.field);

      // M2A relations in Directus: the relation points from the junction table back to the parent.
      // We need to find the junction collection and extract its fields.
      // For a M2A field, Directus stores one relation per allowed collection.
      // All relations share the same junction collection.
      if (relations.length === 0) continue;

      let junctionCollection = '';
      let junctionParentField = '';
      let junctionItemField = 'item';
      let junctionCollectionField = 'collection';
      const allowedCollections: string[] = [];

      for (const relation of relations) {
        // The relation.collection is the junction table
        // The relation.field is the FK pointing to something
        // relation.related_collection is what it points to

        if (relation.related_collection === collection) {
          // This is the relation from junction back to parent
          junctionCollection = relation.collection;
          junctionParentField = relation.field;
        } else if (relation.related_collection) {
          // This points to an allowed child collection
          junctionCollection = junctionCollection || relation.collection;
          junctionItemField = relation.field || 'item';
          allowedCollections.push(relation.related_collection);
        }

        // Check relation.meta for M2A-specific config
        if (relation.meta?.one_collection_field) {
          junctionCollectionField = relation.meta.one_collection_field;
        }
        if (relation.meta?.junction_field) {
          // junction_field on the parent-side relation points to the item field
          if (relation.related_collection === collection) {
            junctionItemField = relation.meta.junction_field;
          }
        }
      }

      // Also check field.meta for allowed collections (Directus stores this in field options)
      if (allowedCollections.length === 0 && field.meta?.options?.allowedCollections) {
        allowedCollections.push(...field.meta.options.allowedCollections);
      }

      // For M2A, Directus may also store allowed_collections on the relation meta
      for (const relation of relations) {
        if (relation.meta?.one_allowed_collections) {
          const stored = relation.meta.one_allowed_collections;
          if (Array.isArray(stored) && stored.length > 0 && allowedCollections.length === 0) {
            allowedCollections.push(...stored);
          }
        }
      }

      if (junctionCollection && junctionParentField) {
        results.push({
          fieldName: field.field,
          junctionCollection,
          junctionParentField,
          junctionItemField,
          junctionCollectionField,
          allowedCollections,
        });
      }
    }

    return results;
  }

  /**
   * Queries the junction table to discover which child items exist for given parent items.
   * Returns a Map of childCollection → childItemIds[].
   */
  static async discoverChildItems(
    m2aRelation: M2ARelationInfo,
    parentItemIds: string[] | undefined,
    fetchDirectusItems: FetchDirectusItems,
  ): Promise<Map<string, string[]>> {
    const query: Record<string, any> = {
      fields: [m2aRelation.junctionItemField, m2aRelation.junctionCollectionField],
      limit: -1,
    };

    if (parentItemIds && parentItemIds.length > 0) {
      query.filter = {
        [m2aRelation.junctionParentField]: { _in: parentItemIds },
      };
    }

    const junctionRows = await fetchDirectusItems<Record<string, any>>(
      m2aRelation.junctionCollection,
      query,
    );

    const result = new Map<string, string[]>();
    for (const row of junctionRows) {
      const childCollection = row[m2aRelation.junctionCollectionField];
      const childItemId = String(row[m2aRelation.junctionItemField]);
      if (!childCollection || !childItemId) continue;

      if (!result.has(childCollection)) {
        result.set(childCollection, []);
      }
      const ids = result.get(childCollection)!;
      if (!ids.includes(childItemId)) {
        ids.push(childItemId);
      }
    }

    return result;
  }

  /**
   * Gets the translatable fields for a collection by finding its translations relation.
   * Returns the translation field name and all string/text fields in the translations table.
   */
  static getTranslatableFields(
    collection: string,
    getFieldsForCollection: GetFieldsForCollection,
    getRelationsForField: GetRelationsForField,
  ): { translationFieldName: string; fields: string[] } | null {
    const fields = getFieldsForCollection(collection);
    const translationField = fields.find(FieldsUtilsService.isTranslationField);

    if (!translationField) return null;

    const relations = getRelationsForField(collection, translationField.field);
    if (relations.length === 0) return null;

    // The translations junction collection is the related collection of the first relation
    const translationsCollection = relations[0]!.collection;
    if (!translationsCollection) return null;

    const excludedFields = relations.map((r) => r.field);
    const translationFields = getFieldsForCollection(translationsCollection);

    const translatableFieldNames = translationFields
      .filter((f) => !excludedFields.includes(f.field))
      .filter(FieldsUtilsService.isTranslatableField)
      .map((f) => f.field);

    return {
      translationFieldName: translationField.field,
      fields: translatableFieldNames,
    };
  }

  /**
   * Recursively discovers all translatable child content reachable via M2A relations.
   * Handles nested M2A (e.g., pages → block_columns → nested blocks).
   */
  static async discoverAllChildContent(
    collection: string,
    parentItemIds: string[] | undefined,
    getFieldsForCollection: GetFieldsForCollection,
    getRelationsForField: GetRelationsForField,
    fetchDirectusItems: FetchDirectusItems,
    maxDepth: number = 3,
  ): Promise<DiscoveredChildContent[]> {
    if (maxDepth <= 0) return [];

    const m2aFields = M2ADiscoveryService.findM2AFields(
      collection,
      getFieldsForCollection,
      getRelationsForField,
    );

    if (m2aFields.length === 0) return [];

    const results: DiscoveredChildContent[] = [];
    // Track seen items to deduplicate across multiple M2A paths
    const seen = new Map<string, Set<string>>();

    for (const m2aField of m2aFields) {
      const childItemsMap = await M2ADiscoveryService.discoverChildItems(
        m2aField,
        parentItemIds,
        fetchDirectusItems,
      );

      for (const [childCollection, childItemIds] of childItemsMap) {
        // Check if this child collection is translatable
        const translatableInfo = M2ADiscoveryService.getTranslatableFields(
          childCollection,
          getFieldsForCollection,
          getRelationsForField,
        );

        if (translatableInfo && translatableInfo.fields.length > 0) {
          // Deduplicate item IDs
          if (!seen.has(childCollection)) {
            seen.set(childCollection, new Set());
          }
          const seenIds = seen.get(childCollection)!;
          const newIds = childItemIds.filter((id) => !seenIds.has(id));
          newIds.forEach((id) => seenIds.add(id));

          if (newIds.length > 0) {
            // Check if we already have an entry for this collection
            const existing = results.find((r) => r.collection === childCollection);
            if (existing) {
              existing.itemIds.push(...newIds);
            } else {
              results.push({
                collection: childCollection,
                itemIds: [...newIds],
                fields: translatableInfo.fields,
              });
            }
          }
        }

        // Recurse: check if the child collection itself has M2A fields (e.g., block_columns)
        const childM2AFields = M2ADiscoveryService.findM2AFields(
          childCollection,
          getFieldsForCollection,
          getRelationsForField,
        );

        if (childM2AFields.length > 0) {
          const nestedChildren = await M2ADiscoveryService.discoverAllChildContent(
            childCollection,
            childItemIds,
            getFieldsForCollection,
            getRelationsForField,
            fetchDirectusItems,
            maxDepth - 1,
          );

          for (const nested of nestedChildren) {
            if (!seen.has(nested.collection)) {
              seen.set(nested.collection, new Set());
            }
            const seenIds = seen.get(nested.collection)!;
            const newIds = nested.itemIds.filter((id) => !seenIds.has(id));
            newIds.forEach((id) => seenIds.add(id));

            if (newIds.length > 0) {
              const existing = results.find((r) => r.collection === nested.collection);
              if (existing) {
                existing.itemIds.push(...newIds);
              } else {
                results.push({
                  collection: nested.collection,
                  itemIds: [...newIds],
                  fields: nested.fields,
                });
              }
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Counts the number of M2A-discoverable block types for a collection (for UI summary).
   */
  static countM2ABlockTypes(
    collection: string,
    getFieldsForCollection: GetFieldsForCollection,
    getRelationsForField: GetRelationsForField,
  ): number {
    const m2aFields = M2ADiscoveryService.findM2AFields(
      collection,
      getFieldsForCollection,
      getRelationsForField,
    );

    const translatableChildren = new Set<string>();

    for (const m2aField of m2aFields) {
      for (const childCollection of m2aField.allowedCollections) {
        const info = M2ADiscoveryService.getTranslatableFields(
          childCollection,
          getFieldsForCollection,
          getRelationsForField,
        );
        if (info && info.fields.length > 0) {
          translatableChildren.add(childCollection);
        }

        // Also check nested M2A (e.g., block_columns has its own allowed collections)
        const nestedM2A = M2ADiscoveryService.findM2AFields(
          childCollection,
          getFieldsForCollection,
          getRelationsForField,
        );
        for (const nested of nestedM2A) {
          for (const nestedChild of nested.allowedCollections) {
            const nestedInfo = M2ADiscoveryService.getTranslatableFields(
              nestedChild,
              getFieldsForCollection,
              getRelationsForField,
            );
            if (nestedInfo && nestedInfo.fields.length > 0) {
              translatableChildren.add(nestedChild);
            }
          }
        }
      }
    }

    return translatableChildren.size;
  }

  /**
   * Collects all collections that are targets of M2A relations across the entire schema.
   * Used to hide these collections from the top-level UI.
   */
  static findAllM2ATargetCollections(
    allCollections: { collection: string }[],
    getFieldsForCollection: GetFieldsForCollection,
    getRelationsForField: GetRelationsForField,
  ): Set<string> {
    const targets = new Set<string>();
    for (const col of allCollections) {
      const m2aFields = M2ADiscoveryService.findM2AFields(
        col.collection,
        getFieldsForCollection,
        getRelationsForField,
      );
      for (const rel of m2aFields) {
        rel.allowedCollections.forEach((c) => targets.add(c));
        // Also add the junction table itself
        targets.add(rel.junctionCollection);
      }
    }
    return targets;
  }
}
