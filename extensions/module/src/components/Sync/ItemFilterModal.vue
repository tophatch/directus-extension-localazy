<template>
  <v-dialog v-model="isOpen" @esc="isOpen = false">
    <template #activator="{ on }">
      <v-button x-small secondary @click="on" class="filter-button">
        <v-icon name="filter_list" small />
        <span v-if="selectedItemIds.length > 0">{{ selectedItemIds.length }} items</span>
        <span v-else>All items</span>
      </v-button>
    </template>

    <v-card>
      <v-card-title>Filter items from {{ collection }}</v-card-title>
      <v-card-text>
        <div class="filter-controls">
          <v-input
            v-model="searchQuery"
            placeholder="Search items..."
            small
          >
            <template #prepend>
              <v-icon name="search" />
            </template>
          </v-input>
          <div class="bulk-actions">
            <v-button x-small secondary @click="selectAllItems">Select All</v-button>
            <v-button x-small secondary @click="deselectAllItems">Deselect All</v-button>
          </div>
        </div>

        <div class="items-list" v-if="!loadingItems">
          <v-checkbox
            v-for="item in filteredItems"
            :key="item.id"
            :value="String(item.id)"
            :model-value="localSelectedIds"
            @update:model-value="localSelectedIds = $event"
            class="item-checkbox"
          >
            <span class="item-label">
              <span class="item-id">#{{ item.id }}</span>
              <span v-if="item.displayValue" class="item-display">{{ item.displayValue }}</span>
            </span>
          </v-checkbox>
        </div>
        <v-progress-linear v-else indeterminate />
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="isOpen = false">Cancel</v-button>
        <v-button @click="applyFilter">
          Apply ({{ localSelectedIds.length || 'All' }} items)
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import {
  PropType, computed, ref, watch,
} from 'vue';
import { Item } from '@directus/types';
import { useDirectusApi } from '../../composables/use-directus-api';

const props = defineProps({
  collection: {
    type: String,
    required: true,
  },
  selectedItemIds: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
});

const emit = defineEmits(['update:itemIds']);

const isOpen = ref(false);
const searchQuery = ref('');
const loadingItems = ref(false);
const items = ref<(Item & { displayValue?: string })[]>([]);
const localSelectedIds = ref<string[]>([...props.selectedItemIds]);

const { fetchDirectusItems } = useDirectusApi();

const filteredItems = computed(() => {
  if (!searchQuery.value) return items.value;
  const query = searchQuery.value.toLowerCase();
  return items.value.filter(
    (item) => String(item.id).includes(query)
      || (item.displayValue && item.displayValue.toLowerCase().includes(query)),
  );
});

async function loadItems() {
  loadingItems.value = true;
  try {
    const result = await fetchDirectusItems<Item>(props.collection, {
      fields: ['id', 'title', 'name', 'label', 'subject', 'heading'],
      limit: -1,
    });
    items.value = result.map((item) => ({
      ...item,
      displayValue: item.title || item.name || item.label || item.subject || item.heading || '',
    }));
  } finally {
    loadingItems.value = false;
  }
}

function selectAllItems() {
  localSelectedIds.value = items.value.map((item) => String(item.id));
}

function deselectAllItems() {
  localSelectedIds.value = [];
}

function applyFilter() {
  emit('update:itemIds', localSelectedIds.value.length === items.value.length ? [] : localSelectedIds.value);
  isOpen.value = false;
}

watch(isOpen, (open) => {
  if (open) {
    localSelectedIds.value = [...props.selectedItemIds];
    loadItems();
  }
});
</script>

<style lang="scss" scoped>
.filter-button {
  margin-left: 4px;
}

.filter-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.bulk-actions {
  display: flex;
  gap: 4px;
}

.items-list {
  max-height: 400px;
  overflow-y: auto;
}

.item-checkbox {
  margin-bottom: 4px;
}

.item-label {
  display: flex;
  gap: 8px;
  align-items: center;
}

.item-id {
  color: var(--foreground-subdued);
  font-size: 12px;
  font-family: var(--family-monospace);
}

.item-display {
  font-weight: 500;
}
</style>
