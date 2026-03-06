export interface LocalHandlebars {
  SafeString: new (value: string) => {
    toString(): string;
    toHTML(): string;
  };
  createFrame<T extends object>(value: T): T;
  Utils: {
    escapeExpression(value: unknown): string;
  };
  helpers: Record<string, Function>;
  create(): LocalHandlebars;
  parse(source: string, options?: unknown): unknown;
  precompile(source: string, options?: unknown): unknown;
  compile(source: string, options?: unknown): (context: unknown, options?: unknown) => string;
  registerHelper(name: string, fn: Function): void;
  registerPartial(name: string, partial: string | Function): void;
}

declare const handlebars: LocalHandlebars;
export default handlebars;
