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

    <div class="add-project">
      <v-button
        secondary
        x-small
        @click="onAddProjectClick"
        :loading="addingProject"
      >
        <v-icon name="add" small />
        Add Project
      </v-button>
    </div>

    <v-notice type="danger" class="error" v-if="addProjectError">
      <div class="message">
        There was an error while connecting to Localazy. Please try again.
      </div>
    </v-notice>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, PropType } from 'vue';
import { storeToRefs } from 'pinia';
import { GenericConnectorClient, Services, getOAuthAuthorizationUrl } from '@localazy/generic-connector-client';
import { useStores } from '@directus/extensions-sdk';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useDirectusApi } from '../../composables/use-directus-api';
import { LocalazyProjectConfig } from '../../../../common/models/collections-data/localazy-project-config';
import { LocalazyData } from '../../../../common/models/collections-data/localazy-data';
import { getConfig } from '../../../../common/config/get-config';

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
const { createDirectusItem, updateDirectusItem, fetchDirectusItems, deleteDirectusItem } = useDirectusApi();
const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();

const addingProject = ref(false);
const addProjectError = ref(false);
const saving = ref(false);

const client = new GenericConnectorClient({
  pluginId: Services.DIRECTUS,
  genericConnectorUrl: getConfig().LOCALAZY_PLUGIN_CONNECTOR_API_URL,
});

const isLoggedIn = computed(() => !!props.localazyData?.access_token);

const configuredProjects = computed(() => projectConfigs.value);

async function reloadConfigs() {
  const items = await fetchDirectusItems<LocalazyProjectConfig>(props.projectsCollectionName, { limit: -1 });
  projectConfigs.value = items || [];
  emit('update:projectConfigs', projectConfigs.value);
}

async function onAddProjectClick() {
  addProjectError.value = false;
  addingProject.value = true;
  try {
    const keys = await client.public.keys();
    const url = getOAuthAuthorizationUrl({
      clientId: getConfig().LOCALAZY_OAUTH_APP_CLIENT_ID,
      customId: keys.writeKey,
      allowCreate: true,
      minimalRole: 'owner',
    }, getConfig().LOCALAZY_OAUTH_URL);
    window.open(url);

    const pollResult = await client.oauth.continuousPoll({
      readKey: keys.readKey,
    });
    const pollResultData = pollResult.data;

    const projectId = pollResultData.project?.id || '';
    const accessToken = pollResultData.accessToken || '';

    // Check if this project is already configured
    if (configuredProjects.value.some((c) => c.project_id === projectId)) {
      // Update the existing project's access token
      const existing = configuredProjects.value.find((c) => c.project_id === projectId);
      if (existing?.id) {
        await updateDirectusItem(props.projectsCollectionName, existing.id, {
          access_token: accessToken,
          project_name: pollResultData.project?.name || existing.project_name,
        });
      }
      notificationsStore.add({
        title: `Token refreshed for ${pollResultData.project?.name || 'project'}`,
      });
    } else {
      // Add new project
      const isFirst = configuredProjects.value.length === 0;
      await createDirectusItem(props.projectsCollectionName, {
        project_id: projectId,
        project_name: pollResultData.project?.name || '',
        project_url: pollResultData.project?.url || '',
        org_id: pollResultData.project?.orgId || '',
        is_default: isFirst,
        access_token: accessToken,
      });
      notificationsStore.add({
        title: `Project "${pollResultData.project?.name || ''}" added`,
      });
    }

    await reloadConfigs();
  } catch (e: any) {
    console.error('Localazy: Failed to add project via OAuth', e);
    addProjectError.value = true;
  } finally {
    addingProject.value = false;
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
      await deleteDirectusItem(props.projectsCollectionName, config.id);
    }
    await reloadConfigs();
  } finally {
    saving.value = false;
  }
}
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

.error {
  margin-top: 12px;
}
</style>
