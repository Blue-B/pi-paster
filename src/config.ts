export interface PasterConfig {
  customEditor?: {
    /** Replace pi's input editor to enable inline image UX features. */
    enabled?: boolean;
    /** Show an image preview above the input while the cursor is inside an image placeholder. */
    showImagePreview?: boolean;
    /** Treat image placeholders as atomic blocks for backspace/delete. */
    deletePlaceholderAsBlock?: boolean;
  };
}

export interface ResolvedPasterConfig {
  customEditor: {
    enabled: boolean;
    showImagePreview: boolean;
    deletePlaceholderAsBlock: boolean;
  };
}

export const DEFAULT_PASTER_CONFIG: ResolvedPasterConfig = {
  customEditor: {
    enabled: true,
    showImagePreview: true,
    deletePlaceholderAsBlock: true,
  },
};

export function resolvePasterConfig(config: PasterConfig = {}): ResolvedPasterConfig {
  return {
    customEditor: {
      enabled: config.customEditor?.enabled ?? DEFAULT_PASTER_CONFIG.customEditor.enabled,
      showImagePreview:
        config.customEditor?.showImagePreview ??
        DEFAULT_PASTER_CONFIG.customEditor.showImagePreview,
      deletePlaceholderAsBlock:
        config.customEditor?.deletePlaceholderAsBlock ??
        DEFAULT_PASTER_CONFIG.customEditor.deletePlaceholderAsBlock,
    },
  };
}
