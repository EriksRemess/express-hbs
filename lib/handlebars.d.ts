export interface Program {
  type: 'Program';
  body: unknown[];
  [key: string]: unknown;
}

export interface TemplateSpec {
  main: Function;
  [key: string]: unknown;
}

export interface PrecompiledSource {
  code: string;
  map?: string;
}

export type TemplateDelegate = (context?: unknown, options?: Record<string, unknown>) => string;

/** The subset required when supplying an external Handlebars instance. */
export interface HandlebarsLike {
  SafeString: new (value: string) => {
    toString(): string;
    toHTML(): string;
  };
  Utils: {
    escapeExpression(value: unknown): string;
  };
  compile(source: string, options?: unknown): Function;
  registerHelper(name: string, fn: Function): void;
  registerPartial(name: string, partial: string | Function): void;
  unregisterHelper?(name: string): void;
  unregisterPartial?(name: string): void;
}

export interface LocalHandlebars extends HandlebarsLike {
  createFrame<T extends object>(value: T): T;
  helpers: Record<string, Function>;
  partials: Record<string, string | Function>;
  decorators: Record<string, Function>;
  create(): LocalHandlebars;
  parse(source: string | Program, options?: Record<string, unknown>): Program;
  precompile(source: string | Program, options: Record<string, unknown> & { srcName: string }): PrecompiledSource;
  precompile(source: string | Program, options?: Record<string, unknown> & { srcName?: undefined }): string;
  precompile(source: string | Program, options?: Record<string, unknown>): string | PrecompiledSource;
  compile(source: string | Program, options?: Record<string, unknown>): TemplateDelegate;
  template(spec: TemplateSpec): TemplateDelegate;
  escapeExpression(value: unknown): string;
  registerHelper(name: string, fn: Function): void;
  registerHelper(helpers: Record<string, Function>): void;
  unregisterHelper(name: string): void;
  registerPartial(name: string, partial: string | Function): void;
  registerPartial(partials: Record<string, string | Function>): void;
  unregisterPartial(name: string): void;
  registerDecorator(name: string, fn: Function): void;
  registerDecorator(decorators: Record<string, Function>): void;
  unregisterDecorator(name: string): void;
}

declare const handlebars: LocalHandlebars;
export default handlebars;
