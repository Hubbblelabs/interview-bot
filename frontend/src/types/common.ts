export interface Topic {
  id: string;
  name: string;
  description?: string;
  is_published?: boolean;
  timer_enabled?: boolean;
  timer_seconds?: number | null;
}

export interface JobRole {
  id: string;
  title: string;
  description: string;
  department?: string;
}
