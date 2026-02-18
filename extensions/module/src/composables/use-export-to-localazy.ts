import { storeToRefs } from 'pinia';
import { Ref, ref } from 'vue';
import { isEmpty } from 'lodash';
import { ProgressTrackerId } from '../enums/progress-tracker-id';
import { Settings } from '../../../common/models/collections-data/settings';
import { KeyValueEntry } from '../../../common/models/localazy-key-entry';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { AnalyticsService } from '../../../common/services/analytics-service';
import { ContentFromCollections } from '../../../common/utilities/content-from-collections-service';
import { DirectusLocalazyAdapter } from '../../../common/services/directus-localazy-adapter';
import { useEnhancedAsyncQueue } from './use-async-queue';
import { useProgressTrackerStore } from '../stores/progress-tracker-store';
import { useLocalazyStore } from '../stores/localazy-store';
import { useErrorsStore } from '../stores/errors-store';
import { ExportToLocalazyCommonService } from '../../../common/services/export-to-localazy-common-service';

type ExportContentToLocalazy = {
  content: TranslatableContent;
  settings: Settings;
  targetProjectId?: string;
};

type ExportToMultipleProjectsEntry = {
  projectId: string;
  content: TranslatableContent;
  settings: Settings;
};

export const useExportToLocalazy = (token: Ref<string>) => {
  const loading = ref(false);
  const { execute, add } = useEnhancedAsyncQueue();
  const { addProgressMessage, upsertProgressMessage } = useProgressTrackerStore();
  const { addLocalazyError } = useErrorsStore();
  const localazyStore = useLocalazyStore();
  const {
    localazyProject, projectId, localazyUser,
  } = storeToRefs(localazyStore);

  const createExportPromisesForLanguage = (content: KeyValueEntry, language: string, resolvedProjectId: string) => {
    const contentChunks = ContentFromCollections.splitContentIntoChunks(content);

    const importPromises = contentChunks.map(
      (chunk, index) => async () => {
        addProgressMessage({
          id: ProgressTrackerId.IMPORTED_CONTENT_CHUNK,
          message: `(${language}) Exporting ${index + 1} / ${contentChunks.length} content chunks`,
        });

        return ExportToLocalazyCommonService
          .exportToLocalazy(token.value, resolvedProjectId, chunk, language)
          .then(() => {
            upsertProgressMessage(ProgressTrackerId.IMPORTED_CONTENT_CHUNK, {
              message: `(${language}) Export ${index + 1} / ${contentChunks.length} content chunks`,
            });
          }).catch((e: any) => {
            addLocalazyError(e, { type: 'export', userId: localazyUser.value.id, orgId: localazyProject.value?.orgId || '' });
          });
      },
    );

    return importPromises;
  };

  const exportContentToLocalazy = async (data: ExportContentToLocalazy) => {
    const { content, settings, targetProjectId } = data;
    loading.value = true;

    // Resolve which project to export to
    const resolvedProject = targetProjectId
      ? localazyStore.getProject(targetProjectId)
      : localazyProject.value;
    const resolvedProjectId = resolvedProject?.id || projectId.value;

    const directusSourceLanguageAsLocalazyLanguage = ExportToLocalazyCommonService.getDirectusSourceLanguageAsLocalazyLanguage({
      localazySourceLanguage: resolvedProject?.sourceLanguage || 0,
      directusSourceLanguage: settings.source_language,
    });

    const nothingToExport = isEmpty(content.sourceLanguage) && Object.values(content.otherLanguages).every(isEmpty);

    add(createExportPromisesForLanguage(content.sourceLanguage, directusSourceLanguageAsLocalazyLanguage, resolvedProjectId));
    Object.entries(content.otherLanguages).forEach(([language, languageContent]) => {
      const localazyLanguage = DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(language);
      add(createExportPromisesForLanguage(languageContent, localazyLanguage, resolvedProjectId));
    });

    if (resolvedProject) {
      addProgressMessage({
        id: ProgressTrackerId.LOADED_LOCALAZY_PROJECT,
        message: `Loaded project ${resolvedProject.name}`,
      });

      await execute({ delayBetween: 150 });

      loading.value = false;
      addProgressMessage({
        id: ProgressTrackerId.EXPORT_FINISHED,
        message: nothingToExport ? 'Nothing to export from selected sources' : 'Export finished',
      });
      AnalyticsService.trackUploadToLocalazy(ExportToLocalazyCommonService.getPayloadForUploadAnalytics({
        userId: localazyUser.value.id,
        orgId: resolvedProject.orgId || '',
        localazyProject: resolvedProject.name || '',
        settings,
        languages: Object.keys(content.otherLanguages),
      }));
    } else {
      addProgressMessage({
        id: ProgressTrackerId.NOT_CONNECTED_TO_LOCALAZY,
        type: 'error',
        message: 'Couldn\'t connect to Localazy',
      });
    }
  };

  const exportToMultipleProjects = async (entries: ExportToMultipleProjectsEntry[]) => {
    for (const entry of entries) {
      await exportContentToLocalazy({
        content: entry.content,
        settings: entry.settings,
        targetProjectId: entry.projectId,
      });
    }
  };

  return {
    exportContentToLocalazy,
    exportToMultipleProjects,
    loading,
  };
};
