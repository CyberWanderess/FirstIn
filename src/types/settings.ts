export interface Setting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingUpsert {
  key: string;
  value: string;
  description?: string | null;
}
