"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return <ErrorScreen error={error} />;
}
