import { z } from 'zod';

/**
 * Gemini `responseSchema` (OpenAPI 3.0 subset) generated from our Zod schemas, so the model's
 * output contract and our validator can never drift apart. Only keywords Gemini supports are
 * emitted; string length limits are enforced afterwards by sanitizers instead.
 */
export interface GeminiSchema {
  type?: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
  description?: string;
  nullable?: boolean;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
  items?: GeminiSchema;
  maxItems?: string;
  minItems?: string;
  anyOf?: GeminiSchema[];
}

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  maxItems?: number;
  minItems?: number;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
};

const TYPE_MAP: Record<string, GeminiSchema['type']> = {
  object: 'OBJECT',
  array: 'ARRAY',
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
};

function convert(node: JsonSchema): GeminiSchema {
  const variants = node.anyOf ?? node.oneOf;
  if (variants) {
    const nonNull = variants.filter((v) => v.type !== 'null');
    const nullable = nonNull.length !== variants.length;
    if (nonNull.length === 1 && nonNull[0]) {
      const inner = convert(nonNull[0]);
      return {
        ...inner,
        ...(nullable ? { nullable: true } : {}),
        ...(node.description ? { description: node.description } : {}),
      };
    }
    return {
      anyOf: nonNull.map(convert),
      ...(nullable ? { nullable: true } : {}),
      ...(node.description ? { description: node.description } : {}),
    };
  }

  let type = node.type;
  let nullable = false;
  if (Array.isArray(type)) {
    nullable = type.includes('null');
    type = type.find((t) => t !== 'null');
  }

  const out: GeminiSchema = {};
  if (node.description) out.description = node.description;
  if (nullable) out.nullable = true;

  if (node.enum || node.const !== undefined) {
    out.type = 'STRING';
    out.enum = (node.enum ?? [node.const]).map(String);
    return out;
  }

  out.type = TYPE_MAP[type ?? 'string'] ?? 'STRING';
  if (out.type === 'OBJECT' && node.properties) {
    const keys = Object.keys(node.properties);
    out.properties = Object.fromEntries(keys.map((k) => [k, convert(node.properties![k]!)]));
    out.required = node.required ?? [];
    out.propertyOrdering = keys;
  }
  if (out.type === 'ARRAY' && node.items) {
    out.items = convert(node.items);
    if (node.maxItems !== undefined) out.maxItems = String(node.maxItems);
    if (node.minItems !== undefined) out.minItems = String(node.minItems);
  }
  return out;
}

export function toGeminiSchema(schema: z.ZodType): GeminiSchema {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' }) as JsonSchema;
  return convert(json);
}
