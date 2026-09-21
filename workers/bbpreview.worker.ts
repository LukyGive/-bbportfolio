/// <reference lib="webworker" />

import { decodeBbPreview } from '@/lib/viewer-v2/codec';
import type { BbPreview } from '@/lib/viewer-v2/schema';

export type BbPreviewWorkerRequest = {
  type: 'decode';
  text: string;
};

export type BbPreviewWorkerSuccess = {
  type: 'decoded';
  preview: BbPreview;
};

export type BbPreviewWorkerFailure = {
  type: 'error';
  message: string;
};

export type BbPreviewWorkerResponse = BbPreviewWorkerSuccess | BbPreviewWorkerFailure;

self.onmessage = (event: MessageEvent<BbPreviewWorkerRequest>) => {
  if (event.data?.type !== 'decode' || typeof event.data.text !== 'string') {
    self.postMessage({ type: 'error', message: 'Invalid preview decode request.' } satisfies BbPreviewWorkerFailure);
    return;
  }

  try {
    const preview = decodeBbPreview(event.data.text);
    self.postMessage({ type: 'decoded', preview } satisfies BbPreviewWorkerSuccess);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not decode preview.',
    } satisfies BbPreviewWorkerFailure);
  }
};
