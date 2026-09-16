const PERMISSION_RESOURCES = [
  'leads',
  'contacts',
  'companies',
  'settings',
  'integrations',
  'users',
  'roles',
] as const;

const PERMISSION_ACTIONS = ['read', 'write'] as const;

export const PERMISSION_KEYS = PERMISSION_RESOURCES.flatMap((resource) =>
  PERMISSION_ACTIONS.map((action) => `${resource}:${action}`),
);
