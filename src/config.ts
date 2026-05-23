export type SubmittedPreviewStyle = "raw" | "collapsible";

export interface PasterConfig {
  /** How submitted attachment previews render in chat history. */
  submittedPreviewStyle?: SubmittedPreviewStyle;
  /** Append local image paths to the submitted prompt so the agent can manipulate the source files. */
  includeImagePathsInPrompt?: boolean;
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
  submittedPreviewStyle: SubmittedPreviewStyle;
  includeImagePathsInPrompt: boolean;
  customEditor: {
    enabled: boolean;
    showImagePreview: boolean;
    deletePlaceholderAsBlock: boolean;
  };
}

export const DEFAULT_PASTER_CONFIG: ResolvedPasterConfig = {
  submittedPreviewStyle: "raw",
  includeImagePathsInPrompt: true,
  customEditor: {
    enabled: true,
    showImagePreview: true,
    deletePlaceholderAsBlock: true,
  },
};

export function resolvePasterConfig(config: PasterConfig = {}): ResolvedPasterConfig {
  return {
    submittedPreviewStyle:
      config.submittedPreviewStyle ?? DEFAULT_PASTER_CONFIG.submittedPreviewStyle,
    includeImagePathsInPrompt:
      config.includeImagePathsInPrompt ?? DEFAULT_PASTER_CONFIG.includeImagePathsInPrompt,
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
