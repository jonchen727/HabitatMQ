// Type declarations for the onvif package (CommonJS, untyped)
// Used via require("onvif").Cam in onvif-events.ts

declare module "onvif" {
  interface CamOptions {
    hostname: string;
    port?: number;
    username?: string;
    password?: string;
    timeout?: number;
  }

  class Cam {
    constructor(options: CamOptions, callback: (err: unknown) => void);
    on(event: string, callback: (...args: unknown[]) => void): this;
    removeAllListeners(event?: string): this;
  }
}
