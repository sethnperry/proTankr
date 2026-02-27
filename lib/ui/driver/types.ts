// lib/ui/driver/types.ts
// Shared types used by AdminPage, ProfilePage, MemberCard, DriverProfileModal

export type Member = {
  user_id: string;
  role: string;
  email: string;
  display_name: string | null;
  hire_date: string | null;
  division: string | null;
  region: string | null;
  local_area: string | null;
  employee_number: string | null;
};

export type License = {
  license_class: string | null;
  endorsements: string[];
  restrictions: string[];
  license_number: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  state_code: string | null;
};

export type MedicalCard = {
  issue_date: string | null;
  expiration_date: string | null;
  examiner_name: string | null;
};

export type TwicCard = {
  card_number: string | null;
  issue_date: string | null;
  expiration_date: string | null;
};

export type TerminalAccess = {
  terminal_id: string;
  terminal_name: string;
  state: string | null;
  city: string | null;
  carded_on: string;
  renewal_days: number;
  expires_on: string;
  days_until_expiry: number;
  is_expired: boolean;
};

export type PortId = {
  port_name: string;
  expiration_date: string;
};

export type DriverProfile = {
  profile: Partial<Member> | null;
  license: License | null;
  medical: MedicalCard | null;
  twic: TwicCard | null;
  terminals: TerminalAccess[];
  port_ids?: PortId[];
};
