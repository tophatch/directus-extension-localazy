<template>
  <div class="sync-option-buttons">
    <v-checkbox
      class="checkbox-button"
      :indeterminate="someTranslatableFieldsChecked && !allTranslatableFieldsChecked"
      :model-value="allTranslatableFieldsChecked"
      @update:model-value="onUpdateCollectionSelection"
    >
      <span class="button-label" v-if="allTranslatableFieldsChecked">Deselect all</span>
      <span class="button-label" v-else>Select all</span>
    </v-checkbox>
  </div>
</template>

<script lang="ts" setup>
const props = defineProps({
  allTranslatableFieldsChecked: {
    type: Boolean,
    required: true,
  },
  someTranslatableFieldsChecked: {
    type: Boolean,
    required: true,
  },
});

const emits = defineEmits(['select-all', 'deselect-all']);

function onUpdateCollectionSelection() {
  if (props.allTranslatableFieldsChecked) {
    emits('deselect-all');
  } else {
    emits('select-all');
  }
}
</script>

<style lang="scss" scoped>
.sync-option-buttons {
  display: flex;
  justify-content: space-between;
  padding: 16px 4px;
  border-top: 2px solid #F0F4F9;
  border-bottom: 2px solid #F0F4F9;
  width: 100%;

  & .v-icon {
    --v-icon-color: var(--foreground-subdued);
  }

  .checkbox-button {
    &::v-deep(.v-icon) {
        color: var(--foreground-subdued);
      }

    &:hover {
      ::v-deep(.checkbox) {
        color: var(--foreground-subdued);
      }
    }
  }

  & .button-label {
    color: var(--foreground-subdued);
    font-weight: 500;
  }
}
</style>
