export function precompile(input: any, options: any): any;
export function compile(input: any, options: {}, env: any): {
    (context: any, execOptions: any): any;
    _setup(setupOptions: any): any;
    _child(i: any, data: any, blockParams: any, depths: any): any;
};
