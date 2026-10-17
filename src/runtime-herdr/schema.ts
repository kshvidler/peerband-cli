import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import addFormatsModule from 'ajv-formats';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { ConnectError } from '../core/index.js';

const execFileAsync = promisify(execFile);
// ajv-formats is CommonJS; under NodeNext its default import is typed as the module namespace.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as unknown as (ajv: Ajv2020) => void;

export interface HerdrSchema {
  protocol: number;
  schema_version: number;
  schemas: {
    request: Record<string, unknown>;
    success_response: Record<string, unknown>;
    error_response: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface SchemaLoadOptions { schemaPath?: string; binary?: string }

export interface ValidatedHerdrSchema {
  schema: HerdrSchema;
  validateRequest(value: unknown): boolean;
  validateSuccessResponse(value: unknown): boolean;
  validateErrorResponse(value: unknown): boolean;
  diagnostics(): string;
  writesHaveAtomicOccupantGuard: boolean;
}

export async function loadHerdrSchema(options: SchemaLoadOptions = {}): Promise<ValidatedHerdrSchema> {
  let raw: string;
  try {
    if (options.schemaPath) raw = await readFile(options.schemaPath, 'utf8');
    else {
      if (!options.binary) throw new Error('No schemaPath or Herdr binary was configured');
      const result = await execFileAsync(options.binary, ['api', 'schema', '--json'], {
        timeout: 10_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: process.env,
      });
      raw = result.stdout;
    }
  } catch {
    throw new ConnectError('runtime_unavailable', 'Could not load the Herdr API schema.', 'Set binary to the installed Herdr executable or provide schemaPath for its matching API schema.');
  }

  let schema: HerdrSchema;
  try { schema = JSON.parse(raw) as HerdrSchema; }
  catch { throw schemaMismatch('schema output is not valid JSON'); }
  if (!schema || typeof schema !== 'object' || !Number.isInteger(schema.protocol) || !Number.isInteger(schema.schema_version) || !schema.schemas?.request || !schema.schemas?.success_response || !schema.schemas?.error_response) {
    throw schemaMismatch('missing protocol metadata or required request/response schemas');
  }
  const requestOneOf = (schema.schemas.request as { oneOf?: unknown[] }).oneOf;
  const resultOneOf = (schema.schemas.success_response as { $defs?: { ResponseResult?: { oneOf?: unknown[] } } }).$defs?.ResponseResult?.oneOf;
  if (!Array.isArray(requestOneOf) || !Array.isArray(resultOneOf)) throw schemaMismatch('does not expose the expected Herdr request and success result unions');

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
    addFormats(ajv);
    const unsigned = (bits: number) => ({ type: 'number' as const, validate: (value: number) => Number.isSafeInteger(value) && value >= 0 && (bits >= 53 || value <= 2 ** bits - 1) });
    ajv.addFormat('uint', unsigned(32));
    ajv.addFormat('uint16', unsigned(16));
    ajv.addFormat('uint32', unsigned(32));
    ajv.addFormat('uint64', unsigned(64));
    const rootId = 'https://peerband.invalid/herdr-api.schema.json';
    const root = { ...schema, $id: rootId };
    ajv.addSchema(root);
    const requestValidator = ajv.compile({ $ref: `${rootId}#/schemas/request` });
    const successValidator = ajv.compile({ $ref: `${rootId}#/schemas/success_response` });
    const errorValidator = ajv.compile({ $ref: `${rootId}#/schemas/error_response` });
    let lastDiagnostics = 'no validation details';
    const wrap = (validator: typeof requestValidator) => (value: unknown): boolean => {
      const valid = validator(value);
      if (!valid) {
        lastDiagnostics = (validator.errors ?? []).slice(0, 5).map((item) => `${item.instancePath || '/'} ${item.message || 'invalid'}`).join('; ') || 'JSON Schema validation failed';
      }
      return valid;
    };
    const validateRequest = wrap(requestValidator);
    const validateSuccessResponse = wrap(successValidator);
    const validateErrorResponse = wrap(errorValidator);
    const methods = new Set(requestOneOf.map((branch) => (branch as { properties?: { method?: { const?: unknown } } }).properties?.method?.const));
    for (const required of ['session.snapshot', 'agent.list', 'agent.get', 'agent.read', 'agent.prompt']) if (!methods.has(required)) throw schemaMismatch(`missing required method ${required}`);
    // The pinned 0.9.3 agent.prompt shape has only target/text/wait. Do not infer
    // an occupant guard from pane ids, terminal ids, revisions, or native session IDs.
    const prompt = requestOneOf.find((branch) => (branch as { properties?: { method?: { const?: unknown } } }).properties?.method?.const === 'agent.prompt') as { properties?: { params?: { $ref?: string } } } | undefined;
    const promptRef = prompt?.properties?.params?.$ref;
    const promptName = promptRef?.split('/').at(-1);
    const params = promptName ? (schema.schemas.request as { $defs?: Record<string, { properties?: Record<string, unknown> }> }).$defs?.[promptName] : undefined;
    const writesHaveAtomicOccupantGuard = Boolean(params?.properties && Object.entries(params.properties).some(([name, spec]) =>
      /^(expected_generation|expected_terminal_id|expected_agent_session)$/i.test(name) && JSON.stringify(spec).toLowerCase().includes('occupant')));
    return {
      schema,
      validateRequest,
      validateSuccessResponse,
      validateErrorResponse,
      diagnostics: () => lastDiagnostics,
      writesHaveAtomicOccupantGuard,
    };
  } catch (cause) {
    if (cause instanceof ConnectError) throw cause;
    throw schemaMismatch(`could not compile JSON Schema validators (${cause instanceof Error ? cause.message : String(cause)})`);
  }
}

function schemaMismatch(detail: string): ConnectError {
  return new ConnectError('schema_mismatch', `Herdr API schema is incompatible: ${detail}`, 'Select a schema that matches the installed Herdr binary or update the adapter for its API.');
}
