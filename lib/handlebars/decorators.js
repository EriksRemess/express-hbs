import registerInline from '#handlebars/decorators/inline';

/**
 * Registers the built-in decorators supported by the local runtime.
 *
 * @param {{ registerDecorator(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export function registerDefaultDecorators(instance) {
  registerInline(instance);
}
