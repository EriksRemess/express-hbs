import registerBlockHelperMissing from '#handlebars/helpers/block-helper-missing';
import registerEach from '#handlebars/helpers/each';
import registerHelperMissing from '#handlebars/helpers/helper-missing';
import registerIf from '#handlebars/helpers/if';
import registerLog from '#handlebars/helpers/log';
import registerLookup from '#handlebars/helpers/lookup';
import registerWith from '#handlebars/helpers/with';

export function registerDefaultHelpers(instance) {
  registerBlockHelperMissing(instance);
  registerEach(instance);
  registerHelperMissing(instance);
  registerIf(instance);
  registerLog(instance);
  registerLookup(instance);
  registerWith(instance);
}

export function moveHelperToHooks(instance, helperName, keepHelper) {
  if (instance.helpers[helperName]) {
    instance.hooks[helperName] = instance.helpers[helperName];
    if (!keepHelper) {
      delete instance.helpers[helperName];
    }
  }
}
