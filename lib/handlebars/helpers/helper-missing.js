import Exception from '#handlebars/exception';

export default function(instance) {
  instance.registerHelper('helperMissing', function(...args) {
    if (args.length === 1) {
      // A missing field in a {{foo}} construct.
      return undefined;
    }

    throw new Exception(`Missing helper: "${args.at(-1).name}"`);
  });
}
