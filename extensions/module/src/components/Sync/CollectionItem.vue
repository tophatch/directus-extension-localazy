<template>
  <div class="collection-card" v-if="isTranslatableCollection">
    <div class="collection-row">
      <v-checkbox
        :model-value="isEnabled"
        @update:model-value="onToggleCollection"
      >
        <span class="collection-header">
          <span class="collection-name-section">
            <v-icon
              :color="collection.color || 'var(--primary)'"
              class="collection-icon"
              :name="collection.icon"
            />
            <span class="collection-name">{{ collection.name }}</span>
          </span>

          <span class="collection-controls" v-if="isEnabled" @click.stop>
            <v-select
              v-if="projectConfigs.length > 1"
              class="project-select"
              :items="projectSelectItems"
              :model-value="selectedProjectId"
              @update:model-value="onUpdateProjectForCollection($event)"
              placeholder="Default project"
              small
            />
            <item-filter-modal
              :collection="collection.collection"
              :selected-item-ids="selectedItemIds"
              @update:item-ids="onUpdateItemsForCollection($event)"
            />
          </span>
        </span>
      </v-checkbox>
    </div>
    <div class="collection-summary" v-if="isEnabled">
      <span class="summary-text">
        {{ translatableFieldCount }} fields
        <span v-if="m2aBlockTypeCount > 0">
          &middot; {{ m2aBlockTypeCount }} block types auto-included
        </span>
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { PropType, computed } from 'vue';
import { AppCollection } from '@directus/types';
import { useGetFieldsForTranslationRelation } from '../../composables/use-get-fields-for-translation-relation';
import { useCollectionsOrganizer } from '../../composables/use-collections-organizer';
import { EnabledField } from '../../../../common/models/collections-data/content-transfer-setup';
import { LocalazyProjectConfig } from '../../../../common/models/collections-data/localazy-project-config';
import { FieldsUtilsService } from '../../../../common/utilities/fields-utils-service';
import { M2ADiscoveryService } from '../../../../common/services/m2a-discovery-service';
import ItemFilterModal from './ItemFilterModal.vue';

const props = defineProps({
  collection: {
    type: Object as PropType<AppCollection>,
    required: true,
  },
  translatableCollections: {
    type: Array as PropType<AppCollection[]>,
    required: true,
  },
  selections: {
    type: Array as PropType<EnabledField[]>,
    required: true,
  },
  projectConfigs: {
    type: Array as PropType<LocalazyProjectConfig[]>,
    default: () => [],
  },
});

const emits = defineEmits(['update:selections']);

const { getFieldsForCollection, getRelationsForField } = useCollectionsOrganizer();

const isTranslatableCollection = computed(() => props.translatableCollections
  .some((col) => col.collection === props.collection.collection));

const selectionsForCollection = computed(() => props.selections
  .find((selection) => selection.collection === props.collection.collection));
const otherSelections = computed(() => props.selections
  .filter((selection) => selection.collection !== props.collection.collection));

const isEnabled = computed(() => !!selectionsForCollection.value);

const selectedProjectId = computed(() => selectionsForCollection.value?.projectId || '');
const selectedItemIds = computed(() => selectionsForCollection.value?.itemIds || []);

const projectSelectItems = computed(() => [
  { text: 'Default project', value: '' },
  ...props.projectConfigs.map((config) => ({
    text: config.project_name + (config.is_default ? ' (Default)' : ''),
    value: config.project_id,
  })),
]);

const { translatableFields } = useGetFieldsForTranslationRelation()
  .getTranslatableFields(props.collection.collection);

const translatableFieldNames = translatableFields
  .filter(FieldsUtilsService.isTranslatableField)
  .map((f) => f.field);

const translatableFieldCount = translatableFieldNames.length;

const m2aBlockTypeCount = computed(() => M2ADiscoveryService.countM2ABlockTypes(
  props.collection.collection,
  getFieldsForCollection,
  getRelationsForField,
));

function onToggleCollection() {
  if (isEnabled.value) {
    // Remove this collection
    emits('update:selections', otherSelections.value);
  } else {
    // Add with ALL translatable fields
    emits('update:selections', [
      ...otherSelections.value,
      {
        collection: props.collection.collection,
        fields: translatableFieldNames,
        ...(selectionsForCollection.value?.projectId ? { projectId: selectionsForCollection.value.projectId } : {}),
        ...(selectionsForCollection.value?.itemIds ? { itemIds: selectionsForCollection.value.itemIds } : {}),
      },
    ]);
  }
}

function onUpdateProjectForCollection(projectId: string) {
  const updated = props.selections.map((s) => {
    if (s.collection === props.collection.collection) {
      return {
        ...s,
        ...(projectId ? { projectId } : { projectId: undefined }),
      };
    }
    return s;
  });
  emits('update:selections', updated);
}

function onUpdateItemsForCollection(itemIds: string[]) {
  const updated = props.selections.map((s) => {
    if (s.collection === props.collection.collection) {
      return {
        ...s,
        ...(itemIds.length > 0 ? { itemIds } : { itemIds: undefined }),
      };
    }
    return s;
  });
  emits('update:selections', updated);
}
</script>

<style lang="scss" scoped>
.collection-card {
  padding: 4px 0;
}

.collection-icon {
  margin-right: 8px;
}

.collection-row {
  :deep(.v-checkbox) {
    font-weight: 500;
  }

  :deep(.v-checkbox .label) {
    width: 100%;
    flex: 1;
    min-width: 0;
  }
}

.collection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.collection-name-section {
  display: flex;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
}

.collection-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  flex-shrink: 0;
}

.collection-summary {
  margin-left: 28px;
  margin-top: -4px;
  margin-bottom: 4px;
}

.summary-text {
  color: var(--foreground-subdued);
  font-size: 12px;
}

.project-select {
  min-width: 220px;
  max-width: 350px;
  flex-shrink: 0;
}
</style>

<!-- Unscoped styles to penetrate Directus v-select component internals -->
<style lang="scss">
.collection-controls .project-select.v-select {
  min-width: 220px;

  .v-input {
    min-width: 220px;

    .input {
      min-width: 200px;
      width: auto;
    }
  }

  .v-text-overflow {
    max-width: none;
    overflow: visible;
    text-overflow: unset;
    white-space: nowrap;
  }
}
</style>
