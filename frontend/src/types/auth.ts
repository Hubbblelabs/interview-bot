export interface User {
  id: string;
  email: string;
  role: "student" | "admin";
  name: string;
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

export interface Profile extends User {
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
