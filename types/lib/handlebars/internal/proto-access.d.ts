export function createProtoAccessControl(runtimeOptions: any): {
    properties: {
        whitelist: any;
        defaultValue: any;
    };
    methods: {
        whitelist: any;
        defaultValue: any;
    };
};
export function resultIsAllowed(result: any, protoAccessControl: any, propertyName: any): any;
export function resetLoggedProperties(): void;
