import type { CommandConfig } from './command.d.ts';
import type { CommandHandler } from './command.d.ts';
import type { CommandModule } from './command.d.ts';

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
