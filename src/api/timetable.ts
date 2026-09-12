import type {
  CreateTimetableSlotRequest,
  Paginated,
  TimetableQuery,
  TimetableSlot,
  UpdateTimetableSlotRequest,
} from '@/types';
import { request } from './client';

type RawSlot = {
  id: string;
  faculty_id: string;
  class_id: string | null;
  slot_type: string;
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
};

type RawPage = { items: RawSlot[]; page: number; pageSize: number; total: number; hasMore: boolean };

function mapSlot(x: RawSlot): TimetableSlot {
  return {
    id: x.id,
    faculty_id: x.faculty_id,
    class_id: x.class_id,
    slot_type: x.slot_type as TimetableSlot['slot_type'],
    day_of_week: x.day_of_week,
    day_label: x.day_label,
    start_time: x.start_time,
    end_time: x.end_time,
    time_label: x.time_label,
    room: x.room,
    break_label: x.break_label,
    class_name: x.class_name,
    class_code: x.class_code,
    subject: x.subject,
    variant: x.variant,
    version: x.version,
  };
}

export const timetableApi = {
  async getMyTimetable(): Promise<TimetableSlot[]> {
    const res = await request<{ items: RawSlot[] }>('timetable/mine');
    return res.items.map(mapSlot);
  },

  async getMyTodayClasses(): Promise<TimetableSlot[]> {
    const res = await request<{ items: RawSlot[] }>('timetable/mine/today');
    return res.items.map(mapSlot);
  },

  async getTimetable(query?: TimetableQuery): Promise<Paginated<TimetableSlot>> {
    const res = await request<RawPage>('admin/timetable', {
      query: {
        facultyId: query?.facultyId,
        classId: query?.classId,
        sectionId: query?.sectionId,
        dayOfWeek: query?.dayOfWeek,
        slotType: query?.slotType,
        page: query?.page,
        page_size: query?.pageSize,
      },
    });
    return {
      items: res.items.map(mapSlot),
      page: res.page,
      pageSize: res.pageSize,
      total: res.total,
      hasMore: res.hasMore,
    };
  },

  async getFacultyTimetable(facultyId: string): Promise<TimetableSlot[]> {
    const res = await request<{ items: RawSlot[] }>(`admin/timetable/faculty/${facultyId}`);
    return res.items.map(mapSlot);
  },

  async createSlot(payload: CreateTimetableSlotRequest): Promise<TimetableSlot> {
    const res = await request<RawSlot>('admin/timetable/slots', {
      method: 'POST',
      body: {
        faculty_id: payload.faculty_id,
        class_id: payload.class_id ?? null,
        slot_type: payload.slot_type,
        day_of_week: payload.day_of_week,
        start_time: payload.start_time,
        end_time: payload.end_time,
        room: payload.room ?? null,
        break_label: payload.break_label ?? null,
      },
    });
    return mapSlot(res);
  },

  async updateSlot(payload: UpdateTimetableSlotRequest): Promise<TimetableSlot> {
    const { slot_id, ...body } = payload;
    const res = await request<RawSlot>(`admin/timetable/slots/${slot_id}`, {
      method: 'PATCH',
      body: {
        class_id: body.class_id,
        slot_type: body.slot_type,
        day_of_week: body.day_of_week,
        start_time: body.start_time,
        end_time: body.end_time,
        room: body.room,
        break_label: body.break_label,
        version: body.version,
      },
    });
    return mapSlot(res);
  },

  async deleteSlot(slotId: string): Promise<void> {
    await request(`admin/timetable/slots/${slotId}`, { method: 'DELETE' });
  },
};
