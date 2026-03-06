export function template(templateSpec: any, env: any): {
    (context: any, options?: {}): string;
    isTop: boolean;
    _setup(options: any): void;
    _child(i: any, data: any, blockParams: any, depths: any): {
        (context: any, options?: {}): any;
        program: any;
        depth: any;
        blockParams: any;
    };
};
