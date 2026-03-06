import { createFrame } from '#handlebars/utils';
import Exception from '#handlebars/exception';
import { registerDefaultDecorators } from '#handlebars/decorators';
import { registerDefaultHelpers } from '#handlebars/helpers';
import logger from '#handlebars/logger';
import { resetLoggedProperties } from '#handlebars/internal/proto-access';

const objectType = '[object Object]';

export class HandlebarsEnvironment {
  constructor(helpers, partials, decorators) {
    this.helpers = helpers ?? {};
    this.partials = partials ?? {};
    this.decorators = decorators ?? {};
    this.helperRevision = 0;
    this.partialRevision = 0;
    this.decoratorRevision = 0;

    registerDefaultHelpers(this);
    registerDefaultDecorators(this);
    this.logger = logger;
    this.log = logger.log;
  }

  registerHelper(name, fn) {
    if (Object.prototype.toString.call(name) === objectType) {
      if (fn) {
        throw new Exception('Arg not supported with multiple helpers');
      }
      Object.assign(this.helpers, name);
      this.helperRevision += 1;
      return;
    }

    this.helpers[name] = fn;
    this.helperRevision += 1;
  }

  unregisterHelper(name) {
    delete this.helpers[name];
    this.helperRevision += 1;
  }

  registerPartial(name, partial) {
    if (Object.prototype.toString.call(name) === objectType) {
      Object.assign(this.partials, name);
      this.partialRevision += 1;
      return;
    }

    if (typeof partial === 'undefined') {
      throw new Exception(
        `Attempting to register a partial called "${name}" as undefined`
      );
    }

    this.partials[name] = partial;
    this.partialRevision += 1;
  }

  unregisterPartial(name) {
    delete this.partials[name];
    this.partialRevision += 1;
  }

  registerDecorator(name, fn) {
    if (Object.prototype.toString.call(name) === objectType) {
      if (fn) {
        throw new Exception('Arg not supported with multiple decorators');
      }
      Object.assign(this.decorators, name);
      this.decoratorRevision += 1;
      return;
    }

    this.decorators[name] = fn;
    this.decoratorRevision += 1;
  }

  unregisterDecorator(name) {
    delete this.decorators[name];
    this.decoratorRevision += 1;
  }

  resetLoggedPropertyAccesses() {
    resetLoggedProperties();
  }
}

export { createFrame, logger };
