export type Category =
  | "Work"
  | "Personal"
  | "Promotions"
  | "Support"
  | "Finance"
  | "Other";

export type Priority = "High" | "Medium" | "Low";

export interface EmailListItem {
  id: string;
  account: string;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  category: Category;
  priority: Priority;
  summary: string;
  receivedAt: string;
  unread: boolean;
}

export interface EmailsResponse {
  emails: EmailListItem[];
}
