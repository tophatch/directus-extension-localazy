export type EnabledField = {
  collection: string;
  fields: string[];
  projectId?: string;   // Localazy project ID; undefined = default project
  itemIds?: string[];    // Specific item IDs; undefined = all items
};

export type ContentTransferSetup = {
  /** Stored as JSON array */
  enabled_fields: EnabledField[];
  /** Sync translation strings defined in UI */
  translation_strings: boolean;
};

export type ContentTransferSetupDatabase = {
  /** Stored as JSON array */
  enabled_fields: string;
  /** Sync translation strings defined in UI */
  translation_strings: boolean;
};
