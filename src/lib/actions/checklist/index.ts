import type { AnyAction } from '../types';
import { attachFile, setResponse } from './set-response';

export const actions: AnyAction[] = [setResponse, attachFile];
