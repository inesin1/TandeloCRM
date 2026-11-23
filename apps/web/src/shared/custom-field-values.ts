/** Keeps only values whose custom field definitions still exist. */
export function currentCustomFieldValues(
  values: Record<string, unknown>,
  fields: ReadonlyArray<{ key: string }>,
): Record<string, unknown> {
  const currentKeys = new Set(fields.map((field) => field.key));
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => currentKeys.has(key)),
  );
}
