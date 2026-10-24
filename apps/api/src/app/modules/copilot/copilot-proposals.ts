type PropertySchema = Record<string, unknown>;

const strictObject = (properties: Record<string, PropertySchema>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

const nullable = (schema: PropertySchema) => ({
  anyOf: [schema, { type: 'null' }],
});

const integer = (minimum = 1) => ({ type: 'integer', minimum });
const string = (maxLength = 5000) => ({ type: 'string', minLength: 1, maxLength });
const field = (value: PropertySchema) => strictObject({
  set: { type: 'boolean' },
  value: nullable(value),
});

const customFieldEntries = nullable({
  type: 'array',
  maxItems: 30,
  items: strictObject({ key: string(100), value: { anyOf: [
    { type: 'string', maxLength: 1000 },
    { type: 'number' },
    { type: 'boolean' },
    { type: 'null' },
  ] } }),
});

const createRecordProperties: Record<string, PropertySchema> = {
  kind: { type: 'string', enum: ['lead', 'company', 'contact'] },
  name: string(160),
  price: nullable({ type: 'integer' }),
  source: nullable(string(200)),
  pipelineId: nullable(integer()),
  statusId: nullable(integer()),
  companyId: nullable(integer()),
  ownerId: nullable(integer()),
  contactIds: nullable({ type: 'array', maxItems: 20, uniqueItems: true, items: integer() }),
  industry: nullable(string(120)),
  address: nullable(string(500)),
  email: nullable({ type: 'string', format: 'email', maxLength: 320 }),
  phone: nullable(string(80)),
  position: nullable(string(120)),
  customFields: customFieldEntries,
};

const recordPatchProperties: Record<string, PropertySchema> = {
  name: field(string(160)),
  price: field({ type: 'integer' }),
  source: field(string(200)),
  pipelineId: field(integer()),
  statusId: field(integer()),
  companyId: field(integer()),
  ownerId: field(integer()),
  contactIds: field({ type: 'array', maxItems: 20, uniqueItems: true, items: integer() }),
  industry: field(string(120)),
  address: field(string(500)),
  email: field({ type: 'string', format: 'email', maxLength: 320 }),
  phone: field(string(80)),
  position: field(string(120)),
  customFields: field({
    type: 'array',
    maxItems: 30,
    items: strictObject({ key: string(100), value: { anyOf: [
      { type: 'string', maxLength: 1000 },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'null' },
    ] } }),
  }),
};

const taskPatchProperties: Record<string, PropertySchema> = {
  leadId: field(integer()),
  type: field({ type: 'string', enum: ['call', 'email', 'meeting', 'document'] }),
  text: field(string(5000)),
  dueAt: field({ type: 'string', format: 'date-time' }),
  isCompleted: field({ type: 'boolean' }),
  assigneeId: field(integer()),
};

const proposalDefinitions = {
  propose_create_record: {
    description: 'Prepare a lead, company, or contact creation proposal for user confirmation. Null fields not used by the selected kind.',
    parameters: strictObject(createRecordProperties),
  },
  propose_update_record: {
    description: 'Prepare a lead, company, or contact update proposal. Set only fields to change; represent unlinking with set=true and value=null.',
    parameters: strictObject({
      kind: { type: 'string', enum: ['lead', 'company', 'contact'] },
      id: integer(),
      patch: strictObject(recordPatchProperties),
    }),
  },
  propose_create_task: {
    description: 'Prepare a task creation proposal for user confirmation.',
    parameters: strictObject({
      leadId: integer(),
      type: { type: 'string', enum: ['call', 'email', 'meeting', 'document'] },
      text: string(5000),
      dueAt: { type: 'string', format: 'date-time' },
      assigneeId: nullable(integer()),
    }),
  },
  propose_update_task: {
    description: 'Prepare a task update proposal. Set only fields to change; represent unlinking with set=true and value=null.',
    parameters: strictObject({
      id: integer(),
      patch: strictObject(taskPatchProperties),
    }),
  },
  propose_add_note: {
    description: 'Prepare a note proposal for a lead, company, or contact. It does not save a CRM note.',
    parameters: strictObject({
      kind: { type: 'string', enum: ['lead', 'company', 'contact'] },
      id: integer(),
      body: string(5000),
    }),
  },
} as const;

export type CopilotProposalToolName = keyof typeof proposalDefinitions;

export function isCopilotProposalToolName(name: string): name is CopilotProposalToolName {
  return Object.prototype.hasOwnProperty.call(proposalDefinitions, name);
}

export function copilotProposalToolDefinitions(granted: string[]): Record<string, unknown>[] {
  const has = (...permissions: string[]) => permissions.every((key) => granted.includes(key));
  const recordKinds = (resource: 'leads' | 'companies' | 'contacts') =>
    has(`${resource}:read`, `${resource}:write`);
  const createKinds = [
    ...(recordKinds('leads') && has('pipelines:read') ? ['lead'] : []),
    ...(recordKinds('companies') ? ['company'] : []),
    ...(recordKinds('contacts') ? ['contact'] : []),
  ];
  const updateKinds = [
    ...(recordKinds('leads') ? ['lead'] : []),
    ...(recordKinds('companies') ? ['company'] : []),
    ...(recordKinds('contacts') ? ['contact'] : []),
  ];
  const definitions = Object.entries(proposalDefinitions) as unknown as Array<[
    CopilotProposalToolName,
    { description: string; parameters: { properties: Record<string, PropertySchema> } },
  ]>;

  return definitions.flatMap(([name, definition]) => {
    if (name === 'propose_create_record' || name === 'propose_update_record') {
      const allowedKinds = name === 'propose_create_record' ? createKinds : updateKinds;
      if (!allowedKinds.length) return [];
      const parameters = JSON.parse(JSON.stringify(definition.parameters)) as {
        properties: Record<string, PropertySchema>;
      };
      parameters.properties.kind.enum = allowedKinds;
      if (name === 'propose_create_record') {
        if (!has('users:read')) parameters.properties.ownerId = { type: 'null' };
        if (!has('companies:read')) parameters.properties.companyId = { type: 'null' };
        if (!has('contacts:read')) parameters.properties.contactIds = { type: 'null' };
        if (!has('custom-fields:read')) parameters.properties.customFields = { type: 'null' };
      } else {
        const patch = parameters.properties.patch as { properties: Record<string, PropertySchema> };
        if (!has('users:read')) patch.properties.ownerId = disabledPatchField();
        if (!has('companies:read')) patch.properties.companyId = disabledPatchField();
        if (!has('contacts:read')) patch.properties.contactIds = disabledPatchField();
        if (!has('custom-fields:read')) patch.properties.customFields = disabledPatchField();
        if (!has('pipelines:read')) {
          patch.properties.pipelineId = disabledPatchField();
          patch.properties.statusId = disabledPatchField();
        }
      }
      return [{ type: 'function', name, description: definition.description, strict: true, parameters }] as unknown as Record<string, unknown>[];
    }
    if (name === 'propose_create_task') {
      if (!has('tasks:read', 'tasks:write', 'leads:read')) return [];
      const parameters = JSON.parse(JSON.stringify(definition.parameters)) as { properties: Record<string, PropertySchema> };
      if (!has('users:read')) parameters.properties.assigneeId = { type: 'null' };
      return [{ type: 'function', name, description: definition.description, strict: true, parameters }] as unknown as Record<string, unknown>[];
    }
    if (name === 'propose_update_task') {
      if (!has('tasks:read', 'tasks:write')) return [];
      const parameters = JSON.parse(JSON.stringify(definition.parameters)) as { properties: Record<string, PropertySchema> };
      const patch = parameters.properties.patch as { properties: Record<string, PropertySchema> };
      if (!has('users:read')) patch.properties.assigneeId = disabledPatchField();
      if (!has('leads:read')) patch.properties.leadId = disabledPatchField();
      return [{ type: 'function', name, description: definition.description, strict: true, parameters }] as unknown as Record<string, unknown>[];
    }
    const kinds = [
      ...(has('leads:read', 'leads:write') ? ['lead'] : []),
      ...(has('companies:read', 'companies:write') ? ['company'] : []),
      ...(has('contacts:read', 'contacts:write') ? ['contact'] : []),
    ];
    if (!kinds.length) return [];
    const parameters = JSON.parse(JSON.stringify(definition.parameters)) as {
      properties: Record<string, PropertySchema>;
    };
    parameters.properties.kind.enum = kinds;
    return [{ type: 'function', name, description: definition.description, strict: true, parameters }] as unknown as Record<string, unknown>[];
  });
}

export function parseCopilotProposalArgs(name: string, raw: string): Record<string, unknown> | null {
  if (!isCopilotProposalToolName(name)) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || !matchesSchemaShape(name, value)) return null;
  return value;
}

function matchesSchemaShape(name: CopilotProposalToolName, args: Record<string, unknown>) {
  const allowedTop = Object.keys(proposalDefinitions[name].parameters.properties);
  if (Object.keys(args).length !== allowedTop.length || allowedTop.some((key) => !(key in args))) return false;
  if (name === 'propose_create_record') {
    const basic = ['lead', 'company', 'contact'].includes(String(args.kind)) &&
      typeof args.name === 'string' && args.name.trim().length > 0 && args.name.length <= 160 &&
      isNullablePositiveInt(args.price) && isNullableString(args.source, 200) &&
      isNullablePositiveInt(args.pipelineId) && isNullablePositiveInt(args.statusId) &&
      isNullablePositiveInt(args.companyId) && isNullablePositiveInt(args.ownerId) &&
      isNullableIdArray(args.contactIds) && isNullableString(args.industry, 120) &&
      isNullableString(args.address, 500) && isNullableEmail(args.email) &&
      isNullableString(args.phone, 80) && isNullableString(args.position, 120) &&
      isNullableCustomFields(args.customFields);
    return basic && (args.kind !== 'lead' || (isPositiveInt(args.pipelineId) && isPositiveInt(args.statusId)));
  }
  if (name === 'propose_update_record') {
    return ['lead', 'company', 'contact'].includes(String(args.kind)) && isPositiveInt(args.id) &&
      isRecord(args.patch) && matchesPatch(args.patch, recordPatchProperties);
  }
  if (name === 'propose_create_task') {
    return isPositiveInt(args.leadId) && ['call', 'email', 'meeting', 'document'].includes(String(args.type)) &&
      typeof args.text === 'string' && args.text.trim().length > 0 && args.text.length <= 5000 &&
      isIsoDate(args.dueAt) && isNullablePositiveInt(args.assigneeId);
  }
  if (name === 'propose_update_task') {
    return isPositiveInt(args.id) && isRecord(args.patch) && matchesPatch(args.patch, taskPatchProperties);
  }
  return ['lead', 'company', 'contact'].includes(String(args.kind)) && isPositiveInt(args.id) &&
    typeof args.body === 'string' && args.body.trim().length > 0 && args.body.length <= 5000;
}

function matchesPatch(patch: Record<string, unknown>, schema: Record<string, PropertySchema>) {
  if (Object.keys(patch).length !== Object.keys(schema).length || Object.keys(schema).some((key) => !(key in patch))) return false;
  let hasChangedField = false;
  for (const [key, value] of Object.entries(patch)) {
    if (!isRecord(value) || Object.keys(value).length !== 2 || typeof value.set !== 'boolean' || !('value' in value)) return false;
    if (!value.set && value.value !== null) return false;
    if (value.set) hasChangedField = true;
    if (value.set && !validPatchValue(key, value.value)) return false;
  }
  return hasChangedField;
}

function validPatchValue(key: string, value: unknown) {
  if (key === 'name') return isNonEmptyString(value, 160);
  if (key === 'text' || key === 'body') return isNonEmptyString(value, 5000);
  if (key === 'price') return value === null || Number.isInteger(value);
  if (key === 'source') return isNullableString(value, 200);
  if (key === 'industry' || key === 'position') return isNullableString(value, 120);
  if (key === 'address') return isNullableString(value, 500);
  if (key === 'phone') return isNullableString(value, 80);
  if (key === 'email') return value === null || isEmail(value);
  if (key === 'pipelineId' || key === 'statusId' || key === 'companyId' || key === 'ownerId' || key === 'leadId' || key === 'assigneeId') return value === null || isPositiveInt(value);
  if (key === 'contactIds') return isIdArray(value);
  if (key === 'customFields') return isCustomFieldEntries(value);
  if (key === 'type') return ['call', 'email', 'meeting', 'document'].includes(String(value));
  if (key === 'dueAt') return isIsoDate(value);
  if (key === 'isCompleted') return typeof value === 'boolean';
  return false;
}

function disabledPatchField(): PropertySchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: { set: { type: 'boolean', enum: [false] }, value: { type: 'null' } },
    required: ['set', 'value'],
  };
}

function isNullableCustomFields(value: unknown) {
  if (value === null) return true;
  return isCustomFieldEntries(value);
}
function isCustomFieldEntries(value: unknown): value is Array<{ key: string; value: unknown }> {
  return Array.isArray(value) && value.length <= 30 && value.every((entry) =>
    isRecord(entry) && Object.keys(entry).length === 2 && isNonEmptyString(entry.key, 100) &&
    (typeof entry.value === 'string' ? entry.value.length <= 1000 :
      typeof entry.value === 'number' ? Number.isFinite(entry.value) :
        typeof entry.value === 'boolean' || entry.value === null),
  ) && new Set(value.map((entry) => entry.key)).size === value.length;
}

function isNullableEmail(value: unknown) {
  return value === null || isEmail(value);
}
function isEmail(value: unknown) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}
function isNullableString(value: unknown, maxLength: number) {
  return value === null || (typeof value === 'string' && value.length <= maxLength);
}
function isNonEmptyString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}
function isNullablePositiveInt(value: unknown) {
  return value === null || isPositiveInt(value);
}
function isNullableIdArray(value: unknown) {
  return value === null || isIdArray(value);
}
function isIdArray(value: unknown) {
  return Array.isArray(value) && value.length <= 20 && value.every(isPositiveInt) && new Set(value).size === value.length;
}
function isPositiveInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
function isIsoDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
