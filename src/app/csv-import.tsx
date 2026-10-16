import { importCsv } from "@/screens/my/api/importCsv";
import { CsvImportScreen } from "@/screens/my/CsvImportScreen";

export default function CsvImportRoute() {
  return <CsvImportScreen onSelectCsv={importCsv} />;
}
