export * from '@shared/types';

export interface TranslateFn {
  (key: string, defaultValue: string): string;
  (key: string, defaultValue: string, options: Record<string, unknown>): string;
}
