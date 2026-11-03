import type { ElectronApi, WindowControlApi } from '../electron/shared';

declare global {
  interface Window {
    chatTranslator: ElectronApi;
    windowControl: WindowControlApi;
    __chatTranslatorProfile?: unknown;
    __dfFlushCustomerWritesBeforeExit?: () => Promise<void>;
    __dfResumeCustomerEditing?: () => void;
  }

  namespace Electron {
    interface WebviewTag extends HTMLElement {
      executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
      sendInputEvent(event: Record<string, unknown>): void;
      reload(): void;
    }
  }
}
