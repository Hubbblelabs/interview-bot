export interface User {
  id: string;
  email: string;
  role: "student" | "admin";
  name: string;
}

export interface Profile extends User {
  resume?: {
    filename: string;
    parsed_data: any;
    uploaded_at: string;
  };
  skills?: string[];
}

export interface JobRole {
  id: string;
  title: string;
  description: string;
  department?: string;
}

export interface AdminQuestion {
  id: string;
  role_id: string;
  question: string;
  difficulty: "easy" | "medium" | "hard";
  category?: string;
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
  total_interviews: number;
  average_score: number;
  top_performers: TopPerformer[];
  common_weak_areas: string[];
}
