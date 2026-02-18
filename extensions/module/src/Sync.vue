<template>
  <private-view>
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="translate" />
      </v-button>
    </template>

    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #title>
      <h1 class="type-title title">Import & Export</h1>
    </template>

    <template #navigation>
      <Navigation />
    </template>

    <template #actions>
      <sync-action-buttons
        @upload="onExport({ contentTransferSetupCollection, contentTransferSetup, targetProjectId: activeProjectTab })"
        @download="onImport({ contentTransferSetupCollection, contentTransferSetup, targetProjectId: activeProjectTab })"
        @save-settings="onSaveSettings({ contentTransferSetupCollection, contentTransferSetup, notify: true })"
        :has-changes="hasChanges"
        :disable-sync="!someTranslatableFieldsChecked && !synchronizeTranslationStrings"
        :active-project-name="activeProjectName"
      />
    </template>

    <div class="panel">
      <config-notice class="notice" :has-incomplete-configuration="hasIncompleteConfiguration" />
      <errors-notice class="notice" :localazy-data="localazyData" />

      <project-tabs
        v-if="projectConfigs.length > 1"
        :project-configs="projectConfigs"
        :active-project-id="activeProjectTab"
        @update:active-project-id="activeProjectTab = $event"
      />

      <sync-option-buttons
        v-model:show-untranslatable-field="showUntranslatableField"
        v-model:show-untranslatable-collections="showUntranslatableCollections"
        :all-translatable-fields-checked="allTranslatableFieldsChecked"
        :some-translatable-fields-checked="someTranslatableFieldsChecked"
        @select-all="selectAll"
        @deselect-all="deselectAll"
      />

      <div class="page" v-if="hydratedDirectusData">

        <div class="collection-list">
          <collection-item
            v-for="col in filteredIteratedCollections"
            :key="col.collection"
            :collection="col"
            :translatable-collections="translatableCollections"
            :collections="collections"
            :selections="enabledFields"
            :showUntranslatableField="showUntranslatableField"
            :show-untranslatable-collections="showUntranslatableCollections"
            :project-configs="projectConfigs"
            @update:selections="enabledFields = $event"
          />
        </div>

        <translation-strings-content
          :class="{
            'translation-strings-separator': filteredIteratedCollections.length > 0,
          }"
          v-model:shouldSynchronize="synchronizeTranslationStrings"
        />
      </div>

      <progress-tracker-modal
        :showProgress="showProgress"
        :loading="loading"
        :progress-tracker="progressTracker"
        @finish="onFinishAction"
      />
    </div>

  </private-view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import Navigation from './components/Navigation.vue';
import CollectionItem from './components/Sync/CollectionItem.vue';
import ProjectTabs from './components/Sync/ProjectTabs.vue';
import { useCollectionsOrganizer } from './composables/use-collections-organizer';
import { useGetFieldsForTranslationRelation } from './composables/use-get-fields-for-translation-relation';
import SyncActionButtons from './components/Sync/SyncActionButtons.vue';
import SyncOptionButtons from './components/Sync/SyncOptionButtons.vue';
import ProgressTrackerModal from './components/Modals/ProgressTrackerModal.vue';
import ErrorsNotice from './components/ErrorsNotice.vue';
import ConfigNotice from './components/ConfigNotice.vue';
import { useProgressTrackerStore } from './stores/progress-tracker-store';
import TranslationStringsContent from './components/Sync/TranslationStringsContent.vue';
import { useInitSyncContainer } from './composables/use-sync-container-init';
import { useSyncContainerActions } from './composables/use-sync-container-actions';
import { useHydrate } from './composables/use-hydrate';
import { useLocalazyStore } from './stores/localazy-store';

const {
  translatableRootCollections, rootCollections, translatableCollections, collections,
} = useCollectionsOrganizer();
const { getTranslatableFields } = useGetFieldsForTranslationRelation();
const { progressTracker } = storeToRefs(useProgressTrackerStore());

const showUntranslatableField = ref(false);
const showUntranslatableCollections = ref(false);
const activeProjectTab = ref<string | undefined>(undefined);

const { configuration, enabledFields, synchronizeTranslationStrings } = useInitSyncContainer();
const {
  onSaveSettings, onExport, onImport, onFinishAction, showProgress, loading, hasChanges,
} = useSyncContainerActions({
  configuration,
  enabledFields,
  synchronizeTranslationStrings,
});
const localazyStore = useLocalazyStore();

const {
  hydrateDirectusData, localazyData, hasIncompleteConfiguration,
  hydratedDirectusData, contentTransferSetupCollection, contentTransferSetup,
  projectConfigs,
} = useHydrate();

hydrateDirectusData().then(() => {
  localazyStore.hydrateLocalazyData({ localazyData, projectConfigs });
});

const iteratedCollections = computed(() => (showUntranslatableCollections.value
  ? rootCollections.value
  : translatableRootCollections.value));

// Filter collections by active project tab
const filteredIteratedCollections = computed(() => {
  if (!activeProjectTab.value) return iteratedCollections.value;

  const defaultPid = localazyStore.defaultProjectId;

  // Collections assigned to the active project tab
  const assignedCollections = new Set(
    enabledFields.value
      .filter((f) => (f.projectId || defaultPid) === activeProjectTab.value)
      .map((f) => f.collection),
  );

  // If no collections assigned to this project yet, show all (so user can assign)
  if (assignedCollections.size === 0) return iteratedCollections.value;

  return iteratedCollections.value.filter(
    (col) => assignedCollections.has(col.collection),
  );
});

const activeProjectName = computed(() => {
  if (!activeProjectTab.value) return undefined;
  const config = projectConfigs.value.find((c) => c.project_id === activeProjectTab.value);
  return config?.project_name;
});

const allTranslatableFields = computed(() => translatableCollections
  .value.map((c) => [
    {
      collection: c.collection,
      fields: getTranslatableFields(c.collection).translatableFields.map((f) => f.field),
    },
  ]).flat());

const someTranslatableFieldsChecked = computed(() => enabledFields.value.length > 0);
const allTranslatableFieldsChecked = computed(() => enabledFields.value.length === allTranslatableFields.value.length);

function selectAll() {
  enabledFields.value = allTranslatableFields.value;
  synchronizeTranslationStrings.value = true;
}

function deselectAll() {
  enabledFields.value = [];
  synchronizeTranslationStrings.value = false;
}

</script>

<style lang="scss" scoped>
@import './styles/mixins/page';
.page {
  @include page;
}

.panel {
 padding: var(--content-padding);
 padding-top: 0;

 .collection-list {
  margin-top: 20px;
 }
}
.notice {
  margin-top: 20px;
  margin-bottom: 20px;
}

.translation-strings-separator {
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--border-normal);
}

.title {
  display: none;
  @media screen and (min-width: 1400px) {
    display: block;
  }
}
</style>
