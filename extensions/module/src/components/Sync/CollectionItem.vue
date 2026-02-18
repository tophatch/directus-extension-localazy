<template>
  <v-list-group
    v-if="shouldRender"
    :open="isExpanded"
    :clickable="isExpandable"
    @click="onGroupClick"
    :arrowPlacement="false"
    class="collection-group"
  >

    <template #activator>
      <v-list-item-icon
        v-if="isExpandable"
        class="collection-group-chevron"
        :class="{ active: isExpanded }"
      >
        <v-icon name="chevron_right" />
      </v-list-item-icon>

      <v-checkbox
        v-if="isTranslatableCollection"
        class="collection-item collection-item-clickable"
        :value="collection.collection"
        :indeterminate="someTranslatableFieldsChecked && !allTranslatableFieldsChecked"
        :model-value="selections.map((selection) => selection.collection)"
        @update:model-value="onUpdateCollectionSelection"
      >
        <span class="collection-header">
          <span>
            <v-icon
              :color="collection.color || 'var(--primary)'"
              class="collection-icon"
              :name="collection.icon"
            />
            <span class="collection-name">{{ collection.name }}</span>
          </span>

          <span class="collection-controls" v-if="isTranslatableCollection && isSelected" @click.stop>
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

      <v-list-item
        v-else
        class="collection-item collection-item-unclickable v-list-item"
      >
        <span>
          <v-icon
            :color="collection.color || 'var(--primary)'"
            class="collection-icon"
            :name="collection.icon"
          />
          <span class="collection-name">{{ collection.name }}</span>
        </span>
      </v-list-item>
    </template>

    <v-checkbox
      v-for="field in renderedFields"
      :key="`${collection.collection}-${field.field}`"
      class="field-item"
      :disabled="!isTranlatableField(field)"
      :value="`${collection.collection}-${field.field}`"
      :model-value="localSelections"
      :title="!isTranlatableField(field) ? `${field.type} is not translatable` : ''"
      @update:model-value="localSelections = $event">
      <span>{{ field.name }}</span>
    </v-checkbox>

    <div class="collection-group">
      <collection-item
        v-for="col in nestedCollections"
        :key="col.collection"
        :collection="col"
        :collections="collections"
        :translatable-collections="translatableCollections"
        :selections="selections"
        :show-untranslatable-field="showUntranslatableField"
        :showUntranslatableCollections="showUntranslatableCollections"
        :project-configs="projectConfigs"
        @update:selections="$emit('update:selections', $event)"
      />
    </div>
  </v-list-group>
</template>

<script lang="ts" setup>
import { PropType, computed, ref } from 'vue';
import { AppCollection, Field } from '@directus/types';
import { isEqualWith } from 'lodash';
import { useGetFieldsForTranslationRelation } from '../../composables/use-get-fields-for-translation-relation';
import { EnabledField } from '../../../../common/models/collections-data/content-transfer-setup';
import { LocalazyProjectConfig } from '../../../../common/models/collections-data/localazy-project-config';
import { FieldsUtilsService } from '../../../../common/utilities/fields-utils-service';
import ItemFilterModal from './ItemFilterModal.vue';

const props = defineProps({
  collection: {
    type: Object as PropType<AppCollection>,
    required: true,
  },
  collections: {
    type: Array as PropType<AppCollection[]>,
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
  showUntranslatableField: {
    type: Boolean,
    required: true,
  },
  showUntranslatableCollections: {
    type: Boolean,
    required: true,
  },
  projectConfigs: {
    type: Array as PropType<LocalazyProjectConfig[]>,
    default: () => [],
  },
});

const emits = defineEmits(['update:selections']);

const localSelections = computed({
  get() : string[] {
    return props.selections.map((selection) => [
      selection.collection,
      ...selection.fields.map((field) => `${selection.collection}-${field}`),
    ]).flat();
  },
  set(selections: string[]): void {
    const collectionFieldsMap = selections
      .reduce((acc, selection) => {
        const [collection, field] = selection.split('-');
        if (collection && field) {
          if (!acc.has(collection)) {
            acc.set(collection, []);
          }
          acc.get(collection)?.push(field);
        }
        return acc;
      }, new Map<string, string[]>());
    const updatedSelections = Object.entries(Object.fromEntries(collectionFieldsMap))
      .map(([collection, fields]) => {
        // Preserve projectId and itemIds from previous selection
        const existing = props.selections.find((s) => s.collection === collection);
        return {
          collection,
          fields,
          ...(existing?.projectId ? { projectId: existing.projectId } : {}),
          ...(existing?.itemIds ? { itemIds: existing.itemIds } : {}),
        };
      });

    emits('update:selections', updatedSelections);
  },

});

const selectionsForCollection = computed(() => props.selections
  .find((selection) => selection.collection === props.collection.collection));
const otherSelections = computed(() => props.selections
  .filter((selection) => selection.collection !== props.collection.collection));

const isTranslatableCollection = computed(() => props.translatableCollections
  .some((col) => col.collection === props.collection.collection));

const isSelected = computed(() => !!selectionsForCollection.value);

const selectedProjectId = computed(() => selectionsForCollection.value?.projectId || '');
const selectedItemIds = computed(() => selectionsForCollection.value?.itemIds || []);

const projectSelectItems = computed(() => [
  { text: 'Default project', value: '' },
  ...props.projectConfigs.map((config) => ({
    text: config.project_name + (config.is_default ? ' (Default)' : ''),
    value: config.project_id,
  })),
]);

const isTranlatableField = FieldsUtilsService.isTranslatableField;

const nestedCollections = computed(() => props.collections.filter((collection) => collection.meta?.group === props.collection.collection));
const collection = computed(() => props.collection);

const { translatableFields, allFields } = useGetFieldsForTranslationRelation().getTranslatableFields(collection.value.collection);
const renderedFields = computed(() => (props.showUntranslatableField ? allFields : translatableFields));
const isExpanded = ref(renderedFields.value.length === 0);

const shouldRender = computed(() => nestedCollections.value.length > 0
|| (isTranslatableCollection.value || props.showUntranslatableCollections));
const isExpandable = computed(() => nestedCollections.value.length > 0 || renderedFields.value.length > 0);

const someTranslatableFieldsChecked = computed(() => {
  const fields = translatableFields
    .filter(isTranlatableField);
  return (selectionsForCollection.value?.fields || [])
    .some((field) => fields.some((f) => f.field === field));
});

const allTranslatableFieldsChecked = computed(() => {
  const fields = translatableFields
    .filter(isTranlatableField);

  return fields.length > 0
    && isEqualWith(
      fields,
      selectionsForCollection.value?.fields || [],
      (translatedFields: Field[], selectionFields: string[]) => translatedFields.length === selectionFields.length
        && translatedFields.every((translatableField) => selectionFields.includes(translatableField.field)),
    );
});

function onUpdateCollectionSelection() {
  const fields = translatableFields
    .filter(isTranlatableField);
  if (allTranslatableFieldsChecked.value) {
    emits('update:selections', otherSelections.value);
  } else {
    emits('update:selections', [
      ...otherSelections.value,
      {
        collection: props.collection.collection,
        fields: fields.map((field) => field.field),
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

function onGroupClick() {
  isExpanded.value = !isExpanded.value;
}
</script>

<style lang="scss" scoped>

.collection-icon {
  margin-right: 8px;
}

.collection-item-clickable {
  font-weight: 500;
  margin-top: 8px!important;
  margin-bottom: 8px!important;
}

.collection-item-unclickable {
  font-weight: 400;
  margin-bottom: 0px!important;
}

.field-item {
  margin-left: 28px;
  margin-bottom: 8px!important;
}

.collection-group {
  display: block;
}

.collection-group-chevron {
 margin-right: 0 !important;
 color: var(--foreground-subdued);
 transform: rotate(0deg);
 transition: transform var(--medium) var(--transition);

 &:hover {
  color: var(--foreground-normal);
 }

 &.active {
  transform: rotate(90deg);
 }
}

.collection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.collection-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.project-select {
  min-width: 150px;
  max-width: 200px;
}

</style>
