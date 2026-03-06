export default logger;
declare namespace logger {
    let methodMap: string[];
    let level: string;
    function lookupLevel(level: any): any;
    function log(level: any, ...message: any[]): void;
}
