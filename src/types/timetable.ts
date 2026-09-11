import type { Id, PageRequest } from './common';

export type SlotType = 'CLASS' | 'FREE';

export interface TimetableSlot {
  id: Id;
  faculty_id: Id;
  class_id: Id | null;
  slot_type: SlotType;
  day_of_week: number;
  day_label: string;
  start_time: string;
  end_time: string;
  time_label: string;
  room: string | null;
  break_label: string | null;
  class_name: string;
  class_code: string | null;
  subject: string | null;
  variant: string | null;
  version: number;
}

export interface CreateTimetableSlotRequest {
  faculty_id: Id;
  class_id?: Id | null;
  slot_type: SlotType;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string | null;
  break_label?: string | null;
}

export interface UpdateTimetableSlotRequest {
  slot_id: Id;
  class_id?: Id | null;
  slot_type?: SlotType;
  day_of_week?: number;
  start_time?: string;
  end_time?: string;
  room?: string | null;
  break_label?: string | null;
  version: number;
}

export interface TimetableQuery extends PageRequest {
  facultyId?: Id;
  dayOfWeek?: number;
  slotType?: SlotType;
}

export const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
};

export const DAY_SHORT: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
};
