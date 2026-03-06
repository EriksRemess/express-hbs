export default class Exception extends Error {
    constructor(message: any, node: any);
    lineNumber: any;
    endLineNumber: any;
}
