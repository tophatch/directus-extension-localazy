<template>
  <private-view>
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="lan" />
      </v-button>
    </template>

    <template #title>
      <h1 class="type-title">Project setup</h1>
    </template>

    <template #headline>
      <v-breadcrumb :items="[{ name: 'Localazy', to: '/localazy' }]" />
    </template>

    <template #actions>
      <v-button
        class="panel-button"
        @click="onSaveChanges"
        :disabled="!changesExist"
        :loading="hydrating || loading">Save changes
      </v-button>
    </template>

    <template #navigation>
      <Navigation />
    </template>
    <div class="panel page" v-if="hydrated && hydratedDirectusData">
      <errors-notice class="errors-notice" :localazy-data="localazyData" />
      <project-setup-form
        v-if="settingsCollection"
        v-model:edits="settingsEdits"
        v-model:localazy-data="localazyData"
        :collection="settingsCollection.collection"
        :localazy-data-collection="localazyDataCollection"
      />

      <project-manager
        v-if="localazyProjectsCollection"
        :localazy-data="localazyData"
        :projects-collection-name="localazyProjectsCollection.collection"
        @update:project-configs="onProjectConfigsUpdated"
      />

    </div>

  </private-view>
</template>

<script lang="ts" setup>
import {
  computed, ref, watch,
} from 'vue';
import {
  cloneDeep, isEqual, merge,
} from 'lodash';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { Settings } from '../../common/models/collections-data/settings';
import ProjectSetupForm from './components/ProjectSetup/ProjectSetupForm.vue';
import ProjectManager from './components/Sync/ProjectManager.vue';
import Navigation from './components/Navigation.vue';
import { useLocalazyStore } from './stores/localazy-store';
import { defaultConfiguration } from './data/default-configuration';
import ErrorsNotice from './components/ErrorsNotice.vue';
import { useDirectusApi } from './composables/use-directus-api';
import { useHydrate } from './composables/use-hydrate';
import { LocalazyProjectConfig } from '../../common/models/collections-data/localazy-project-config';

type Configuration = {
  settings: Settings;
};

const configuration = ref<Configuration>(defaultConfiguration());
const settingsEdits = ref<Settings>(cloneDeep(configuration.value.settings));
const loading = ref(false);

const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();
const { upsertDirectusItem } = useDirectusApi();
const localazyStore = useLocalazyStore();
const {
  hydrateLocalazyData,
} = localazyStore;
const {
  hydrateDirectusData, localazyData, settings, settingsCollection,
  localazyDataCollection, hydratedDirectusData, localazyProjectsCollection,
  projectConfigs,
} = useHydrate();
const { hydrating, hydrated } = storeToRefs(localazyStore);

watch(
  settings,
  (s) => {
    configuration.value.settings = merge(configuration.value.settings, s);
    settingsEdits.value = cloneDeep(configuration.value.settings);
  },
  { immediate: true, deep: true },
);

hydrateDirectusData().then(() => {
  hydrateLocalazyData({ localazyData, projectConfigs });
});

const changesExist = computed(() => !isEqual(settingsEdits.value, configuration.value.settings));

async function onSaveChanges() {
  loading.value = true;
  if (settingsCollection.value) {
    await upsertDirectusItem(settingsCollection.value.collection, settings.value, settingsEdits.value, { ignoreEmpty: true });
    configuration.value.settings = cloneDeep(settingsEdits.value);
    notificationsStore.add({
      title: 'Settings saved',
    });
    await hydrateDirectusData({ force: true });
  }
  loading.value = false;
}

function onProjectConfigsUpdated(configs: LocalazyProjectConfig[]) {
  // Project configs are managed by ProjectManager and stored in localazy-store
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
  padding-bottom: var(--content-padding-bottom);
}

.panel-button {
  margin-top: 20px;
}

.errors-notice {
  margin-bottom: 16px;
}
</style>
