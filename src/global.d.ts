declare const __TYPOSPOTTER_VERSION__: string;

interface MwApi {
  get(parameters: Record<string, unknown>): Promise<any>;
  post(parameters: Record<string, unknown>): Promise<any>;
  postWithEditToken(parameters: Record<string, unknown>): Promise<any>;
}

declare const mw: {
  Api: new () => MwApi;
  config: { get(name: string): any };
  loader: {
    using(modules: string | string[]): Promise<unknown>;
  };
  storage?: {
    get(key: string): string | null;
    set(key: string, value: string): boolean;
  };
  util: {
    getUrl(title: string, parameters?: Record<string, string>): string;
  };
  notify?(message: string, options?: Record<string, unknown>): void;
};
