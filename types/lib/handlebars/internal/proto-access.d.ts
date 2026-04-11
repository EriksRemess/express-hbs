/**
 * Creates the runtime prototype-access allowlist structure.
 *
 * @param {Record<string, unknown>} runtimeOptions
 * @returns {{ properties: { whitelist: object, defaultValue: unknown }, methods: { whitelist: object, defaultValue: unknown } }}
 */
export function createProtoAccessControl(runtimeOptions: Record<string, unknown>): {
    properties: {
        whitelist: object;
        defaultValue: unknown;
    };
    methods: {
        whitelist: object;
        defaultValue: unknown;
    };
};
/**
 * Checks whether a resolved property or method value may be returned to templates.
 *
 * @param {unknown} result
 * @param {{ properties: object, methods: object }} protoAccessControl
 * @param {string} propertyName
 * @returns {boolean}
 */
export function resultIsAllowed(result: unknown, protoAccessControl: {
    properties: object;
    methods: object;
}, propertyName: string): boolean;
/**
 * Clears the once-per-property warning cache used during tests.
 *
 * @returns {void}
 */
export function resetLoggedProperties(): void;
