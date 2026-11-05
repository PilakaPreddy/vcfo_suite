import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AnnouncementKindChip,
  AnnouncementKindPicker,
  AnnouncementRow,
  announcementIsImportant,
} from '@/components/announcements/AnnouncementList';
import type { Announcement } from '@/lib/notifications/announcements';

const item: Announcement = {
  id: 'a1',
  title: 'GSTR-3B due',
  body: 'File GSTR-3B for September by 20 Oct.',
  kind: 'deadline',
  origin: 'manual',
  sourceId: null,
  sourceName: null,
  sourceUrl: 'https://www.gst.gov.in/newsandupdates',
  authorId: 'u1',
  authorName: 'Pranay',
  authorRole: 'manager',
  publishedAt: '2026-10-14T09:00:00.000Z',
  createdAt: '2026-10-14T09:00:00.000Z',
};

describe('AnnouncementList', () => {
  it('treats deadline and compliance notes as important', () => {
    expect(announcementIsImportant('deadline')).toBe(true);
    expect(announcementIsImportant('compliance')).toBe(true);
    expect(announcementIsImportant('gst')).toBe(false);
    expect(announcementIsImportant('unknown')).toBe(false);
  });

  it('draws a deadline as a status chip and other kinds as area pills', () => {
    const { rerender } = render(<AnnouncementKindChip kind="deadline" />);
    expect(screen.getByText('Deadline')).toBeTruthy();
    rerender(<AnnouncementKindChip kind="gst" />);
    expect(screen.getByText('GST')).toBeTruthy();
  });

  it('shows the message, the author, the source host and an unread dot, and opens on Enter', () => {
    const onActivate = vi.fn();
    render(<AnnouncementRow item={item} unread onActivate={onActivate} />);
    expect(screen.getByText(item.title)).toBeTruthy();
    expect(screen.getByText('From Pranay')).toBeTruthy();
    expect(screen.getByLabelText('Unread')).toBeTruthy();
    expect(screen.getByLabelText('Open source on gst.gov.in').getAttribute('href')).toBe(item.sourceUrl);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('marks the picked kind as pressed', () => {
    const onChange = vi.fn();
    render(<AnnouncementKindPicker value="general" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'MCA' }));
    expect(onChange).toHaveBeenCalledWith('mca');
  });
});
