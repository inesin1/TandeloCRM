const PERMISSION_RESOURCES = [
  'leads',
  'contacts',
  'companies',
  'tasks',
  'pipelines',
  'custom-fields',
  'analytics',
  'users',
  'groups',
  'roles',
] as const;

const PERMISSION_ACTIONS = ['read', 'write'] as const;
const READ_ONLY_RESOURCES = ['analytics', 'roles'] as const;

export const PERMISSION_KEYS = PERMISSION_RESOURCES.flatMap((resource) =>
  (READ_ONLY_RESOURCES.includes(resource as (typeof READ_ONLY_RESOURCES)[number])
    ? ['read']
    : PERMISSION_ACTIONS
  ).map((action) => `${resource}:${action}`),
);
