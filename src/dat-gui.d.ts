declare global {
    const dat: DatGUIStatic;

    interface DatGUIStatic {
        GUI: new (options?: GUIOptions) => GUI;
    }

    interface GUIOptions {
        name?: string;
        width?: number;
        autoPlace?: boolean;
        closeOnTop?: boolean;
        load?: any;
        parent?: HTMLElement;
    }

    interface GUI {
        add(object: any, property: string): GUIController;
        add(object: any, property: string, min: number, max: number): GUIController;
        add(object: any, property: string, options: string[]): GUIController;
        add(object: any, property: string, options: Record<string, any>): GUIController;

        addColor(object: any, property: string): GUIController;

        addFolder(name: string): GUI;

        open(): this;
        close(): this;

        destroy(): void;
        hide(): void;

        domElement: HTMLElement;

        name: string;

        onChange(callback: (value: any) => void): this;
        onFinishChange(callback: (value: any) => void): this;

        remember(object: any): void;

        width: number;
    }

    interface GUIController {
        onChange(callback: (value: any) => void): this;
        onFinishChange(callback: (value: any) => void): this;

        setValue(value: any): this;
        getValue(): any;

        listen(): this;

        name(name: string): this;

        min(min: number): this;
        max(max: number): this;
        step(step: number): this;

        updateDisplay(): this;

        options(options: any): this;

        domElement: HTMLElement;
    }
}

// This export is necessary to make this file a module
export {};
