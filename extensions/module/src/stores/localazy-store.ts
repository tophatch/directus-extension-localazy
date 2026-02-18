import { defineStore } from 'pinia';
import { Project, File } from '@localazy/api-client';
import {
  computed, MaybeRef, ref, toValue,
} from 'vue';
import { LocalazyData } from '../../../common/models/collections-data/localazy-data';
import { LocalazyProjectConfig } from '../../../common/models/collections-data/localazy-project-config';
import { useErrorsStore } from './errors-store';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { LocalazyApiThrottleService } from '../../../common/services/localazy-api-throttle-service';
import { LocalazyPaymentStatus } from '../../../common/utilities/localazy-payment-status';

type HydrateOptions = {
  /** Force rehydration */
  force?: boolean;
  localazyData: MaybeRef<LocalazyData | null>;
  projectConfigs?: MaybeRef<LocalazyProjectConfig[]>;
};

export const useLocalazyStore = defineStore('localazyStore', () => {
  // Single project state (backward compat)
  const localazyProject = ref<Project | null>(null);
  const directusFile = ref<File | null>(null);

  // Multi-project state
  const projectConfigs = ref<LocalazyProjectConfig[]>([]);
  const localazyProjectsMap = ref<Map<string, Project>>(new Map());
  const directusFilesMap = ref<Map<string, File>>(new Map());

  const hydrating = ref(false);
  const hydrated = ref(false);
  const {
    addLocalazyError, resetLocalazyErrors,
  } = useErrorsStore();

  // Backward-compat computed: default project
  const defaultProjectConfig = computed(() => projectConfigs.value.find((p) => p.is_default));
  const defaultProjectId = computed(() => defaultProjectConfig.value?.project_id || '');

  const projectId = computed(() => localazyProject.value?.id || '');
  const exceededKeyLimit = computed(() => LocalazyPaymentStatus.isOverKeysLimit(localazyProject.value));
  const lacksAccessToPlugin = computed(() => LocalazyPaymentStatus.lacksAccessToPlugin(localazyProject.value));
  const shouldDisableSyncOperations = computed(() => LocalazyPaymentStatus.shouldDisableSyncOperations(localazyProject.value));

  const localazyDataItem = ref<LocalazyData | null>(null);

  const localazyUser = computed(() => ({
    id: localazyDataItem.value?.user_id || '',
    name: localazyDataItem.value?.user_name || '',
  }));

  function getProject(pid: string): Project | null {
    return localazyProjectsMap.value.get(pid) || null;
  }

  function getFile(pid: string): File | null {
    return directusFilesMap.value.get(pid) || null;
  }

  const allProjectConfigs = computed(() => projectConfigs.value);

  async function loadProjects(options: HydrateOptions) {
    const token = localazyDataItem.value?.access_token;
    if (!token) {
      localazyProject.value = null;
      localazyProjectsMap.value = new Map();
      resetLocalazyErrors();
      return;
    }

    if (localazyProject.value && !options.force) return;

    try {
      const projects = await LocalazyApiThrottleService.listProjects(token, { organization: true, languages: true });

      // Build the map for configured projects
      const newMap = new Map<string, Project>();
      for (const config of projectConfigs.value) {
        const matchedProject = projects.find((p) => p.id === config.project_id);
        if (matchedProject) {
          newMap.set(config.project_id, matchedProject);
        }
      }
      localazyProjectsMap.value = newMap;

      // Backward compat: set localazyProject to the default (or first) project
      if (defaultProjectId.value) {
        localazyProject.value = newMap.get(defaultProjectId.value) || projects[0] || null;
      } else {
        localazyProject.value = projects[0] || null;
      }

      resetLocalazyErrors();
      AnalyticsService.trackConnectedProject({
        orgId: localazyProject.value?.orgId || '',
        userId: localazyDataItem.value?.user_id || '',
        name: localazyProject.value?.name || '',
        slug: localazyProject.value?.slug || '',
      });
    } catch (e: any) {
      addLocalazyError(e, {
        type: 'project', userId: localazyDataItem.value?.user_id || '', orgId: localazyDataItem.value?.org_id || '',
      });
    }
  }

  async function loadFiles(options: HydrateOptions) {
    const token = localazyDataItem.value?.access_token;
    if (!token) {
      directusFile.value = null;
      directusFilesMap.value = new Map();
      resetLocalazyErrors();
      return;
    }

    // Load files for each configured project
    const newFilesMap = new Map<string, File>();
    for (const config of projectConfigs.value) {
      const project = localazyProjectsMap.value.get(config.project_id);
      if (!project) continue;
      if (directusFilesMap.value.has(config.project_id) && !options.force) continue;

      try {
        const files = await LocalazyApiThrottleService.listFiles(token, {
          project: project.id,
        });
        const dFile = files.find((file) => file.name === 'directus.json') || null;
        if (dFile) {
          newFilesMap.set(config.project_id, dFile);
        }
        resetLocalazyErrors();
      } catch (e: any) {
        addLocalazyError(e, {
          type: 'file', userId: localazyDataItem.value?.user_id || '', orgId: localazyDataItem.value?.org_id || '',
        });
      }
    }

    directusFilesMap.value = new Map([...directusFilesMap.value, ...newFilesMap]);

    // Backward compat: set directusFile from default project
    if (defaultProjectId.value) {
      directusFile.value = directusFilesMap.value.get(defaultProjectId.value) || null;
    } else if (projectId.value) {
      // Legacy fallback using projectId from localazyProject
      if (!directusFile.value || options.force) {
        try {
          const files = await LocalazyApiThrottleService.listFiles(token, {
            project: projectId.value,
          });
          directusFile.value = files.find((file) => file.name === 'directus.json') || null;
        } catch (e: any) {
          addLocalazyError(e, {
            type: 'file', userId: localazyDataItem.value?.user_id || '', orgId: localazyDataItem.value?.org_id || '',
          });
        }
      }
    }
  }

  async function hydrateLocalazyData(options: HydrateOptions) {
    localazyDataItem.value = toValue(options.localazyData);
    if (options.projectConfigs) {
      projectConfigs.value = toValue(options.projectConfigs) || [];
    }
    if (hydrating.value) return;

    hydrating.value = true;
    await loadProjects(options);
    await loadFiles(options);

    hydrated.value = true;
    hydrating.value = false;
  }

  return {
    hydrated,
    hydrating,
    hydrateLocalazyData,
    localazyProject,
    projectId,
    localazyUser,
    directusFile,
    exceededKeyLimit,
    lacksAccessToPlugin,
    shouldDisableSyncOperations,
    // Multi-project
    projectConfigs,
    localazyProjectsMap,
    directusFilesMap,
    defaultProjectId,
    defaultProjectConfig,
    getProject,
    getFile,
    allProjectConfigs,
  };
});
