<template>
  <div class="project-tabs" v-if="projectConfigs.length > 1">
    <v-button
      class="tab-button"
      :class="{ active: !activeProjectId }"
      x-small
      :secondary="!!activeProjectId"
      @click="$emit('update:activeProjectId', undefined)"
    >
      All Projects
    </v-button>
    <v-button
      v-for="config in projectConfigs"
      :key="config.project_id"
      class="tab-button"
      :class="{ active: activeProjectId === config.project_id }"
      x-small
      :secondary="activeProjectId !== config.project_id"
      @click="$emit('update:activeProjectId', config.project_id)"
    >
      {{ config.project_name }}
      <v-chip v-if="config.is_default" x-small class="default-chip">Default</v-chip>
    </v-button>
  </div>
</template>

<script lang="ts" setup>
import { PropType } from 'vue';
import { LocalazyProjectConfig } from '../../../../common/models/collections-data/localazy-project-config';

defineProps({
  projectConfigs: {
    type: Array as PropType<LocalazyProjectConfig[]>,
    required: true,
  },
  activeProjectId: {
    type: String as PropType<string | undefined>,
    default: undefined,
  },
});

defineEmits(['update:activeProjectId']);
</script>

<style lang="scss" scoped>
.project-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-normal);
  flex-wrap: wrap;
}

.tab-button {
  &.active {
    --v-button-background-color: var(--primary);
    --v-button-color: var(--white);
  }
}

.default-chip {
  margin-left: 4px;
}
</style>
