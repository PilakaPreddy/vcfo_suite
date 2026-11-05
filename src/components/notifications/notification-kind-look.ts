import {
  CalendarClock,
  MessageSquare,
  CircleCheck,
  FileText,
  Inbox,
  LockOpen,
  Mail,
  Megaphone,
  Send,
  TriangleAlert,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import type { NotificationKind } from '@/lib/checklist/checklist-notifications';

/* One place for how a notification kind looks in VCFO Spectrum (prototype NotificationsScreen
   `TYPE_ICON`): the type tile's icon, the status tone of its chip, and the tab group it sits in.
   The words on the chip stay `NOTIFICATION_KIND_LABEL`. */

export type NotificationGroup = 'Steps' | 'Documents' | 'Requests' | 'Team' | 'Email';

export const NOTIFICATION_GROUPS: NotificationGroup[] = ['Steps', 'Documents', 'Requests', 'Team', 'Email'];

export const NOTIFICATION_KIND_LOOK: Record<
  NotificationKind,
  { Icon: LucideIcon; tone: ChipTone; group: NotificationGroup }
> = {
  'checklist.deliver': { Icon: CircleCheck, tone: 'ok', group: 'Steps' },
  'checklist.submit': { Icon: Send, tone: 'prog', group: 'Steps' },
  'checklist.review': { Icon: CircleCheck, tone: 'prog', group: 'Steps' },
  'checklist.unlock': { Icon: LockOpen, tone: 'idle', group: 'Steps' },
  'docs.share': { Icon: FileText, tone: 'prog', group: 'Documents' },
  'request.created': { Icon: Inbox, tone: 'teal', group: 'Requests' },
  'request.uploaded': { Icon: Upload, tone: 'ok', group: 'Requests' },
  'message.received': { Icon: MessageSquare, tone: 'teal', group: 'Requests' },
  'schedule.window': { Icon: CalendarClock, tone: 'prog', group: 'Steps' },
  'compliance.reminder': { Icon: CalendarClock, tone: 'warn', group: 'Steps' },
  'compliance.task': { Icon: CircleCheck, tone: 'prog', group: 'Steps' },
  'board.meeting': { Icon: Users, tone: 'prog', group: 'Steps' },
  'watch.update': { Icon: Megaphone, tone: 'prog', group: 'Documents' },
  'watch.alert': { Icon: TriangleAlert, tone: 'warn', group: 'Requests' },
  'team.assigned': { Icon: Users, tone: 'prog', group: 'Team' },
  'team.removed': { Icon: Users, tone: 'idle', group: 'Team' },
  'email.sent': { Icon: Mail, tone: 'ok', group: 'Email' },
  'email.skipped': { Icon: Mail, tone: 'warn', group: 'Email' },
  'email.failed': { Icon: Mail, tone: 'bad', group: 'Email' },
};
