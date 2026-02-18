import { Field, DeepPartial } from '@directus/types';
import { getConfig } from '../../../../../common/config/get-config';

export const createLocalazyProjectsFields = (): Array<DeepPartial<Field>> => [
  {
    field: 'id',
    type: 'integer',
    meta: {
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
      interface: 'numeric',
    },
    schema: {
      is_nullable: false,
      is_primary_key: true,
      has_auto_increment: true,
    },
  },
  {
    field: 'project_id',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'project_name',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'project_url',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'org_id',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
  {
    field: 'is_default',
    type: 'boolean',
    meta: {
      interface: 'boolean',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
    schema: {
      default_value: false,
    },
  },
  {
    field: 'access_token',
    type: 'string',
    meta: {
      interface: 'input',
      readonly: getConfig().APP_MODE === 'production',
      hidden: getConfig().APP_MODE === 'production',
    },
  },
];
