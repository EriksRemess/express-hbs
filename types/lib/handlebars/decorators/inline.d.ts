/**
 * Registers the built-in `inline` decorator.
 *
 * @param {{ registerDecorator(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export default function registerInline(instance: {
    registerDecorator(name: string, fn: Function): void;
}): void;
