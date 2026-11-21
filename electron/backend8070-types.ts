export type Backend8070Action = 'status' | 'start' | 'stop';
export type Backend8070State = 'running' | 'stopped' | 'residual' | 'unknown' | 'starting' | 'stopping';
export interface Backend8070Result {
  ok: boolean;
  state: Backend8070State;
  message: string;
  code?: string;
}
