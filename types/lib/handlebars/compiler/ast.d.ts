export default AST;
declare namespace AST {
    namespace helpers {
        function helperExpression(node: any): boolean;
        function scopedId(path: any): boolean;
        function simpleId(path: any): boolean;
    }
}
