declare module '@mkkellogg/gaussian-splats-3d' {
    export class DropInViewer {
        constructor(options?: any);
        addSplatScene(path: string, options?: any): Promise<void>;
        dispose(): void;
        [key: string]: any;
    }
    export class Viewer {
        constructor(options?: any);
        [key: string]: any;
    }
}
