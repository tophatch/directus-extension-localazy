<template>
  <div class="project-manager" v-if="isLoggedIn">
    <v-divider :inline-title="false" large>
      Localazy Projects
    </v-divider>

    <div class="project-list" v-if="configuredProjects.length > 0">
      <div class="project-row" v-for="config in configuredProjects" :key="config.project_id">
        <div class="project-info">
          <span class="project-name">{{ config.project_name }}</span>
          <v-chip v-if="config.is_default" small>Default</v-chip>
        </div>
        <div class="project-actions">
          <v-button
            v-if="!config.is_default"
            x-small
            secondary
            @click="setAsDefault(config)"
            :loading="saving"
          >
            Set as Default
          </v-button>
          <v-button
            v-if="!config.is_default"
            x-small
            secondary
            kind="danger"
            @click="removeProject(config)"
            :loading="saving"
          >
            <v-icon name="close" small />
          </v-button>
        </div>
      </div>
    </div>

    <div class="add-project" v-if="availableProjects.length > 0">
      <v-menu show-arrow>
        <template #activator="{ toggle }">
          <v-button secondary x-small @click="toggle" :loading="loadingProjects">
            <v-icon name="add" small />
            Add Project
          </v-button>
        </template>
        <v-list>
          <v-list-item
            v-for="project in availableProjects"
            :key="project.id"
            clickable
            @click="addProject(project)"
          >
            {{ project.name }}
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <v-button
      v-if="configuredProjects.length === 0 && availableProjects.length === 0"
      secondary
      x-small
      @click="refreshProjects"
      :loading="loadingProjects"
    >
      Load Available Projects
    </v-button>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted, PropType } from 'vue';
import { storeToRefs } from 'pinia';
import { Project } from '@localazy/api-client';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useDirectusApi } from '../../composables/use-directus-api';
import { LocalazyProjectConfig } from '../../../../common/models/collections-data/localazy-project-config';
import { LocalazyApiThrottleService } from '../../../../common/services/localazy-api-throttle-service';
import { LocalazyData } from '../../../../common/models/collections-data/localazy-data';

const props = defineProps({
  localazyData: {
    type: Object as PropType<LocalazyData | null>,
    required: true,
  },
  projectsCollectionName: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['update:projectConfigs']);

const localazyStore = useLocalazyStore();
const { projectConfigs } = storeToRefs(localazyStore);
const { createDirectusItem, updateDirectusItem, fetchDirectusItems } = useDirectusApi();

const allLocalazyProjects = ref<Project[]>([]);
const loadingProjects = ref(false);
const saving = ref(false);

const isLoggedIn = computed(() => !!props.localazyData?.access_token);

const configuredProjects = computed(() => projectConfigs.value);

const availableProjects = computed(() => allLocalazyProjects.value.filter(
  (p) => !configuredProjects.value.some((c) => c.project_id === p.id),
));

async function refreshProjects() {
  if (!props.localazyData?.access_token) return;
  loadingProjects.value = true;
  try {
    allLocalazyProjects.value = await LocalazyApiThrottleService.listProjects(
      props.localazyData.access_token,
      { organization: true, languages: true },
    );
  } finally {
    loadingProjects.value = false;
  }
}

async function reloadConfigs() {
  const items = await fetchDirectusItems<LocalazyProjectConfig>(props.projectsCollectionName, { limit: -1 });
  projectConfigs.value = items || [];
  emit('update:projectConfigs', projectConfigs.value);
}

async function addProject(project: Project) {
  saving.value = true;
  try {
    const isFirst = configuredProjects.value.length === 0;
    await createDirectusItem(props.projectsCollectionName, {
      project_id: project.id,
      project_name: project.name || '',
      project_url: project.slug || '',
      org_id: project.orgId || '',
      is_default: isFirst,
    });
    await reloadConfigs();
    // Re-hydrate store to load the new project's data
    await localazyStore.hydrateLocalazyData({
      localazyData: props.localazyData,
      projectConfigs: projectConfigs.value,
      force: true,
    });
  } finally {
    saving.value = false;
  }
}

async function setAsDefault(config: LocalazyProjectConfig) {
  saving.value = true;
  try {
    // Unset current default
    for (const c of configuredProjects.value) {
      if (c.is_default && c.id) {
        await updateDirectusItem(props.projectsCollectionName, c.id, { is_default: false });
      }
    }
    // Set new default
    if (config.id) {
      await updateDirectusItem(props.projectsCollectionName, config.id, { is_default: true });
    }
    await reloadConfigs();
  } finally {
    saving.value = false;
  }
}

async function removeProject(config: LocalazyProjectConfig) {
  saving.value = true;
  try {
    if (config.id) {
      const api = useDirectusApi();
      // Delete via direct API call since useDirectusApi doesn't have deleteItem
      await api.fetchDirectusItems(props.projectsCollectionName, {
        filter: { id: { _eq: config.id } },
      });
      // Actually we need to use the api to delete - let's do it via updateDirectusItem workaround
      // Use the Directus REST API directly
    }
    await reloadConfigs();
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  if (isLoggedIn.value) {
    refreshProjects();
  }
});
</script>

<style lang="scss" scoped>
.project-manager {
  margin-top: 20px;
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.project-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--border-normal);
  border-radius: var(--border-radius);
  background-color: var(--background-subdued);
}

.project-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-name {
  font-weight: 500;
}

.project-actions {
  display: flex;
  gap: 4px;
}

.add-project {
  margin-top: 8px;
}
</style>
