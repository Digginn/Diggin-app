import { MemberOnly } from "@/components/MemberOnly";
import { CsvImportScreen } from "@/screens/my/CsvImportScreen";
import { useImportCsv } from "@/screens/my/hooks/useImportCsv";

function CsvImportContent() {
  const importCsv = useImportCsv();
  return <CsvImportScreen onSelectCsv={importCsv} />;
}

export default function CsvImportRoute() {
  return (
    <MemberOnly>
      <CsvImportContent />
    </MemberOnly>
  );
}
