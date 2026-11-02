export interface User {
  id: string;
  email: string | null;
  name: string;
  role: "admin" | "member";
}
export interface GoogleSession {
  id: string;
  name: string;
  token: string;
  expiresAt: number;
  user: User;
}
