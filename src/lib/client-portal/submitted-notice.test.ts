import { describe, expect, it } from 'vitest';
import { clientSubmittedCopy } from './submitted-notice';

describe('clientSubmittedCopy', () => {
  it('says the details were submitted and the step is complete', () => {
    expect(clientSubmittedCopy({ stepTitle: 'Client Details' })).toEqual({
      title: 'Details submitted',
      body: 'Your details for Client Details have been submitted and this step is complete. Your project lead has been told.',
    });
  });

  it('says the project lead still adds the NIC codes', () => {
    expect(clientSubmittedCopy({ stepTitle: 'Client Details', waitingOnLead: true }).body).toMatch(/adds the NIC codes/);
  });

  it('says the team reviews a step that is reviewed', () => {
    expect(clientSubmittedCopy({ stepTitle: 'Bank Account Opening', forReview: true }).body).toMatch(/review them shortly/);
  });
});
