import { Redirect, useLocalSearchParams } from "expo-router";

import { OpenSourceLicensesScreen } from "@/screens/my/OpenSourceLicensesScreen";
import { POLICY_DOCUMENTS, PolicyDocumentScreen } from "@/screens/my/PolicyDocumentScreen";

export default function PolicyDocumentRoute() {
  const { document } = useLocalSearchParams<{ document: string }>();
  const policyDocument = POLICY_DOCUMENTS.find((key) => key === document);

  if (document === "licenses") return <OpenSourceLicensesScreen />;
  if (policyDocument) return <PolicyDocumentScreen document={policyDocument} />;
  return <Redirect href="/terms" />;
}
