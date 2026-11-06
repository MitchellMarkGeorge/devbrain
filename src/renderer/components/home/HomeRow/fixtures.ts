import { storyDate } from '../../lib/story-dates';
import type { HomeMeetingData } from './HomeRow';

/** A core-shaped meeting for stories: 30 minutes, with a meeting link when `link`. */
export function sampleMeeting(
  title: string,
  startAt: Date,
  color: string,
  link = false,
): HomeMeetingData {
  return {
    title,
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    allDay: false,
    meetingUrl: link ? 'https://meet.google.com/abc-defg-hij' : null,
    color,
  };
}

/** Home's meetings at the story's 9:48 AM: the next in 12 minutes, then two later today. */
export const SAMPLE_MEETINGS: HomeMeetingData[] = [
  sampleMeeting('Sprint Planning', storyDate(0, 10), 'green', true),
  sampleMeeting('Mitchell / Jesse 1:1', storyDate(0, 10, 30), 'green'),
  sampleMeeting('Design Review', storyDate(0, 13), 'blue'),
];
