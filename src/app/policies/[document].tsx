import { Redirect, useLocalSearchParams } from "expo-router";

import { OpenSourceLicensesScreen } from "@/screens/my/OpenSourceLicensesScreen";
import { PolicyDocumentScreen } from "@/screens/my/PolicyDocumentScreen";

export default function PolicyDocumentRoute() {
  const { document } = useLocalSearchParams<{ document: string }>();

  if (document === "licenses") return <OpenSourceLicensesScreen />;
  if (document === "terms" || document === "privacy" || document === "community") {
    return <PolicyDocumentScreen document={document} />;
  }
  return <Redirect href="/terms" />;
}
