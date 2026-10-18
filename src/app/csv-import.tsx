import { CsvImportScreen } from "@/screens/my/CsvImportScreen";
import { useImportCsv } from "@/screens/my/hooks/useImportCsv";

export default function CsvImportRoute() {
  const importCsv = useImportCsv();
  return <CsvImportScreen onSelectCsv={importCsv} />;
}
