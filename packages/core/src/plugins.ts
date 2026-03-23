// src/plugins/types.ts — Plugin system interfaces

export interface YbkPlugin {
  name: string;
  version: string;
  renderers?: OutputRendererPlugin[];
}

export interface OutputRendererPlugin {
  type: string;
  displayName: string;
  canRender(value: unknown): boolean;
  serialize(value: unknown): Record<string, unknown>;
  componentSource?: string;
  componentUrl?: string;
}
