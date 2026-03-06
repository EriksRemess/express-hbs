export default function registerInline(instance) {
  instance.registerDecorator('inline', function(fn, props, container, options) {
    let wrapper;

    if (!props.partials) {
      props.partials = {};
      wrapper = function(context, execOptions) {
        const original = container.partials;
        container.partials = Object.assign({}, original, props.partials);
        const result = fn(context, execOptions);
        container.partials = original;
        return result;
      };
    }

    props.partials[options.args[0]] = options.fn;
    return wrapper;
  });
}
