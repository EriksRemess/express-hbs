/**
 * Converts a compiled template spec into an executable render function.
 *
 * @param {{ main?: Function, main_d?: Function, compilerOptions?: unknown, useData?: boolean, useDepths?: boolean, useBlockParams?: boolean, [key: string]: unknown }} templateSpec
 * @param {Record<string, unknown>} env
 * @param {boolean} [undecoratedChildren] Set by the local compiler for decorator-free templates.
 * @returns {Function}
 */
export declare function template(templateSpec: {
    main?: Function;
    main_d?: Function;
    compilerOptions?: unknown;
    useData?: boolean;
    useDepths?: boolean;
    useBlockParams?: boolean;
    [key: string]: unknown;
}, env: Record<string, unknown>, undecoratedChildren?: boolean): Function;
