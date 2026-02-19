/* eslint-disable no-use-before-define */
import { sortBy, uniqWith } from 'lodash';
import { computed } from 'vue';
import { AppCollection } from '@directus/types';
import { useStores } from '@directus/extensions-sdk';
import { storeToRefs } from 'pinia';
import { FieldsUtilsService } from '../../../common/utilities/fields-utils-service';
import { M2ADiscoveryService } from '../../../common/services/m2a-discovery-service';

export const useCollectionsOrganizer = () => {
  const { useCollectionsStore, useFieldsStore, useRelationsStore } = useStores();
  const { allCollections } = storeToRefs(useCollectionsStore());
  const { getFieldsForCollection } = useFieldsStore();
  const { getRelationsForField } = useRelationsStore();

  const collections = computed<AppCollection[]>(() => (
    sortBy(
      allCollections?.value.filter((c: AppCollection) => c.meta && !c.meta.hidden),
      ['meta.sort', 'collection'],
    )
  ));

  const translatableCollections = computed(() => {
    const collectionsToTranslate: AppCollection[] = [];

    collections.value.forEach((collection: AppCollection) => {
      const fields = getFieldsForCollection(collection.collection);
      const translationsField = fields.find(FieldsUtilsService.isTranslationField);
      if (translationsField) {
        collectionsToTranslate.push(collection);
      }
    });

    return uniqWith(collectionsToTranslate, (a, b) => a.collection === b.collection);
  });

  const rootCollections = computed(() => collections.value.filter((collection) => !collection.meta?.group));
  const translatableRootCollections = computed(() => rootCollections.value.filter(isTranslatableCollection));

  /**
   * Collections that are targets of M2A relations (e.g., block_hero, block_text).
   * These should be hidden from the top-level UI since they're auto-discovered.
   */
  const m2aTargetCollections = computed(() => M2ADiscoveryService.findAllM2ATargetCollections(
    collections.value,
    getFieldsForCollection,
    getRelationsForField,
  ));

  /**
   * Translatable root collections excluding M2A targets, junction tables,
   * and group folders whose visible children are all M2A targets.
   */
  const visibleTranslatableCollections = computed(() => {
    const withoutM2A = translatableRootCollections.value.filter(
      (c) => !m2aTargetCollections.value.has(c.collection),
    );
    return withoutM2A.filter((c) => {
      if (c.schema !== null) return true; // Not a group folder
      // Group folder: check if it has any visible nested translatable children
      const nestedChildren = collections.value.filter((nested) => nested.meta?.group === c.collection);
      return nestedChildren.some((nested) => !m2aTargetCollections.value.has(nested.collection)
        && translatableCollections.value.some((tc) => tc.collection === nested.collection));
    });
  });

  function getNestedCollections(collection: AppCollection) {
    return collections.value.filter((c) => c.meta?.group === collection.collection);
  }

  function isTranslatableCollection(collection: AppCollection): boolean {
    const isTranslatable = translatableCollections.value.some((c) => c.collection === collection.collection);
    if (isTranslatable) {
      return true;
    }

    return getNestedCollections(collection).some(isTranslatableCollection);
  }

  return {
    rootCollections,
    translatableRootCollections,
    translatableCollections,
    collections,
    m2aTargetCollections,
    visibleTranslatableCollections,
    getFieldsForCollection,
    getRelationsForField,
  };
};
