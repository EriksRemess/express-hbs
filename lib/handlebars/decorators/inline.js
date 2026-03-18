import { createNewLookupObject } from '#handlebars/internal/create-new-lookup-object';

export default function registerInline(instance) {
  instance.registerDecorator('inline', function(fn, props, container, options) {
    let wrapper;

    if (!props.partials) {
      props.partials = createNewLookupObject();
      wrapper = function(context, execOptions) {
        const original = container.partials;
        container.partials = createNewLookupObject(original, props.partials);
        const result = fn(context, execOptions);
        container.partials = original;
        return result;
      };
    }

    props.partials[options.args[0]] = options.fn;
    return wrapper;
  });
}
