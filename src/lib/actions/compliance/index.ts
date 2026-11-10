import type { AnyAction } from '../types';
import { attachEvidence } from './attach-evidence';
import { openNotice } from './open-notice';
import { draftNoticeReply } from './draft-notice-reply';
import { requestNoticeDocuments } from './request-notice-documents';

export const actions: AnyAction[] = [attachEvidence, openNotice, draftNoticeReply, requestNoticeDocuments];
