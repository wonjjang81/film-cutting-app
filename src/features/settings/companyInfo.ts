export type CompanyInfo = {
  companyName: string;
  managerName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
};

export const COMPANY_INFO_STORAGE_KEY = 'film-cutting-company-v2';
export const emptyCompanyInfo: CompanyInfo = { companyName: '', managerName: '', phone: '', email: '', address: '', note: '' };

export function parseCompanyInfo(raw: string | null): CompanyInfo {
  if (!raw) return { ...emptyCompanyInfo };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...emptyCompanyInfo };
    const record = parsed as Record<string, unknown>;
    return Object.fromEntries(Object.keys(emptyCompanyInfo).map((key) => [key, typeof record[key] === 'string' ? record[key] : ''])) as CompanyInfo;
  } catch { return { ...emptyCompanyInfo }; }
}
