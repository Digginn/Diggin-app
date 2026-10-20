export function formatPriceInput(text: string) {
  return text
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
