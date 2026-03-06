export default class WhitespaceControl extends Visitor {
    constructor(options?: {});
    options: {};
    Program(program: any): any;
    isRootSeen: boolean;
    BlockStatement(block: any): {
        open: any;
        close: any;
        openStandalone: any;
        closeStandalone: any;
    };
    DecoratorBlock(block: any): {
        open: any;
        close: any;
        openStandalone: any;
        closeStandalone: any;
    };
    PartialBlockStatement(block: any): {
        open: any;
        close: any;
        openStandalone: any;
        closeStandalone: any;
    };
    visitBlockLike(block: any): {
        open: any;
        close: any;
        openStandalone: any;
        closeStandalone: any;
    };
    Decorator(mustache: any): any;
    MustacheStatement(mustache: any): any;
    PartialStatement(node: any): {
        inlineStandalone: boolean;
        open: any;
        close: any;
    };
    CommentStatement(node: any): {
        inlineStandalone: boolean;
        open: any;
        close: any;
    };
    visitStandaloneNode(node: any): {
        inlineStandalone: boolean;
        open: any;
        close: any;
    };
}
import Visitor from '#handlebars/compiler/visitor';
