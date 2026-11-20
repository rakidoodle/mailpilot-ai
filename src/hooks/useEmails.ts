import { useCallback, useEffect, useState } from "react";
import type { EmailListItem, EmailsResponse } from "../../shared/types";
import { mockEmails } from "../data/mockEmails";

export type EmailsSource = "api" | "demo";

export function useEmails() {
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [source, setSource] = useState<EmailsSource>("demo");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/emails", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`API responded ${response.status}`);
        }
        return (await response.json()) as EmailsResponse;
      })
      .then((data) => {
        if (!Array.isArray(data.emails) || data.emails.length === 0) {
          throw new Error("API returned no emails");
        }
        setEmails(data.emails);
        setSource("api");
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setEmails(mockEmails);
        setSource("demo");
        setError(cause instanceof Error ? cause.message : "API unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

  return { emails, isLoading, source, error, reload };
}
