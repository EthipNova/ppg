import { useCallback, useEffect, useState } from "react";
import { fetchCustomers, type CustomerPage } from "../services/customers";

const PAGE_SIZE = 25;

export function useCustomers(search: string, status: string, category: string = "all") {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<CustomerPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setResult(await fetchCustomers({ search, status, category, page, pageSize: PAGE_SIZE }));
    } catch (cause) {
      console.error("Unable to load customers", cause);
      setError(cause instanceof Error ? cause.message : "Unable to load customers.");
    } finally {
      setIsLoading(false);
    }
  }, [category, page, search, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setPage(0);
  }, [category, search, status]);

  return {
    customers: result?.customers ?? [],
    memberships: result?.memberships ?? [],
    plans: result?.plans ?? [],
    total: result?.total ?? 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading,
    error,
    refresh,
    setPage,
  };
}