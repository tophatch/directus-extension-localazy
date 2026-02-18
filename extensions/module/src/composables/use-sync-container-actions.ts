import { AppCollection } from '@directus/types';
import { isEqual, merge } from 'lodash';
import { Ref, computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useStores } from '@directus/extensions-sdk';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { EnabledFieldsService } from '../../../common/utilities/enabled-fields-service';
import { useExportToLocalazy } from './use-export-to-localazy';
import { useImportFromLocalazy } from './use-import-from-localazy';
import { useLocalazyStore } from '../stores/localazy-store';
import { useDirectusApi } from './use-directus-api';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useDirectusLanguages } from './use-directus-languages';
import { useCollectionsOrganizer } from './use-collections-organizer';
import { useDirectusLocalazyAdapter } from './use-directus-localazy-adapter';
import { useTranslatableCollections } from './use-translatable-collections';
import { useTranslationStringsContent } from './use-translation-strings-content';
import { ContentTransferSetupDatabase, EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { Configuration } from '../models/configuration';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { ExportToLocalazyCommonService } from '../../../common/services/export-to-localazy-common-service';

type UseSyncContainerActions = {
  configuration: Ref<Configuration>;
  enabledFields: Ref<EnabledField[]>;
  synchronizeTranslationStrings: Ref<boolean>;
};

type OnSaveSettingsParams = {
  notify?: boolean;
  contentTransferSetupCollection: AppCollection | null;
  contentTransferSetup: ContentTransferSetupDatabase | null;
};

type OnExportParams = {
  contentTransferSetupCollection: AppCollection | null;
  contentTransferSetup: ContentTransferSetupDatabase | null;
  targetProjectId?: string;
};

type OnImportParams = {
  contentTransferSetupCollection: AppCollection | null;
  contentTransferSetup: ContentTransferSetupDatabase | null;
  targetProjectId?: string;
};

export const useSyncContainerActions = (data: UseSyncContainerActions) => {
  const { configuration, enabledFields, synchronizeTranslationStrings } = data;

  const { upsertDirectusItem } = useDirectusApi();
  const { resolveExportLanguages, resolveImportLanguages } = useDirectusLanguages();
  const { fetchContentFromTranslatableCollections } = useTranslatableCollections();
  const { fetchTranslationStrings } = useTranslationStringsContent();
  const { translatableCollections } = useCollectionsOrganizer();
  const { upsertFromLocalazyContent } = useDirectusLocalazyAdapter();

  const { useNotificationsStore } = useStores();
  const notificationsStore = useNotificationsStore();

  const { addProgressMessage, resetProgressTracker } = useProgressTrackerStore();
  const localazyStore = useLocalazyStore();
  const { localazyUser, localazyProject, defaultProjectId } = storeToRefs(localazyStore);

  const loading = ref(false);
  const showProgress = ref(false);

  const hasChanges = computed(() => synchronizeTranslationStrings.value !== configuration.value.content_transfer_setup.translation_strings
  || !isEqual(
    EnabledFieldsService.parseFromDatabase(configuration.value.content_transfer_setup.enabled_fields),
    enabledFields.value,
  ));

  async function onSaveSettings(payload: OnSaveSettingsParams) {
    const { contentTransferSetupCollection, contentTransferSetup, notify } = payload;
    if (!hasChanges.value) { return; }

    if (contentTransferSetupCollection && contentTransferSetup) {
      contentTransferSetup.enabled_fields = EnabledFieldsService.prepareForDatabase(enabledFields.value);
      await upsertDirectusItem(
        contentTransferSetupCollection.collection,
        contentTransferSetup,
        {
          enabled_fields: EnabledFieldsService.prepareForDatabase(enabledFields.value),
          translation_strings: synchronizeTranslationStrings.value,
        },
      );
      if (notify) {
        notificationsStore.add({
          title: 'Settings saved',
        });
      }
    }
  }

  async function onExport(payload: OnExportParams) {
    loading.value = true;
    showProgress.value = true;
    addProgressMessage({
      id: ProgressTrackerId.PREPARING_IMPORT,
      message: 'Preparing Directus data for import',
    });
    const token = computed(() => configuration.value.localazy_data.access_token);
    onSaveSettings(payload);

    try {
      const exportLanguages = await resolveExportLanguages(configuration.value.settings);
      const resolvedDefaultProjectId = defaultProjectId.value;

      // If a specific project is targeted, filter fields for that project
      const fieldsToExport = payload.targetProjectId
        ? enabledFields.value.filter((f) => (f.projectId || resolvedDefaultProjectId) === payload.targetProjectId)
        : enabledFields.value;

      // Group fields by project
      const projectGroups = EnabledFieldsService.groupByProject(fieldsToExport, resolvedDefaultProjectId);

      // Only include translation strings for the default project export
      const shouldExportTranslationStrings = !payload.targetProjectId
        || payload.targetProjectId === resolvedDefaultProjectId;

      for (const [pid, projectFields] of projectGroups) {
        const projectTranslatableCollections = EnabledFieldsService.buildTranslatableCollections(projectFields);

        // Map to the format expected by fetchContentFromTranslatableCollections
        const collectionsForFetch = projectTranslatableCollections.map((tc) => {
          const existing = translatableCollections.value.find((c) => c.collection === tc.collection);
          return existing ? { ...existing, itemIds: tc.itemIds } : { collection: tc.collection, itemIds: tc.itemIds };
        });

        const [translationStrings, collectionsContent] = await Promise.all([
          (shouldExportTranslationStrings && pid === resolvedDefaultProjectId)
            ? fetchTranslationStrings({
              languages: exportLanguages,
              settings: configuration.value.settings,
              synchronizeTranslationStrings: synchronizeTranslationStrings.value,
            })
            : Promise.resolve({ sourceLanguage: {}, otherLanguages: {} }),
          fetchContentFromTranslatableCollections({
            languages: exportLanguages,
            translatableCollections: collectionsForFetch,
            enabledFields: projectFields,
            settings: configuration.value.settings,
          }),
        ]);

        await useExportToLocalazy(token).exportContentToLocalazy({
          content: merge(collectionsContent, translationStrings),
          settings: configuration.value.settings,
          targetProjectId: pid,
        });
      }
    } finally {
      loading.value = false;
    }
  }

  async function onImport(payload: OnImportParams) {
    showProgress.value = true;
    loading.value = true;
    addProgressMessage({
      id: ProgressTrackerId.RETRIEVING_LANGUAGES,
      message: 'Retrieving target languages',
    });
    onSaveSettings(payload);

    try {
      const importLanguages = await resolveImportLanguages(configuration.value.settings);
      const resolvedDefaultProjectId = defaultProjectId.value;

      if (payload.targetProjectId) {
        // Import from a specific project
        const projectFields = enabledFields.value.filter(
          (f) => (f.projectId || resolvedDefaultProjectId) === payload.targetProjectId,
        );
        const result = await useImportFromLocalazy().importFromProject({
          projectId: payload.targetProjectId,
          languages: importLanguages,
          enabledFields: projectFields,
          localazyData: configuration.value.localazy_data,
        });
        if (result.success) {
          await upsertFromLocalazyContent(result.content, configuration.value.settings);
          addProgressMessage({
            id: ProgressTrackerId.IMPORT_FINISHED,
            message: 'Import finished',
          });
        }
      } else {
        // Import from all configured projects
        const projectGroups = EnabledFieldsService.groupByProject(enabledFields.value, resolvedDefaultProjectId);

        for (const [pid, projectFields] of projectGroups) {
          const result = await useImportFromLocalazy().importFromProject({
            projectId: pid,
            languages: importLanguages,
            enabledFields: projectFields,
            localazyData: configuration.value.localazy_data,
          });
          if (result.success) {
            await upsertFromLocalazyContent(result.content, configuration.value.settings);
          }
        }

        addProgressMessage({
          id: ProgressTrackerId.IMPORT_FINISHED,
          message: 'Import finished',
        });
        AnalyticsService.trackDownloadFromLocalazy(ExportToLocalazyCommonService.getPayloadForUploadAnalytics({
          userId: localazyUser.value.id,
          orgId: localazyProject.value?.orgId || '',
          localazyProject: configuration.value.localazy_data.project_name,
          settings: configuration.value.settings,
          languages: Object.keys(importLanguages),
        }));
      }
    } finally {
      loading.value = false;
    }
  }

  function onFinishAction() {
    showProgress.value = false;
    resetProgressTracker();
  }

  return {
    onSaveSettings,
    onExport,
    onImport,
    onFinishAction,
    hasChanges,
    loading,
    showProgress,
  };
};
