import type { CommandConfig } from './command.js';
import type { CommandHandler } from './command.js';
import type { CommandModule } from './command.js';

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  commands: CommandConfig[];
  onLoad?(): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}

export type PluginModule = Plugin & {
  handlers: Record<string, CommandHandler>;
};

export interface CategoryPlugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  onLoad?(): Promise<void> | void;
  onUnload?(): Promise<void> | void;
  commands: CommandModule[];
}
