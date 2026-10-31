import { supabase } from "../integrations/supabase/client";

export interface ExpenseRecord {
  id: string;
  category: string;
  amount: number | string | null;
  expense_date: string;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface ExpensePage {
  expenses: ExpenseRecord[];
  total: number;
  totalAmount: number;
}

const PAGE_SIZE = 25;
const EXPENSE_FIELDS = "id, category, amount, expense_date, note, recorded_by, created_at";

function cleanSearch(value: string) {
  return value.trim().replace(/[,%()]/g, " ");
}

export async function fetchExpenses({ search, category, page }: { search: string; category: string; page: number }): Promise<ExpensePage> {
  let query = supabase.from("expenses").select(EXPENSE_FIELDS, { count: "exact" }).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  const normalizedSearch = cleanSearch(search);
  if (category !== "all") query = query.eq("category", category);
  if (normalizedSearch) query = query.or(`category.ilike.%${normalizedSearch}%,note.ilike.%${normalizedSearch}%`);

  const { data, count, error } = await query;
  if (error) throw error;

  const rawExpenses = (data ?? []) as ExpenseRecord[];
  const userIds = [...new Set(rawExpenses.map(e => e.recorded_by).filter((id): id is string => Boolean(id)))];
  let userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: userData } = await (supabase.from("users") as unknown as { select: (cols: string) => { in: (col: string, vals: string[]) => Promise<{ data: Array<{ id: string; email: string }> | null }> } })
      .select("id, email")
      .in("id", userIds);
    if (userData) {
      userMap = new Map(userData.map(u => [u.id, u.email]));
    }
  }

  const expenses = rawExpenses.map(e => ({
    ...e,
    recorded_by: e.recorded_by ? userMap.get(e.recorded_by) || e.recorded_by : null,
  }));

  let totalQuery = supabase.from("expenses").select("amount");
  if (category !== "all") totalQuery = totalQuery.eq("category", category);
  if (normalizedSearch) totalQuery = totalQuery.or(`category.ilike.%${normalizedSearch}%,note.ilike.%${normalizedSearch}%`);
  const totalResult = await totalQuery;
  if (totalResult.error) throw new Error(`Unable to calculate expenses total: ${totalResult.error.message}`);

  const totalAmount = (totalResult.data ?? []).reduce((total, expense) => total + (Number(expense.amount) || 0), 0);
  return { expenses, total: count ?? 0, totalAmount };
}

export async function createExpense(input: { category: string; amount: number; expenseDate: string; note: string; recordedBy?: string }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const recordedBy = user?.id || input.recordedBy || null;

  const result = await supabase.from("expenses").insert([{
    category: input.category,
    amount: input.amount,
    expense_date: input.expenseDate,
    note: input.note,
    recorded_by: recordedBy,
  }] as never);
  if (result.error) throw new Error(`Unable to save expense: ${result.error.message}`);
}

export { PAGE_SIZE as EXPENSE_PAGE_SIZE };
