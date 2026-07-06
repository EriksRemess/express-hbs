import registerBlockHelperMissing from '#handlebars/helpers/block-helper-missing';
import registerEach from '#handlebars/helpers/each';
import registerHelperMissing from '#handlebars/helpers/helper-missing';
import registerIf from '#handlebars/helpers/if';
import registerLog from '#handlebars/helpers/log';
import registerLookup from '#handlebars/helpers/lookup';
import registerWith from '#handlebars/helpers/with';
import { lookupPropertyOption } from '#handlebars/internal/wrapHelper';

const noLookupPropertyHelpers = [
  'blockHelperMissing',
  'each',
  'helperMissing',
  'if',
  'log',
  'unless',
  'with'
];

/**
 * Registers the built-in helpers exposed by the local Handlebars runtime.
 *
 * @param {{ registerHelper(name: string, fn: Function): void }} instance
 * @returns {void}
 */
export function registerDefaultHelpers(instance) {
  registerBlockHelperMissing(instance);
  registerEach(instance);
  registerHelperMissing(instance);
  registerIf(instance);
  registerLog(instance);
  registerLookup(instance);
  registerWith(instance);

  for (let index = 0; index < noLookupPropertyHelpers.length; index += 1) {
    instance.helpers[noLookupPropertyHelpers[index]][lookupPropertyOption] = false;
  }
}

/**
 * Mirrors a helper onto the runtime hook table.
 *
 * @param {{ helpers: Record<string, Function>, hooks: Record<string, Function> }} instance
 * @param {string} helperName
 * @param {boolean} keepHelper
 * @returns {void}
 */
export function moveHelperToHooks(instance, helperName, keepHelper) {
  if (instance.helpers[helperName]) {
    instance.hooks[helperName] = instance.helpers[helperName];
    if (!keepHelper) {
      delete instance.helpers[helperName];
    }
  }
}
