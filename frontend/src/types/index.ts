<<<<<<< Updated upstream
export * from "./auth";
export * from "./interview";
export * from "./admin";
export * from "./common";
export * from "./ui";
=======
export interface User {
  id: string;
  email: string;
  role: "student" | "admin";
  name: string;
}

export interface Profile extends User {
  speech_settings?: {
    voice_gender?: "male" | "female" | "auto";
  };
  resume?: {
    filename: string;
    parsed_data?: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      location?: string | null;
      recommended_roles?: string[];
      experience_summary?: string;
    };
    uploaded_at: string;
  };
  skills?: string[];
  clustered_skills?: {
    cluster: string;
    members: string[];
    label: string;
    count: number;
  }[];
}

export interface JobRole {
  id: string;
  title: string;
  description: string;
  department?: string;
}

export interface AdminQuestion {
  id: string;
  role_id?: string;
  topic_id?: string;
  interview_type?: "resume" | "topic";
  question: string;
  difficulty: "easy" | "medium" | "hard";
  category?: string;
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  is_published?: boolean;
  timer_enabled?: boolean;
  timer_seconds?: number | null;
}

export interface InterviewReport {
  session_id: string;
  student_id: string;
  role_id: string;
  role_title: string;
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  detailed_scores: {
    question: string;
    answer: string;
    score: number;
    feedback: string;
  }[];
  completed_at: string;
  total_questions: number;
}

export interface ReportHistoryItem {
  session_id: string;
  role_title: string;
  overall_score: number;
  completed_at: string;
  total_questions: number;
}

export interface TopPerformer {
  student_id: string;
  name: string;
  avg_score: number;
  interview_count: number;
}

export interface AdminAnalytics {
  total_students: number;
  live_users: number;
  new_users_today: number;
  total_interviews: number;
  average_score: number;
  top_performers: TopPerformer[];
  common_weak_areas: string[];
}

export interface AdminQuitInterview {
  session_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role_title: string;
  status: string;
  quit_reason: string;
  answered_count: number;
  max_questions: number;
  quit_at: string;
  quit_day?: string | null;
  quit_date?: string | null;
  quit_time?: string | null;
  report_generated: boolean;
  overall_score?: number | null;
  total_questions_evaluated?: number;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
}

export interface AdminReportSummary {
  session_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role_title: string;
  overall_score: number;
  total_questions: number;
  completed_at: string;
  session_status: string;
  is_quit: boolean;
}

export interface AdminReportDetail extends InterviewReport {
  id?: string;
  user_id: string;
  user_name: string;
  user_email: string;
  session_status?: string;
  is_quit?: boolean;
  quit_at?: string | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "student" | "admin";
  created_at: string;
  interview_count: number;
  report_count: number;
}
>>>>>>> Stashed changes
