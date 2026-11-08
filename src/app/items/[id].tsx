import { MemberOnly } from "@/components/MemberOnly";
import { ItemDetailScreen } from "@/screens/item-detail/ItemDetailScreen";

export default function ItemDetailRoute() {
  return (
    <MemberOnly>
      <ItemDetailScreen />
    </MemberOnly>
  );
}
