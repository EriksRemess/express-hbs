export default AST;
declare namespace AST {
    namespace helpers {
        function helperExpression(node: any | Record<string, unknown>): boolean;
        function scopedId(path: {
            original: string;
        }): boolean;
        function simpleId(path: {
            depth: number;
            parts: string[];
        }): boolean;
    }
}
