/**
 * The client's "Details submitted" pop-up (owner, 2026-11-05). A Submit moves
 * the client to the next step at once, so a toast alone was easy to miss; the
 * pop-up lives in the portal shell and survives that navigation.
 *
 * The form raises it with `showClientSubmittedNotice`; `ClientSubmittedNotice`
 * (mounted once in `ClientPortalShell`) listens for the event and shows it.
 */
export const CLIENT_SUBMITTED_EVENT = 'vcfo-client-submitted';

export interface ClientSubmittedNoticeDetail {
  stepTitle: string;
  /** The submit is in, but the project lead still has their part (the NIC codes). */
  waitingOnLead?: boolean;
  /** A step the firm reviews before it is complete. */
  forReview?: boolean;
}

export function showClientSubmittedNotice(detail: ClientSubmittedNoticeDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ClientSubmittedNoticeDetail>(CLIENT_SUBMITTED_EVENT, { detail }));
}

/** The pop-up's text for one submit. */
export function clientSubmittedCopy(detail: ClientSubmittedNoticeDetail): { title: string; body: string } {
  const step = detail.stepTitle.trim() || 'this step';
  if (detail.waitingOnLead) {
    return {
      title: 'Details submitted',
      body: `Your details for ${step} have been submitted. Your project lead adds the NIC codes, then this step is complete.`,
    };
  }
  if (detail.forReview) {
    return {
      title: 'Details submitted',
      body: `Your details for ${step} have been submitted. Your project team will review them shortly.`,
    };
  }
  return {
    title: 'Details submitted',
    body: `Your details for ${step} have been submitted and this step is complete. Your project lead has been told.`,
  };
}
