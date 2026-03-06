/**
 * Registers the built-in decorators supported by the local runtime.
 *
 * @param {{ registerDecorator(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export function registerDefaultDecorators(instance: {
    registerDecorator(name: string, fn: Function): void;
}): void;
