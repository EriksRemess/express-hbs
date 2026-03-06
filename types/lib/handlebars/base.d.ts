export class HandlebarsEnvironment {
    constructor(helpers: any, partials: any, decorators: any);
    helpers: any;
    partials: any;
    decorators: any;
    helperRevision: number;
    partialRevision: number;
    decoratorRevision: number;
    logger: {
        methodMap: string[];
        level: string;
        lookupLevel(level: any): any;
        log(level: any, ...message: any[]): void;
    };
    log: (level: any, ...message: any[]) => void;
    registerHelper(name: any, fn: any): void;
    unregisterHelper(name: any): void;
    registerPartial(name: any, partial: any): void;
    unregisterPartial(name: any): void;
    registerDecorator(name: any, fn: any): void;
    unregisterDecorator(name: any): void;
    resetLoggedPropertyAccesses(): void;
}
import { createFrame } from '#handlebars/utils';
import logger from '#handlebars/logger';
export { createFrame, logger };
